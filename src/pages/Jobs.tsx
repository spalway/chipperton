import { useState } from 'react'
import { JOB_PRIVATE, etaBasisNote, etaText, sol, usdApprox, type Job, type View } from '../data'
import { useResolved } from '../useLiveData'
import { useReport } from '../useReport'

type Props = {
  jobId: string | null
  go: (v: View) => void
  openJob: (id: string | null) => void
}

/**
 * The delivered report, in full. Published on chain in memo chunks as well as
 * here — so the chunk links are the actual bytes, not a reference to them.
 */
function Report({ orderId }: { orderId: string }) {
  const { report, loading, error } = useReport(orderId)

  if (loading) return <div className="rep loading">loading report…</div>
  // a 404 here means refunded — the caller only mounts this when a hash exists,
  // so anything else is a genuine fetch failure worth showing rather than hiding
  if (error || !report) return null

  return (
    <div className="rep">
      <div className="rephead">
        <span>report · {report.serviceId}</span>
        <span className="chunks">
          {/* these point at explorer.solana.com, which decodes spl-memo — Solscan
              shows the same transaction as "Unknown" with the text nowhere on
              the page, so the bytes would be published but not readable */}
          published on chain:{' '}
          {report.chunkUrls.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              {i + 1}/{report.chunkUrls.length}
            </a>
          ))}
        </span>
      </div>
      <div className="repinput">
        <span className="k">subject</span> {report.input}
      </div>
      <pre className="repbody">{report.report}</pre>
      <div className="repfoot">
        <span>
          sha256 <b>{report.reportHash}</b>
        </span>
        {report.receiptUrl && (
          <a href={report.receiptUrl} target="_blank" rel="noreferrer">
            receipt ↗
          </a>
        )}
      </div>
      <div className="repverify">{report.verify}</div>
    </div>
  )
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
  /** the server tells us whether a report/receipt is still coming — we do not
   *  enumerate statuses, so a new terminal status needs no change here */
  const ended = !job.awaitingDelivery && job.status !== 'delivered'

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
              : `${job.status} · ~${etaText(job)}${job.status === 'running' ? ' left' : ''}`}
      </p>

      <div className="jobgrid">
        <div className="jf">
          <div className="k">Paid</div>
          <div className={`v${job.chips ? ' g' : ''}`}>
            {sol(job.amountSol)} in {job.payer}
            {usdApprox(job.amountUsd) && (
              <span className="mut"> · {usdApprox(job.amountUsd)}</span>
            )}
          </div>
        </div>
        <div className="jf">
          <div className="k">Payment tx</div>
          <div className="v">
            {/* the URL is server-built — a client-side ?cluster= would keep
                resolving to the wrong chain after the mainnet flip */}
            {job.paymentUrl ? (
              <a href={job.paymentUrl} target="_blank" rel="noreferrer">
                {job.paymentSig}
              </a>
            ) : (
              job.paymentSig
            )}
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
              <>
                ~{etaText(job)}
                {/* the server says whether this is a target or an observation;
                    the number alone cannot distinguish them */}
                <div className="basis">{etaBasisNote(job.etaBasis)}</div>
              </>
            ) : (
              <span className="mut">not yet estimated</span>
            )}
          </div>
        </div>

        <div className="jf">
          <div className="k">Receipt</div>
          <div className="v">
            {job.receiptSig && job.receiptUrl ? (
              <a href={job.receiptUrl} target="_blank" rel="noreferrer">
                {job.receiptSig}
              </a>
            ) : job.receiptSig ? (
              job.receiptSig
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
            The paying wallet is not returned by the queue API. What was submitted is no longer
            private — it is published with the report.
          </span>
        )}
      </div>

      {job.reportHash && <Report orderId={job.rawId} />}

      <p className="disc" style={{ margin: '14px 0 0', textAlign: 'left', maxWidth: '74ch' }}>
        <b>Everything about a delivered order is public.</b> What was bought, what it cost, what
        was asked, and the full report body — published on chain in chunks, not just its hash,
        so the report is recoverable from Solana alone. The paying wallet is not returned by the
        API, but the payment transaction is, so the two can be linked by anyone who looks.
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
                  {j.chips && (
                    <>
                      <b>{j.payer}</b>{' · '}
                    </>
                  )}
                  {sol(j.amountSol)}
                  {usdApprox(j.amountUsd) && (
                    <span className="mut"> · {usdApprox(j.amountUsd)}</span>
                  )}
                </td>
                <td className="pay">{j.paidAt}</td>
                <td
                  className={`st${j.status === 'running' ? ' run' : j.status === 'delivered' ? ' done' : j.terminal ? ' ref' : ''}`}
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
