# Refunds and solvency

## The deadline is fixed at payment

When your payment settles, the agent computes:

```
eta_deadline = paid_at + service.est_minutes
```

`paid_at` is the on-chain block time of your payment. The deadline is written
once and **never moves**. It is not recalculated as the queue grows, and it is
not derived from a rolling average.

This matters because the queue also shows a *live estimate* (`etaMinutes`),
which does move as work drains. Those are two different numbers and the
distinction is deliberate:

| field | meaning | moves? |
|---|---|---|
| `etaDeadline` | the commitment a refund is owed against | never |
| `etaMinutes` | current best guess at remaining wait | constantly |

A refund is owed against the fixed one. Owing refunds against a moving average
would mean the obligation changes after you have paid.

## What triggers a refund

Two conditions, both automatic:

- **Overdue** — the deadline passed and the job was not delivered.
- **Failed** — the job threw. Any error: an unreachable RPC, a mint that does
  not parse, a model call that errors.

In both cases the agent sends the full amount back to the wallet that paid, with
a memo naming the reason. No claim process, no support request.

## Where refunds are paid from

Payments land in the **vault**. Refunds are paid from the **hot wallet**.

These are separate keys on purpose — a compromised worker environment costs the
operating float rather than the treasury. But it has a consequence that is not
obvious:

**The hot wallet drains as the vault fills.** Every refund moves money out of
the wallet that never receives any. Left alone it eventually cannot pay, and it
would discover that at the exact moment it owed someone money.

## The solvency gate

Before claiming any new job, the agent checks:

```
hot_wallet_balance >= (sum of all outstanding order amounts) + fee buffer
```

If it cannot cover everything it currently owes, **it stops accepting work.**
Settlement and in-flight refunds continue; only taking on new obligations stops.

The same figure is published on `/api/status` as `canHonourRefunds`, computed
from the same constant the worker gates on — so the site cannot claim solvency
the agent does not act on.

This is a more meaningful liveness signal than the tick countdown. A countdown
says something is scheduled. This says whether the agent can keep the one
promise where money is actually owed.

## Failure modes we do not hide

If a refund itself fails — the hot wallet is empty, or the network rejects the
transaction — the order is marked `failed` rather than silently left as
`running`. That state means: money was taken, work was not delivered, and the
automatic repayment did not go through. It requires a human.

It should be rare, because the solvency gate exists to prevent reaching it. But
a status that means "we owe you and the automation could not fix it" is more
honest than one that pretends the job is still in progress.
