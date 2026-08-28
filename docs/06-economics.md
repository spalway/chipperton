# Cost, runway, and which numbers are measured

Prices are fixed in **lamports**, not dollars. The USD figure on the shop floats
with the SOL price and is recomputed per request — it is a display of the SOL
price, not the price itself.

## The cost ledger

Every model call writes a row recording real token counts priced at published
per-MTok rates:

```json
{ "kind": "inference", "usd": 0.027745,
  "detail": { "model": "claude-opus-5",
              "input_tokens": 1049, "output_tokens": 900,
              "priced": true } }
```

`priced: false` means the model was not in the rate table and the row recorded
$0. Those rows are visible rather than silently summed — an unnoticed zero is
its own quiet lie.

## Declared vs measured

`/api/status` carries three related fields, and the third is the important one:

| field | meaning |
|---|---|
| `dailyCostUsd` | the **declared** figure from config. An assumption. |
| `measuredDailyCostUsd` | the **observed** daily rate. Often `null`. |
| `dailyCostBasis` | `'measured'` or `'declared'` — which one runway used |

The site is required to follow `dailyCostBasis`. Runway may only be described as
measured when that field says so.

## Why measured is usually null

`measuredDailyCostUsd` returns null until there are **at least 5 observations
spanning at least 24 hours**.

This threshold exists because of a specific failure. The first delivered job
wrote one $0.0277 cost row. Dividing that by a one-day floor produced a "daily
rate" of $0.0277 — and a runway of **581 days on a $16 vault**. Every input was
real. The sample was one observation, 20 seconds old, extrapolated to a rate and
labelled measured.

The number was unavailable to be wrong for the entire period there was nothing
to measure, and became wrong the instant there was one thing.

Making the figure **unavailable** below a threshold is deliberate. The
alternative — publishing it with a caveat — asks every consumer to be
appropriately sceptical, and one of them eventually will not be.

## observedSpend is not a cost

There is a separate field for raw partial spend:

```json
"observedSpend": { "totalUsd": 0.027745, "sampleCount": 1,
                   "hoursObserved": 0.023,
                   "coversKinds": ["inference"], "isLowerBound": true }
```

Two qualifiers, both load-bearing:

- **not a rate** — it is a total over an observed window, however short
- **`isLowerBound: true`** — it covers only what the ledger tracks, which today
  is inference alone. **RPC calls and network fees are real costs and are not
  tracked yet.** The agent spends more than this figure, and we do not yet know
  how much more.

Any surface that renders this as "what the agent costs" is wrong.

## What runway actually means

```
runwayDays = vaultUsd / effectiveDailyCost
```

The numerator is counted on-chain. The denominator is declared until the ledger
earns the right to replace it. So today the honest reading is *"N days at its
declared daily cost"* — not *"N days of runway"* as a bare fact.

The vault balance is **never** derived from the ledger. Balance is counted;
spend is measured; runway divides one by the other. Deriving the balance by
subtracting assumed costs would put an assumption upstream of a measurement,
which is backwards.
