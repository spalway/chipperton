# Chipperton

## An agent that publishes its work, and refuses to sell what it couldn't refund

Most "AI agent on Solana" projects ask you to take their word for it. The agent
did something, apparently. It cost something, allegedly. The dashboard says so.

Chipperton is built the other way round. It sells small Solana research jobs —
token safety checks, wallet activity reports, program IDL briefs — and every
report it delivers is published on-chain in full, byte for byte, with a
cryptographic commitment you can verify without trusting the site, the database,
or us.

That claim is either true or it isn't, and you can settle it yourself in about
two minutes. That's the point.

---

## There is no program, and that's deliberate

The obvious way to build this would be an Anchor program: an escrow, a job
registry, on-chain state. Chipperton has none of that, and the absence is a
design decision rather than a shortcut.

Everything the agent needs from Solana already exists:

| need | mechanism |
|---|---|
| take payment | SystemProgram transfer |
| attribute a payment to an order | SPL Memo + a Solana Pay reference key |
| publish a tamper-evident receipt | SPL Memo signed by the agent |
| publish the work itself | SPL Memo, chunked |
| refund | SystemProgram transfer |

A custom program would add a deployment, an upgrade authority, an audit surface,
and a class of bug that can permanently lock funds. It would not make a single
row above more true. The receipts would be identical bytes.

What a program *would* buy is custody — a vault with no private key. That's a
real improvement and it's on the roadmap. It's also orthogonal to whether the
work is verifiable, which is what this is about.

---

## Reference keys prove nothing

Accepting payment without a program is easy. Knowing *which order* a given
transaction paid for, and proving it paid what it claims, is the hard part.

When you order, the server generates a fresh single-use keypair and keeps only
the public half. That address rides along on your payment transaction as a
read-only, non-signer account. It does nothing on-chain and controls nothing —
but Solana validators index transactions by every account key they touch, so the
server can later ask `getSignaturesForAddress(reference)` and find your payment
without you telling it anything.

This is the [Solana Pay](https://github.com/solana-foundation/pay) reference
pattern, and here is the part most integrations get wrong:

**Anyone can put your reference key into any transaction.** It's just an address
in a list. Finding your reference inside a confirmed transaction tells you a
transaction mentioned it. Not that it paid you. Not that it paid the right
amount. Not that it paid at all.

An implementation that marks an order paid on `findReference` alone will
cheerfully accept a transaction that transferred nothing.

So the reference only *locates* the transaction. The security boundary is
`validateTransfer`, which enforces four things:

1. **The transfer must be the last instruction** — blocking a transaction that
   pays and then claws the funds back afterwards.
2. **The amount comes from pre/post balance metadata**, not decoded instruction
   data. Instruction data describes intent; balance deltas describe what
   happened.
3. **The memo must match** the expected order.
4. **The recipient must be the vault.**

Only after all four does an order move to `paid`.

---

## The receipt, and how to check one

When a job is delivered the agent signs one transaction containing a single
memo:

```
chp:1:done:<orderId>:<sha256 of the report, first 16 hex>
```

The agent's own wallet is the fee payer, so the receipt is attributable to the
agent and costs about 5,000 lamports.

To verify a delivery you don't need this site:

```bash
printf '%s' "$(cat report.txt)" | sha256sum | cut -c1-16
```

If that matches the receipt memo, the report you're holding is the one the agent
committed to. If it doesn't, the report has been modified since delivery — by
anyone, including us.

**What a receipt does not prove is that the report is correct.** It's an
integrity guarantee, not a quality one. The agent can commit to a wrong
conclusion just as firmly as a right one. What it removes is the possibility of
quietly editing a report after the fact — including changing a verdict after a
token moved.

That distinction is load-bearing, and worth stating plainly rather than letting
a green checkmark imply more than it carries.

---

## The whole report goes on-chain

Not a hash of it. Not a summary. The report body, split into ~830-byte chunks
and written as an ordered run of memo transactions:

```
chp:1:rpt:<orderId>:1/5:# Token safety check\n\nMint: DezXAZ8z...
chp:1:rpt:<orderId>:2/5:...
chp:1:rpt:<orderId>:5/5:...
chp:1:done:<orderId>:<hash>
```

The receipt lands **last**, after every chunk confirms, so a receipt only ever
exists for a report that fully published. If a chunk fails partway, the job is
refunded instead of delivered.

Cost: five memos plus the receipt, roughly a third of a cent against a job
priced in dollars.

Rebuilding a report from Solana alone is mechanical — pull the chunks, strip
each prefix, concatenate in index order, hash the result. We've verified it
end to end: a reassembled report is byte-identical to the delivered text and
hashes to the value in its receipt.

One implementation note for anyone building something similar: **the binding
constraint on memo size is compute, not transaction size.** The memo program
validates UTF-8, and that cost scales with length — a 560-byte memo consumes
~198,000 CU against a 200,000 default. It fails with a bare "Transaction
simulation failed" while the transaction is barely half full. Raise the compute
unit limit and ~1,000-byte memos land fine.

---

## It only sells what it could refund

Chipperton promises a refund if it misses its estimate or a job fails. That
promise is only worth something if the agent can actually keep it, so the check
happens **before** it takes your money, not after.

Payments land in a vault. Refunds are paid from a separate, deliberately thin
hot wallet — so a compromised worker environment costs the operating float
rather than the treasury. But that split has a consequence: the hot wallet
drains as the vault fills. Left alone it would eventually be unable to refund,
and would discover that at the exact moment it owed someone money.

So before accepting any order, the agent checks that its refund wallet covers
that job **plus everything it already owes**. If it doesn't, the sale is refused
rather than taken:

> Chipperton is not accepting orders — it cannot currently cover a refund for
> this job, so it will not take payment for it.

The shop closing is the promise working, not failing.

The deadline a refund is owed against is fixed at the moment of payment and
never moves. It accounts for the work already queued ahead of you, so it
describes a time the agent can actually reach rather than one it was never given
a chance to meet.

---

## Measured, declared, and the difference

Every number the site shows either measures something or says it doesn't.

**Turnaround is measured**, from two on-chain timestamps — the `blockTime` of
your payment and the `blockTime` of the receipt. Both are cluster-agreed facts
anyone can read back from the two signatures. It isn't a figure we assert.

**Runway is a projection**, and is labelled as one. It divides a real on-chain
balance by a daily cost that starts as a declared assumption. The agent records
what each job actually costs it — real token counts at published rates — and
once the ledger holds enough history the figure becomes observed rather than
stated. Until then the site says "at its declared cost" rather than "of runway",
because those are different claims.

The same applies to the cost figure itself. It currently covers inference only;
RPC and network fees are real and not yet fully tracked, so it's published as a
lower bound rather than a total.

---

## What it doesn't do

- **Three services work today**: token safety check, wallet activity report,
  program IDL brief. Transaction tracing, bundle detection and watchlist digests
  are listed and greyed, because offering something the system can't deliver is
  the same error as quoting a price nobody can pay.
- **Reports are public.** The full body goes on-chain, and the payment
  transaction is public like any Solana payment. Which wallet requested a given
  report is reconstructible. That's a deliberate transparency decision, not an
  oversight.
- **The vault is an ordinary keypair.** Whoever holds the secret can move the
  funds. No on-chain program constrains it — the operating rules are enforced by
  the worker, not by Solana. The chain doesn't enforce the rules; it produces the
  evidence to check whether they were kept.
- **There is no dispute process.** If a report is wrong but delivered on time,
  the automatic refund doesn't trigger.

---

## Where it is

Live on mainnet at [chipperton.fun](https://chipperton.fun). The full loop —
order, pay, settle, run, deliver, publish, receipt — has been proven end to end
with real transactions, real signatures, and reports reassembled from chain and
verified against their hashes.

The interesting claim isn't that an agent is doing work. It's that you never
have to take its word for any of it.
