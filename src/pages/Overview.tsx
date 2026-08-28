import {
  AGENT,
  DECISIONS,
  etaBasisNote,
  measuredTurnaroundMins,
  runwayDays,
  sol,
  turnaroundLabel,
  usdApprox,
  type View,
} from '../data'
import Motto from '../components/Motto'
import Status from '../components/Status'
import { useResolved } from '../useLiveData'
import { short } from '../wallet'

const LINKS: { view: View; label: string; promo: string; green?: boolean }[] = [
  { view: 'shop', label: "chip's shop →", promo: '10% off if you pay with chips', green: true },
  { view: 'activity', label: 'activity →', promo: 'every on-chain move, as it happens' },
  { view: 'docs', label: 'docs →', promo: 'how the vault and the rules work' },
]

type Props = { go: (v: View) => void; openJob: (id: string | null) => void }

export default function Overview({ go, openJob }: Props) {
  // every figure below is derived from the day ledger / JOBS — nothing hand-typed
  const { services, queue, isLive, emptyQueue, deliveredToday, queueTotal, queueTruncated, queueLimit, status } =
    useResolved()
  // backlog comes from the server, never from counting rows — /api/queue is
  // paged, so a row count is "in this page" masquerading as "in total"
  const open = status ? status.backlog : queue.filter((j) => j.status !== 'delivered').length
  const turnaround = isLive ? null : measuredTurnaroundMins()
  // live figure when there is one; the sample ledger otherwise. Never a literal.
  const runway = isLive ? status?.runwayDays ?? null : runwayDays()
  const reviewMins = status ? Math.round(status.tickIntervalSeconds / 60) : AGENT.reviewMinutes

  const nav = (v: View) => (e: React.MouseEvent) => {
    e.preventDefault()
    go(v)
  }

  return (
    <div>
      <div className="bodyrow">
        <div>
          <div className="titlerow">
            <h1>{AGENT.name}</h1>
            {/* Was an "agent registry →" link with a dead href, promising a
                registry entry that was never created. The wallet is the thing
                that actually exists and can be checked, so it is what we link. */}
            {/* Nothing at all when there is no live status: in sample mode we do
                not have the agent's real address, and a placeholder one would be
                the same lie in a different font. */}
            {status?.vaultUrl && status.vaultAddress && (
              <a
                className="registry"
                href={status.vaultUrl}
                target="_blank"
                rel="noreferrer"
                title={status.vaultAddress}
              >
                {short(status.vaultAddress, 4, 4)} ↗
              </a>
            )}
          </div>

          <Motto />

          <div className="body">
            <p>
              Chipperton is an autonomous agent with its own wallet. It sells small Solana
              research jobs — token safety checks, wallet reports, transaction traces — and
              everything it earns lands in its own wallet, which it spends from on its own.
            </p>
            <p>
              It pays a fixed cost every day to keep running: compute, inference, RPC credits.{' '}
              <b>Nobody tops it up.</b> When the vault runs dry, it stops. Every job it takes and
              every tool it buys moves money, so each one leaves a transaction anyone can open.
              The work it turns down moves nothing — those decisions are published with its
              reasoning, but there is no receipt to check.
            </p>
            {/* This read "45.7 days" as a literal while the server reported 1.8.
                A hardcoded headline is fine until the data behind it moves, and
                then it is just a confident wrong number. */}
            <p>
              It reviews its queue every {reviewMins} minutes and decides what is worth doing.
              {runway == null ? (
                <> Its runway is not yet measurable.</>
              ) : (
                <>
                  {' '}
                  Right now it has <span className="g">{runway.toFixed(1)} days</span> of runway
                  left.
                </>
              )}
            </p>
            <p>
              Pay for any job in <b>$CHIPS</b> and it costs 10% less than the SOL or USDC price.
              Holding a minimum lets you submit a mission the agent may take, and holding more
              moves it up the queue. It is not equity, ownership, or a revenue share.
            </p>
          </div>

          <div className="links">
            {LINKS.map((l) => (
              <div className="row" key={l.view}>
                <a className={`lk${l.green ? ' g' : ''}`} href="#" onClick={nav(l.view)}>
                  {l.label}
                </a>
                <span className={`promo${l.green ? ' g' : ''}`}>{l.promo}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h1 className="agendatitle">agenda</h1>
          {/* "+$29.60 net" was a literal here. The server does not report a
              daily net, so rather than compute a lookalike we show what it does
              report — how much work actually went out today. */}
          <p className="agendadate">
            {isLive ? (
              <>
                {new Date().toISOString().slice(0, 10)} · {deliveredToday} delivered today
              </>
            ) : (
              <>
                {AGENT.date} · day {AGENT.day} · +$29.60 net
              </>
            )}
          </p>

          <Status go={go} openJob={openJob} />

          {DECISIONS.map((d, i) => (
            <div className="dec" key={i}>
              <div className="t">
                <span className={`tg ${d.kind}`}>
                  {d.kind === 'earn' ? 'Earn' : d.kind === 'spend' ? 'Spend' : 'Pass'}
                </span>
                <span className="amt">{d.amount}</span>
              </div>
              <div className="w">{d.why}</div>
            </div>
          ))}
        </div>
      </div>

      <section>
        <div className="shead">
          <h2>
            <i className="dot" />
            services<span className="n">{services.length}</span>
          </h2>
          <span className="meta">
            <a className="shoplink" href="#" onClick={nav('shop')}>
              chip's shop →
            </a>
          </span>
        </div>
        <div className="svcgrid">
          {services.map((s) => (
            <div
              className={`svc${s.active ? '' : ' soon'}`}
              key={s.id}
              onClick={() => go('shop')}
            >
              <div>
                <div className="n">{s.name}</div>
                <div className="d">{s.short}</div>
              </div>
              <div className="r">
                <div className="pz">{sol(s.priceSol)}</div>
                {/* absent, not zero, when the price feed is down */}
                {usdApprox(s.price) && <div className="pzu">{usdApprox(s.price)}</div>}
                <div className="tt">{s.active ? s.turnaround : 'soon'}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="shead">
          <h2>
            <i className="dot" />
            queue<span className="n">{open}</span>
          </h2>
          <span className="meta">
            {deliveredToday} delivered today
            {turnaround ? ` · ${turnaroundLabel(turnaround)} median turnaround, measured` : ''}
            {queueTruncated ? ` · showing ${queueLimit} of ${queueTotal}` : ''}
          </span>
        </div>
        {emptyQueue ? (
          <p className="emptyq">
            No orders yet. The queue is genuinely empty — this is live data, not a placeholder.
          </p>
        ) : (
        <table className="qt">
          <thead>
            <tr>
              <th>Job</th>
              <th>Service</th>
              <th>Paid in</th>
              <th>Status</th>
              <th>ETA</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((j) => (
              <tr key={j.id} onClick={() => { openJob(j.id); go('jobs') }}>
                <td className="id">{j.id}</td>
                <td className="nm">{j.service}</td>
                <td className="pay">
                  {/* the amount already says SOL, so the payer label is only
                      worth showing when it is something else */}
                  {j.chips && (
                    <>
                      <b>{j.payer}</b>{' · '}
                    </>
                  )}
                  {sol(j.amountSol)}
                  {usdApprox(j.amountUsd) && (
                    <span className="mut"> · {usdApprox(j.amountUsd)}</span>
                  )}
                </td>
                <td
                  className={`st${j.status === 'running' ? ' run' : j.status === 'delivered' ? ' done' : j.terminal ? ' ref' : ''}`}
                >
                  {j.status}
                </td>
                <td className="eta" title={j.etaMinutes != null ? etaBasisNote(j.etaBasis) : undefined}>
                  {j.status === 'delivered'
                    ? j.deliveredAt
                    : !j.awaitingDelivery
                      ? 'repaid'
                      : j.etaMinutes != null
                        ? `${j.etaMinutes} min`
                        : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </section>
    </div>
  )
}
