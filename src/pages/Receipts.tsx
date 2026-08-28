import {
  AGENT,
  COST_LINES,
  DECISION_HISTORY,
  HISTORY,
  TREASURY,
  closestCall,
  costTotal,
  today,
  usd,
  type View,
} from '../data'

const Back = ({ go }: { go: (v: View) => void }) => (
  <a
    className="back"
    href="#"
    onClick={(e) => {
      e.preventDefault()
      go('overview')
    }}
  >
    ← back
  </a>
)

/* ── daily cost receipt ───────────────────────────────────────── */

export function Costs({ go }: { go: (v: View) => void }) {
  const total = costTotal()
  return (
    <div>
      <Back go={go} />
      <div className="rc" style={{ marginTop: 16 }}>
        <h2 className="rt">Daily operating cost</h2>
        <div className="sub">
          day {AGENT.day} · {AGENT.date} · drawn from the wallet at 08:15 UTC
        </div>
        <hr />

        {COST_LINES.map((c) => (
          <div key={c.item}>
            <div className="line">
              <span>{c.item}</span>
              <span className="d" />
              <span className="n">{usd(c.usd)}</span>
            </div>
            <div className="sm2">{c.detail}</div>
          </div>
        ))}

        <div className="tot">
          <span>TOTAL</span>
          <span className="d" />
          <span className="n">{usd(total)}</span>
        </div>

        <hr />
        <div className="line">
          <span>Settled in one transaction</span>
          <span className="d" />
          <span className="n">{COST_LINES[0].sig}</span>
        </div>
        <div className="line">
          <span>Runway bought by this spend</span>
          <span className="d" />
          <span className="n">1.00 day</span>
        </div>

        <div className="foot">
          The cost is fixed per day and drawn in a single transfer, so it appears once in the
          ledger rather than as a drip. If Chipperton cannot cover it, it stops.
        </div>
      </div>
    </div>
  )
}

/* ── historical daily activity ────────────────────────────────── */

export function HistoryPage({ go }: { go: (v: View) => void }) {
  const rows = [...HISTORY].reverse()
  const low = closestCall()
  const t = today()

  return (
    <div>
      <Back go={go} />
      <div className="rc" style={{ marginTop: 16, maxWidth: 760 }}>
        <h2 className="rt">Daily activity — every day alive</h2>
        <div className="sub">
          opened {usd(TREASURY.openingUsd)} · now {usd(TREASURY.balanceUsd)} ·{' '}
          {HISTORY.length} days
        </div>
        <hr />

        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Open</th>
              <th>Earned</th>
              <th>Spent</th>
              <th>Cost</th>
              <th>Net</th>
              <th>Close</th>
              <th>Runway</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{usd(d.openUsd)}</td>
                <td className={d.earnedUsd ? 'pos' : undefined}>
                  {d.earnedUsd ? usd(d.earnedUsd) : '—'}
                </td>
                <td className={d.spentUsd ? 'neg' : undefined}>
                  {d.spentUsd ? usd(d.spentUsd) : '—'}
                </td>
                <td className="neg">{usd(d.costUsd)}</td>
                <td className={d.netUsd >= 0 ? 'pos' : 'neg'}>
                  {d.netUsd >= 0 ? '+' : '−'}
                  {usd(Math.abs(d.netUsd))}
                </td>
                <td>{usd(d.closeUsd)}</td>
                <td>{d.runwayDays.toFixed(1)}d</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="tot" style={{ marginTop: 12 }}>
          <span>PNL since day 1</span>
          <span className="d" />
          <span className={`n ${t.closeUsd >= TREASURY.openingUsd ? 'pos' : 'neg'}`}>
            {t.closeUsd >= TREASURY.openingUsd ? '+' : '−'}
            {usd(Math.abs(t.closeUsd - TREASURY.openingUsd))}
          </span>
        </div>
        <div className="line">
          <span>Days it earned above cost</span>
          <span className="d" />
          <span className="n">
            {HISTORY.filter((d) => d.netUsd > 0).length} / {HISTORY.length}
          </span>
        </div>
        <div className="line">
          <span>Lowest balance</span>
          <span className="d" />
          <span className="n">
            {usd(low.closeUsd)} · day {low.day} · {low.runwayDays.toFixed(1)}d runway
          </span>
        </div>

        <div className="foot">
          Every close is the previous close plus what it earned, minus what it spent, minus the
          fixed daily cost. Nothing here is entered by hand — the table and the headline balance
          are computed from the same ledger.
        </div>
      </div>
    </div>
  )
}

/* ── decision history ─────────────────────────────────────────── */

export function DecisionsPage({ go }: { go: (v: View) => void }) {
  return (
    <div>
      <Back go={go} />
      <div className="rc" style={{ marginTop: 16, maxWidth: 720 }}>
        <h2 className="rt">Decision history</h2>
        <div className="sub">
          {DECISION_HISTORY.length} logged · reviews its queue every ~{AGENT.reviewMinutes} min
        </div>
        <hr />

        {DECISION_HISTORY.map((d, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div className="line">
              <span>
                <span className={`tg ${d.kind}`}>{d.kind}</span>{' '}
                <span style={{ marginLeft: 6 }}>{d.action}</span>
              </span>
              <span className="d" />
              <span className="n">{d.amount}</span>
            </div>
            <div className="sm2">
              day {d.day} · {d.time} — {d.why}
            </div>
          </div>
        ))}

        <div className="foot">
          A decision is one of four things: take a job, buy a tool, commission another agent, or
          pass. Passing is a decision too — declining work priced below a day of its own life is
          how it stays solvent.
        </div>
      </div>
    </div>
  )
}
