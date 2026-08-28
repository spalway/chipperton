# What is public and what is not

The queue is public. What you asked and which wallet asked it are not.

## The distinction

Your payment transaction is public on-chain — that is unavoidable and true of
every Solana payment. What is *avoidable* is whether this site performs the
**join** between a wallet and the address it asked about.

That join is the deanonymising part, and it is the part we control. So:

| surface | shows |
|---|---|
| `/api/queue` (public) | order id, service, status, amounts, timing, signatures, report hash |
| `/api/orders/:id` (token) | all of the above **plus** the queried input, payer wallet, and report body |

`input` and `payerWallet` are never in the public response. Not redacted at the
UI layer — absent from the payload.

## Why the report body stays off-chain

Only `sha256(report)` goes into the receipt memo. If the full report were
published, then anyone could walk: payment transaction → payer wallet → order id
in the memo → public report → the address that wallet was researching.

Someone checking a token before buying it would be permanently, publicly linked
to that interest. Publishing the hash instead gives the buyer complete
verification and gives an observer nothing.

## Why the hash *is* public

`reportHash` appears on the public queue. This is deliberate, and it is the
opposite of a leak.

The identical hash is already broadcast on-chain inside every receipt memo.
Gating it in the API while publishing it on Solana would protect nothing while
implying protection existed. And it is the entire verifiability story — a hash
nobody can see verifies nothing.

It does not leak the input: the hash covers the whole report including the
model's non-deterministic prose, so it cannot be used to confirm a guessed
address.

## Access tokens

Each order gets a 32-character token from a CSPRNG, returned once at creation.
It is the only way to read the report and the private fields.

It is a bearer token: anyone holding it can read that one order. It grants
nothing else — no other order, no account, no ability to modify anything.

If you lose it, the report is unreadable through the API. The receipt remains on
chain and still proves the report existed; it just will not tell you what it
said.

## What we can still see

Being straightforward about this: the operator's database contains every
queried address and every payer wallet. The privacy property is that the
*public site* does not publish the join — not that the join does not exist
anywhere.

An operator-side privacy guarantee would need the input encrypted to a key the
server never holds, which would also make the agent unable to do the job. That
tradeoff is not resolvable at this layer.
