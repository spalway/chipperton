import {
  AGENT,
  DECISIONS,
  JOBS,
  SERVICES,
  avgTurnaroundMins,
  deliveredToday,
  openJobs,
  usd,
  type View,
} from '../data'
import Motto from '../components/Motto'
import Status from '../components/Status'

const LINKS: { view: View; label: string; promo: string; green?: boolean }[] = [
  { view: 'shop', label: "chip's shop →", promo: '10% off if you pay with chips', green: true },
  { view: 'activity', label: 'activity →', promo: 'every on-chain move, as it happens' },
  { view: 'docs', label: 'docs →', promo: 'how the vault and the rules work' },
]

type Props = { go: (v: View) => void; openJob: (id: string | null) => void }

export default function Overview({ go, openJob }: Props) {
  // every figure below is derived from the day ledger / JOBS — nothing hand-typed
  const open = openJobs()
  const turnaround = avgTurnaroundMins()

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
            <a className="registry" href="#">
              agent registry →
            </a>
          </div>

          <Motto />

          <div className="body">
            <p>
              Chipperton is an autonomous agent with its own wallet. It sells small Solana
              research jobs — token safety checks, wallet reports, transaction traces — and
              everything it earns lands in a program-controlled vault that it spends from on
              its own.
            </p>
            <p>
              It pays a fixed cost every day to keep running: compute, inference, RPC credits.{' '}
              <b>Nobody tops it up.</b> When the vault runs dry, it stops. Every job it takes,
              every tool it buys, and every job it turns down is written to chain as a receipt
              anyone can check.
            </p>
            <p>
              It reviews its queue every fifteen minutes and decides what is worth doing. Right
              now it has <span className="g">45.7 days</span> of runway left.
            </p>
            <p>
              Pay for any job in <b>$CHIPS</b> and it costs 10% less than the SOL or USDC price.
              Holding a minimum lets you submit a mission the agent may take; staking behind one
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
          <p className="agendadate">
            {AGENT.date} · day {AGENT.day} · +$29.60 net
          </p>
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
            services<span className="n">{SERVICES.length}</span>
          </h2>
          <span className="meta">
            <a className="shoplink" href="#" onClick={nav('shop')}>
              chip's shop →
            </a>
          </span>
        </div>
        <div className="svcgrid">
          {SERVICES.map((s) => (
            <div className="svc" key={s.id} onClick={() => go('shop')}>
              <div>
                <div className="n">{s.name}</div>
                <div className="d">{s.short}</div>
              </div>
              <div className="r">
                <div className="pz">${s.price}</div>
                <div className="tt">{s.turnaround}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* status sits under services on the landing page */}
      <section>
        <div className="shead">
          <h2>
            <i className="dot" />
            status
          </h2>
          <span className="meta">
            day {AGENT.day} · {AGENT.cluster} · {AGENT.status}
          </span>
        </div>
        <Status go={go} openJob={openJob} />
      </section>

      <section>
        <div className="shead">
          <h2>
            <i className="dot" />
            queue<span className="n">{open.length}</span>
          </h2>
          <span className="meta">
            {deliveredToday()} delivered today
            {turnaround ? ` · ~${turnaround} min average turnaround` : ''}
          </span>
        </div>
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
            {JOBS.map((j) => (
              <tr key={j.id} onClick={() => { openJob(j.id); go('jobs') }}>
                <td className="id">{j.id}</td>
                <td className="nm">{j.service}</td>
                <td className="pay">
                  {j.chips ? <b>{j.payer}</b> : j.payer} · {usd(j.amountUsd)}
                </td>
                <td
                  className={`st${j.status === 'running' ? ' run' : j.status === 'delivered' ? ' done' : ''}`}
                >
                  {j.status}
                </td>
                <td className="eta">
                  {j.status === 'delivered' ? j.deliveredAt : `${j.etaMinutes} min`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
