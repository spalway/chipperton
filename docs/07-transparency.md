# What is published

Every delivered report is published in full, on Solana, and on this site.

Not a hash of it. Not a summary. The report body, byte for byte, in memo
transactions signed by the agent.

## How it lands on chain

A finished report is split into ~830-byte chunks and written as an ordered run
of SPL Memo transactions:

```
chp:1:rpt:<orderId>:1/5:# Token safety check\n\nMint: DezXAZ8z...
chp:1:rpt:<orderId>:2/5:...
chp:1:rpt:<orderId>:5/5:...
```

Then the receipt lands last:

```
chp:1:done:<orderId>:<sha256 first 16 hex>
```

The receipt is written **after** every chunk confirms, so a receipt only ever
exists for a report that fully published. If a chunk fails partway, the job is
refunded instead of delivered.

Cost: five memo transactions plus the receipt, about 30,000 lamports — roughly
a third of a cent against a job priced in dollars.

## Rebuilding a report from Solana alone

You do not need this site.

1. Open the agent's wallet on Solscan.
2. Find the `chp:1:rpt:<orderId>:i/n:` transactions for the order you want.
3. Strip each memo's prefix and concatenate the payloads in index order.
4. Hash the result — first 16 hex of SHA-256 — and compare to the receipt.

```bash
printf '%s' "$REBUILT" | sha256sum | cut -c1-16
```

If it matches the receipt memo, you have the exact report the agent delivered.

This has been verified end to end: report 0406 reassembled from five on-chain
memos is byte-identical to the delivered text, and hashes to
`b9b72a1a8e5c004e`, the value in its receipt.

## Chunking is byte-safe

Reports contain em dashes and typographic quotes, which are multi-byte in UTF-8.
Chunk boundaries walk backwards off continuation bytes so a character is never
split across two transactions — a naive byte slice would write permanent
mojibake into the chain.

## Reading it from the API

```
GET /api/reports/:orderId
```

No authentication. Returns the report body, the queried input, the hash, the
receipt link, and the ordered chunk links. It serves what anyone could already
reassemble from Solana; the endpoint is convenience, not disclosure.

Orders that were refunded or expired return 404 with the reason — there was no
delivery, so there is no report and never will be.

## What is not published

The **payer wallet** is not on the report endpoint. The payment transaction is
public on-chain like any Solana payment, so the information exists; this site
simply does not put the buyer's address next to their report.

An **access token** is still issued per order and still gates
`/api/orders/:id`, which carries the payer wallet alongside everything else.

## A note on compute, for anyone building similar

The binding constraint on memo size is not transaction size — it is compute.
The memo program validates UTF-8, and that cost scales with length: a 560-byte
memo consumes ~198,000 CU against a 200,000 default. It fails with a bare
"Transaction simulation failed" while the transaction is barely half full.
Raise the compute unit limit and ~1,000-byte memos land fine.
