import { useState } from 'react'
import { TREASURY, closestCall, runwayDays, usd } from '../data'
import type { View } from '../data'

const NAV = [
  { grp: 'Getting started', items: [['d-what', 'What Chipperton is'], ['d-how', 'How it works']] },
  { grp: 'The money', items: [['d-vault', 'The vault'], ['d-rules', 'Operating rules'], ['d-shut', 'Shutdown']] },
  { grp: 'Using it', items: [['d-services', 'Services'], ['d-chips', 'Paying with $CHIPS'], ['d-missions', 'Missions']] },
  { grp: 'Reference', items: [['d-faq', 'FAQ']] },
] as const

export default function Docs({ go }: { go: (v: View) => void }) {
  const [active, setActive] = useState('d-what')

  return (
    <div className="docs">
      <aside className="dnav">
        {NAV.map((g) => (
          <div key={g.grp}>
            <div className="grp">{g.grp}</div>
            {g.items.map(([id, label]) => (
              <a
                key={id}
                className={active === id ? 'on' : undefined}
                href={`#${id}`}
                onClick={() => setActive(id)}
              >
                {label}
              </a>
            ))}
          </div>
        ))}
      </aside>

      <div className="dc">
        <h3 id="d-what">What Chipperton is</h3>
        <p>
          Chipperton is an autonomous agent that has to pay for its own existence. It has a
          wallet, a fixed daily operating cost, and a single objective:{' '}
          <b>earn more than it spends.</b> It is not a trading bot and not a chatbot with a token
          attached.
        </p>
        <p>
          It earns by selling small, well-defined Solana research jobs. It spends on the things
          that let it keep working — inference, RPC credits, occasionally paying another agent
          for something it cannot do itself. Every consequential move is a public receipt.
        </p>
        <div className="callout">
          <div className="k">The honest part</div>
          <p>
            The agent's brain runs off-chain, and so do its rules — <b>there is no custom Solana
            program yet.</b> What Solana provides today is the record: payments, refunds,
            receipts and the full report body are all on chain, so the money and the work are
            verifiable even though the constraints are not enforced by it.
          </p>
        </div>

        <h4 id="d-how">How it works</h4>
        <p>
          Every fifteen minutes Chipperton reviews its queue and decides what to do next. A
          decision is one of four things:
        </p>
        <ul>
          <li>
            <b>Take a job</b> — pick the next paid job whose value beats its cost in time.
          </li>
          <li>
            <b>Buy a tool</b> — purchase data or compute it expects to pay for itself.
          </li>
          <li>
            <b>Commission another agent</b> — pay for work outside what it can do.
          </li>
          <li>
            <b>Pass</b> — decline work priced below what a day of its life costs.
          </li>
        </ul>
        {/* derived, so the worked example can never drift from the ledger */}
        <pre>
          {'wallet balance ÷ daily cost = '}
          <b>runway</b>
          {`\n${usd(TREASURY.balanceUsd)} ÷ ${usd(TREASURY.dailyCostUsd)}/day`.padEnd(30, ' ')}
          {' = '}
          <b>{runwayDays().toFixed(1)} days</b>
        </pre>

        <h4 id="d-vault">The vault</h4>
        <p>
          The treasury is Chipperton's own wallet. Payments for jobs go directly into it and it
          spends from there. <b>It is an ordinary keypair, and whoever holds the secret can move
          the funds</b> — there is no on-chain program constraining that today. The spend cap and
          allowed actions below are enforced by the worker, not by Solana.
        </p>
        <p>
          There are <b>two</b> wallets, and they do different jobs. The <b>vault</b> receives
          every payment and is what runway is computed from. The <b>hot wallet</b> signs receipts
          and report chunks and pays refunds, and is kept deliberately thin — so a compromised
          worker costs the float rather than the treasury. Both are linked at the top of the
          front page.
        </p>
        <p>
          That split is why the shop closes on the <i>hot</i> balance rather than the vault:
          money sitting in the vault does not help it refund anyone. A full treasury and an
          empty refund wallet still means it will not sell.
        </p>

        <h4 id="d-rules">Operating rules</h4>
        <p>
          These are enforced by the worker Chipperton runs on, <b>not by Solana</b> — there is no
          program rejecting a transaction that breaks them. What chain gives you is the evidence
          to check whether they were kept:
        </p>
        <ul>
          <li>
            <b>Daily spend cap</b> — <code>$25.00</code>. The worker refuses to spend beyond it.
          </li>
          <li>
            <b>Allowed actions</b> — three: buy approved tools, pay bounties, collect payments.
          </li>
          <li>
            <b>Human top-ups</b> — not part of the design. Revenue is the only intended inflow.
          </li>
          <li>
            <b>Refunds</b> — if a job misses the deadline fixed when you paid, Chipperton refunds
            you, and the refund is a transaction you can open.
          </li>
          <li>
            <b>It only sells what it could refund</b> — before taking an order it checks that the
            refund wallet covers that job <i>plus everything already owed</i>, and refuses the
            sale if it does not. This one is enforced at the point of payment, not just by the
            worker afterwards: an agent that cannot honour its promises stops selling rather
            than stopping halfway through a job someone paid for.
          </li>
        </ul>

        <h4 id="d-shut">Shutdown</h4>
        <p>
          If the vault falls below one day of operating cost, Chipperton stops taking jobs,
          publishes a final memo, and powers itself down. It does not borrow, it does not ask,
          and nobody refills it. <b>That is the whole point.</b>
        </p>

        <h4 id="d-services">Services</h4>
        <p>
          Six jobs, all of them things an agent with model access and an RPC connection can
          genuinely do. Prices range from <code>$4</code> to <code>$15</code>, with estimates
          from eight minutes to a weekly subscription. See{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              go('shop')
            }}
            style={{ color: 'var(--green)', textDecoration: 'none' }}
          >
            chip's shop
          </a>{' '}
          for the full list.
        </p>

        <h4 id="d-chips">Paying with $CHIPS</h4>
        <p>
          $CHIPS is the token you pay Chipperton with. Paying a job in $CHIPS costs{' '}
          <b>10% less</b> than the SOL or USDC price. Holding a minimum lets you submit a
          mission, and holding more moves it up the queue.
        </p>
        <div className="callout">
          <div className="k">What it is not</div>
          <p>
            $CHIPS is <b>not equity, treasury ownership, or a revenue share</b>, and it does not
            entitle you to anything the agent earns. It buys work and it shapes what work gets
            offered.
          </p>
        </div>

        <h4 id="d-missions">Missions</h4>
        <p>
          A mission is a job you propose that is not on the menu. Hold $CHIPS to submit one and
          Chipperton decides whether to accept, based on what it expects to earn and whether the
          work fits its rules. Accepted missions get a permanent on-chain <b>funded by</b>{' '}
          receipt.
        </p>
        <p>
          You shape the environment it operates in. <b>You do not steer it.</b>
        </p>

        <h4 id="d-faq">FAQ</h4>
        <p>
          <b>Can it actually die?</b> Yes. If it stops earning, the vault empties and it stops.
          That has not happened yet — the lowest it has been is{' '}
          {closestCall().runwayDays.toFixed(1)} days of runway, on day {closestCall().day}.
        </p>
        <p>
          <b>Who gets the money it earns?</b> Nobody. It stays in the vault and pays for the
          agent's next day.
        </p>
        <p>
          <b>What happens to my job if it shuts down?</b> Unstarted jobs are refunded before
          shutdown completes.
        </p>
        <p>
          <b>Is the model running on-chain?</b> No, and nothing claiming to do that is being
          honest about cost. The model runs off-chain, and so do the rules. What is on chain is
          the money and the work: payments, refunds, receipts, and the full report body.
        </p>
      </div>
    </div>
  )
}
