import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { address } from '@solana/kit';
import { REFUND_FEE_BUFFER, config, corsOrigins } from './config.ts';
import { rateLimit } from './ratelimit.ts';
import { db, type Order, type Service } from './db.ts';
import {
  agentSigner,
  explorerAddress,
  explorerTx,
  explorerTxOrNull,
  solscanTx,
  rpcPay,
  vaultAddress,
} from './chain/clients.ts';
import { LAMPORTS_PER_SOL, buildOrderTransaction, newReference } from './chain/orders.ts';

export const app = new Hono();

app.use(
  '/*',
  cors({
    origin: (origin) => {
      if (corsOrigins === '*') return origin ?? '*';
      const o = origin?.replace(/\/$/, '') ?? '';

      // Exact match. Returning the request's origin when it is NOT on the list
      // would echo any caller back to itself and defeat the whole point.
      if (corsOrigins.includes(o)) return origin;

      // Any local dev origin, on any port. Pinning specific ports does not
      // work: Vite silently moves to the next free port, so an allowlist of
      // 5173 blocks a dev server that happened to start on 5202 — which is
      // exactly what this change originally did.
      //
      // Safe to allow: the API is public and unauthenticated, and the only
      // secret it serves is a per-order access token passed as a query param.
      // A page on someone's localhost gains nothing curl does not already have.
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return origin;

      return null;
    },
  }),
);

/*
 * Rate limits. These exist to stop accidental hammering and casual abuse —
 * the solvency gate is what actually protects the money.
 *
 * Order creation is the expensive path: it makes three RPC calls (balance,
 * sender lookup inside createTransfer, latest blockhash) plus a database
 * insert, so it is the one worth limiting tightly. Reads are cheaper but
 * /api/status still costs two getBalance calls, so it is not free either.
 */
app.use('/api/*', rateLimit({ name: 'read', limit: 120, windowMs: 60_000 }));
app.use('/api/orders', async (c, next) =>
  c.req.method === 'POST'
    ? rateLimit({ name: 'order', limit: 10, windowMs: 10 * 60_000 })(c, next)
    : next(),
);

/* ------------------------------------------------------------------ status */

app.get('/api/status', async (c) => {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [
    { value: balance },
    { value: hotBalance },
    solUsd,
    state,
    counts,
    turnaround,
    measuredCost,
    spend,
    liability,
    deliveredCount,
  ] = await Promise.all([
    rpcPay.getBalance(vaultAddress).send(),
    rpcPay.getBalance(agentSigner.address).send(),
    solPriceUsd(),
    db.from('agent_state').select('*').eq('id', 1).single(),
    // head:true + count:'exact' asks Postgres to count. Reading data.length
    // instead would silently cap at the PostgREST row limit and under-report
    // a real backlog as soon as it got interesting.
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['paid', 'running']),
    medianTurnaroundMinutes(),
    measuredDailyCostUsd(),
    observedSpend(),
    db.from('orders').select('amount_lamports').in('status', ['paid', 'running']),
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'delivered')
      .gte('delivered_at', startOfDay.toISOString()),
  ]);

  // Cheapest ORDERABLE service — what the agent would need to cover to reopen.
  // Using the cheapest rather than an average keeps the agenda's stated
  // threshold the true one: this is the smallest sale it could accept.
  const { data: activeSvcs } = await db
    .from('services')
    .select('price_lamports')
    .eq('active', true)
    .order('price_lamports', { ascending: true })
    .limit(1);
  const cheapestActive = activeSvcs?.[0]?.price_lamports
    ? Number(activeSvcs[0].price_lamports)
    : null;

  // Empty string in the column is treated as unset — a blank is far likelier
  // to be someone clearing the field than a deliberate value.
  const chipsMint = (state.data?.chips_mint || null) as string | null;
  const twitterHandle = (state.data?.twitter_handle || null) as string | null;

  const refundLiability = (liability.data ?? []).reduce(
    (sum, o) => sum + Number(o.amount_lamports),
    0,
  );
  const vaultLamports = Number(balance);
  const vaultUsd = solUsd === null ? null : (vaultLamports / LAMPORTS_PER_SOL) * solUsd;
  const declaredCostUsd = Number(state.data?.daily_cost_usd ?? config.dailyCostUsd);
  const interval = Number(state.data?.tick_interval_seconds ?? config.tickIntervalSeconds);
  const lastTickAt = state.data?.last_tick_at ?? null;

  // Prefer what the agent has actually been observed spending. Fall back to the
  // declared figure, and SAY which one is in play — a runway computed from a
  // hardcoded cost is a projection, and must not be rendered as a measurement.
  const basis = measuredCost !== null && measuredCost > 0 ? 'measured' : 'declared';
  const effectiveCostUsd = basis === 'measured' ? measuredCost! : declaredCostUsd;

  return c.json({
    vaultAddress: vaultAddress.toString(),
    vaultUrl: explorerAddress(vaultAddress.toString()),
    hotWalletAddress: agentSigner.address.toString(),
    hotWalletUrl: explorerAddress(agentSigner.address.toString()),
    vaultLamports,
    vaultUsd,

    /** Config constant. An assumption, not an observation. */
    dailyCostUsd: declaredCostUsd,
    /** Observed daily RATE. Null until the ledger holds enough observations
     *  over enough time to actually be a rate — one job's cost divided by a
     *  one-day floor is an extrapolation, not a measurement. */
    measuredDailyCostUsd: measuredCost,

    /** Raw partial spend. Always available, explicitly NOT a daily rate, and
     *  a LOWER BOUND: it covers only the kinds written to the ledger, which
     *  today is inference alone. RPC and network fees are real and untracked. */
    observedSpend: spend,
    /** 'measured' | 'declared' — which figure runwayDays actually used.
     *  The UI must not call runway "measured" unless this says so. */
    dailyCostBasis: basis,
    /**
     * Why the basis is what it is, and what would change it.
     *
     * This field flips on its own roughly 24h after the first jobs run, and
     * when it does it silently changes what every cost and runway label is
     * asserting. Nobody is watching at that moment. Stating the threshold and
     * the current distance from it means a consumer can see the flip coming
     * and test both branches, rather than discovering it from a number.
     */
    dailyCostBasisReason:
      basis === 'measured'
        ? `observed from ${spend.sampleCount} ledger entries over ` +
          `${spend.hoursObserved.toFixed(1)}h`
        : `needs 5+ entries spanning 24h+ to be a rate; have ` +
          `${spend.sampleCount} over ${spend.hoursObserved.toFixed(1)}h`,

    runwayDays:
      vaultUsd === null || effectiveCostUsd <= 0 ? null : vaultUsd / effectiveCostUsd,

    backlog: counts.count ?? 0,
    deliveredToday: deliveredCount.count ?? 0,

    /* ---- solvency ----------------------------------------------------
     * Refunds are paid from the HOT wallet while payments fill the VAULT,
     * so the hot wallet drains as the vault fills. "Can it honour what it
     * already owes" is a truer liveness signal than tick timing: an agent
     * that cannot refund has stopped being trustworthy even while it is
     * still ticking happily. The worker refuses new work on this basis. */
    hotWalletLamports: Number(hotBalance),
    refundLiabilityLamports: refundLiability,
    canHonourRefunds: Number(hotBalance) >= refundLiability + REFUND_FEE_BUFFER,

    lastTickAt,
    tickIntervalSeconds: interval,
    // SCHEDULED, not guaranteed — the worker is a cron tick, not a promise.
    nextTickAt: lastTickAt ? new Date(Date.parse(lastTickAt) + interval * 1000).toISOString() : null,
    medianTurnaroundMinutes: turnaround,
    payCluster: config.payCluster,

    /* ---- live settings ------------------------------------------------
     * Read from agent_state, which this handler already fetches — so these
     * change the moment the row changes, with no redeploy. That matters for
     * the mint especially: the address exists the second the token launches,
     * and waiting on a Railway rebuild to show it is the wrong shape.
     *
     * NULL mint means not launched. chipsEnabled is DERIVED from it rather
     * than being a separate flag that could disagree. */
    chipsMint,
    chipsUrl: chipsMint ? `https://pump.fun/coin/${chipsMint}` : null,
    chipsEnabled: chipsMint !== null,
    chipsDiscountPct: config.chipsDiscountPct,

    twitterHandle,
    twitterUrl: twitterHandle ? `https://x.com/${twitterHandle}` : null,

    /**
     * What the agent is currently blocked on or working through.
     *
     * Every item is DERIVED from state elsewhere in this same response, and
     * every one names the condition that removes it. Nothing here is written
     * ahead of time — the list empties on its own as each condition clears,
     * and an empty list means the agent is simply running.
     *
     * This replaces a hand-written activity feed. Invented entries would be
     * indistinguishable from real ones to a reader, which is the failure this
     * whole project keeps finding.
     */
    agenda: buildAgenda({
      canHonourRefunds: Number(hotBalance) >= refundLiability + REFUND_FEE_BUFFER,
      hotWalletLamports: Number(hotBalance),
      refundLiabilityLamports: refundLiability,
      cheapestServiceLamports: cheapestActive,
      chipsMint,
      payCluster: config.payCluster,
      backlog: counts.count ?? 0,
      everDelivered: turnaround !== null,
      dailyCostBasis: basis,
    }),
  });
});

interface AgendaInput {
  canHonourRefunds: boolean;
  hotWalletLamports: number;
  refundLiabilityLamports: number;
  cheapestServiceLamports: number | null;
  chipsMint: string | null;
  payCluster: string;
  backlog: number;
  everDelivered: boolean;
  dailyCostBasis: string;
}

/** Ordered most-blocking first. Only conditions that are currently true appear. */
function buildAgenda(s: AgendaInput) {
  const sol = (n: number) => `${(n / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
  const items: { kind: 'blocked' | 'waiting' | 'working'; title: string; detail: string; clearsWhen: string }[] = [];

  if (!s.canHonourRefunds) {
    const needed = s.refundLiabilityLamports + (s.cheapestServiceLamports ?? 0) + REFUND_FEE_BUFFER;
    items.push({
      kind: 'blocked',
      title: 'Not accepting orders',
      detail:
        `The refund wallet holds ${sol(s.hotWalletLamports)}. Taking the cheapest job ` +
        `would put it on the hook for ${sol(needed)} including everything already owed. ` +
        `It will not sell what it could not refund, so the shop is closed.`,
      clearsWhen: 'the refund wallet can cover a job plus its outstanding book',
    });
  }

  if (s.chipsMint === null) {
    items.push({
      kind: 'waiting',
      title: '$CHIPS not launched',
      detail:
        `No mint address is set, so the ${config.chipsDiscountPct}% discount cannot be ` +
        'honoured and paying in $CHIPS is disabled rather than advertised.',
      clearsWhen: 'the mint address is set',
    });
  }

  if (s.payCluster !== 'mainnet-beta') {
    items.push({
      kind: 'waiting',
      title: `Running on ${s.payCluster}`,
      detail: 'Transactions are real but the money is not. Nothing here is a live payment.',
      clearsWhen: 'payments move to mainnet',
    });
  }

  if (s.backlog > 0) {
    items.push({
      kind: 'working',
      title: `${s.backlog} job${s.backlog === 1 ? '' : 's'} in the queue`,
      detail: 'Worked oldest-paid-first, one per tick, regardless of who paid most.',
      clearsWhen: 'the queue drains',
    });
  }

  if (!s.everDelivered) {
    items.push({
      kind: 'waiting',
      title: 'Nothing delivered yet',
      detail:
        'Turnaround is measured from two on-chain timestamps, so there is no figure ' +
        'to report until a first job completes.',
      clearsWhen: 'the first job is delivered',
    });
  }

  if (s.dailyCostBasis === 'declared') {
    items.push({
      kind: 'waiting',
      title: 'Operating cost is declared, not measured',
      detail:
        'Runway currently divides a real balance by an assumed daily cost. The ledger ' +
        'needs enough history before that figure can be observed rather than stated.',
      clearsWhen: '5+ cost entries span 24h+',
    });
  }

  return items;
}

/* ---------------------------------------------------------------- services */

app.get('/api/services', async (c) => {
  const { data, error } = await db.from('services').select('*').order('sort_order');
  // Surface DB failures. Falling through to `[]` would render an empty shop
  // that looks deliberate rather than broken.
  if (error) return c.json({ error: `services unavailable: ${error.message}` }, 503);
  const solUsd = await solPriceUsd();

  return c.json(
    ((data ?? []) as Service[]).map((s) => ({
      id: s.id,
      name: s.name,
      short: s.short,
      long: s.long,
      priceLamports: s.price_lamports,
      priceSol: s.price_lamports / LAMPORTS_PER_SOL,
      priceUsd: solUsd === null ? null : (s.price_lamports / LAMPORTS_PER_SOL) * solUsd,
      estMinutes: s.est_minutes,
      active: s.active,
    })),
  );
});

/* ------------------------------------------------------------------- queue */

/**
 * PUBLIC. Deliberately omits `input` and `payer_wallet`.
 *
 * The payment transaction is public on-chain regardless, but this site will not
 * perform the join between a wallet and the address it asked about. That join
 * is the deanonymising part, and it is the part we control.
 */
const QUEUE_PAGE_LIMIT = 25;

/** Statuses after which nothing about the order will change again. */
const TERMINAL: ReadonlySet<string> = new Set(['delivered', 'refunded', 'expired', 'failed']);

/**
 * Which phase an order is in, as three flags rather than a status string the
 * client has to interpret.
 *
 * EXACTLY ONE of awaitingPayment / awaitingDelivery / terminal is true for
 * every status. That completeness is the point — a client can branch on all
 * three and never land in an unhandled state.
 *
 * Fields like `receiptSig`, `reportHash` and `deliveredAt` are "empty now,
 * filled on delivery" EXCEPT when the order ended without ever being
 * delivered, where they are empty forever. A bare null for both cases makes
 * every client re-derive "will this ever arrive?" from status semantics, which
 * is what produced a "Receipt: on delivery" label on an already-refunded job.
 *
 * `awaitingPayment` exists because the first version of this shipped only two
 * flags, and an unpaid order was then false for both — neither finished nor
 * coming. That is the same missing-state bug the two flags were added to
 * remove, reintroduced one endpoint over: the queue never carries unpaid
 * orders so it never showed, while order detail is unpaid for the entire
 * window a buyer sits watching the screen.
 */
function lifecycle(status: string) {
  return {
    /**
     * Waiting for the buyer's payment to land. Only ever true on
     * /api/orders/:id — the public queue holds no unpaid orders, so this is
     * always false there.
     */
    awaitingPayment: status === 'pending',
    /** Paid, and a report and receipt are still expected. When false and
     *  receiptSig is null, that null is permanent. */
    awaitingDelivery: status === 'paid' || status === 'running',
    /** Nothing about this order will change again. */
    terminal: TERMINAL.has(status),
  };
}

app.get('/api/queue', async (c) => {
  const { data, error, count } = await db
    .from('orders')
    .select(
      'id,service_id,status,currency,amount_lamports,created_at,paid_at,delivered_at,payment_sig,receipt_sig,eta_deadline,report_hash,report_chunk_sigs',
      { count: 'exact' },
    )
    .in('status', ['paid', 'running', 'delivered', 'refunded'])
    .order('created_at', { ascending: false })
    .limit(QUEUE_PAGE_LIMIT);

  // This response is a PAGE, not the whole set. Any total derived by counting
  // these rows is wrong the moment there are more than QUEUE_PAGE_LIMIT orders,
  // and wrong silently. Advertised in headers so a client can detect the
  // truncation without the response shape changing under it.
  c.header('X-Queue-Total', String(count ?? 0));
  c.header('X-Queue-Limit', String(QUEUE_PAGE_LIMIT));
  c.header('X-Queue-Truncated', String((count ?? 0) > QUEUE_PAGE_LIMIT));

  // An empty queue and an unreachable database look identical to the frontend
  // unless we distinguish them here.
  if (error) return c.json({ error: `queue unavailable: ${error.message}` }, 503);

  const [services, solUsd, measured, openQueue] = await Promise.all([
    serviceMap(),
    solPriceUsd(),
    medianTurnaroundMinutes(),
    // Queue position MUST come from the whole open queue, never from the page
    // above. That page is the 25 most recent orders by created_at DESC, while
    // work is claimed oldest-paid-FIRST — so the job actually next in line can
    // sit outside the page entirely, and any position derived from the page is
    // wrong in the optimistic direction once there are more than 25 orders.
    // Same error as reporting a sampling window as full history.
    db
      .from('orders')
      .select('id')
      .in('status', ['paid', 'running'])
      .order('paid_at', { ascending: true }),
  ]);

  // Live queue estimate: true position in the open queue x how long a job
  // actually takes. Distinct from etaDeadline, which was committed at settle
  // and never moves — the refund is owed against THAT, not against this.
  const open = (openQueue.data ?? []).map((o) => o.id);

  return c.json(
    (data ?? []).map((o) => {
      const svc = services.get(o.service_id);
      const position = open.indexOf(o.id);
      const perJob = measured ?? svc?.est_minutes ?? null;

      return {
        id: o.id,
        serviceId: o.service_id,
        serviceName: svc?.name ?? o.service_id,
        status: o.status,
        currency: o.currency,
        amountSol: o.amount_lamports / LAMPORTS_PER_SOL,
        amountUsd: solUsd === null ? null : (o.amount_lamports / LAMPORTS_PER_SOL) * solUsd,
        createdAt: o.created_at,
        paidAt: o.paid_at,
        deliveredAt: o.delivered_at,

        /** Committed at payment, immutable. The refund is owed against this. */
        etaDeadline: o.eta_deadline,
        /** Live ESTIMATE, moves as the queue drains. Never a promise. */
        etaMinutes: position < 0 || perJob === null ? null : (position + 1) * perJob,
        /** Whether etaMinutes came from observed turnaround or a declared
         *  per-service guess. The UI must not call it measured unless this
         *  says 'measured'. */
        etaBasis: measured !== null ? 'measured' : 'declared',

        ...lifecycle(o.status),

        paymentSig: o.payment_sig,
        receiptSig: o.receipt_sig,

        /** Prebuilt explorer links. Built server-side so the cluster can never
         *  drift out of sync with where the payment actually settled. Null
         *  when there is no signature — render the link or nothing. */
        paymentUrl: explorerTxOrNull(o.payment_sig),
        receiptUrl: explorerTxOrNull(o.receipt_sig),

        /** Ordered memo txs carrying the full report body on-chain. */
        reportChunkSigs: o.report_chunk_sigs ?? null,
        reportChunkUrls: (o.report_chunk_sigs ?? []).map((s: string) => explorerTx(s)),

        /** PUBLIC on purpose. This hash is already broadcast on-chain inside
         *  the receipt memo (chp:1:done:<id>:<hash>), so gating it here would
         *  protect nothing while implying it was protected. It is also the
         *  entire verifiability story: hold the report, hash it, compare.
         *  It does not leak the queried address — the hash covers the full
         *  report including non-deterministic model prose. */
        reportHash: o.report_hash,
      };
    }),
  );
});

/**
 * PUBLIC. What the agent has actually spent.
 *
 * Deliberately returns spend entries and totals only — no running balance and
 * no "remaining" figure. The vault balance is COUNTED on-chain via /api/status;
 * deriving it from this ledger instead would put an assumption upstream of a
 * measurement, which is exactly backwards.
 */
app.get('/api/costs', async (c) => {
  const { data, error } = await db
    .from('costs')
    .select('id,order_id,kind,usd,detail,created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return c.json({ error: `costs unavailable: ${error.message}` }, 503);

  const rows = data ?? [];
  const byKind: Record<string, number> = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + Number(r.usd);

  return c.json({
    entries: rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      kind: r.kind,
      usd: Number(r.usd),
      detail: r.detail,
      createdAt: r.created_at,
    })),
    totalsByKind: byKind,
    measuredDailyCostUsd: await measuredDailyCostUsd(),
    note: 'Observed spend only. Vault balance is counted on-chain, not derived from this.',
  });
});

/* ------------------------------------------------------------------ orders */

app.post('/api/orders', async (c) => {
  const body = await c.req.json().catch(() => null) as
    | { serviceId?: string; input?: string; payer?: string; currency?: string }
    | null;

  if (!body?.serviceId || !body.input || !body.payer) {
    return c.json({ error: 'serviceId, input and payer are required' }, 400);
  }

  const currency = (body.currency ?? 'SOL').toUpperCase();
  // Read the live setting, not the env var — otherwise the shop could offer
  // CHIPS the moment the mint is set in the database while this path kept
  // rejecting it until a redeploy.
  const liveChipsMint = await chipsMintSetting();
  if (currency === 'CHIPS' && liveChipsMint === null) {
    return c.json(
      { error: 'CHIPS payment is not available yet — the token has not launched.' },
      409,
    );
  }
  if (currency !== 'SOL') return c.json({ error: 'unsupported currency' }, 400);

  // Validate the addresses before we take anyone's money.
  try {
    address(body.payer);
    address(body.input);
  } catch {
    return c.json({ error: 'payer and input must be valid Solana addresses' }, 400);
  }

  const { data: service } = await db
    .from('services')
    .select('*')
    .eq('id', body.serviceId)
    .single();

  if (!service) return c.json({ error: 'unknown service' }, 404);
  if (!(service as Service).active) {
    return c.json({ error: 'that service is not available yet' }, 409);
  }

  const s = service as Service;

  /*
   * Refuse the order if the agent could not refund it.
   *
   * The worker already gates on this before claiming work, but that is too
   * late — by then the buyer has paid. Without this check an insolvent agent
   * happily quotes, takes real money, settles it, then declines to work the
   * job, and the overdue refund fails because the hot wallet is empty. The
   * order lands in `failed`: paid, undelivered, unrefunded, needing a human.
   *
   * Checking here means an agent that cannot honour its promises stops
   * selling instead of stopping halfway through.
   */
  const [{ value: hotBalance }, { data: owedRows }] = await Promise.all([
    rpcPay.getBalance(agentSigner.address).send(),
    db.from('orders').select('amount_lamports').in('status', ['paid', 'running']),
  ]);

  const owed = (owedRows ?? []).reduce((sum, o) => sum + Number(o.amount_lamports), 0);
  // Include THIS order — it is about to become a liability.
  const wouldOwe = owed + s.price_lamports + REFUND_FEE_BUFFER;

  if (Number(hotBalance) < wouldOwe) {
    return c.json(
      {
        error:
          'Chipperton is not accepting orders — it cannot currently cover a refund ' +
          'for this job, so it will not take payment for it.',
        canHonourRefunds: false,
        hotWalletLamports: Number(hotBalance),
        requiredLamports: wouldOwe,
      },
      503,
    );
  }

  const id = await nextOrderId();
  const reference = await newReference();
  const accessToken = randomBytes(24).toString('base64url');
  const quoteExpiresAt = new Date(Date.now() + config.quoteTtlSeconds * 1000);

  // Build the transaction BEFORE inserting. If this throws, we must not leave a
  // pending order behind that can never be paid. (A gap in the id sequence is
  // the cheaper problem.)
  let tx;
  try {
    tx = await buildOrderTransaction({
      orderId: id,
      payer: body.payer,
      amountLamports: s.price_lamports,
      reference,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // @solana/pay checks the sender exists on-chain. A wallet that has never
    // held SOL has no account, and that is the buyer's problem to fix, not a
    // server fault — say so instead of returning a 500.
    if (/sender not found/i.test(msg)) {
      return c.json(
        { error: 'that wallet has no SOL on this cluster — fund it before ordering' },
        400,
      );
    }
    return c.json({ error: `could not build payment transaction: ${msg}` }, 502);
  }

  const { error } = await db.from('orders').insert({
    id,
    service_id: s.id,
    input: body.input,
    reference: reference.toString(),
    currency: 'SOL',
    amount_lamports: s.price_lamports,
    quote_expires_at: quoteExpiresAt.toISOString(),
    access_token: accessToken,
    status: 'pending',
  });
  if (error) return c.json({ error: error.message }, 500);

  return c.json({
    orderId: id,
    reference: reference.toString(),
    amountLamports: s.price_lamports,
    amountSol: s.price_lamports / LAMPORTS_PER_SOL,
    quoteExpiresAt: quoteExpiresAt.toISOString(),
    estMinutes: s.est_minutes,
    accessToken,
    transaction: tx.transaction,
    payUrl: tx.payUrl,
  });
});

/**
 * PUBLIC. The delivered report, in full.
 *
 * The same text is already published on-chain across the memo transactions in
 * `chunkUrls`, so this endpoint is a convenience, not a disclosure — it serves
 * what anyone can already reassemble from Solana. `input` is included because
 * it appears inside the report body itself; gating a field that is printed in
 * the thing next to it would be theatre.
 *
 * `payerWallet` is not in this payload, but do NOT read that as protection.
 * The join is fully open by another route:
 *
 *     orderId -> input        (here, public)
 *     orderId -> paymentSig   (/api/queue, public) -> Solscan -> payer wallet
 *
 * So "this wallet looked up this address" is reconstructible by anyone in two
 * clicks. Omitting the field only means this endpoint does not do the work for
 * them; it does not make the link unavailable. Publishing reports is a
 * deliberate transparency decision, and this is a consequence of it, not a
 * gap in it — recorded here so nobody later mistakes the omission for a
 * guarantee and builds on that assumption.
 *
 * If the join is ever meant to be closed, removing paymentSig/paymentUrl from
 * the public queue is the change that would actually do it.
 */
app.get('/api/reports/:id', async (c) => {
  const { data } = await db
    .from('orders')
    .select(
      'id,service_id,input,status,report_hash,report_chunk_sigs,receipt_sig,delivered_at,paid_at',
    )
    .eq('id', c.req.param('id'))
    .single();

  if (!data) return c.json({ error: 'not found' }, 404);
  if (data.status !== 'delivered') {
    return c.json(
      { error: `order ${data.id} is ${data.status} — no report was delivered`, status: data.status },
      404,
    );
  }

  const { data: report } = await db
    .from('reports')
    .select('body')
    .eq('order_id', data.id)
    .maybeSingle();

  const chunkSigs: string[] = data.report_chunk_sigs ?? [];

  return c.json({
    orderId: data.id,
    serviceId: data.service_id,
    input: data.input,
    paidAt: data.paid_at,
    deliveredAt: data.delivered_at,
    report: report?.body ?? null,
    reportHash: data.report_hash,
    receiptSig: data.receipt_sig,
    receiptUrl: explorerTxOrNull(data.receipt_sig),
    /** The report as published on Solana, in order. Concatenate each memo
     *  after its `chp:1:rpt:<id>:<i>/<n>:` prefix to rebuild the body. */
    chunkSigs,
    /** Solana Explorer — renders the memo text. Solscan does not decode it. */
    chunkUrls: chunkSigs.map((s) => explorerTx(s)),
    chunkUrlsSolscan: chunkSigs.map((s) => solscanTx(s)),
    verify:
      'sha256 the report body and take the first 16 hex characters; it must ' +
      'equal reportHash, which is also in the receipt memo on-chain.',
  });
});

/** Full detail including payerWallet — access token required. */
app.get('/api/orders/:id', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'access token required' }, 401);

  const { data } = await db.from('orders').select('*').eq('id', c.req.param('id')).single();
  const order = data as Order | null;
  if (!order) return c.json({ error: 'not found' }, 404);

  // Constant-ish comparison; tokens are 32 chars of base64url from a CSPRNG.
  if (order.access_token !== token) return c.json({ error: 'not found' }, 404);

  const { data: report } = await db
    .from('reports')
    .select('body')
    .eq('order_id', order.id)
    .maybeSingle();

  return c.json({
    id: order.id,
    serviceId: order.service_id,
    input: order.input,
    payerWallet: order.payer_wallet,
    status: order.status,
    ...lifecycle(order.status),
    currency: order.currency,
    amountSol: order.amount_lamports / LAMPORTS_PER_SOL,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    etaDeadline: order.eta_deadline,
    deliveredAt: order.delivered_at,
    paymentSig: order.payment_sig,
    receiptSig: order.receipt_sig,
    paymentUrl: explorerTxOrNull(order.payment_sig),
    receiptUrl: explorerTxOrNull(order.receipt_sig),
    refundUrl: explorerTxOrNull(order.refund_sig),
    reportChunkSigs: order.report_chunk_sigs ?? null,
    reportChunkUrls: (order.report_chunk_sigs ?? []).map((s: string) => explorerTx(s)),
    reportHash: order.report_hash,
    refundSig: order.refund_sig,
    failureReason: order.failure_reason,
    report: report?.body ?? null,
  });
});

/* ------------------------------------------------------------------ helpers */

/**
 * The $CHIPS mint, from the database rather than config, so launching the
 * token is a single UPDATE and takes effect on the next request.
 *
 * Cached briefly: this is read on every order attempt, and a launch-day value
 * being up to five seconds stale is fine while a database round trip per
 * order is not.
 */
let chipsCache: { at: number; mint: string | null } = { at: 0, mint: null };

async function chipsMintSetting(): Promise<string | null> {
  if (Date.now() - chipsCache.at < 5_000) return chipsCache.mint;
  const { data } = await db.from('agent_state').select('chips_mint').eq('id', 1).single();
  chipsCache = { at: Date.now(), mint: (data?.chips_mint || null) as string | null };
  return chipsCache.mint;
}

async function serviceMap(): Promise<Map<string, Service>> {
  const { data } = await db.from('services').select('*');
  return new Map(((data ?? []) as Service[]).map((s) => [s.id, s]));
}

async function nextOrderId(): Promise<string> {
  const { data } = await db.rpc('next_order_id');
  return String(data);
}

let solPriceCache: { at: number; usd: number | null } = { at: 0, usd: null };

async function solPriceUsd(): Promise<number | null> {
  if (Date.now() - solPriceCache.at < 30_000) return solPriceCache.usd;
  try {
    const res = await fetch(
      'https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112',
      { signal: AbortSignal.timeout(6000) },
    );
    const json = (await res.json()) as Record<string, { usdPrice?: number }>;
    const usd = json['So11111111111111111111111111111111111111112']?.usdPrice ?? null;
    solPriceCache = { at: Date.now(), usd };
    return usd;
  } catch {
    return solPriceCache.usd;
  }
}

/**
 * Observed spend per DAY. Null until the ledger holds enough observations,
 * spanning enough time, to be a rate rather than an extrapolation from a
 * handful of seconds. Null makes the caller fall back to declared and say so.
 */
async function measuredDailyCostUsd(): Promise<number | null> {
  const { data, error } = await db.rpc('measured_daily_cost_usd', { window_days: 7 });
  if (error || data === null || data === undefined) return null;
  const n = Number(data);
  return Number.isFinite(n) ? n : null;
}

/**
 * The raw partial figure — always available, explicitly not a daily rate.
 *
 * IMPORTANT: this covers only the cost kinds actually written to the ledger,
 * which today is inference alone. RPC and network fees are real costs and are
 * NOT tracked yet, so this is a LOWER BOUND on what the agent spends, never
 * the total.
 */
async function observedSpend(): Promise<{
  totalUsd: number;
  sampleCount: number;
  hoursObserved: number;
  coversKinds: string[];
  isLowerBound: boolean;
}> {
  const { data } = await db.rpc('observed_spend', { window_days: 7 });
  const row = (Array.isArray(data) ? data[0] : data) as
    | { total_usd: number; sample_count: number; hours_observed: number }
    | undefined;

  return {
    totalUsd: Number(row?.total_usd ?? 0),
    sampleCount: Number(row?.sample_count ?? 0),
    hoursObserved: Number(row?.hours_observed ?? 0),
    coversKinds: ['inference'],
    isLowerBound: true,
  };
}

/** Measured from two on-chain timestamps, not estimated. */
async function medianTurnaroundMinutes(): Promise<number | null> {
  const { data } = await db
    .from('orders')
    .select('paid_at,delivered_at')
    .eq('status', 'delivered')
    .not('paid_at', 'is', null)
    .not('delivered_at', 'is', null)
    .order('delivered_at', { ascending: false })
    .limit(50);

  const mins = (data ?? [])
    .map((o) => (Date.parse(o.delivered_at!) - Date.parse(o.paid_at!)) / 60_000)
    .filter((m) => Number.isFinite(m) && m >= 0)
    .sort((a, b) => a - b);

  if (!mins.length) return null;
  return mins[Math.floor(mins.length / 2)]!;
}
