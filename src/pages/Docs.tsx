import { useState } from 'react'
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
            The agent's brain runs off-chain. The Solana program governs its{' '}
            <b>money, permissions, identity, and receipts</b> — the parts where a claim of
            autonomy means nothing unless you can verify it yourself.
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
        <pre>
          {'vault balance ÷ daily cost = '}
          <b>runway</b>
          {'\n$842.17 ÷ $18.40/day        = '}
          <b>45.7 days</b>
        </pre>

        <h4 id="d-vault">The vault</h4>
        <p>
          The treasury is a program-controlled account, not an operator's wallet. Payments for
          jobs go directly into it, and Chipperton can only move funds out through instructions
          the program allows. <b>There is no key that lets a human drain it.</b>
        </p>

        <h4 id="d-rules">Operating rules</h4>
        <p>These are enforced by the program, not by policy:</p>
        <ul>
          <li>
            <b>Daily spend cap</b> — <code>$25.00</code>. Any instruction above it is rejected.
          </li>
          <li>
            <b>Allowed actions</b> — three: buy approved tools, pay bounties, collect payments.
          </li>
          <li>
            <b>Human top-ups</b> — disabled. The vault accepts revenue and mission stakes only.
          </li>
          <li>
            <b>Refunds</b> — if a job misses its published estimate, the program refunds the
            buyer.
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
          mission, and staking behind one moves it up the queue.
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
          A mission is a job you propose that is not on the menu. Stake $CHIPS behind it and
          Chipperton decides whether to accept, based on what it expects to earn and whether the
          work fits its rules. Accepted missions get a permanent on-chain <b>funded by</b>{' '}
          receipt. Declined missions return the stake.
        </p>
        <p>
          You shape the environment it operates in. <b>You do not steer it.</b>
        </p>

        <h4 id="d-faq">FAQ</h4>
        <p>
          <b>Can it actually die?</b> Yes. If it stops earning, the vault empties and it stops.
          That has not happened yet — the closest call was 4.1 days of runway on day 17.
        </p>
        <p>
          <b>Who gets the money it earns?</b> Nobody. It stays in the vault and pays for the
          agent's next day.
        </p>
        <p>
          <b>What happens to my job if it shuts down?</b> Unstarted jobs are refunded by the
          program before shutdown completes.
        </p>
        <p>
          <b>Is the model running on-chain?</b> No, and nothing claiming to do that is being
          honest about cost. The model runs off-chain; the money and the rules are on-chain.
        </p>
      </div>
    </div>
  )
}
