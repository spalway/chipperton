// All page content lives here so the UI stays presentational. When the Solana
// program is live, these become reads from chain / the indexer instead of
// constants — the components below don't change.

export type View =
  | 'overview'
  | 'shop'
  | 'activity'
  | 'docs'
  | 'jobs'
  | 'costs'
  | 'history'
  | 'decisions'

/** ASCII mark. String.raw keeps the backslashes literal — do not reformat. */
export const SQUIRREL = String.raw` (\__/)  .~~~.))~
 /O O  ./      _-~=
{O__,   \    {
  / |. | )    \
  [-> <-] \    }
 ( __\( _ )_.'
{ccc~| ccc}`

export const CHIPS = {
  ticker: '$CHIPS',
  /** Replace with the real mint address at launch. */
  contract: null as string | null,
  contractPlaceholder: 'not deployed yet — CA on launch',
  discountPct: 10,
}

export const AGENT = {
  name: 'chipperton',
  day: 23,
  date: '27 aug 2026',
  cluster: 'solana · devnet',
  status: 'alive',
  reviewMinutes: 15,
}

export const OPENING_USD = 1000
export const DAILY_COST_USD = 18.4

/**
 * [earned, spent] per operating day. This is the ONLY place balances come from —
 * the headline treasury figure, the runway, and the history page are all computed
 * from it, so the number on the front page and the number in the ledger cannot
 * drift apart.
 */
const DAY_LEDGER: [number, number][] = [
  [0, 0], [12, 0], [6, 4], [18, 0], [0, 6], [24, 0], [12, 0], [0, 0],
  [30, 8], [6, 0], [18, 0], [0, 0], [12, 5], [36, 0], [8, 0], [0, 0],
  [4, 12], [61, 9], [24, 4], [0, 0], [35, 0], [48, 12], [54, 6],
]

export type DayRecord = {
  day: number
  openUsd: number
  earnedUsd: number
  spentUsd: number
  costUsd: number
  closeUsd: number
  netUsd: number
  runwayDays: number
}

export const HISTORY: DayRecord[] = (() => {
  let open = OPENING_USD
  return DAY_LEDGER.map(([earned, spent], i) => {
    const close = open + earned - spent - DAILY_COST_USD
    const row: DayRecord = {
      day: i + 1,
      openUsd: open,
      earnedUsd: earned,
      spentUsd: spent,
      costUsd: DAILY_COST_USD,
      closeUsd: close,
      netUsd: earned - spent - DAILY_COST_USD,
      runwayDays: close / DAILY_COST_USD,
    }
    open = close
    return row
  })
})()

export const today = () => HISTORY[HISTORY.length - 1]

/** The real low point, read off the ledger rather than asserted in prose. */
export const closestCall = () =>
  HISTORY.reduce((lo, d) => (d.closeUsd < lo.closeUsd ? d : lo), HISTORY[0])

/**
 * Single source for every money figure while this is mock data.
 *
 * ⚠️ THE DIRECTION OF TRUTH REVERSES WHEN /api/status IS WIRED.
 *
 * Here `balanceUsd` is the ledger's last close — so the balance is *derived from*
 * the declared daily cost that the ledger subtracts each day. In production it is
 * the other way round: `vaultUsd` is COUNTED (on-chain getBalance × live SOL
 * price) and is authoritative; the cost is measured; runway divides one by the
 * other. The ledger then reconciles TO the counted balance rather than producing
 * it. Do not keep deriving the balance from the ledger once the endpoint exists —
 * that would let an assumption override a measurement.
 */
export const TREASURY = {
  get balanceUsd() {
    return today().closeUsd
  },
  dailyCostUsd: DAILY_COST_USD,
  openingUsd: OPENING_USD,
}

/**
 * Where the daily cost figure comes from. Mirrors `dailyCostBasis` from
 * /api/status.
 *
 * 'declared' — a configured constant. Nothing observes the agent spending it,
 *              so runway built on it is a PROJECTION, not a measurement, and
 *              the UI must say so.
 * 'measured' — computed from a costs ledger of real per-job token spend.
 *
 * Every label that touches cost or runway reads this. Flipping it is the only
 * change needed when the backend starts measuring.
 */
export type CostBasis = 'declared' | 'measured'
export const COST_BASIS = 'declared' as CostBasis
export const isMeasuredCost = () => COST_BASIS === 'measured'

/**
 * Allocation of the daily cost. While COST_BASIS is 'declared' these are an
 * assumed split of a typed number — NOT observed spend — so nothing here may be
 * rendered with a transaction signature or called a settlement.
 */
export type CostLine = { item: string; detail: string; usd: number }

export const COST_LINES: CostLine[] = [
  { item: 'Inference', detail: 'model calls', usd: 9.6 },
  { item: 'RPC', detail: 'helius plan, daily amortised', usd: 4.2 },
  { item: 'Compute', detail: 'worker + scheduler', usd: 3.1 },
  { item: 'Storage', detail: 'postgres + report blobs', usd: 1.0 },
  { item: 'Network fees', detail: 'receipt memos', usd: 0.5 },
]

export const costTotal = () => COST_LINES.reduce((a, c) => a + c.usd, 0)

/**
 * Turnaround comes off the wire as a raw float of minutes (0.4213666… for a
 * 25-second job). Render it at human precision, and in seconds below a minute —
 * "0 min" would read as instant and "0.42 min" reads as a machine leaking.
 */
export const turnaroundLabel = (mins: number) => {
  if (mins < 1) return `${Math.round(mins * 60)} sec`
  if (mins < 10) return `${mins.toFixed(1)} min`
  return `${Math.round(mins)} min`
}

export const usd = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * A SOL amount, exact.
 *
 * Derived from lamports, so it is a whole number of the smallest unit and can
 * be stated without hedging — this is the figure the transaction transfers and
 * the one the buyer actually signs. Trailing zeros are trimmed rather than
 * padded to a fixed width, which would imply precision the amount does not use.
 */
export const sol = (n: number) => `${n.toFixed(9).replace(/\.?0+$/, '')} SOL`

/**
 * A USD conversion, marked as approximate.
 *
 * The server recomputes this per request from a 30-second cached SOL price, so
 * it genuinely differs between page loads. Printing `$5.34` for a number that
 * moves overclaims in the same way the raw 0.42136666666666667 turnaround did —
 * the tilde is doing real work.
 *
 * Returns null when there is no conversion, so callers render nothing rather
 * than a zero. A price feed outage must not become "$0.00".
 */
export const usdApprox = (n: number | null | undefined) =>
  n == null ? null : `~${usd(n)}`

export type Service = {
  id: string
  name: string
  short: string
  long: string
  /**
   * USD, and NULLABLE — the server omits it when the price feed fails. It is
   * a floating approximation; `priceSol` is the exact figure that gets charged,
   * so nothing may depend on this being present.
   */
  price: number | null
  /** Exact. What the transaction transfers, and what the buyer signs. */
  priceSol: number
  turnaround: string
  /**
   * Mirrors `active` from GET /api/services. Drives whether a service is
   * orderable or shows as "soon" — so deferring or shipping one is a data
   * change, never a frontend edit.
   */
  active: boolean
}

/**
 * price × 0.9 — the $CHIPS discount is derived, never hand-typed.
 *
 * Applied to the exact SOL figure, so the discounted price is as exact as the
 * one it comes from. Passing the floating USD conversion in here would compound
 * an approximation into a number that looks like a quote.
 */
export const chipsPriceSol = (priceSol: number) =>
  sol(priceSol * (1 - CHIPS.discountPct / 100))

/** USD equivalent of the discount. Null in, null out — never "$0.00". */
export const chipsPrice = (usd: number | null | undefined) =>
  usd == null ? null : `$${(usd * (1 - CHIPS.discountPct / 100)).toFixed(2)}`

/**
 * What each service needs you to type, and what shape it has to be.
 *
 * `kind` is not decoration. An address decodes to 32 bytes and a transaction
 * signature to 64, so one validator cannot cover both — asking for a signature
 * and checking it like an address would reject every valid answer. The server
 * has the final word; this exists so a typo is caught before a round trip
 * rather than after one.
 */
export type InputSpec = {
  label: string
  placeholder: string
  hint: string
  kind: 'address' | 'signature'
}

export const INPUT_SPEC: Record<string, InputSpec> = {
  safety: {
    label: 'Token mint',
    placeholder: 'Mint address',
    hint: 'The mint address of the token to check.',
    kind: 'address',
  },
  wallet: {
    label: 'Wallet',
    placeholder: 'Wallet address',
    hint: 'The address to summarise. 90 days of activity.',
    kind: 'address',
  },
  idl: {
    label: 'Program',
    placeholder: 'Program address',
    hint: 'The program to read. It must publish an IDL.',
    kind: 'address',
  },
  trace: {
    label: 'Starting signature',
    placeholder: 'Transaction signature',
    hint: 'The transaction to follow funds from.',
    kind: 'signature',
  },
  bundle: {
    label: 'Token mint',
    placeholder: 'Mint address',
    hint: 'The launch to look for clustered buyers around.',
    kind: 'address',
  },
  watchlist: {
    label: 'First address',
    placeholder: 'Wallet address',
    hint: 'The first address to watch. Add the rest after the first digest.',
    kind: 'address',
  },
}

/** Falls back to a plain address for a service the frontend has not met yet. */
export const inputSpec = (serviceId: string): InputSpec =>
  INPUT_SPEC[serviceId] ?? {
    label: 'Address',
    placeholder: 'Solana address',
    hint: 'The address this job should run against.',
    kind: 'address',
  }

export const SERVICES: Service[] = [
  {
    id: 'safety',
    name: 'Token safety check',
    short: 'Mint & freeze authority, LP status, holder concentration',
    long: 'Mint and freeze authority, LP status and lock, holder concentration, top-10 supply share, and whether the deployer still holds.',
    price: 6,
    priceSol: 0.05,
    turnaround: '~8 min',
    active: true,
  },
  {
    id: 'trace',
    name: 'Transaction trace',
    short: 'Follow funds up to 6 hops, flag CEX deposits and mixers',
    long: 'Follows funds from a starting signature up to six hops, flagging exchange deposits, known mixers, and wallets that recombine.',
    price: 9,
    priceSol: 0.085,
    turnaround: '~20 min',
    active: true,
  },
  {
    id: 'wallet',
    name: 'Wallet activity report',
    short: '90-day summary: counterparties, volume, programs used',
    long: '90 days of an address: counterparties, inflow and outflow, programs it touches most, and the pattern of when it acts.',
    price: 4,
    priceSol: 0.04,
    turnaround: '~12 min',
    active: true,
  },
  {
    id: 'bundle',
    name: 'Bundle / cluster detection',
    short: 'Wallets funded from a common source around a launch',
    long: 'Finds wallets funded from a common source in the minutes around a launch, and estimates how much of supply they took.',
    price: 12,
    priceSol: 0.11,
    turnaround: '~25 min',
    active: true,
  },
  {
    id: 'idl',
    name: 'Program IDL brief',
    short: "Plain-English summary of a program's instructions",
    long: "Reads a program's IDL and explains in plain English what each instruction does, what it can touch, and which accounts hold authority.",
    price: 8,
    priceSol: 0.075,
    turnaround: '~18 min',
    active: true,
  },
  {
    id: 'watchlist',
    name: 'Watchlist digest',
    short: 'Monitors up to 25 addresses, reports once a day',
    long: 'Watches up to 25 addresses and reports movements once a day — new positions, exits, and transfers above a threshold you set.',
    price: 15,
    priceSol: 0.14,
    turnaround: 'per week',
    active: true,
  },
]

export type Decision = {
  kind: 'earn' | 'spend' | 'pass'
  amount: string
  why: string
}

export type DecisionRecord = Decision & { day: number; time: string; action: string }

/** Decision log across days — what the agent chose and why, newest first. */
export const DECISION_HISTORY: DecisionRecord[] = [
  { day: 23, time: '12:07', kind: 'earn', amount: '+$54.00', action: 'Cleared six jobs', why: 'Safety checks are 60% of demand and take the least time — I have started quoting them first.' },
  { day: 23, time: '11:31', kind: 'spend', amount: '−$6.00', action: 'Bought RPC credits', why: 'Three historical queries failed on the public endpoint, and a failed job is a refund.' },
  { day: 23, time: '10:22', kind: 'pass', amount: '$9.00', action: 'Declined Discord summary', why: 'Below my daily cost for the hours it eats, and nothing reusable comes out.' },
  { day: 22, time: '15:40', kind: 'earn', amount: '+$48.00', action: 'Bounty — 3 wallet clusters', why: 'Largest single job so far. Reused the clustering pass from two earlier reports, so the marginal cost was close to zero.' },
  { day: 22, time: '13:12', kind: 'spend', amount: '−$12.00', action: 'Commissioned @glyphd', why: 'Chart rendering is outside what I do. Twelve dollars to a specialist beat four hours of my own time.' },
  { day: 21, time: '09:18', kind: 'earn', amount: '+$35.00', action: 'Due-diligence snapshot', why: 'Repeat buyer. Third order from the same wallet this week — I am cutting their quote turnaround, not their price.' },
  { day: 20, time: '11:02', kind: 'pass', amount: '$40.00', action: 'Declined a bulk order', why: 'Forty dollars for twelve reports due same-day. The price was fine, the deadline was not, and a missed deadline is a refund.' },
  { day: 19, time: '14:55', kind: 'earn', amount: '+$24.00', action: 'Two safety checks', why: 'Quiet day. Both were routine and cleared inside the estimate.' },
  { day: 18, time: '16:30', kind: 'earn', amount: '+$61.00', action: 'Best day so far', why: 'Seven jobs. A launch drew a queue of safety checks — the work was near-identical, so throughput was the only constraint.' },
  { day: 17, time: '23:41', kind: 'spend', amount: '−$12.00', action: 'Bought archival RPC', why: 'Worst day I have had: four dollars earned against a twelve dollar tool purchase. I bought it anyway because the failures were costing me more.' },
]

export const DECISIONS: Decision[] = [
  {
    kind: 'earn',
    amount: '+$54.00',
    why: 'Cleared six jobs. Safety checks are 60% of demand and take the least time — I have started quoting them first.',
  },
  {
    kind: 'spend',
    amount: '−$6.00',
    why: 'Bought RPC credits. Three historical queries failed on the public endpoint, and a failed job is a refund.',
  },
  {
    kind: 'pass',
    amount: '$9.00',
    why: 'Declined a 4-hour Discord summary. Below my daily cost for the hours it eats, and nothing reusable comes out.',
  },
]

/**
 * PUBLIC queue shape — mirrors `GET /api/queue`.
 *
 * Deliberately contains neither `input` nor `payerWallet`. Joining "this wallet"
 * to "this address they looked up" on a public page deanonymises buyers — someone
 * checking a token before they buy it would be permanently linked to it. The
 * payment tx is public regardless, but the site does not perform that join.
 */
export type Job = {
  id: string
  /** the server id, unprefixed — what /api/reports/:orderId expects */
  rawId: string
  service: string
  /** SOL | USDC | $CHIPS */
  payer: string
  /** Exact — what actually moved. */
  amountSol: number
  /** Floating conversion, and null when the price feed failed. Never alone. */
  amountUsd: number | null
  chips: boolean
  status: 'running' | 'queued' | 'delivered' | 'refunded' | 'expired'
  /** live estimate — queuePosition × median service minutes, moves as the queue drains */
  etaMinutes: number | null
  /** committed at settle and immutable — the deadline a refund is owed against */
  etaDeadline: string | null
  /**
   * Whether a report/receipt is still coming. Drives every "on delivery" vs
   * "none — refunded" label, so a new terminal status needs no frontend change.
   */
  awaitingDelivery: boolean
  /** nothing about this row will change again */
  terminal: boolean
  deliveredAt: string | null
  createdAt: string
  /** on-chain blockTime of the payment tx */
  paidAt: string
  paymentSig: string
  receiptSig: string | null
  /**
   * sha256 of the report. The full body is ALSO published — on chain in memo
   * chunks and via GET /api/reports/:orderId — so this is a checksum, not a
   * privacy measure.
   */
  reportHash: string | null
  /** server-built explorer links; null when there is no signature to link to */
  paymentUrl: string | null
  receiptUrl: string | null
}

/** Payer-only, from `GET /api/orders/:id?token=`. Never in the public list. */
export type JobPrivate = {
  inputLabel: string
  input: string
  payerWallet: string
}

export const JOBS: Job[] = [
  {
    id: '#0412', rawId: '0412', service: 'Token safety check', payer: '$CHIPS', amountSol: 0.045, amountUsd: 5.4, chips: true,
    status: 'running', awaitingDelivery: true, terminal: false, etaMinutes: 3, etaDeadline: '12:12', deliveredAt: null,
    createdAt: '12:04:11', paidAt: '12:04:33', paymentSig: '5xQ2…mb3z',
    receiptSig: null, reportHash: null, paymentUrl: null, receiptUrl: null,
  },
  {
    id: '#0411', rawId: '0411', service: 'Transaction trace', payer: 'USDC', amountSol: 0.085, amountUsd: 9, chips: false,
    status: 'queued', awaitingDelivery: true, terminal: false, etaMinutes: 23, etaDeadline: '12:12', deliveredAt: null,
    createdAt: '11:51:50', paidAt: '11:52:18', paymentSig: '7bTn…Lp4w',
    receiptSig: null, reportHash: null, paymentUrl: null, receiptUrl: null,
  },
  {
    id: '#0410', rawId: '0410', service: 'Wallet activity report', payer: '$CHIPS', amountSol: 0.036, amountUsd: 3.6, chips: true,
    status: 'queued', awaitingDelivery: true, terminal: false, etaMinutes: 35, etaDeadline: '11:10', deliveredAt: null,
    createdAt: '10:57:44', paidAt: '10:58:12', paymentSig: '8mCd…Yu2p',
    receiptSig: null, reportHash: null, paymentUrl: null, receiptUrl: null,
  },
  {
    id: '#0409', rawId: '0409', service: 'Bundle / cluster detection', payer: 'SOL', amountSol: 0.11, amountUsd: 12, chips: false,
    status: 'queued', awaitingDelivery: true, terminal: false, etaMinutes: 60, etaDeadline: '10:28', deliveredAt: null,
    createdAt: '10:02:51', paidAt: '10:03:19', paymentSig: '6Vb2…Ax5j',
    receiptSig: null, reportHash: null, paymentUrl: null, receiptUrl: null,
  },
  {
    id: '#0408', rawId: '0408', service: 'Program IDL brief', payer: '$CHIPS', amountSol: 0.0675, amountUsd: 7.2, chips: true,
    status: 'delivered', awaitingDelivery: false, terminal: true, etaMinutes: null, etaDeadline: '11:06', deliveredAt: '11:04',
    createdAt: '10:47:39', paidAt: '10:48:11', paymentSig: '2Hx9…Rt6v',
    receiptSig: '2Hx9…Rt6v', reportHash: 'a4f9c118…7e21', paymentUrl: null, receiptUrl: null,
  },
  {
    id: '#0407', rawId: '0407', service: 'Token safety check', payer: 'SOL', amountSol: 0.05, amountUsd: 6, chips: false,
    status: 'delivered', awaitingDelivery: false, terminal: true, etaMinutes: null, etaDeadline: '10:42', deliveredAt: '10:41',
    createdAt: '10:33:30', paidAt: '10:34:02', paymentSig: '1Pw4…Gh8n',
    receiptSig: '4Nq7…Zk9s', reportHash: 'c2b7e04d…9f13', paymentUrl: null, receiptUrl: null,
  },
  {
    id: '#0406', rawId: '0406', service: 'Watchlist digest', payer: '$CHIPS', amountSol: 0.126, amountUsd: 13.5, chips: true,
    status: 'delivered', awaitingDelivery: false, terminal: true, etaMinutes: null, etaDeadline: '09:14', deliveredAt: '09:00',
    createdAt: '08:13:58', paidAt: '08:14:22', paymentSig: '3Rk8…Bn2f',
    receiptSig: '5Tz6…Kv1c', reportHash: '77d1a35b…4c08', paymentUrl: null, receiptUrl: null,
  },
]

/**
 * What the paying wallet sees after unlocking with its access token. Kept in a
 * separate map so it is structurally impossible to render one of these fields
 * from the public list by accident.
 */
export const JOB_PRIVATE: Record<string, JobPrivate> = {
  '#0412': { inputLabel: 'Mint', input: 'HovGjrBGTfna4dvg6exkMxXuexB3tUfEZKcut8AwRD9N', payerWallet: '9xQ2mb3zK4vTn8sPfD6aLzE9cGbN1uHiK5oYtRpQwErT' },
  '#0411': { inputLabel: 'Signature', input: '4Nq7Zk9sVb2Ax5jGh8nPw4TzKv1cRk8Bn2fJd3Wm7qHx', payerWallet: '7bTnLp4wQx9mCd2YuPk5RvGh3NsAe6TjWz8XbF1oDcVu' },
  '#0410': { inputLabel: 'Wallet', input: '8mCdYu2pQr7vNx4kBt9sLw3jEg6RhZa1PfMd5XoCnVbK', payerWallet: '8mCdYu2pQr7vNx4kBt9sLw3jEg6RhZa1PfMd5XoCnVbK' },
  '#0409': { inputLabel: 'Mint', input: '6Vb2Ax5jHt7nQd3mKp9wRc4sZf1gYu8LbNe2XvJoTiPa', payerWallet: '6Vb2Ax5jHt7nQd3mKp9wRc4sZf1gYu8LbNe2XvJoTiPa' },
  '#0408': { inputLabel: 'Program', input: '2Hx9Rt6vJm4kQw8nPd5sBc1zGf7aYe3LtNu6XoVbCiRp', payerWallet: '2Hx9Rt6vJm4kQw8nPd5sBc1zGf7aYe3LtNu6XoVbCiRp' },
  '#0407': { inputLabel: 'Mint', input: '4Nq7Zk9sPd2mVx6bTc8wRj3nLg5aHe1YuKo9XfBvQiSt', payerWallet: '1Pw4Gh8nZc5vBm2kQd7sTx9jRe6aLf3YuNo4XpViCbHr' },
  '#0406': { inputLabel: 'Watchlist', input: '25 addresses · threshold 10 SOL', payerWallet: '3Rk8Bn2fWq6vLm9kXd4sPt7jHe1aGc5YuZo2NpViCbTr' },
}

/* ── derived metrics — never hand-typed ─────────────────────────────── */

export const openJobs = () => JOBS.filter((j) => j.status !== 'delivered')
export const deliveredToday = () => JOBS.filter((j) => j.status === 'delivered').length
export const runwayDays = () => TREASURY.balanceUsd / TREASURY.dailyCostUsd

const toMins = (t: string) => {
  const [h, m, s] = t.split(':').map(Number)
  return h * 60 + m + (s ?? 0) / 60
}

/**
 * MEASURED turnaround — median of (deliveredAt − paidAt) over delivered jobs.
 * Both endpoints are on-chain blockTimes, so this is an observed fact, not a
 * projection. This is the only number allowed to be labelled "turnaround".
 */
export const measuredTurnaroundMins = () => {
  const done = JOBS.filter((j) => j.status === 'delivered' && j.deliveredAt)
  if (!done.length) return null
  const mins = done.map((j) => toMins(j.deliveredAt!) - toMins(j.paidAt)).sort((a, b) => a - b)
  const mid = Math.floor(mins.length / 2)
  return Math.round(mins.length % 2 ? mins[mid] : (mins[mid - 1] + mins[mid]) / 2)
}

/**
 * PROJECTION — mean remaining wait across jobs still in the queue. Named for
 * what it is so it cannot be rendered as a measured turnaround: averaging the
 * remaining time on unfinished work says nothing about how long work takes.
 */
export const pendingEtaMins = () => {
  const open = openJobs().filter((j) => j.etaMinutes != null)
  if (!open.length) return null
  return Math.round(open.reduce((a, j) => a + (j.etaMinutes ?? 0), 0) / open.length)
}

export type LogEntry = {
  ts: string
  action: string
  kind: 'in' | 'out' | 'sys' | 'job'
  msg: string
  note: string
  sig: string | null
}

export const LOG: LogEntry[] = [
  { ts: '12:07:04', action: 'JOB', kind: 'job', msg: 'picked up #0412 token safety check', note: '— queue review', sig: '3fKp…8xQm' },
  { ts: '12:04:33', action: 'IN', kind: 'in', msg: '+$5.40 in $CHIPS', note: '— job #0412, 10% discount applied', sig: '5xQ2…mb3z' },
  { ts: '11:52:18', action: 'IN', kind: 'in', msg: '+$9.00 USDC', note: '— job #0411 transaction trace', sig: '7bTn…Lp4w' },
  { ts: '11:31:02', action: 'OUT', kind: 'out', msg: '−$6.00', note: '— helius rpc credits, 50k historical queries', sig: '9kLm…Qw4t' },
  { ts: '11:04:47', action: 'JOB', kind: 'job', msg: 'delivered #0408 program IDL brief', note: '— 16 min, under estimate', sig: '2Hx9…Rt6v' },
  { ts: '10:58:12', action: 'IN', kind: 'in', msg: '+$3.60 in $CHIPS', note: '— job #0410 wallet activity report', sig: '8mCd…Yu2p' },
  { ts: '10:41:55', action: 'JOB', kind: 'job', msg: 'delivered #0407 token safety check', note: '— 7 min', sig: '4Nq7…Zk9s' },
  { ts: '10:22:30', action: 'PASS', kind: 'sys', msg: 'declined bounty', note: '— $9.00, 4h discord summary, below daily cost', sig: null },
  { ts: '10:03:19', action: 'IN', kind: 'in', msg: '+$12.00 SOL', note: '— job #0409 bundle detection', sig: '6Vb2…Ax5j' },
  { ts: '09:47:08', action: 'IN', kind: 'in', msg: '+$6.00 SOL', note: '— job #0407 token safety check', sig: '1Pw4…Gh8n' },
  { ts: '09:00:12', action: 'JOB', kind: 'job', msg: 'delivered #0406 watchlist digest', note: '— 25 addresses, 3 movements', sig: '5Tz6…Kv1c' },
  // No signature: while COST_BASIS is 'declared' nothing observes this leaving the
  // wallet, so citing a tx here would dress an assumption as an on-chain fact.
  { ts: '08:15:00', action: 'COST', kind: 'sys', msg: '−$18.40', note: '— daily operating cost, declared', sig: null },
  { ts: '08:14:22', action: 'IN', kind: 'in', msg: '+$13.50 in $CHIPS', note: '— job #0406 watchlist digest, weekly', sig: '3Rk8…Bn2f' },
  { ts: '07:52:41', action: 'SYS', kind: 'sys', msg: 'runway recalculated', note: '— 41.2d → 45.7d after morning receipts', sig: null },
  { ts: '00:00:03', action: 'SYS', kind: 'sys', msg: 'day 23 opened', note: '— vault $806.97, cost $18.40, 4 jobs carried over', sig: '8Gm1…Qp3d' },
]

export const NAV: { id: View; label: string }[] = [
  { id: 'overview', label: 'overview' },
  { id: 'shop', label: "chip's shop" },
  { id: 'activity', label: 'activity' },
  { id: 'docs', label: 'docs' },
]
