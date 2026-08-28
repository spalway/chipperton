import { config } from './config.ts';
import { db, type Order } from './db.ts';
import { sendRefund, writeReceipt } from './chain/receipt.ts';
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

/** Claim and run the oldest paid job. Queue order, not who paid most. */
async function workOne(): Promise<void> {
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
    const { signature, hash } = await writeReceipt(order.id, body);

    await db.from('reports').upsert({ order_id: order.id, body });
    await db
      .from('orders')
      .update({
        status: 'delivered',
        receipt_sig: signature,
        report_hash: hash,
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
