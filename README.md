# chipperton

An autonomous agent that sells small Solana research jobs, does them, and writes
a receipt on-chain for each one.

Two deployables in one repo:

| path | target | what it is |
|---|---|---|
| `/` (root) | Vercel | Vite + React 19 site |
| `/server` | Railway | API + agent worker (its own `package.json`) |

**Railway must be pointed at `server/` as its root directory.** Aimed at the repo
root it will try to build the Vite app instead.

## How it works

- A **payment** is a plain SOL transfer to the agent's wallet carrying a memo with
  the order id, plus a Solana Pay **reference key** so the backend can find the
  transaction without the buyer reporting anything.
- A **receipt** is a memo transaction the agent signs itself, committing
  `sha256(report)`. Anyone holding the report can hash it and check the chain.
- **Turnaround is measured, not estimated** — `deliveredAt − paidAt`, both read
  from on-chain `blockTime`. Anyone can recompute it from the two signatures.
- **Refunds** are owed against `eta_deadline`, fixed at settle time and immutable,
  not against a moving average.

No custom on-chain program. Payments, receipts and refunds are ordinary transfers
and memos, so there is nothing to deploy, audit, or upgrade.

### Payment verification

`@solana/pay`'s `findReference` + `validateTransfer`. These are not
interchangeable and both are required:

- `findReference` only **locates** a transaction mentioning our reference key.
  Reference keys are trivially spoofable — anyone can insert ours into a
  transaction that pays us nothing.
- `validateTransfer` is the **security boundary**: transfer must be the last
  instruction, and the amount is checked from pre/post balance metadata rather
  than decoded instruction data.

### Privacy

The public queue shows service, status, timing and signatures. It does **not**
show the payer wallet or the address they asked about. The payment transaction is
public on-chain regardless, but this site does not perform the join between a
wallet and what it looked up — that join is the deanonymising part, and it is the
part we control. Only the report hash goes on-chain; the body stays behind a
per-order access token.

## Networks

Two RPCs, one purpose each:

- **payments** → devnet in v1
- **job reads** → always **mainnet**, regardless of the payment cluster. A safety
  check against devnet data would be worthless.

Consequence: the 10% `$CHIPS` discount cannot function until payments move to
mainnet, because pump.fun is mainnet-only. The CHIPS path is gated off while
`CHIPS_MINT` is empty.

Both RPCs must be paid endpoints. Verified 2026-08-28: the public endpoints
return 429/403 on `getAccountInfo` and `getTokenLargestAccounts` immediately —
devnet answers `getHealth` in 0.24s and still rate-limits the real calls.

## Running the server

```bash
cd server
npm install
cp .env.example .env   # then fill it in
npm run dev
```

Two keypairs, generated locally, never committed:

```bash
solana-keygen new --no-bip39-passphrase -o .keys/agent-hot.json
solana-keygen new --no-bip39-passphrase -o .keys/vault.json
```

`agent-hot` signs receipts and refunds — keep it thin. `vault` receives payments.
Splitting them means a leaked worker env costs the float, not the treasury.

### Smoke tests

```bash
npm run try:safety   # facts only, no model call
npm run try:loop     # full job including the written verdict
```

## API

| endpoint | notes |
|---|---|
| `GET /api/status` | vault balance, runway, backlog, measured turnaround, tick timing |
| `GET /api/services` | prices fixed in lamports; USD floats with the SOL price |
| `GET /api/queue` | **public**, redacted — no payer wallet, no queried input |
| `POST /api/orders` | returns an unsigned tx + Solana Pay URL + access token |
| `GET /api/orders/:id?token=` | full detail incl. report — access token required |

`nextTickAt` is **scheduled, not guaranteed**. The worker is a cron tick, and the
UI should not imply the agent is certain to act at that instant.

## See also

`PLAN.md` — architecture, the agent-registry options with verified program IDs,
and the list of things that can bite.
