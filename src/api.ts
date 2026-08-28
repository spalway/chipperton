/**
 * Live data from the Chipperton server.
 *
 * Types mirror the API contract exactly. Where a field carries a *basis*
 * (`dailyCostBasis`, `etaBasis`) the UI must let that field decide the wording —
 * never render a declared figure as measured.
 */

export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
export const hasApi = () => API_BASE.length > 0

export type CostBasisField = 'declared' | 'measured'

/**
 * Verified against the live endpoint on 2026-08-28, not against the written
 * contract — the contract has been wrong twice.
 *
 * `null` and `0` mean different things here and must render differently:
 *   0    → measured, and it is genuinely zero
 *   null → not yet measurable (nothing to compute from)
 * Neither is missing data, and neither may fall back to a sample constant.
 */
export type StatusResponse = {
  vaultAddress: string
  vaultLamports: number
  /** COUNTED on-chain. Authoritative — never derive this from a ledger. */
  vaultUsd: number
  /** Declared config constant. An assumption. */
  dailyCostUsd: number
  /** Observed from the costs ledger; null until there is real spend. */
  measuredDailyCostUsd: number | null
  /** Which of the two `runwayDays` used. Drives every cost/runway label. */
  dailyCostBasis: CostBasisField
  runwayDays: number | null
  backlog: number
  /** Delivered since UTC midnight. */
  deliveredToday: number
  /* ── solvency: refunds are paid from the hot wallet, payments fill the vault,
     so the hot wallet drains as the vault fills. This is the liveness signal
     that matters — "can it honour what it already owes" beats tick timing. ── */
  hotWalletLamports: number
  refundLiabilityLamports: number
  /** Same buffer the worker gates on, so the page and the agent cannot disagree. */
  canHonourRefunds: boolean
  lastTickAt: string | null
  tickIntervalSeconds: number
  /** Scheduled, not guaranteed — the worker is best-effort cron. */
  nextTickAt: string | null
  medianTurnaroundMinutes: number | null
  /** Cluster payments settle on. Research jobs read mainnet regardless. */
  payCluster: string
  /** false while $CHIPS has no mint — the discount path cannot function. */
  chipsEnabled: boolean
}

export type ServiceResponse = {
  id: string
  name: string
  short: string
  long: string
  priceLamports: number
  priceSol: number
  /** Floats off the live SOL price — moves between requests. Do not cache. */
  priceUsd: number
  estMinutes: number
  /** false → render as "soon", not orderable. */
  active: boolean
}

export type QueueResponse = {
  id: string
  serviceId: string
  serviceName: string
  status: 'queued' | 'running' | 'delivered' | 'refunded' | 'expired'
  currency: string
  amountSol: number
  amountUsd: number
  createdAt: string
  paidAt: string | null
  /** Live estimate — moves as the queue drains. */
  etaMinutes: number | null
  etaBasis: CostBasisField
  /** Committed at settle and immutable — what a refund is owed against. */
  etaDeadline: string | null
  /** Nothing about this order will change again — safe to stop polling. */
  terminal: boolean
  /**
   * Whether a report and receipt are still expected.
   *
   * This is what disambiguates a null. A refunded order and a queued order both
   * send `receiptSig: null` — identical payload, opposite meanings ("never" vs
   * "not yet"). Ask this field instead of enumerating statuses per nullable
   * field, which is how "on delivery" ended up on a refunded job.
   */
  awaitingDelivery: boolean
  deliveredAt: string | null
  paymentSig: string | null
  receiptSig: string | null
  /** Public: the same hash is broadcast in the receipt memo on chain. */
  reportHash: string | null
}

export type CostEntry = {
  id: string
  orderId: string | null
  kind: 'inference' | 'rpc' | 'fee' | 'other'
  usd: number
  detail: Record<string, unknown> & { priced?: boolean }
  createdAt: string
}

export type CostsResponse = {
  entries: CostEntry[]
  totalsByKind: Record<string, number>
  measuredDailyCostUsd: number | null
  note?: string
}

class ApiError extends Error {}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (!hasApi()) throw new ApiError('VITE_API_URL is not set')
  const res = await fetch(`${API_BASE}${path}`, { signal, headers: { accept: 'application/json' } })
  if (!res.ok) throw new ApiError(`${path} → ${res.status}`)
  return (await res.json()) as T
}

export const getStatus = (s?: AbortSignal) => get<StatusResponse>('/api/status', s)
export const getServices = (s?: AbortSignal) => get<ServiceResponse[]>('/api/services', s)
export const getCosts = (s?: AbortSignal) => get<CostsResponse>('/api/costs', s)

export type QueuePage = {
  rows: QueueResponse[]
  /** Exact count across the WHOLE queue — not `rows.length`, which is one page. */
  total: number
  limit: number
  truncated: boolean
}

/**
 * /api/queue is PAGED (limit 25). Counting `rows` gives you "in this page of
 * results" wearing the label "in total" — correct at 2 orders and silently
 * wrong at 26. The exact count comes from the X-Queue-Total header.
 */
export async function getQueue(signal?: AbortSignal): Promise<QueuePage> {
  if (!hasApi()) throw new ApiError('VITE_API_URL is not set')
  const res = await fetch(`${API_BASE}/api/queue`, {
    signal,
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new ApiError(`/api/queue → ${res.status}`)
  const rows = (await res.json()) as QueueResponse[]
  const num = (h: string, fallback: number) => {
    const v = Number(res.headers.get(h))
    return Number.isFinite(v) && v > 0 ? v : fallback
  }
  return {
    rows,
    total: num('X-Queue-Total', rows.length),
    limit: num('X-Queue-Limit', rows.length),
    truncated: res.headers.get('X-Queue-Truncated') === 'true',
  }
}

/**
 * Rows whose model wasn't in the rate table recorded $0. Summing them into a
 * headline hides the gap, so callers get the count and can disclose it.
 */
export const unpricedCount = (c: CostsResponse) =>
  c.entries.filter((e) => e.detail?.priced === false).length
