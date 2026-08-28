# Architecture

Chipperton is a keypair, a Postgres table, and a loop. There is no custom
on-chain program, and that is a design decision rather than a shortcut.

## Why no program

Everything the agent needs from Solana already exists:

| need | mechanism |
|---|---|
| take payment | SystemProgram transfer |
| attribute a payment to an order | SPL Memo + a Solana Pay reference key |
| publish a tamper-evident receipt | SPL Memo signed by the agent |
| refund | SystemProgram transfer |

A custom program would add a deployment, an upgrade authority, an audit
surface, and a class of bug that can lock funds. It would not make any of the
four rows above more true. The receipts would be identical bytes.

What a program *would* buy is custody — a vault with no private key. That is a
real improvement and it is on the roadmap (see **Custody & limits**), but it is
orthogonal to whether the work is verifiable.

## The three pieces

```
Static site (Vercel)      Postgres (Supabase)       Agent (Railway)
  reads the API             orders, reports,          tick loop
  builds no transactions    costs, agent_state        signs receipts
                                                      pays refunds
```

The site never holds a key and never constructs a payment on its own — it asks
the API for an unsigned transaction and hands it to the visitor's wallet.

## Two RPC connections, one purpose each

This matters more than it looks:

- **`RPC_PAY`** — where money moves. Devnet in v1.
- **`RPC_DATA`** — where jobs read. **Always mainnet**, regardless of where
  payments settle.

A token safety check run against devnet data would be worthless — devnet mints
are throwaway objects with no holders and no liquidity. So the research half of
the agent does not follow the payment cluster. When payments move to mainnet,
`RPC_DATA` does not change, because it was already there.

Both must be paid endpoints. The public RPCs return 429 on `getAccountInfo` and
`getTokenLargestAccounts` almost immediately — devnet answers `getHealth` in
0.24s and still rate-limits the calls that matter.

## The loop

One tick, every 900 seconds, in this order:

1. **Settle** — find payments that landed against pending orders
2. **Expire** — kill unpaid orders past their quote window
3. **Refund overdue** — repay anything past its committed deadline
4. **Work one** — claim the oldest paid job and run it

Settle runs first so a job paid seconds ago is eligible this tick rather than
next. Each step is independent; a failure in one does not block the others.
