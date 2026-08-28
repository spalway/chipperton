/**
 * Full end-to-end proof: order -> real devnet payment -> settle -> job -> receipt.
 *
 * Acts as a real buyer: takes the unsigned transaction the API hands out,
 * signs it with a funded devnet keypair, and sends it. Nothing is simulated.
 *
 *   node --env-file=.env scripts/try-loop.ts [serviceId] [input]
 */
import { readFileSync } from 'node:fs';
import {
  createKeyPairFromBytes,
  getBase64Encoder,
  getSignatureFromTransaction,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  signTransaction,
} from '@solana/kit';
import { rpcPay, explorerTx } from '../src/chain/clients.ts';
import { db } from '../src/db.ts';
import { tick } from '../src/worker.ts';

const API = process.env.API ?? 'http://localhost:8787';
const serviceId = process.argv[2] ?? 'safety';
const input = process.argv[3] ?? 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

const buyerBytes = Uint8Array.from(
  JSON.parse(readFileSync('.keys/test-buyer.json', 'utf8')) as number[],
);
const buyer = await createKeyPairFromBytes(buyerBytes);
const buyerAddress = process.argv[4] ?? (await addressOf(buyerBytes));

const step = (n: number, s: string) => console.log(`\n[${n}] ${s}`);

/* 1 ── order ------------------------------------------------------------- */
step(1, 'Creating order');
const res = await fetch(`${API}/api/orders`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ serviceId, input, payer: buyerAddress }),
});
if (!res.ok) throw new Error(`order failed ${res.status}: ${await res.text()}`);
const order = (await res.json()) as {
  orderId: string;
  reference: string;
  amountSol: number;
  accessToken: string;
  transaction: string;
};
console.log(`    order ${order.orderId} · ${order.amountSol} SOL · ref ${order.reference}`);

/* 2 ── pay (as a real buyer) --------------------------------------------- */
step(2, 'Signing the returned transaction as the buyer and sending it');
const wire = getBase64Encoder().encode(order.transaction);
const decoded = getTransactionDecoder().decode(wire);
const signed = await signTransaction([buyer], decoded);
const paySig = getSignatureFromTransaction(signed);

// Decoding wire bytes drops the blockhash-lifetime metadata that kit's
// sendAndConfirm helper needs, so send raw and poll — which is what a wallet
// receiving this transaction would do anyway.
await rpcPay
  .sendTransaction(getBase64EncodedWireTransaction(signed), {
    encoding: 'base64',
    preflightCommitment: 'confirmed',
  })
  .send();

process.stdout.write('    confirming');
for (let i = 0; i < 40; i++) {
  const { value } = await rpcPay.getSignatureStatuses([paySig]).send();
  const st = value[0];
  if (st?.err) throw new Error(`payment failed on chain: ${JSON.stringify(st.err)}`);
  if (st?.confirmationStatus === 'confirmed' || st?.confirmationStatus === 'finalized') break;
  process.stdout.write('.');
  await new Promise((r) => setTimeout(r, 1000));
}
console.log(`\n    paid: ${paySig}`);
console.log(`    ${explorerTx(paySig)}`);

/* 3 ── settle ------------------------------------------------------------ */
step(3, 'Running agent tick — expect settle');
await tick();
await show(order.orderId);

/* 4 ── work + receipt ---------------------------------------------------- */
step(4, 'Running agent tick — expect job + receipt');
await tick();
const final = await show(order.orderId);

/* 5 ── verify the on-chain hash matches the delivered report -------------- */
if (final?.status === 'delivered') {
  const detail = await (
    await fetch(`${API}/api/orders/${order.orderId}?token=${order.accessToken}`)
  ).json() as { report: string | null; reportHash: string | null };

  const { createHash } = await import('node:crypto');
  const recomputed = createHash('sha256')
    .update(detail.report ?? '', 'utf8')
    .digest('hex')
    .slice(0, 16);

  console.log(`\n    report hash on chain : ${final.report_hash}`);
  console.log(`    recomputed from body : ${recomputed}`);
  console.log(
    recomputed === final.report_hash
      ? '    MATCH — the receipt provably commits to the delivered report.'
      : '    MISMATCH — the receipt does not match the report.',
  );
  console.log(`\n--- report ---\n${(detail.report ?? '').slice(0, 900)}`);
}

async function show(id: string) {
  const { data } = await db.from('orders').select('*').eq('id', id).single();
  const o = data as Record<string, unknown> | null;
  if (!o) return null;
  console.log(
    `    status=${o.status} paidAt=${o.paid_at ?? '-'} ` +
      `receipt=${o.receipt_sig ?? '-'} refund=${o.refund_sig ?? '-'}`,
  );
  if (o.failure_reason) console.log(`    failure: ${o.failure_reason}`);
  if (o.receipt_sig) console.log(`    ${explorerTx(String(o.receipt_sig))}`);
  return o as { status: string; report_hash: string | null };
}

async function addressOf(bytes: Uint8Array): Promise<string> {
  const { getAddressFromPublicKey } = await import('@solana/kit');
  const kp = await createKeyPairFromBytes(bytes);
  return getAddressFromPublicKey(kp.publicKey);
}

process.exit(0);
