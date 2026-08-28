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
  /** Where refunds are paid from. Drains as the vault fills. */
  hotWalletAddress: string
  vaultLamports: number
  /** COUNTED on-chain. Authoritative — never derive this from a ledger. */
  vaultUsd: number
  /** Declared config constant. An assumption. */
  dailyCostUsd: number
  /** Observed from the costs ledger; null until there is real spend. */
  measuredDailyCostUsd: number | null
  /** Which of the two `runwayDays` used. Drives every cost/runway label. */
  dailyCostBasis: CostBasisField
  /**
   * Why it is on that basis, and how far off the other one is — e.g.
   * "needs 5+ entries spanning 24h+ to be a rate; have 0 over 0.0h".
   *
   * OPTIONAL because it was not on the endpoint when this was written, whatever
   * the deploy notes said. Rendered only when present, so its arrival is an
   * improvement rather than a requirement.
   */
  dailyCostBasisReason?: string | null
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
  /**
   * DERIVED from `chipsMint` server-side, so the two can no longer disagree.
   * Previously an independent flag, which meant a stale config could claim the
   * token was payable with no mint to show, or hide a mint that existed.
   */
  chipsEnabled: boolean
  /** The $CHIPS mint. Null until launch. */
  chipsMint: string | null
  /** pump.fun page for the mint. Null until launch — render nothing, not a dead link. */
  chipsUrl: string | null
  /**
   * The discount, from the server rather than a client constant. Both sides
   * hardcoding 10 works until one changes, and then the shop advertises a
   * discount the order endpoint will not honour.
   */
  chipsDiscountPct: number
  /** Without the @, so the glyph is ours to render. Null if unset. */
  twitterHandle: string | null
  twitterUrl: string | null
  /**
   * What is standing between the agent and running normally, derived from the
   * rest of this response. Optional because a server predating it sends
   * nothing — and an absent agenda is unknown, which is NOT the same as an
   * empty one, which means nothing is outstanding.
   */
  agenda?: AgendaItem[]
  vaultUrl: string | null
  hotWalletUrl: string | null
}

/**
 * One thing standing between the agent and running normally.
 *
 * Derived server-side from state already in the same response — refund
 * solvency, whether the token has a mint, the backlog — so nothing here is
 * written ahead of time and the list empties itself as conditions clear.
 *
 * This replaced a block of invented EARN/SPEND/PASS prose that read exactly
 * like real activity. An empty array is therefore SUCCESS, not missing data:
 * it means nothing is outstanding.
 */
export type AgendaItem = {
  /** 'blocked' stops work; 'waiting' does not. Do not collapse them. */
  kind: 'blocked' | 'waiting' | 'working'
  title: string
  /** A sentence naming the actual numbers behind the item. */
  detail: string
  /** The condition that removes this item, in the agent's own words. */
  clearsWhen: string
}

export type ServiceResponse = {
  id: string
  name: string
  short: string
  long: string
  /** Source of truth — what the transaction actually transfers. */
  priceLamports: number
  /** Exact and stable. Safe to state flatly. */
  priceSol: number
  /**
   * Derived per request from a 30s-cached SOL price, so it genuinely moves
   * between page loads — and it is NULL whenever the price feed fails, because
   * the server returns nothing rather than a stale or invented number.
   *
   * Two consequences: never render it as a precise figure, and never let it be
   * the only price on a card, or a feed outage leaves an item with no price.
   */
  priceUsd: number | null
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
  /** What was actually transferred. Exact. */
  amountSol: number
  /** Same nullable, floating conversion as `priceUsd` — see ServiceResponse. */
  amountUsd: number | null
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
  /* Explorer links are built SERVER-side because the cluster is a server concern:
     a client hardcoding ?cluster=devnet keeps producing links that resolve, to the
     wrong chain, the moment payments move to mainnet — no error, just wrong. */
  paymentUrl: string | null
  receiptUrl: string | null
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

/**
 * A delivered report. Public and unauthenticated — the body is also published
 * on chain in memo chunks, so `chunkUrls` are the actual bytes rather than a
 * reference to them.
 *
 * Refunded/expired orders 404: there was no delivery, so there is no report and
 * never will be. Gate the fetch on `reportHash`, don't enumerate statuses.
 */
export type ReportResponse = {
  orderId: string
  serviceId: string
  input: string
  paidAt: string | null
  deliveredAt: string | null
  report: string
  reportHash: string
  receiptSig: string | null
  receiptUrl: string | null
  chunkSigs: string[]
  /**
   * explorer.solana.com — the only major explorer that DECODES spl-memo
   * instruction data. Solscan renders these same transactions as
   * "Memo Program V2: Unknown" with the text absent from the page, so linking
   * there published the data without delivering the feature.
   */
  chunkUrls: string[]
  /** Solscan equivalents — secondary, for balance/token views. */
  chunkUrlsSolscan: string[]
  verify: string
}

export const getReport = (orderId: string, s?: AbortSignal) =>
  get<ReportResponse>(`/api/reports/${encodeURIComponent(orderId)}`, s)

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
