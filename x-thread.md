# Chipperton — X thread

Each block is one post. Counts verified under 280 so it works on a free account
too. `ARTICLE.md` is the long-form version if you want a linked companion.

---

**1/**

Chipperton is an autonomous agent on Solana. It sells research jobs — token
safety checks, wallet reports, IDL briefs.

Every report it delivers is published on-chain. In full. Not a hash — the whole
thing.

Rebuild any report from Solana alone and prove it never changed. 🧵

---

**2/**

There's no custom program, and that's deliberate.

Payments are SystemProgram transfers. Receipts are SPL Memos signed by the
agent. Reports are memos too, chunked.

A program adds a deploy, an upgrade authority, and a way to lock funds. It
wouldn't make any of it more true.

---

**3/**

Taking payment without a program is easy. Proving *which order* a transaction
paid for is the hard part.

Each order gets a single-use reference key, attached to your payment as a
read-only account.

Validators index by it, so we find your payment without being told.

---

**4/**

Here's what most integrations get wrong.

Anyone can put your reference key into any transaction.

Finding it in a confirmed tx proves a transaction *mentioned* it. Not that it
paid you. Not the right amount. Not at all.

Settle on that alone and you accept transfers of zero.

---

**5/**

So the reference only *locates* the transaction. The real check enforces:

→ transfer must be the LAST instruction (no clawback after)
→ amount read from pre/post balance metadata, not instruction data
→ memo matches the order
→ recipient is the vault

Only then does it settle.

---

**6/**

On delivery the agent signs one memo:

`chp:1:done:<order>:<sha256 first 16>`

Check it yourself:

`printf '%s' "$(cat report.txt)" | sha256sum | cut -c1-16`

Match = that's the report it committed to.
No match = it changed since delivery.

---

**7/**

A receipt does NOT prove the report is correct.

It's an integrity guarantee, not a quality one. The agent can commit to a wrong
conclusion as firmly as a right one.

What it removes is quietly editing a report after the fact — like changing a
verdict after a token moved.

---

**8/**

The whole report goes on-chain. ~830-byte chunks, ordered:

`chp:1:rpt:<order>:1/5:# Token safety check…`

The receipt lands LAST, after every chunk confirms — so a receipt only ever
exists for a report that fully published.

Total cost: about a third of a cent.

---

**9/**

Building this, a finding worth passing on:

the limit on memo size is COMPUTE, not transaction size.

The memo program validates UTF-8. 560 bytes ≈ 198k CU against a 200k default.

It fails as "Transaction simulation failed" while the tx is half empty. Raise
the CU limit.

---

**10/**

It refunds you if it misses its estimate or the job fails.

That's only worth something if it can pay — so it checks *before* taking your
money. The refund wallet must cover your job plus everything already owed.

If it can't, the sale is refused rather than taken.

---

**11/**

> "Chipperton is not accepting orders — it cannot currently cover a refund for
> this job, so it will not take payment for it."

The shop closing is the promise working, not failing.

---

**12/**

Every number on the site either measures something or says it doesn't.

Turnaround is MEASURED — two on-chain blockTimes. Recompute it from the
signatures yourself.

Runway is a PROJECTION and says so: "at its declared cost", until the ledger has
enough history to observe it.

---

**13/**

What it doesn't do:

→ 3 services live, 3 greyed out. Offering what you can't deliver is the same
error as quoting a price nobody can pay.
→ reports are public, and so is who ordered them
→ the vault is an ordinary keypair. A human can move it.
→ no dispute process

---

**14/**

The chain doesn't enforce the rules.

It produces the evidence to check whether they were kept.

chipperton.fun
