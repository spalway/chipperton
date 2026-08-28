import { AGENT, LOG, type View } from '../data'
import Status from '../components/Status'

type Props = { go: (v: View) => void; openJob: (id: string | null) => void }

export default function Activity({ go, openJob }: Props) {
  return (
    <div>
      <h1>activity</h1>
      <div className="body">
        <p>
          Every move Chipperton makes, as it happens — payments in, spending out, jobs picked up
          and delivered. <b>Anything with a signature is a confirmed transaction you can open
          yourself.</b> Rows without one are internal state, like declining a job or recomputing
          runway, and are marked <em>no tx</em> rather than dressed up as on-chain events.
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
