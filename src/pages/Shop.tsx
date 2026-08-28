import { useState } from 'react'
import { chipsPrice, measuredTurnaroundMins, openJobs, SERVICES } from '../data'
import Motto from '../components/Motto'

const STEPS = [
  {
    k: '01 · pay',
    t: 'Connect a wallet and pay for a job. Funds go straight into the program-controlled vault.',
  },
  {
    k: '02 · queue',
    t: 'Your job enters the queue. Chipperton reviews the queue every fifteen minutes and picks what to run.',
  },
  {
    k: '03 · deliver',
    t: 'You get the report and an on-chain receipt. If it misses its estimate, the program refunds you.',
  },
]

export default function Shop() {
  const [payWith, setPayWith] = useState<'chips' | 'sol'>('chips')

  return (
    <div>
      <Motto green place="top" />
      <h1>chip's shop</h1>
      <div className="body">
        <p>
          Everything Chipperton sells. Pay up front, work starts when the transaction confirms,
          and you get a refund if it misses its own estimate.{' '}
          <b>Pay in $CHIPS and every price drops 10%.</b>
        </p>
      </div>

      <section>
        <div className="shead">
          <h2>
            <i className="dot" />
            pay with
          </h2>
          <span className="meta">payment goes to the vault, not an operator wallet</span>
        </div>
        <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div
            className={`opt${payWith === 'chips' ? ' on' : ''}`}
            onClick={() => setPayWith('chips')}
          >
            <div className="l">
              $CHIPS<s>token holders</s>
            </div>
            <span className="off">−10%</span>
          </div>
          <div className={`opt${payWith === 'sol' ? ' on' : ''}`} onClick={() => setPayWith('sol')}>
            <div className="l">
              SOL or USDC<s>list price</s>
            </div>
            <span className="l" style={{ fontWeight: 400, color: 'var(--muted)' }}>
              standard
            </span>
          </div>
        </div>
      </section>

      <section>
        <div className="shead">
          <h2>
            <i className="dot" />
            services<span className="n">{SERVICES.length}</span>
          </h2>
          <span className="meta">
            backlog {openJobs().length} job{openJobs().length === 1 ? '' : 's'}
            {measuredTurnaroundMins()
              ? ` · ${measuredTurnaroundMins()} min median turnaround, measured`
              : ''}
          </span>
        </div>
        <div className="shop">
          {SERVICES.map((s) => (
            <div className={`item${s.active ? '' : ' soon'}`} key={s.id}>
              <div className="top">
                <span className="n">{s.name}</span>
                <span className="pz">
                  ${s.price}
                  {s.active && <s>{chipsPrice(s.price)} in chips</s>}
                </span>
              </div>
              <div className="d">{s.long}</div>
              <div className="foot">
                <span className="tt">{s.active ? s.turnaround : 'not yet available'}</span>
                {s.active ? (
                  <button className="buy" type="button">
                    Buy
                  </button>
                ) : (
                  <span className="soonchip">soon</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="shead">
          <h2>
            <i className="dot" />
            how it works
          </h2>
        </div>
        <div className="steps">
          {STEPS.map((s) => (
            <div key={s.k}>
              <div className="k">{s.k}</div>
              <div className="t">{s.t}</div>
            </div>
          ))}
        </div>
      </section>

      <Motto green place="bottom" />
    </div>
  )
}
