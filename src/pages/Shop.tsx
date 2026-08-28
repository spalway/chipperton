import { useState } from 'react'
import {
  CHIPS,
  chipsPriceSol,
  measuredTurnaroundMins,
  sol,
  turnaroundLabel,
  usdApprox,
  type Service,
} from '../data'
import { useResolved } from '../useLiveData'
import Motto from '../components/Motto'
import BuyPanel from '../components/BuyPanel'
import { useWallet } from '../WalletProvider'

const STEPS = [
  {
    k: '01 · pay',
    t: "Connect a wallet and pay for a job. Funds go straight into the agent's own wallet.",
  },
  {
    k: '02 · queue',
    t: 'Your job enters the queue. Chipperton reviews the queue every fifteen minutes and picks what to run.',
  },
  {
    k: '03 · deliver',
    t: 'You get the report and an on-chain receipt. If it misses its estimate, Chipperton refunds you.',
  },
]

export default function Shop() {
  const { services, isLive, status, queue } = useResolved()
  const { address } = useWallet()
  const [buying, setBuying] = useState<Service | null>(null)
  // The server reports whether $CHIPS can actually be paid with. It is false
  // while the token has no mint — pump.fun is mainnet-only and payments settle
  // on devnet — so offering it would be a button that cannot work.
  const chipsEnabled = status ? status.chipsEnabled : true
  // server-side, so the price quoted here and the price orders honour cannot drift
  const discountPct = status?.chipsDiscountPct ?? CHIPS.discountPct
  const [payWith, setPayWith] = useState<'chips' | 'sol'>('chips')
  const pay = chipsEnabled ? payWith : 'sol'
  const backlog = status ? status.backlog : queue.filter((j) => j.status !== 'delivered').length
  const turnaround = isLive ? status?.medianTurnaroundMinutes ?? null : measuredTurnaroundMins()

  return (
    <div>
      <Motto green place="top" />
      <h1>chip's shop</h1>
      <div className="body">
        <p>
          Everything Chipperton sells. Pay up front, work starts when the transaction confirms,
          and you get a refund if it misses its own estimate.{' '}
          <b>Pay in $CHIPS and every price drops {discountPct}%.</b>
        </p>
      </div>

      <section>
        <div className="shead">
          <h2>
            <i className="dot" />
            pay with
          </h2>
          <span className="meta">payment goes straight to the agent&apos;s wallet</span>
        </div>
        <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div
            className={`opt${pay === 'chips' ? ' on' : ''}${chipsEnabled ? '' : ' soon'}`}
            onClick={() => chipsEnabled && setPayWith('chips')}
          >
            <div className="l">
              $CHIPS<s>{chipsEnabled ? 'token holders' : 'not available until the token launches'}</s>
            </div>
            <span className={chipsEnabled ? 'off' : 'soonchip'}>
              {chipsEnabled ? `−${discountPct}%` : 'soon'}
            </span>
          </div>
          <div className={`opt${pay === 'sol' ? ' on' : ''}`} onClick={() => setPayWith('sol')}>
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
            services<span className="n">{services.length}</span>
          </h2>
          <span className="meta">
            backlog {backlog} job{backlog === 1 ? '' : 's'}
            {turnaround ? ` · ${turnaroundLabel(turnaround)} median turnaround, measured` : ''}
          </span>
        </div>
        <div className="shop">
          {services.map((s) => (
            <div className={`item${s.active ? '' : ' soon'}`} key={s.id}>
              <div className="top">
                <span className="n">{s.name}</span>
                <span className="pz">
                  {/* SOL leads because it is exact and it is what the wallet
                      charges. The USD conversion floats and can be null, so it
                      can never be the only price on the card. */}
                  {sol(s.priceSol)}
                  {usdApprox(s.price) && <s className="approx">{usdApprox(s.price)}</s>}
                  {/* only quote the discounted price when it can actually be paid */}
                  {s.active && chipsEnabled && <s>{chipsPriceSol(s.priceSol, discountPct)} in chips</s>}
                </span>
              </div>
              <div className="d">{s.long}</div>
              <div className="foot">
                <span className="tt">{s.active ? s.turnaround : 'not yet available'}</span>
                {s.active ? (
                  <button className="buy" type="button" onClick={() => setBuying(s)}>
                    {address ? 'Buy' : 'Buy →'}
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

      {buying && <BuyPanel service={buying} onClose={() => setBuying(null)} />}

      <Motto green place="bottom" />
    </div>
  )
}
