import { AGENT, TREASURY, avgTurnaroundMins, openJobs, runwayDays, usd, type View } from '../data'
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
  const turnaround = avgTurnaroundMins()

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
        <div className="s">{usd(TREASURY.balanceUsd)} on hand</div>
        {link('history', 'view historical daily activities →', 'white')}
      </div>

      <div className="sm green">
        <div className="k">Daily cost</div>
        <div className="v">{usd(TREASURY.dailyCostUsd)}</div>
        <div className="s">compute + inference</div>
        {link('costs', 'view cost receipt →', 'green')}
      </div>

      <div className="sm blue">
        <div className="k">Backlog</div>
        <div className="v">
          {open.length} job{open.length === 1 ? '' : 's'}
        </div>
        <div className="s">{turnaround ? `~${turnaround} min average` : 'queue empty'}</div>
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
