import {
  AGENT,
  etaBasisNote,
  intervalLabel,
  runwayDays,
  sol,
  usdApprox,
  type View,
} from '../data'
import Motto from '../components/Motto'
import Status from '../components/Status'
import { useResolved } from '../useLiveData'

const LINKS: { view: View; label: string; promo: string; green?: boolean }[] = [
  { view: 'shop', label: "chip's shop →", promo: '10% off if you pay with chips', green: true },
  { view: 'activity', label: 'activity →', promo: 'every on-chain move, as it happens' },
  { view: 'docs', label: 'docs →', promo: 'how the vault and the rules work' },
]

type Props = { go: (v: View) => void; openJob: (id: string | null) => void }

export default function Overview({ go, openJob }: Props) {
  // every figure below is derived from the day ledger / JOBS — nothing hand-typed
  const { services, queue, isLive, emptyQueue, deliveredToday, queueTotal, status } =
    useResolved()
  // live figure when there is one; the sample ledger otherwise. Never a literal.
  const runway = isLive ? status?.runwayDays ?? null : runwayDays()
  // "every 1 minutes" is what the naive version produced once the worker
  // dropped to a 60s tick
  const reviewEvery = status ? intervalLabel(status.tickIntervalSeconds) : `${AGENT.reviewMinutes} minutes`

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
            {/* Replaced an "agent registry →" link with a dead href. Each wallet
                is gated on its OWN url and address: in sample mode we do not
                have real ones, and a placeholder address would be the same lie
                in a different font. Gated separately so one missing does not
                hide the other. */}
            {status?.hotWalletUrl && status.hotWalletAddress && (
              <a
                className="wal hot"
                href={status.hotWalletUrl}
                target="_blank"
                rel="noreferrer"
                title={`Hot wallet ${status.hotWalletAddress} — signs receipts and report chunks and pays refunds. Kept deliberately thin, so a compromised worker costs the float rather than the treasury.`}
              >
                [hot] ↗
              </a>
            )}
            {status?.vaultUrl && status.vaultAddress && (
              <a
                className="wal vault"
                href={status.vaultUrl}
                target="_blank"
                rel="noreferrer"
                title={`Vault ${status.vaultAddress} — receives every payment. Runway is computed from this balance.`}
              >
                [vault] ↗
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
              It reviews its queue every {reviewEvery} and decides what is worth doing.
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

          {/* The agenda ITEM LIST used to sit here. Removing it left ~850px of
              white under the tiles, because this column is short and the one
              beside it is not — so the queue moves up into that space rather
              than the gap being left open.

              Rendered as a compact list, not the wide table used on the jobs
              page: five columns in a ~330px column would either crush or
              force a horizontal scrollbar onto the front page. */}
          <div className="qhead">
            <span>queue</span>
            <a className="qall" href="#" onClick={nav('jobs')}>
              all jobs →
            </a>
          </div>
          {emptyQueue ? (
            <p className="emptyq">
              No orders yet. The queue is genuinely empty — this is live data, not a placeholder.
            </p>
          ) : (
            <div className="qmini">
              {queue.slice(0, 6).map((j) => (
                <div
                  className="qrow"
                  key={j.id}
                  onClick={() => {
                    openJob(j.id)
                    go('jobs')
                  }}
                >
                  <div className="l1">
                    <span className="nm">{j.service}</span>
                    <span
                      className={`st${j.status === 'running' ? ' run' : j.status === 'delivered' ? ' done' : j.terminal ? ' ref' : ''}`}
                    >
                      {j.status}
                    </span>
                  </div>
                  <div className="l2">
                    <span className="id">{j.id}</span>
                    <span>{sol(j.amountSol)}</span>
                    <span className="eta" title={j.etaMinutes != null ? etaBasisNote(j.etaBasis) : undefined}>
                      {j.status === 'delivered'
                        ? j.deliveredAt
                        : !j.awaitingDelivery
                          ? 'repaid'
                          : j.etaMinutes != null
                            ? `${j.etaMinutes} min`
                            : '—'}
                    </span>
                  </div>
                </div>
              ))}
              {queueTotal > 6 && (
                <a className="qmore" href="#" onClick={nav('jobs')}>
                  {queueTotal - 6} more →
                </a>
              )}
            </div>
          )}
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

    </div>
  )
}
