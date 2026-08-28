/**
 * Placing and following an order.
 *
 * The server builds the payment transaction; the browser only signs it. That
 * split is deliberate — the amount, the destination and the memo are all fixed
 * server-side, so nothing the client does can redirect a payment or under-pay
 * for a job.
 */

import { API_BASE, hasApi } from './api'

export type CreateOrderRequest = {
  serviceId: string
  /** Currently always a Solana address — the server 400s on anything else. */
  input: string
  /** The connected wallet. Must be the account that signs. */
  payer: string
}

/** Verified against POST /api/orders on 2026-08-28 — every field observed. */
export type CreateOrderResponse = {
  orderId: string
  /** Solana Pay reference key; how the worker spots the payment. */
  reference: string
  amountLamports: number
  amountSol: number
  /** 60 seconds out. Signing after this is a dead quote. */
  quoteExpiresAt: string
  estMinutes: number
  /**
   * Returned exactly once. It is the buyer's only key to their own order —
   * lose it and the order detail is unreachable, so it is persisted before
   * anything else happens.
   */
  accessToken: string
  /** base64 wire transaction, already built and unsigned. Do not rebuild it. */
  transaction: string
  /** Solana Pay URL for the same payment — the QR / mobile path. */
  payUrl: string
}

/**
 * A status the public queue never shows.
 *
 * /api/queue only contains orders that have been paid for, so its enum starts
 * at 'queued'. An order exists from the moment it is quoted, and between the
 * quote and the payment landing it is 'pending' — a state only its buyer can
 * see. Treating the queue's enum as exhaustive here would leave the buyer's own
 * order in an unhandled branch for the entire window in which they are actually
 * looking at the screen.
 */
export type OrderStatus = 'pending' | 'queued' | 'running' | 'delivered' | 'refunded' | 'expired'

/**
 * The buyer's view of their own order. Verified field-by-field against
 * GET /api/orders/:id on 2026-08-28 — not against the written contract.
 *
 * Two traps live in here:
 *
 * `awaitingDelivery` is false BEFORE payment as well as after a refund. On the
 * queue it cleanly means "a report is still coming", because everything on the
 * queue is already paid. Here it does not: an unpaid order is neither terminal
 * nor awaiting delivery. Read `status` for the pre-payment half of the flow.
 *
 * `report` is delivered inline, so a buyer watching their own order never needs
 * /api/reports — that endpoint is for everyone else, after the fact.
 */
export type OrderDetail = {
  id: string
  serviceId: string
  input: string
  /** Recorded from the signer at settle, so null until the payment lands. */
  payerWallet: string | null
  status: OrderStatus
  /** Nothing will change again — safe to stop polling. */
  terminal: boolean
  awaitingDelivery: boolean
  currency: string
  amountSol: number
  createdAt: string
  paidAt: string | null
  /** Committed at settle; what a refund is owed against. Null until paid. */
  etaDeadline: string | null
  deliveredAt: string | null
  paymentSig: string | null
  paymentUrl: string | null
  receiptSig: string | null
  receiptUrl: string | null
  refundSig: string | null
  refundUrl: string | null
  /** Why it failed, when it did. Null otherwise — not an empty string. */
  failureReason: string | null
  reportHash: string | null
  reportChunkSigs: string[] | null
  reportChunkUrls: string[]
  /** The full report body, inline. Null until delivered. */
  report: string | null
}

/**
 * An API failure with the server's own words kept intact.
 *
 * The order endpoint distinguishes cases the buyer can act on — an unfunded
 * wallet, a service that is not live, a token that has not launched — and
 * flattening them into "something went wrong" would strip exactly the part
 * that tells someone what to do next.
 */
export class OrderError extends Error {
  // a plain field, not a constructor parameter property — the build runs with
  // erasableSyntaxOnly, so TypeScript-only syntax cannot survive to runtime
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'OrderError'
    this.status = status
  }
}

async function readError(res: Response, fallback: string): Promise<never> {
  let msg = fallback
  try {
    const body = (await res.json()) as { error?: string }
    if (typeof body.error === 'string' && body.error) msg = body.error
  } catch {
    /* non-JSON error body — keep the fallback */
  }
  throw new OrderError(msg, res.status)
}

export async function createOrder(
  req: CreateOrderRequest,
  signal?: AbortSignal,
): Promise<CreateOrderResponse> {
  if (!hasApi()) throw new OrderError('No API configured — orders cannot be placed.', 0)
  const res = await fetch(`${API_BASE}/api/orders`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) await readError(res, `order failed (${res.status})`)
  const order = (await res.json()) as CreateOrderResponse
  // persisted the moment it exists, before the wallet is even opened — the
  // token is returned once, and a refresh mid-signing would otherwise lose it
  rememberOrder(order.orderId, order.accessToken)
  return order
}

export async function getOrder(
  orderId: string,
  token: string,
  signal?: AbortSignal,
): Promise<OrderDetail> {
  if (!hasApi()) throw new OrderError('No API configured.', 0)
  const res = await fetch(
    `${API_BASE}/api/orders/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}`,
    { signal, headers: { accept: 'application/json' } },
  )
  if (!res.ok) await readError(res, `order lookup failed (${res.status})`)
  return (await res.json()) as OrderDetail
}

// ── access tokens ─────────────────────────────────────────────────────────
// localStorage, keyed by order. This is the buyer's copy of a credential the
// server issues once; it never leaves the browser and is not sent anywhere but
// back to the order endpoint it came from.

const KEY = 'chipperton:orders'

type Stored = Record<string, { token: string; at: string }>

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Stored) : {}
  } catch {
    // private mode, disabled storage, corrupt JSON — the order still works,
    // the buyer just cannot come back to it later
    return {}
  }
}

export function rememberOrder(orderId: string, token: string): void {
  try {
    const all = read()
    all[orderId] = { token, at: new Date().toISOString() }
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* nothing we can do, and nothing worth interrupting the purchase for */
  }
}

export const orderToken = (orderId: string): string | null => read()[orderId]?.token ?? null

/** The buyer's own orders, most recent first. */
export const myOrders = (): { orderId: string; token: string; at: string }[] =>
  Object.entries(read())
    .map(([orderId, v]) => ({ orderId, ...v }))
    .sort((a, b) => b.at.localeCompare(a.at))

/** Seconds left on a quote, floored at zero. */
export function secondsLeft(quoteExpiresAt: string, now = Date.now()): number {
  const ms = Date.parse(quoteExpiresAt) - now
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0
}
