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

export type StatusResponse = {
  vaultLamports?: number
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
  lastTickAt: string | null
  tickIntervalSeconds: number
  /** Scheduled, not guaranteed — the worker is best-effort cron. */
  nextTickAt: string | null
  medianTurnaroundMinutes: number | null
  deliveredToday: number
}

export type ServiceResponse = {
  id: string
  name: string
  short: string
  long: string
  priceLamports: number
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
  amountUsd: number
  createdAt: string
  paidAt: string | null
  etaMinutes: number | null
  etaBasis?: CostBasisField
  deliveredAt: string | null
  paymentSig: string | null
  receiptSig: string | null
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
export const getQueue = (s?: AbortSignal) => get<QueueResponse[]>('/api/queue', s)
export const getCosts = (s?: AbortSignal) => get<CostsResponse>('/api/costs', s)

/**
 * Rows whose model wasn't in the rate table recorded $0. Summing them into a
 * headline hides the gap, so callers get the count and can disclose it.
 */
export const unpricedCount = (c: CostsResponse) =>
  c.entries.filter((e) => e.detail?.priced === false).length
