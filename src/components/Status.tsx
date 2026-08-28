import {
  AGENT,
  COST_BASIS,
  TREASURY,
  isMeasuredCost,
  openJobs,
  pendingEtaMins,
  runwayDays,
  usd,
  type View,
} from '../data'
import { useCountdown } from '../useCountdown'

type Props = { go: (v: View) => void; openJob?: (id: string | null) => void }

/**
 * The four headline metrics. No card chrome — they sit straight on the page.
 * Each colour is carried by the label, the value and its link, so the four read
 * as four distinct things rather than four identical boxes.
 */
export default function Status({ go, openJob }: Props) {
  const countdown = useCountdown(AGENT.reviewMinutes)
  const open = openJobs()
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
    <div className="statrow">
      <div className="sm white">
        <div className="k">Runway</div>
        <div className="v">{runwayDays().toFixed(1)}d</div>
        {/* Runway is balance ÷ cost. The balance is counted; the cost is declared.
            So this is a projection and the caption has to say whose cost it uses. */}
        <div className="s">
          {usd(TREASURY.balanceUsd)} on hand · at {COST_BASIS} cost
        </div>
        {link('history', 'view historical daily activities →', 'white')}
      </div>

      <div className="sm green">
        <div className="k">Daily cost</div>
        <div className="v">{usd(TREASURY.dailyCostUsd)}</div>
        <div className="s">
          {isMeasuredCost() ? 'measured' : 'declared'} · compute + inference
        </div>
        {link('costs', isMeasuredCost() ? 'view cost receipt →' : 'view cost breakdown →', 'green')}
      </div>

      <div className="sm blue">
        <div className="k">Backlog</div>
        <div className="v">
          {open.length} job{open.length === 1 ? '' : 's'}
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
  )
}
