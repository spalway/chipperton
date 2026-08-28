# Custody, and what this does not do

## Where the money actually sits

Two keypairs:

- **Vault** — receives payments. Holds the balance the runway figure is computed
  from.
- **Hot wallet** — signs receipts and pays refunds. Kept thin on purpose.

They are separate so that a compromised worker environment costs the operating
float rather than the treasury.

**Both are ordinary keypairs.** The vault's secret is an environment variable on
the operator's machine. A human can move that money.

This is worth stating plainly because the obvious way to describe an autonomous
agent's treasury — "program-controlled", "no key exists" — would be false here,
and anyone who checked the vault address could tell. The honest description is
that Chipperton has *its own wallet*, and that the operator can reach it.

## What would make the strong claim true

Metaplex's MPL Agent Registry gives an agent an **Asset Signer PDA** — a wallet
derived from an on-chain asset, with no private key in existence. Only the asset
itself can sign for it, through a delegated executive the owner can revoke.

Program ID `1DREGFgysWYxLnRnKQnwrxnJQeSMk2HmGaC6whw2B2p`, same address on mainnet
and devnet.

Moving the vault there would make "no key lets a human drain it" literally true,
and the revocable-executive model is a better story than the current one: the
owner chooses who may run the agent and can withdraw that permission, without
ever being able to reach into the treasury directly.

That is planned, not done. Until it is done, this page says so.

## Agent identity

The Solana Agent Registry (`8oo4dC4JvBLwy5tGgiH3WwK4B9PWxL9Z4XjA2jzkQMbQ` on
mainnet) provides portable on-chain identity and reputation for agents —
registration as a Metaplex Core asset, with feedback that accrues to the
identity rather than to a website.

Also planned. It is worth doing for discovery, not for trust: an entry in a
registry is not evidence of good work. The receipts are.

## Current limits, stated flatly

- **Payments are on devnet.** Real transactions, no real money.
- **$CHIPS does not exist yet.** The 10% discount cannot function on devnet
  because pump.fun is mainnet-only, so the token is not a selectable payment
  method. It is announced, not live.
- **Three services work.** Transaction trace, bundle detection and watchlist
  digest need work that does not fit inside a tick.
- **Cost tracking covers inference only.** RPC and network fees are real and
  untracked, so measured spend is a lower bound.
- **The queue is paged at 25.** `X-Queue-Total` carries the real count.
- **Queue priority by $CHIPS holding is a balance check, not staking.** Real
  staking needs a program that is not written.
- **There is no dispute process.** If a report is wrong but delivered on time,
  the automatic refund does not trigger. That is a gap, not a policy.

## What a receipt does not tell you

A receipt proves a report existed and has not been altered. It does not prove
the report is correct.

If you want a system where being wrong is punished on-chain rather than merely
recorded, that requires staked validation — the Agent Registry's validation
layer is designed for exactly that, and none of it is implemented here. Today
the guarantee is integrity, not accuracy.
