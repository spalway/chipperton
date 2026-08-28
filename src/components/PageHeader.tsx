import { CHIPS, SQUIRREL } from '../data'

/** Squirrel + $CHIPS info. Renders above every page. */
export default function PageHeader() {
  return (
    <header className="pagehead">
      <pre className="logo">{SQUIRREL}</pre>

      <div className="fetch">
        <div className="h">
          chips@chipperton{' '}
          <span className="util">
            — <b>{CHIPS.discountPct}% off</b> every job Chipperton sells
          </span>
        </div>
        <div className="rule">
          ──────────────────────────────────────────────────────────────────────────
        </div>
        <div className="metarow">
          <span>
            <span className="k">Ticker</span> <span className="v">{CHIPS.ticker}</span>
          </span>
          <span>
            <span className="k">Contract</span>{' '}
            <span className={`v${CHIPS.contract ? '' : ' dim'}`}>
              {CHIPS.contract ?? CHIPS.contractPlaceholder}
            </span>
          </span>
        </div>
        <p className="disc">
          Jobs are worked in <b>queue order</b>, not by who paid most. Turnaround times are
          estimates the agent sets itself — if it misses one, the program refunds you
          automatically.
        </p>
      </div>
    </header>
  )
}
