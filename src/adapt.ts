import type { QueueResponse, ServiceResponse } from './api'
import type { Job, Service } from './data'

/**
 * Map live API shapes onto the display shapes the components already use, so
 * wiring the API changed no markup.
 *
 * `inputLabel` is derived here, client-side — the server does not send it.
 */

export const adaptService = (s: ServiceResponse): Service => ({
  id: s.id,
  name: s.name,
  short: s.short,
  long: s.long,
  // priceUsd floats off the live SOL price and is null when the feed fails, so
  // it is read per render, never cached, and never the only price shown
  price: s.priceUsd,
  priceSol: s.priceSol,
  turnaround: `~${s.estMinutes} min`,
  active: s.active,
})

const CURRENCY_LABEL: Record<string, string> = {
  SOL: 'SOL',
  USDC: 'USDC',
  CHIPS: '$CHIPS',
}

const clock = (iso: string | null) =>
  iso ? new Date(iso).toISOString().slice(11, 19) : null

export const adaptQueueRow = (q: QueueResponse): Job => ({
  id: q.id.startsWith('#') ? q.id : `#${q.id.slice(0, 6)}`,
  rawId: q.id,
  service: q.serviceName,
  payer: CURRENCY_LABEL[q.currency] ?? q.currency,
  // exact first, approximate second — same rule as the shop, so a queue row and
  // a service card cannot disagree about which figure is authoritative
  amountSol: q.amountSol,
  amountUsd: q.amountUsd,
  chips: q.currency.toUpperCase().includes('CHIPS'),
  // pass the server's status through verbatim — collapsing 'refunded' into
  // 'queued' would tell a buyer their job is pending when they were repaid
  status: q.status,
  etaMinutes: q.etaMinutes,
  // read, not just carried: this flips to 'measured' on the first delivery and
  // the label above the number has to change with it
  etaBasis: q.etaBasis,
  // both confirmed present by running scripts/contract.ts against the live
  // server — an observation of the code, not a claim about it
  etaDeadline: clock(q.etaDeadline),
  // the server answers 'will this ever arrive?' so the UI never has to infer it
  awaitingDelivery: q.awaitingDelivery,
  terminal: q.terminal,
  deliveredAt: clock(q.deliveredAt),
  createdAt: clock(q.createdAt) ?? '—',
  paidAt: clock(q.paidAt) ?? '—',
  paymentSig: q.paymentSig ? `${q.paymentSig.slice(0, 4)}…${q.paymentSig.slice(-4)}` : '—',
  receiptSig: q.receiptSig ? `${q.receiptSig.slice(0, 4)}…${q.receiptSig.slice(-4)}` : null,
  // public on /api/queue — the same hash is already broadcast in the receipt memo,
  // so gating it in the API would have implied a protection that does not exist
  reportHash: q.reportHash,
  // never construct these locally — see api.ts
  paymentUrl: q.paymentUrl,
  receiptUrl: q.receiptUrl,
})
