import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { address } from '@solana/kit';
import { REFUND_FEE_BUFFER, chipsEnabled, config } from './config.ts';
import { db, type Order, type Service } from './db.ts';
import { agentSigner, rpcPay, vaultAddress } from './chain/clients.ts';
import { LAMPORTS_PER_SOL, buildOrderTransaction, newReference } from './chain/orders.ts';

export const app = new Hono();
app.use('/*', cors({ origin: config.corsOrigin }));

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
    db.from('orders').select('amount_lamports').in('status', ['paid', 'running']),
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'delivered')
      .gte('delivered_at', startOfDay.toISOString()),
  ]);

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
    vaultLamports,
    vaultUsd,

    /** Config constant. An assumption, not an observation. */
    dailyCostUsd: declaredCostUsd,
    /** Observed from the costs ledger over a trailing window. Null until there
     *  is spend to measure. */
    measuredDailyCostUsd: measuredCost,
    /** 'measured' | 'declared' — which figure runwayDays actually used.
     *  The UI must not call runway "measured" unless this says so. */
    dailyCostBasis: basis,

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
    chipsEnabled,
  });
});

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
app.get('/api/queue', async (c) => {
  const { data, error } = await db
    .from('orders')
    .select('id,service_id,status,currency,amount_lamports,created_at,paid_at,delivered_at,payment_sig,receipt_sig,eta_deadline,report_hash')
    .in('status', ['paid', 'running', 'delivered', 'refunded'])
    .order('created_at', { ascending: false })
    .limit(25);

  // An empty queue and an unreachable database look identical to the frontend
  // unless we distinguish them here.
  if (error) return c.json({ error: `queue unavailable: ${error.message}` }, 503);

  const [services, solUsd, measured] = await Promise.all([
    serviceMap(),
    solPriceUsd(),
    medianTurnaroundMinutes(),
  ]);

  // Live queue estimate: position in the open queue x how long a job actually
  // takes. Distinct from etaDeadline, which was committed at settle and never
  // moves — the refund is owed against THAT, not against this.
  const open = (data ?? [])
    .filter((o) => o.status === 'paid' || o.status === 'running')
    .sort((a, b) => Date.parse(a.paid_at ?? '') - Date.parse(b.paid_at ?? ''))
    .map((o) => o.id);

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

        paymentSig: o.payment_sig,
        receiptSig: o.receipt_sig,

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
  if (currency === 'CHIPS' && !chipsEnabled) {
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

/** PRIVATE. Full detail, including input/payer/report — access token required. */
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
    currency: order.currency,
    amountSol: order.amount_lamports / LAMPORTS_PER_SOL,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    etaDeadline: order.eta_deadline,
    deliveredAt: order.delivered_at,
    paymentSig: order.payment_sig,
    receiptSig: order.receipt_sig,
    reportHash: order.report_hash,
    refundSig: order.refund_sig,
    failureReason: order.failure_reason,
    report: report?.body ?? null,
  });
});

/* ------------------------------------------------------------------ helpers */

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

/** Observed spend per day from the costs ledger. Null when nothing is recorded. */
async function measuredDailyCostUsd(): Promise<number | null> {
  const { data, error } = await db.rpc('measured_daily_cost_usd', { window_days: 7 });
  if (error || data === null || data === undefined) return null;
  const n = Number(data);
  return Number.isFinite(n) ? n : null;
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
