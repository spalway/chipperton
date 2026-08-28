import {
  AGENT,
  COST_BASIS,
  TREASURY,
  openJobs,
  pendingEtaMins,
  runwayDays,
  turnaroundLabel,
  usd,
  type View,
} from '../data'
import { useCountdown } from '../useCountdown'
import { useLiveData } from '../useLiveData'

type Props = { go: (v: View) => void; openJob?: (id: string | null) => void }

const mins = (iso: string | null) => {
  if (!iso) return null
  const d = Math.round((Date.parse(iso) - Date.now()) / 60000)
  return Number.isFinite(d) ? d : null
}

/**
 * The four headline metrics. No card chrome — they sit straight on the page.
 *
 * Live and sample are kept strictly separate. When the API answers, its values
 * are used verbatim — including `0` (measured zero) and `null` (not yet
 * measurable), which render as themselves. Falling back to a sample constant on
 * a null would overstate confidence, which is the same bug as understating it.
 */
export default function Status({ go, openJob }: Props) {
  const live = useLiveData()
  const s = live.source === 'live' ? live.status : null

  const tick = useCountdown(AGENT.reviewMinutes, s?.nextTickAt ?? null)
  const nextIn = s ? mins(s.nextTickAt) : null

  const link = (v: View, label: string, tone: string, onClick?: () => void) => (
    <a
      className={`slink ${tone}`}
      href="#"
      onClick={(e) => {
        e.preventDefault()
        onClick?.()
        go(v)
      }}
    >
      {label}
    </a>
  )

  // ── live ────────────────────────────────────────────────────────────────
  if (s) {
    const basis = s.dailyCostBasis
    return (
      <div className="statrow">
        <div className="sm white">
          <div className="k">Runway</div>
          <div className="v">{s.runwayDays == null ? '—' : `${s.runwayDays.toFixed(1)}d`}</div>
          <div className="s">
            {s.runwayDays == null
              ? 'not yet measurable'
              : `${usd(s.vaultUsd)} on hand · at ${basis} cost`}
          </div>
          {link('history', 'daily history →', 'white')}
        </div>

        <div className="sm green">
          <div className="k">Daily cost</div>
          <div className="v">{usd(s.dailyCostUsd)}</div>
          {/* the server can explain its own basis and how far it is from the
              other one; shown as a tooltip when it does, absent when it does not */}
          <div className="s" title={s.dailyCostBasisReason ?? undefined}>
            {basis} · compute + inference
          </div>
          {link(
            'costs',
            basis === 'measured' ? 'cost receipt →' : 'cost breakdown →',
            'green',
          )}
        </div>

        <div className="sm blue">
          <div className="k">Backlog</div>
          <div className="v">
            {s.backlog} job{s.backlog === 1 ? '' : 's'}
          </div>
          <div className="s">
            {s.medianTurnaroundMinutes == null
              ? 'nothing delivered yet'
              : `${turnaroundLabel(s.medianTurnaroundMinutes)} median turnaround, measured`}
          </div>
          {link('jobs', 'the queue →', 'blue', () => openJob?.(null))}
        </div>

        <div className="sm red">
          <div className="k">Next decision</div>
          <div className="v">{tick.label}</div>
          <div className="s">
            scheduled{nextIn != null ? ` · in ~${Math.max(nextIn, 0)} min` : ''} · every{' '}
            {Math.round(s.tickIntervalSeconds / 60)} min
          </div>
          {link('decisions', 'decisions →', 'red')}
        </div>
      </div>
    )
  }

  // ── sample ──────────────────────────────────────────────────────────────
  const pendingEta = pendingEtaMins()
  return (
    <>
      <div className="srcnote">
        {live.source === 'error' ? (
          <>
            <b>Sample figures.</b> A live API is configured but unreachable
            {live.error ? ` (${live.error})` : ''} — the numbers below are illustrative, not
            fetched.
          </>
        ) : (
          <>
            <b>Sample figures.</b> No live API connected — the numbers below are illustrative,
            not measured.
          </>
        )}
      </div>

      <div className="statrow">
        <div className="sm white">
          <div className="k">Runway</div>
          <div className="v">{runwayDays().toFixed(1)}d</div>
          <div className="s">
            {usd(TREASURY.balanceUsd)} on hand · at {COST_BASIS} cost
          </div>
          {link('history', 'daily history →', 'white')}
        </div>

        <div className="sm green">
          <div className="k">Daily cost</div>
          <div className="v">{usd(TREASURY.dailyCostUsd)}</div>
          <div className="s">{COST_BASIS} · compute + inference</div>
          {link('costs', 'cost breakdown →', 'green')}
        </div>

        <div className="sm blue">
          <div className="k">Backlog</div>
          <div className="v">
            {openJobs().length} job{openJobs().length === 1 ? '' : 's'}
          </div>
          <div className="s">{pendingEta ? `~${pendingEta} min est. wait` : 'queue empty'}</div>
          {link('jobs', 'the queue →', 'blue', () => openJob?.(null))}
        </div>

        <div className="sm red">
          <div className="k">Next decision</div>
          <div className="v">{tick.label}</div>
          <div className="s">scheduled · every ~{AGENT.reviewMinutes} min</div>
          {link('decisions', 'decisions →', 'red')}
        </div>
      </div>
    </>
  )
}
