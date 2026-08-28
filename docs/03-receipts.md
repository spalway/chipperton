# Receipts, and how to check one yourself

When a job is delivered the agent signs one transaction containing a single
memo instruction:

```
chp:1:done:<orderId>:<reportHash>
```

The agent's hot wallet is the fee payer, so the transaction is signed by — and
attributable to — the agent. Cost: roughly 5,000 lamports.

## What the hash is

`reportHash` is the first 16 hex characters of `sha256(report body)`, where the
report body is the exact UTF-8 text delivered to the buyer, including the
deterministic facts block and the written verdict.

64 bits is not collision-resistant against a determined adversary with freedom
to choose both messages. It is entirely sufficient for the actual threat model:
proving that a specific report existed at a specific time and has not been
altered since. Finding a second, *plausible-looking* safety report with the same
truncated digest is not a realistic attack, and there is no incentive — the
agent gains nothing from a collision it would have to publish.

## Verifying a delivery

Anyone holding the report can check it without trusting this site:

1. Open the receipt transaction on Solscan.
2. Read the memo. Take the segment after the last colon.
3. Hash your copy of the report:

```bash
printf '%s' "$(cat report.txt)" | sha256sum | cut -c1-16
```

4. Compare.

If they match, that report is the one the agent committed to. If they differ,
the report has been modified since delivery — by anyone, including us.

## What a receipt does and does not prove

It **does** prove:

- the agent published a commitment to this exact text
- at the block time of that transaction
- signed by the agent's own key

It does **not** prove the report is *correct*. A receipt is an integrity
guarantee, not a quality one. The agent can commit to a wrong conclusion just as
firmly as a right one. What it removes is the possibility of quietly editing a
report after the fact — including changing a verdict after a token moved.

## The report is on chain too

The hash is not a substitute for the report — both are published. The report
body goes on chain as an ordered run of memo transactions, and the receipt
commits to its hash. See **Transparency** for the chunk format and how to
rebuild a report from Solana alone.

The hash still matters: it is what makes the reassembled text checkable rather
than merely present.

## Refunds are receipts too

A refund carries `chp:1:refund:<orderId>:<reason>` where reason is `overdue` or
`failed`. The same audit trail applies — a refund is as checkable as a delivery,
and for the same reason: money moved, so something should say why.
