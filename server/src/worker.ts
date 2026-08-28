import { REFUND_FEE_BUFFER, config } from './config.ts';
import { db, type Order } from './db.ts';
import { agentSigner, rpcPay } from './chain/clients.ts';
import { publishReport, sendRefund, writeReceipt } from './chain/receipt.ts';
import { settleOrder } from './chain/settle.ts';
import { runJob } from './services/index.ts';

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

/**
 * One pass of the agent's loop. Order matters: settle money first so a job that
 * was paid seconds ago is eligible this tick rather than next.
 */
export async function tick(): Promise<void> {
  await db.from('agent_state').update({ last_tick_at: new Date().toISOString() }).eq('id', 1);

  await settlePending();
  await expireStale();
  await refundOverdue();
  await workOne();
}

/** Look for payments that have landed against pending orders. */
async function settlePending(): Promise<void> {
  const { data } = await db
    .from('orders')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(25);

  for (const order of (data ?? []) as Order[]) {
    let result;
    try {
      result = await settleOrder({
        orderId: order.id,
        reference: order.reference,
        amountLamports: order.amount_lamports,
      });
    } catch (err) {
      log('settle error', order.id, err);
      continue;
    }

    if (result.kind === 'not-found') continue;

    if (result.kind === 'invalid') {
      // A transaction carried our reference but was not a valid payment.
      // Expected: reference keys are spoofable. Leave the order pending.
      log('settle rejected', order.id, result.reason);
      continue;
    }

    const service = await getService(order.service_id);
    const deadline = new Date(
      result.paidAt.getTime() + (service?.est_minutes ?? 30) * 60_000,
    );

    // Guarded on status so a concurrent tick cannot credit the same order twice.
    // payment_sig is UNIQUE, so the same transaction cannot settle two orders.
    const { data: updated } = await db
      .from('orders')
      .update({
        status: 'paid',
        payment_sig: result.signature,
        paid_at: result.paidAt.toISOString(),
        payer_wallet: result.payerWallet,
        eta_deadline: deadline.toISOString(),
      })
      .eq('id', order.id)
      .eq('status', 'pending')
      .select('id');

    if (updated?.length) log('settled', order.id, result.signature);
  }
}

/** Unpaid orders past their quote window are dead — the price has moved. */
async function expireStale(): Promise<void> {
  await db
    .from('orders')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('quote_expires_at', new Date().toISOString());
}

/**
 * The refund the site promises. Owed against eta_deadline, which was committed
 * at settle time and never moves — not against a rolling average.
 */
async function refundOverdue(): Promise<void> {
  const { data } = await db
    .from('orders')
    .select('*')
    .in('status', ['paid', 'running'])
    .lt('eta_deadline', new Date().toISOString())
    .limit(10);

  for (const order of (data ?? []) as Order[]) {
    if (!order.payer_wallet) continue;
    try {
      const sig = await sendRefund({
        orderId: order.id,
        to: order.payer_wallet,
        lamports: order.amount_lamports,
        reason: 'overdue',
      });
      await db
        .from('orders')
        .update({ status: 'refunded', refund_sig: sig, failure_reason: 'missed committed ETA' })
        .eq('id', order.id)
        .in('status', ['paid', 'running']);
      log('refunded (overdue)', order.id, sig);
    } catch (err) {
      log('refund failed', order.id, err);
    }
  }
}

/**
 * Refund liability the hot wallet must be able to cover right now.
 *
 * Payments land in the vault but refunds are paid from the hot wallet, so the
 * hot wallet drains as the vault fills. Left alone it eventually cannot refund
 * — and it would discover that only at the moment it owed someone money.
 * An agent that cannot refund must not accept new work.
 */
async function canCoverRefunds(): Promise<boolean> {
  const { data } = await db
    .from('orders')
    .select('amount_lamports')
    .in('status', ['paid', 'running']);

  const owed = (data ?? []).reduce((sum, o) => sum + Number(o.amount_lamports), 0);
  const feeBuffer = REFUND_FEE_BUFFER;
  const { value: balance } = await rpcPay.getBalance(agentSigner.address).send();

  if (Number(balance) >= owed + feeBuffer) return true;

  log(
    `HOT WALLET LOW — balance ${Number(balance) / 1e9} SOL cannot cover ` +
      `${owed / 1e9} SOL of outstanding refunds. Refusing new work. ` +
      `Top up ${agentSigner.address} from the vault.`,
  );
  return false;
}

/** Claim and run the oldest paid job. Queue order, not who paid most. */
async function workOne(): Promise<void> {
  // Checked before claiming, not after failing.
  if (!(await canCoverRefunds())) return;

  const { data } = await db
    .from('orders')
    .select('*')
    .eq('status', 'paid')
    .order('paid_at', { ascending: true })
    .limit(1);

  const order = (data ?? [])[0] as Order | undefined;
  if (!order) return;

  // Atomic claim: if another tick took it, this updates zero rows.
  const { data: claimed } = await db
    .from('orders')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('status', 'paid')
    .select('id');

  if (!claimed?.length) return;

  log('running', order.id, order.service_id);

  try {
    const body = await runJob(order.service_id, order.input, order.id);

    // Publish the report body BEFORE the receipt, so a receipt only ever
    // exists for a report that fully landed. If a chunk fails partway, this
    // throws and the job is refunded rather than being marked delivered with
    // half a report on chain.
    const published = await publishReport(order.id, body);
    log(`published ${order.id} — ${published.bytes} bytes in ${published.chunks} txs`);

    // Network fees are a real cost the agent pays. Recording them here is what
    // makes the cost ledger cover more than inference.
    await db.from('costs').insert({
      order_id: order.id,
      kind: 'fee',
      usd: (published.chunks + 1) * 5000 * 1e-9 * (await solUsdForCosts()),
      detail: { chunks: published.chunks, bytes: published.bytes, includesReceipt: true },
    });

    const { signature, hash } = await writeReceipt(order.id, body);

    await db.from('reports').upsert({ order_id: order.id, body });
    await db
      .from('orders')
      .update({
        status: 'delivered',
        receipt_sig: signature,
        report_hash: hash,
        report_chunk_sigs: published.signatures,
        delivered_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    log('delivered', order.id, signature);
  } catch (err) {
    log('job failed', order.id, err);
    // A failed job is a refund — the site says so, so the code has to mean it.
    if (order.payer_wallet) {
      try {
        const sig = await sendRefund({
          orderId: order.id,
          to: order.payer_wallet,
          lamports: order.amount_lamports,
          reason: 'failed',
        });
        await db
          .from('orders')
          .update({
            status: 'refunded',
            refund_sig: sig,
            failure_reason: String(err instanceof Error ? err.message : err).slice(0, 500),
          })
          .eq('id', order.id);
      } catch (refundErr) {
        log('refund after failure ALSO failed', order.id, refundErr);
        await db.from('orders').update({ status: 'failed' }).eq('id', order.id);
      }
    }
  }
}

async function getService(id: string) {
  const { data } = await db.from('services').select('*').eq('id', id).single();
  return data as { est_minutes: number } | null;
}

/** Standalone worker entrypoint (`npm run worker`). */
if (process.argv[1]?.endsWith('worker.ts')) {
  log(`worker up — tick every ${config.tickIntervalSeconds}s`);
  await tick();
  setInterval(() => {
    tick().catch((e) => log('tick error', e));
  }, config.tickIntervalSeconds * 1000);
}

/** SOL price for costing network fees. Falls back to 0 rather than guessing —
 *  a fabricated price in the cost ledger is worse than a missing one. */
async function solUsdForCosts(): Promise<number> {
  try {
    const res = await fetch(
      'https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112',
      { signal: AbortSignal.timeout(5000) },
    );
    const j = (await res.json()) as Record<string, { usdPrice?: number }>;
    return j['So11111111111111111111111111111111111111112']?.usdPrice ?? 0;
  } catch {
    return 0;
  }
}
