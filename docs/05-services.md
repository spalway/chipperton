# What the services actually read

Every service works the same way, and the structure is the point:

1. Gather **facts** from mainnet RPC and public APIs. Deterministic. No model.
2. Render those facts into a block. Still no model.
3. Ask a model to write a verdict **over that block**.

The numbers in a report are always reproducible from public data. The model
never generates a figure, because it never sees the raw sources — only the facts
block that is already in the report you receive. It cannot invent a holder
percentage, because it is not the thing that counted holders.

Model: `claude-opus-5` at `effort: low` — a short, bounded judgement over facts
already assembled.

---

## Token safety check — 0.05 SOL

Reads:

- `getAccountInfo(mint, jsonParsed)` → token program (SPL Token vs Token-2022),
  decimals, supply, **mint authority**, **freeze authority**
- `getTokenLargestAccounts(mint)` → top 10 accounts and their share of supply
- Jupiter Price API v3 → USD price, reported liquidity, and whether the mint
  routes at all

Flags raised automatically:

| condition | why it matters |
|---|---|
| mint authority live | supply can be inflated |
| freeze authority live | balances can be frozen |
| top 10 > 50% | concentrated enough that one exit moves price |
| does not route on Jupiter | no reachable liquidity |
| liquidity < $10,000 | thin |
| Token-2022 mint | may carry transfer hooks or fees — check extensions |

**Known limits, stated in every report:** top-holder addresses are unlabelled.
Exchange custody wallets, bridge accounts, LP vaults and locked treasury all
appear in that list and none of them represent one person's discretionary stack.
A concentration figure without labels cannot be read as insider control and
cannot be dismissed as benign.

## Wallet activity report — 0.04 SOL

Reads `getSignaturesForAddress` (paged, capped at 500) plus `getTransaction` on
the most recent 25, producing: balance, activity span, failure count, active
days, busiest hour, programs touched, frequent counterparties, and net SOL flow.

**The cap is disclosed in the report, not hidden.** Signatures return
newest-first, so on a busy address 500 signatures may span only hours. When the
cap is hit the report says *"Sample window"* and states outright that the window
is **not** the age of the account. "First seen" is only claimed when the entire
history actually fit.

This was a real bug before it was a feature — the report once stated that a 2022
token's mint was first seen that morning. Every number in it was true; the label
claimed more than the data supported.

## Program IDL brief — 0.075 SOL

Resolves the Anchor IDL account, inflates the compressed IDL, and explains each
instruction in plain English: what it does, what accounts it touches, and which
of them hold authority.

Only works for programs that publish an IDL on-chain. Programs that do not are
refused rather than guessed at — and a refused job is refunded.

---

## Not yet available

**Transaction trace**, **bundle / cluster detection** and **watchlist digest**
are listed but not orderable. They need recursive multi-hop transaction walks or
scheduled monitoring, neither of which finishes inside a single worker tick.
They are shown because they are planned, and greyed because offering something
the system cannot do is the same error as quoting a price nobody can pay.

`/api/services` returns `active` per service. The shop reads that field — it is
not a hardcoded list, so these light up when the backend can serve them.
