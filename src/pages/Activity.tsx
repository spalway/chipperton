import { useMemo, useState } from 'react'
import { AGENT, LOG } from '../data'
import { buildActivity, clockOf, type Event } from '../activity'
import { useLiveData } from '../useLiveData'
import { useCosts } from '../useCosts'
import { useReport } from '../useReport'

/** The full report body, opened in place. Public — no token, no wallet. */
function InlineReport({ orderId }: { orderId: string }) {
  const { report, loading, error } = useReport(orderId)

  if (loading) return <div className="lrep loading">loading report…</div>
  if (error || !report) return <div className="lrep loading">report unavailable</div>

  return (
    <div className="lrep">
      <div className="lrephead">
        <span>{report.input}</span>
        <span className="chunks">
          {/* explorer.solana.com decodes spl-memo; Solscan renders these same
              transactions as "Unknown" with the text nowhere on the page */}
          on chain:{' '}
          {report.chunkUrls.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              {i + 1}/{report.chunkUrls.length}
            </a>
          ))}
        </span>
      </div>
      <pre className="lrepbody">{report.report}</pre>
      <div className="lrepfoot">sha256 {report.reportHash}</div>
    </div>
  )
}

function Row({ e, live }: { e: Event; live: boolean }) {
  const [open, setOpen] = useState(false)
  const canOpen = live && !!e.orderId && !!e.reportHash

  return (
    <>
      <div className={`le${canOpen ? ' clickable' : ''}`} onClick={() => canOpen && setOpen((o) => !o)}>
        <span className="ts">{live ? clockOf(e.at) : e.at}</span>
        <span className={`ac ${e.kind}`}>{e.action}</span>
        <span className="msg">
          {e.msg} <em>{e.note}</em>
          {canOpen && <b className="rtog">{open ? '− hide report' : '+ read report'}</b>}
        </span>
        <span className="sg">
          {e.sig ? (
            e.url ? (
              <a href={e.url} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>
                {e.sig.slice(0, 4)}…{e.sig.slice(-4)}
              </a>
            ) : (
              `${e.sig.slice(0, 4)}…${e.sig.slice(-4)}`
            )
          ) : (
            'no tx'
          )}
        </span>
      </div>
      {open && e.orderId && <InlineReport orderId={e.orderId} />}
    </>
  )
}

export default function Activity() {
  const live = useLiveData()
  const { costs } = useCosts()
  const isLive = live.source === 'live'

  const events = useMemo(
    () => (isLive ? buildActivity(live.queue, costs) : []),
    [isLive, live.queue, costs],
  )

  // sample rows carry a pre-formatted `ts` and no url; live rows carry an ISO
  // timestamp and a server-built link. They are never mixed.
  const rows: Event[] = isLive
    ? events
    : LOG.map((e) => ({
        at: e.ts,
        kind: e.kind as Event['kind'],
        action: e.action,
        msg: e.msg,
        note: e.note,
        sig: e.sig || null,
        url: null,
      }))

  return (
    <div>
      <h1>activity</h1>
      <div className="body">
        <p>
          Every move Chipperton makes that leaves a record — payments in, spending out, reports
          delivered. <b>Anything with a signature is a confirmed transaction you can open
          yourself.</b> Rows without one are internal accounting, like the cost of a model call,
          and are marked <em>no tx</em> rather than dressed up as on-chain events.
        </p>
        {isLive && (
          <p>
            Assembled from the public queue and the spending ledger, so it covers what those
            record — payments, deliveries and costs. Delivered rows open the full report.
          </p>
        )}
      </div>

      {!isLive && (
        <div className="srcnote">
          {live.source === 'error' ? (
            <>
              <b>Sample log.</b> A live API is configured but unreachable
              {live.error ? ` (${live.error})` : ''} — the rows below are illustrative, and their
              signatures are not real transactions.
            </>
          ) : (
            <>
              <b>Sample log.</b> No live API connected — the rows below are illustrative, and
              their signatures are not real transactions.
            </>
          )}
        </div>
      )}

      <section>
        <div className="shead">
          <h2>
            <i className="dot" />
            live log
          </h2>
          <span className="meta">
            {isLive
              ? `${rows.length} event${rows.length === 1 ? '' : 's'} on record`
              : `day ${AGENT.day} · sample`}
          </span>
        </div>

        {isLive && rows.length === 0 ? (
          <p className="emptyq">
            Nothing has happened yet. No payments, no deliveries, no spending — this is live data,
            not a placeholder.
          </p>
        ) : (
          <div className="log">
            {rows.map((e, i) => (
              <Row e={e} live={isLive} key={`${e.at}-${e.action}-${i}`} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
