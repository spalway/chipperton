import { CHIPS, SQUIRREL } from '../data'
import { useLiveData } from '../useLiveData'
import { short } from '../wallet'

/** Squirrel + $CHIPS info. Renders above every page. */
export default function PageHeader() {
  const live = useLiveData()
  const s = live.status

  // The mint lives in the database, and /api/status reads it every request — so
  // on launch day the CA appears on the next page load with no deploy. Null
  // until then, which renders as the placeholder rather than a dead link.
  const mint = s?.chipsMint ?? CHIPS.contract
  const chipsUrl = s?.chipsUrl ?? null
  // server-side when live: both sides hardcoding 10 works right up until one
  // of them changes, and then the header advertises a discount orders refuse
  const discountPct = s?.chipsDiscountPct ?? CHIPS.discountPct

  return (
    <header className="pagehead">
      <pre className="logo">{SQUIRREL}</pre>

      <div className="fetch">
        <div className="h">
          chips@chipperton{' '}
          <span className="util">
            — <b>{discountPct}% off</b> every job Chipperton sells
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
            {mint && chipsUrl ? (
              <a className="v ca" href={chipsUrl} target="_blank" rel="noreferrer" title={mint}>
                {short(mint, 5, 5)} ↗
              </a>
            ) : mint ? (
              // a mint with no pump.fun page yet — show it, but do not invent a
              // URL for it; a fabricated link is worse than a plain address
              <span className="v" title={mint}>
                {short(mint, 5, 5)}
              </span>
            ) : (
              <span className="v dim">{CHIPS.contractPlaceholder}</span>
            )}
          </span>
        </div>
        <p className="disc">
          Jobs are worked in <b>queue order</b>, not by who paid most. Turnaround times are
          estimates the agent sets itself — if it misses one, Chipperton refunds you.
        </p>
      </div>
    </header>
  )
}
