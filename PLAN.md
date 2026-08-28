# Chipperton — build plan

**Verdict: feasible, and you do not need an Anchor program for v1.**
Every claim on the mockup maps onto plain transfers, SPL Memo, and RPC reads.
No custom program means no WSL, no deploy, no audit surface. Ship today.

---

## 1. The one idea that makes this simple

Chipperton is **a keypair with a cron loop**. That's it.

- A **payment** is a normal SOL (or CHIPS) transfer to the agent's wallet, with a
  memo carrying the order id, plus a Solana Pay **reference key** so the backend can
  find the tx without the user telling it anything.
- A **receipt** is a memo transaction the agent signs itself, containing the order id
  and the SHA-256 of the delivered report.
- The **vault balance** is just `getBalance`. Runway = balance ÷ daily cost. Real,
  and anyone can check it.
- The **queue** lives in Postgres. Only money and receipts touch the chain — which is
  correct, and also what a real agent would do.

Solscan shows: user pays in → agent's receipt tx out, hash-committed. That is the
whole "verifiable work" story, and it costs ~0.000005 SOL per receipt.

---

## 2. Architecture

```
Next.js 16 (Vercel)          Supabase (Postgres)        Worker (Railway)
  site + /api routes   <-->    orders, jobs,       <-->   tick loop every 60s
  builds pay tx                receipts, ledger           does the work
  polls reference key                                     writes memo receipts
```

Three pieces, all stack you already run. No new infrastructure category.

### Network split (decided)

v1 runs **payments on devnet, research jobs against mainnet**. Two RPC connections
with one purpose each:

- `RPC_PAY` → devnet. Orders, transfers, reference-key polling, memo receipts.
  Free to get wrong while the loop is unproven.
- `RPC_DATA` → mainnet, read-only. Every service reads mainnet, because a safety
  check on a devnet mint tells nobody anything.

This means the work is real from day one even though the money isn't. Flipping to
mainnet later is a one-line env change plus the CHIPS wiring in §4 — nothing in the
job code moves.

Consequence: the **10% CHIPS discount can't be exercised until the flip**, since
pump.fun is mainnet-only. Build the quote path against the real Jupiter API anyway
and gate the CHIPS pay option behind a feature flag.

### Payment flow (no program required)

1. User picks a service, picks SOL or CHIPS → `POST /api/orders`
2. Server creates order row, generates a random `reference` pubkey, and if paying in
   CHIPS locks a quote for 60s (see §4).
3. Server returns an unsigned tx:
   - `transfer(user → agentWallet, amount)` (SystemProgram for SOL,
     `transferChecked` for CHIPS)
   - `memo("chp:1:<orderId>")`
   - `reference` added as a **readonly non-signer account** — Solana Pay's trick.
4. Wallet signs. Backend polls `getSignaturesForAddress(reference)` until it lands,
   then verifies amount + destination from the parsed tx before marking paid.

That last verification step is the part people skip and it's the part that matters —
never trust the client's claim that it paid.

### Receipt flow

On completion the agent signs one tx:

```
memo("chp:1:done:<orderId>:<sha256(report) first 16 hex>")
```

Fee-payer is the agent wallet, so the receipt is signed *by the agent* and is
attributable. Refunds are `transfer(agent → user)` + `memo("chp:1:refund:<orderId>")`.

Post the report at `/j/<orderId>`; anyone can hash it and match the chain.

---

## 3. Services — cut from 6 to 3 for v1

All three are pure RPC reads plus one Claude summarization pass. No third-party
data vendor, no scraping.

| Service | Price | How it actually works |
|---|---|---|
| **Token safety check** | 0.05 SOL | `getAccountInfo(mint)` → mint/freeze authority, decimals, supply. `getTokenLargestAccounts` → top-10 concentration. Jupiter `/price/v3` → liquidity and whether it routes at all. Claude writes the verdict. |
| **Wallet activity report** | 0.04 SOL | `getSignaturesForAddress` (cap 1000) → batched `getTransaction` → counterparties, programs touched, volume, first/last seen. Claude summarizes. |
| **Program IDL brief** | 0.06 SOL | Anchor IDL PDA (`seeds = ["anchor:idl", programId]`), inflate the zlib blob, feed instructions + accounts to Claude → plain-English brief. |

**Deferred to v2:** transaction trace (recursive `getTransaction`, expensive and slow),
bundle/cluster detection (needs funding-graph walks), watchlist digest (needs its own
scheduler and delivery channel).

Cutting these three removes the only jobs that could blow past a 60s function limit.

---

## 4. CHIPS and the 10% discount

CHIPS is a pump.fun mint (SPL Token, 6 decimals). **You launch it manually — I won't
execute a token launch or any trade.**

**Pricing.** Prices are fixed in SOL. At order time:

```
chipsAmount = (solPrice * 0.90) * (solUsd / chipsUsd)
```

Both `solUsd` and `chipsUsd` come from `https://lite-api.jup.ag/price/v3?ids=<mint>,So111...112`
— free, no API key, verified working. Lock the quote in the order row with a
60-second expiry and accept ±2% slippage on arrival. If the quote expires, reject and
re-quote. That is the entire discount mechanism; no on-chain price logic.

**Treasury.** v1: the agent *holds* CHIPS and counts it toward the vault at spot.
Do **not** wire auto-swap on day one — an autonomous swap loop with a hot key is the
single largest thing that can go wrong. Add Jupiter swap in v2 behind a cap
(e.g. max 5% of vault per day, only when SOL runway drops under 7 days).

**Queue priority.** The mockup says *staking* moves you up the queue. Real staking
needs a program. For v1 check CHIPS balance with
`getTokenAccountsByOwner(user, { mint: CHIPS })` and call it **holding**, not staking.
One-word copy change, zero program.

---

## 5. Agent registry — both options are live, verified on-chain

I confirmed each of these is deployed and executable on mainnet:

| Registry | Program ID | Notes |
|---|---|---|
| **8004-solana** (QuantuLabs) | `8oo4dC4JvBLwy5tGgiH3WwK4B9PWxL9Z4XjA2jzkQMbQ` (mainnet)<br>`8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C` (devnet) | The one solana.com/agent-registry points at. `npm i 8004-solana` (v0.8.3). Agent = Metaplex Core NFT + IPFS registration file. Has reputation (`giveFeedback` / `getSummary`) and a public explorer at 8004.qnt.sh. **Needs a Pinata JWT.** |
| **MPL Agent Identity** (Metaplex) | `1DREGFgysWYxLnRnKQnwrxnJQeSMk2HmGaC6whw2B2p` | Same address on mainnet and devnet. `@metaplex-foundation/mpl-agent-registry` (v0.2.6). Gives the agent an **Asset Signer PDA — a wallet with no private key** — plus a revocable delegated executive. |
| MPL Agent Tools | `TLREGni9ZEyGC3vnPZtqUh95xQ8oPqJSvNjvB7FGK8S` | Executive registration and delegation. |

**Recommendation: register on 8004 today.** One transaction, it's the registry the
Solana Foundation is promoting, and it gives you a public explorer page to link from
the site — worth more for the narrative than anything else here.

**MPL Agent is the better custody model** and is the honest fix for §6. Do it in v2.

---

## 6. Copy that is currently false

### The custody claim — fix before anything ships

The docs page reads **"There is no key that lets a human drain it,"** and the
overview calls the vault **"program-controlled."** In v1 the vault is a keypair whose
secret sits in a Railway env var. A human can drain it, trivially.

That is not a wording preference. It is a false custody claim on a page that asks
people to send money, and it is the single most damaging line on the site.

Two ways out:

- **Today (5 min):** "its own wallet." Delete the no-human-key sentence outright —
  don't soften it, it has no true version in v1. Everything else stays literally true.
- **v2 (half a day):** register via MPL Agent Identity and hold funds in the Asset
  Signer PDA. Then "no private key exists" is *true*, and the revocable-executive
  model is a better story than the one on the page now.

Take the 5-minute option today. Do the real one this week.

### Staking

**"stakes"** → **"holds"** (§4). Real staking needs a program; a balance check doesn't.

### Network label — devnet is correct, leave it

`day 23 · solana devnet` **stays as-is.** An earlier draft of this section said to
change it to mainnet; that was written before the devnet-first decision in §2 and is
wrong. Payments are devnet. Research jobs read mainnet, but that's a backend detail
and shouldn't surface as a second network label in the header.

The real consequence — and it belongs on the page, not buried here — is that **the
10% $CHIPS discount cannot function while payments are on devnet**, because
pump.fun is mainnet-only. So the shop must not present CHIPS as a live payment
option today. Show the discount as announced-but-not-yet-active, consistent with the
existing "not deployed yet — CA on launch" treatment of the contract address. That
line is already honest; the CHIPS pay button would not be.

---

## 7. Pre-installs and signups

Already verified present on this machine — nothing to install:

```
node v24.18.0    npm 11.16.0    solana-cli 4.1.1 (Windows)
WSL: node v24.20.0, solana 3.1.10, anchor 1.1.2, rustc 1.98.0
```

WSL is **not needed for v1** — there's no program to build.

**Accounts to create (free tiers all fine):**

1. **Helius RPC key** — required. Public RPC will rate-limit
   `getSignaturesForAddress` polling within minutes. <https://helius.dev>
2. **Anthropic API key** — the agent's "inference" line item, and the thing that makes
   the daily cost real rather than decorative.
3. **Supabase project** — MCP already connected, can be provisioned from here.
4. **Railway project** — MCP already connected.
5. **Pinata JWT** — only if registering on 8004. <https://pinata.cloud>
6. **Vercel** — already in use.

**npm packages:**

```
@solana/pay              1.0.26   # findReference + validateTransfer — see below
@solana/kit              8.1.0    # plugin clients: createClient() + .use()
@solana/kit-plugin-rpc   0.18.0
@solana/kit-plugin-signer 0.18.0
@solana-program/memo     0.13.0   # getAddMemoInstruction
@solana-program/system   0.14.0
@solana-program/token    0.16.0   # transferChecked for CHIPS
@solana-program/compute-budget 0.18.0
@supabase/supabase-js
@anthropic-ai/sdk
8004-solana              0.8.3    # only for registry registration
```

All versions above verified against the npm registry.

> **Use `@solana/pay` — do not hand-roll payment verification.** It is the Solana
> Foundation's package, built on kit, and it already implements the exact flow in §2:
> `encodeURL()`, `createTransfer()`, `findReference(rpc, reference)`, and
> `validateTransfer(rpc, signature, { recipient, amount, splToken, reference, memo })`.
>
> `validateTransfer` does the checks correctly in ways that are easy to get wrong
> alone: it requires the transfer to be the **last** instruction, and it verifies the
> amount from **pre/post balance metadata** (`post - pre >= expected`) rather than
> trusting parsed instruction data. It validates the memo too.
>
> **This matters more than convenience.** Reference keys are trivially spoofable —
> anyone can insert your reference into any transaction. Finding your reference in a
> confirmed transaction proves nothing on its own. Without full validation of the
> associated transaction, the naive flow accepts a transaction that paid you nothing.

> **Do not use `gill`.** An earlier draft of this plan recommended it. The Solana MCP
> source catalogue now tags both `solana-gill-docs` and `gh-gill`
> *"do not use for new code — prefer @solana/kit plugin clients."* Verified against
> the live catalogue. `gh-solana-dev-skill` is the reference for the current stack
> (kit v7 `createClient` + `.use()`, Codama codegen, Surfpool/LiteSVM testing).

**Two keypairs, generated locally, never committed:**

```bash
solana-keygen new --no-bip39-passphrase -o agent-hot.json
```

- **agent-hot** — signs receipts and refunds. Keep it thin: a few SOL.
- **vault** — receives payments. Sweep from hot manually until v2.

Splitting these means a leaked worker env var costs you the float, not the treasury.

---

## 8. Order of work

**Today — ship the loop.**

1. Next.js 16 + Tailwind v4 scaffold; port `mockup.html` to components. Apply the §6
   copy changes.
2. Supabase schema: `orders`, `jobs`, `receipts`, `ledger`.
3. `POST /api/orders` → order + reference key + unsigned tx.
4. `GET /api/orders/:id` → poll `getSignaturesForAddress(reference)`, verify amount and
   destination, mark paid.
5. Worker: tick every 60s → claim oldest paid job → run it → store report →
   sign memo receipt → mark delivered. **Include the overdue-refund sweep here** (§9).
6. Ship **token safety check** first. Highest-demand job on the page and the easiest
   to make genuinely good.
7. Wire the live numbers: runway = `getBalance` ÷ daily cost, backlog = row count.
8. Deploy site → Vercel, worker → Railway.

**Then, same day if it holds:**

9. Launch CHIPS on pump.fun (you, manually). Drop the mint into env.
10. Jupiter quote path + 10% discount + hold-based queue priority.
11. Register on 8004, link the explorer page from the footer.
12. Add the other two services.

**This week:** MPL Agent PDA vault, capped auto-swap, transaction trace, bundle
detection.

---

## 9. What can actually bite you

- **Double-crediting.** Unique index on `orders.reference` and on the payment
  signature. Do the state transition in one Postgres update guarded on
  `status = 'pending'`, not in application logic.
- **Quote expiry races.** Store `quote_expires_at`; verify at settle time against the
  amount actually transferred, not the amount you quoted.
- **Underpayment.** Someone will send 90% of the CHIPS quote. Accept ±2%, refund
  anything below, log it.
- **Hot key in env.** Cap the hot wallet. Never log the secret. Never put it in the
  Next.js app — worker only.
- **The refund promise.** The mockup promises automatic refunds on missed ETAs. That
  means the worker needs an overdue sweep, or the page is lying. Build it in step 5,
  not later.
- **RPC cost.** `getSignaturesForAddress` polling is the expensive call. Poll each
  pending order at 3s for 2 min, back off to 30s, abandon at 15 min.
