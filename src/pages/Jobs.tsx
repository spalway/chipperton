import { useState } from 'react'
import { JOB_PRIVATE, usd, type Job, type View } from '../data'
import { useResolved } from '../useLiveData'

type Props = {
  jobId: string | null
  go: (v: View) => void
  openJob: (id: string | null) => void
}

function Detail({
  job,
  openJob,
  live,
}: {
  job: Job
  openJob: (id: string | null) => void
  live: boolean
}) {
  // Stands in for "this browser holds the order's access token". The real gate is
  // server-side: the public queue endpoint never returns these fields at all —
  // so for a LIVE order there is nothing to reveal here, by design.
  const [unlocked, setUnlocked] = useState(false)
  const priv = JOB_PRIVATE[job.id] as (typeof JOB_PRIVATE)[string] | undefined
  const canReveal = !live && !!priv
  const shown = unlocked && canReveal
  /** terminal states that will never produce a delivery or a receipt */
  const ended = job.status === 'refunded' || job.status === 'expired'

  return (
    <div>
      <a
        className="back"
        href="#"
        onClick={(e) => {
          e.preventDefault()
          openJob(null)
        }}
      >
        ← all jobs
      </a>

      <h1 className="agendatitle" style={{ marginTop: 14 }}>
        {job.id} · {job.service}
      </h1>
      <p className="agendadate">
        paid {job.paidAt} ·{' '}
        {job.status === 'delivered'
          ? `delivered ${job.deliveredAt}`
          : ended
            ? job.status
            : job.etaMinutes == null
              ? job.status
              : `${job.status} · ~${job.etaMinutes} min${job.status === 'running' ? ' left' : ''}`}
      </p>

      <div className="jobgrid">
        <div className="jf">
          <div className="k">Paid</div>
          <div className={`v${job.chips ? ' g' : ''}`}>
            {usd(job.amountUsd)} in {job.payer}
          </div>
        </div>
        <div className="jf">
          <div className="k">Payment tx</div>
          <div className="v">
            <a href="#">{job.paymentSig}</a>
          </div>
        </div>

        <div className="jf">
          <div className="k">Deadline committed at payment</div>
          <div className="v">{job.etaDeadline ?? '—'}</div>
        </div>
        <div className="jf">
          <div className="k">
            {job.status === 'delivered'
              ? 'Delivered'
              : ended
                ? 'Outcome'
                : 'Estimate now'}
          </div>
          <div className="v">
            {job.status === 'delivered' ? (
              job.deliveredAt
            ) : ended ? (
              <span className="mut">refunded — no longer queued</span>
            ) : job.etaMinutes != null ? (
              `~${job.etaMinutes} min`
            ) : (
              <span className="mut">not yet estimated</span>
            )}
          </div>
        </div>

        <div className="jf">
          <div className="k">Receipt</div>
          <div className="v">
            {job.receiptSig ? (
              <a href="#">{job.receiptSig}</a>
            ) : (
              // a refunded job is never delivered, so "on delivery" would be false
              <span className="mut">{ended ? 'none — refunded' : 'on delivery'}</span>
            )}
          </div>
        </div>
        <div className="jf">
          <div className="k">Report hash</div>
          <div className="v">
            {job.reportHash ?? (
              <span className="mut">{ended ? 'none — refunded' : 'on delivery'}</span>
            )}
          </div>
        </div>

        {/* payer-gated */}
        <div className="jf wide locked">
          <div className="k">
            {shown ? priv!.inputLabel : 'What was submitted'}
            <span className="lockbadge">payer only</span>
          </div>
          <div className={`v${shown ? '' : ' redacted'}`}>
            {shown ? priv!.input : '••••••••••••••••••••••••••••••••••••••••'}
          </div>
        </div>
        <div className="jf wide locked">
          <div className="k">
            Paid by<span className="lockbadge">payer only</span>
          </div>
          <div className={`v${shown ? '' : ' redacted'}`}>
            {shown ? priv!.payerWallet : '••••••••••••••••••••••••••••••••••••••••'}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12, alignItems: 'baseline', gap: 10 }}>
        {canReveal ? (
          <>
            <a
              className="lk"
              href="#"
              onClick={(e) => {
                e.preventDefault()
                setUnlocked((u) => !u)
              }}
            >
              {unlocked ? 'lock again' : 'unlock as payer →'}
            </a>
            <span className="promo">
              demo toggle — in production this needs the order's access token
            </span>
          </>
        ) : (
          <span className="promo">
            These fields are not in the public response at all. Reading them needs the order's
            access token, which only the paying wallet holds.
          </span>
        )}
      </div>

      <p className="disc" style={{ margin: '14px 0 0', textAlign: 'left', maxWidth: '74ch' }}>
        The queue is public: what was bought, what it cost, and the transactions that settled
        it. <b>What you asked about and which wallet asked is not.</b> Only the hash of the
        report goes on chain — enough for you to prove your report is the one Chipperton
        signed, without publishing what you looked up.
      </p>
    </div>
  )
}

export default function Jobs({ jobId, openJob }: Props) {
  const { queue, status, queueTotal, queueTruncated, queueLimit, isLive } = useResolved()
  const job = jobId ? queue.find((j) => j.id === jobId) : null
  if (job) return <Detail job={job} openJob={openJob} live={isLive} />

  // server-side backlog; row counts are page-scoped and would understate it
  const open = status ? status.backlog : queue.filter((j) => j.status !== 'delivered').length

  return (
    <div>
      <h1 className="agendatitle">jobs</h1>
      <p className="agendadate">
        {open} in the queue · {queueTotal} total · public record
        {queueTruncated ? ` · showing the most recent ${queueLimit}` : ''}
      </p>

      <section>
        <table className="qt">
          <thead>
            <tr>
              <th>Job</th>
              <th>Service</th>
              <th>Paid</th>
              <th>Settled</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((j) => (
              <tr key={j.id} onClick={() => openJob(j.id)}>
                <td className="id">{j.id}</td>
                <td className="nm">{j.service}</td>
                <td className="pay">
                  {j.chips ? <b>{j.payer}</b> : j.payer} · {usd(j.amountUsd)}
                </td>
                <td className="pay">{j.paidAt}</td>
                <td
                  className={`st${j.status === 'running' ? ' run' : j.status === 'delivered' ? ' done' : ''}`}
                >
                  {j.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
