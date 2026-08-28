import {
  AGENT,
  COST_BASIS,
  TREASURY,
  openJobs,
  pendingEtaMins,
  runwayDays,
  usd,
  type View,
} from '../data'
import { useCountdown } from '../useCountdown'
import { useLiveData } from '../useLiveData'

type Props = { go: (v: View) => void; openJob?: (id: string | null) => void }

/**
 * The four headline metrics. No card chrome — they sit straight on the page.
 *
 * Prefers live server values and falls back to sample constants, but ALWAYS
 * discloses which it used: showing constants as though they were fetched is the
 * same class of error as labelling a declared cost as measured.
 */
export default function Status({ go, openJob }: Props) {
  const countdown = useCountdown(AGENT.reviewMinutes)
  const live = useLiveData()
  const s = live.status

  // live where available, sample otherwise — never silently mixed
  const runway = s?.runwayDays ?? runwayDays()
  const dailyCost = s?.dailyCostUsd ?? TREASURY.dailyCostUsd
  const vault = s?.vaultUsd ?? TREASURY.balanceUsd
  const basis = s?.dailyCostBasis ?? COST_BASIS
  const backlog = s?.backlog ?? openJobs().length
  const pendingEta = pendingEtaMins()

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

  return (
    <>
      {live.source !== 'live' && (
        <div className="srcnote">
          {live.source === 'error' ? (
            <>
              <b>Sample figures.</b> The live API is configured but unreachable
              {live.error ? ` (${live.error})` : ''} — these are illustrative, not fetched.
            </>
          ) : (
            <>
              <b>Sample figures.</b> No live API connected yet — every number below is
              illustrative, not measured.
            </>
          )}
        </div>
      )}

      <div className="statrow">
        <div className="sm white">
          <div className="k">Runway</div>
          <div className="v">{runway != null ? `${runway.toFixed(1)}d` : '—'}</div>
          {/* balance ÷ cost. Balance is counted; cost may be declared — so say which. */}
          <div className="s">
            {usd(vault)} on hand · at {basis} cost
          </div>
          {link('history', 'view historical daily activities →', 'white')}
        </div>

        <div className="sm green">
          <div className="k">Daily cost</div>
          <div className="v">{usd(dailyCost)}</div>
          <div className="s">{basis} · compute + inference</div>
          {link(
            'costs',
            basis === 'measured' ? 'view cost receipt →' : 'view cost breakdown →',
            'green',
          )}
        </div>

        <div className="sm blue">
          <div className="k">Backlog</div>
          <div className="v">
            {backlog} job{backlog === 1 ? '' : 's'}
          </div>
          {/* est. wait, not turnaround — this averages remaining time on unfinished work */}
          <div className="s">{pendingEta ? `~${pendingEta} min est. wait` : 'queue empty'}</div>
          {link('jobs', 'view the queue →', 'blue', () => openJob?.(null))}
        </div>

        <div className="sm red">
          <div className="k">Next decision</div>
          <div className="v">{countdown.label}</div>
          <div className="s">scheduled · every ~{AGENT.reviewMinutes} min</div>
          {link('decisions', 'view decision history →', 'red')}
        </div>
      </div>
    </>
  )
}
