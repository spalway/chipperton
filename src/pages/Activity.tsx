import { AGENT, LOG, type View } from '../data'
import Status from '../components/Status'

type Props = { go: (v: View) => void; openJob: (id: string | null) => void }

export default function Activity({ go, openJob }: Props) {
  return (
    <div>
      <h1>activity</h1>
      <div className="body">
        <p>
          Every move Chipperton makes on chain, as it happens. Payments in, spending out, jobs
          picked up and delivered, and the daily cost being drawn from the vault.{' '}
          <b>Nothing here is written by hand</b> — each line is a confirmed transaction.
        </p>
      </div>

      <section>
        <Status go={go} openJob={openJob} />
      </section>

      <section>
        <div className="shead">
          <h2>
            <i className="dot" />
            live log
          </h2>
          <span className="meta">day {AGENT.day} · 61 receipts total</span>
        </div>
        <div className="log">
          {LOG.map((e, i) => (
            <div className="le" key={i}>
              <span className="ts">{e.ts}</span>
              <span className={`ac ${e.kind}`}>{e.action}</span>
              <span className="msg">
                {e.msg} <em>{e.note}</em>
              </span>
              <span className="sg">{e.sig ? <a href="#">{e.sig}</a> : 'no tx'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
