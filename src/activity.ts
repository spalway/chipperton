import type { CostsResponse, QueuePage } from './api'

/**
 * The activity feed, derived rather than fetched.
 *
 * There is no /api/activity. Rather than leave this page showing constants
 * while every other panel went live, the feed is assembled from the two live
 * endpoints that already carry timestamped events: the queue (payments in,
 * deliveries out) and the costs ledger (spending).
 *
 * The consequence worth stating: this is every event those two endpoints can
 * account for, which is not necessarily every move the agent made. The page
 * says so rather than implying completeness it cannot demonstrate.
 */

export type Event = {
  at: string
  /** Same vocabulary as the sample LOG, so both render through one stylesheet. */
  kind: 'in' | 'out' | 'sys' | 'job'
  action: string
  msg: string
  note: string
  /** Present only for real transactions. Never invent one. */
  sig: string | null
  /** Server-built. A client-side ?cluster= would survive the mainnet flip wrong. */
  url: string | null
  /** Set when a delivered report can be opened inline. */
  orderId?: string
  reportHash?: string | null
}

const money = (n: number) => `$${n.toFixed(2)}`

const KIND_LABEL: Record<string, string> = {
  inference: 'model inference',
  rpc: 'RPC credits',
  fee: 'network fees',
  other: 'operating cost',
}

export function buildActivity(queue: QueuePage | null, costs: CostsResponse | null): Event[] {
  const out: Event[] = []

  for (const j of queue?.rows ?? []) {
    if (j.paidAt) {
      out.push({
        at: j.paidAt,
        kind: 'in',
        action: 'IN',
        msg: `${money(j.amountUsd)} in for ${j.serviceName}`,
        note: `order ${j.id}`,
        sig: j.paymentSig,
        url: j.paymentUrl,
      })
    }
    if (j.deliveredAt) {
      out.push({
        at: j.deliveredAt,
        kind: 'job',
        action: 'JOB',
        msg: `${j.serviceName} delivered`,
        // a receipt exists only once one has been broadcast; saying "receipt on
        // chain" for a row whose receiptSig is null is the fabricated-proof bug
        note: j.receiptSig ? 'receipt on chain' : 'no receipt broadcast',
        sig: j.receiptSig,
        url: j.receiptUrl,
        orderId: j.id,
        reportHash: j.reportHash,
      })
    }
  }

  for (const c of costs?.entries ?? []) {
    const unpriced = c.detail?.priced === false
    out.push({
      at: c.createdAt,
      kind: 'out',
      action: 'OUT',
      // an entry whose model was missing from the rate table recorded $0.00.
      // Rendering that as a real cost states a measurement that was not made.
      msg: unpriced
        ? `${KIND_LABEL[c.kind] ?? c.kind} — not priced`
        : `${money(c.usd)} on ${KIND_LABEL[c.kind] ?? c.kind}`,
      note: c.orderId ? `order ${c.orderId}` : 'operating',
      // costs are internal accounting, not transactions — the page marks these
      // "no tx" rather than dressing them up as on-chain events
      sig: null,
      url: null,
    })
  }

  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/** `14:22:07` — the log is dense, so only the time of day fits. */
export const clockOf = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Date(t).toISOString().slice(11, 19) : '—'
}
