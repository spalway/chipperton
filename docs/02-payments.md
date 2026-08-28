# How a payment is taken and verified

The hard part of accepting payment without a program is not receiving money —
it is knowing *which order* a given transaction paid for, and proving it paid
what it claims.

## Reference keys

When you order, the server generates a fresh single-use keypair and keeps only
its public key. That address is attached to your payment transaction as a
**read-only, non-signer account** — it does nothing on-chain and controls
nothing.

Solana validators index transactions by every account key they touch. So the
server can later ask:

```
getSignaturesForAddress(<reference>)
```

and find your payment without you telling it anything, without polling your
wallet, and before it knows the signature. This is the
[Solana Pay](https://github.com/solana-foundation/pay) reference pattern.

## Reference keys prove nothing on their own

This is the part most integrations get wrong.

**Anyone can put your reference key into any transaction.** It is just an
address in a list. Finding your reference inside a confirmed transaction tells
you a transaction mentioned it — not that it paid you, not that it paid the
right amount, not that it paid at all.

An implementation that marks an order paid on `findReference` alone accepts a
transaction that transferred nothing.

## What actually authorises the order

Chipperton uses `validateTransfer` from `@solana/pay`, which enforces:

1. **The transfer must be the last instruction.** This blocks a transaction
   that pays and then claws the funds back in a later instruction.
2. **The amount is read from pre/post balance metadata** — `post - pre >=
   expected` on the recipient — not from decoded instruction data. Instruction
   data describes intent; balance deltas describe what happened.
3. **The memo must match** the expected `chp:1:<orderId>`.
4. **The recipient must be the vault.**

Only after all four does the order move to `paid`.

## Memo format

Every transaction the system produces or expects carries a versioned memo via
the SPL Memo program (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`):

| direction | memo |
|---|---|
| buyer → vault | `chp:1:<orderId>` |
| agent → chain | `chp:1:done:<orderId>:<reportHash>` |
| agent → buyer | `chp:1:refund:<orderId>:<reason>` |

The `1` is a format version. Parsers should reject memos they do not recognise
rather than guess.

## Double-credit protection

Two database constraints do the work that would otherwise need careful code:

- `orders.reference` is **unique** — one reference can only ever belong to one
  order.
- `orders.payment_sig` is **unique** — one transaction can never settle two
  orders.

The settle write is also guarded on `status = 'pending'` in the same statement,
so two concurrent ticks cannot both credit the same order. The second update
touches zero rows and is a no-op.

## Timestamps

`paid_at` is not when the server noticed. It is the **`blockTime` of the
payment transaction** — cluster-agreed wall clock, recorded on-chain.

This is what makes turnaround a measurement rather than a claim: both endpoints
of `deliveredAt − paidAt` are on-chain timestamps that anyone can read back
from the two signatures.
