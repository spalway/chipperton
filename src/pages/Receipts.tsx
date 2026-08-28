import {
  AGENT,
  COST_LINES,
  DECISION_HISTORY,
  HISTORY,
  TREASURY,
  closestCall,
  costTotal,
  isMeasuredCost,
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
  const measured = isMeasuredCost()

  return (
    <div>
      <Back go={go} />
      <div className="rc" style={{ marginTop: 16 }}>
        <h2 className="rt">Daily operating cost — {measured ? 'measured' : 'declared'}</h2>
        <div className="sub">
          day {AGENT.day} · {AGENT.date} ·{' '}
          {measured ? 'observed from the cost ledger' : 'configured, not yet measured'}
        </div>

        {!measured && (
          <div className="callout" style={{ margin: '10px 0 12px' }}>
            <div className="k">Not a receipt yet</div>
            <p>
              This is how the declared <b>{usd(total)}</b> is allocated, not a record of money
              observed leaving the wallet. Per-job token spend is not being recorded yet, so no
              transaction is cited below and <b>runway is a projection built on this figure</b>,
              not a measurement.
            </p>
          </div>
        )}

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
          <span>TOTAL {measured ? 'SPENT' : 'DECLARED'}</span>
          <span className="d" />
          <span className="n">{usd(total)}</span>
        </div>

        <hr />
        <div className="line">
          <span>Runway this covers</span>
          <span className="d" />
          <span className="n">1.00 day</span>
        </div>

        <div className="foot">
          {measured
            ? 'Every line is a recorded cost with a transaction behind it. If Chipperton cannot cover the total, it stops.'
            : 'The total is the number runway divides by, so it is the single most load-bearing figure on the site — and the one currently least supported. It becomes a real receipt once per-job token spend is recorded.'}
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

        {!isMeasuredCost() && (
          <div className="callout" style={{ margin: '10px 0 12px' }}>
            <div className="k">Cost column is declared</div>
            <p>
              Earned and spent are counted. The <b>Cost</b> column is the configured{' '}
              {usd(TREASURY.dailyCostUsd)}/day, not observed spend — so every Close and Runway
              figure below inherits that assumption.
            </p>
          </div>
        )}

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
          daily cost. The table and the headline balance are computed from one ledger, so they
          cannot disagree — but a shared source is not the same as a verified one, and the cost
          input is {isMeasuredCost() ? 'measured' : 'still declared'}.
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
