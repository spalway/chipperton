import { createHash } from 'node:crypto';
import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
} from '@solana/kit';
import { getAddMemoInstruction } from '@solana-program/memo';
import { getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import { getTransferSolInstruction } from '@solana-program/system';
import { agentSigner, rpcPay, sendAndConfirm } from './clients.ts';

/**
 * The report hash committed on-chain. Short enough to fit a memo comfortably,
 * long enough that finding a collision isn't worth anyone's afternoon.
 */
export function reportHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Send a transaction signed by the agent, and return its signature.
 *
 * `computeUnits` matters for long memos. The SPL Memo program validates UTF-8,
 * and that cost scales with length: a 560-byte memo consumes ~198k CU, which
 * is already at the 200k default. Anything larger fails with a bare
 * "Transaction simulation failed" that looks like a size problem and is not —
 * the transaction was 772 of 1232 bytes when it first failed.
 */
async function sendAsAgent(
  instructions: Instruction[],
  computeUnits?: number,
): Promise<string> {
  const { value: blockhash } = await rpcPay.getLatestBlockhash().send();

  const all = computeUnits
    ? [getSetComputeUnitLimitInstruction({ units: computeUnits }), ...instructions]
    : instructions;

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(agentSigner, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => appendTransactionMessageInstructions(all, tx),
  );

  const signed = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(signed);
  await sendAndConfirm(signed, { commitment: 'confirmed' });
  return getSignatureFromTransaction(signed);
}

/**
 * Bytes of report payload per memo transaction.
 *
 * Solana's packet limit is 1232 bytes for the whole transaction. After the
 * signature, header, two account keys, blockhash and instruction framing there
 * is roughly 1050 left; 800 leaves comfortable room for the chunk prefix and
 * any encoding surprise.
 */
const CHUNK_BYTES = 830;

/** Headroom over the ~317k a 900-byte memo actually costs to validate. */
const MEMO_COMPUTE_UNITS = 500_000;

/**
 * Split on BYTE boundaries without cutting a multi-byte character in half.
 * The reports are full of em dashes and typographic quotes, so naive
 * byte-slicing produces mojibake on chain — permanently.
 */
function chunkUtf8(text: string, maxBytes: number): string[] {
  const buf = Buffer.from(text, 'utf8');
  const out: string[] = [];
  let start = 0;

  while (start < buf.length) {
    let end = Math.min(start + maxBytes, buf.length);
    // Walk back off a continuation byte (10xxxxxx) so we never split a rune.
    while (end > start && end < buf.length && (buf[end]! & 0xc0) === 0x80) end--;
    out.push(buf.subarray(start, end).toString('utf8'));
    start = end;
  }
  return out;
}

/**
 * Publish the full report body on-chain as an ordered run of memo
 * transactions, and return their signatures.
 *
 * Format per chunk:  chp:1:rpt:<orderId>:<i>/<n>:<payload>
 *
 * PRIVACY: this makes the report — including the address the buyer asked
 * about — permanently public and joinable to the wallet that paid, via the
 * order id carried in the payment memo. That is a deliberate product decision,
 * not an oversight, and the site states it before purchase.
 */
export async function publishReport(
  orderId: string,
  body: string,
): Promise<{ signatures: string[]; chunks: number; bytes: number }> {
  const parts = chunkUtf8(body, CHUNK_BYTES);
  const signatures: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const memo = `chp:1:rpt:${orderId}:${i + 1}/${parts.length}:${parts[i]}`;
    signatures.push(await sendAsAgent([getAddMemoInstruction({ memo })], MEMO_COMPUTE_UNITS));
  }

  return {
    signatures,
    chunks: parts.length,
    bytes: Buffer.byteLength(body, 'utf8'),
  };
}

/**
 * The receipt. Signed by the agent, so it is attributable to the agent, and it
 * commits to the delivered report's hash — anyone holding the report can hash
 * it and check the chain.
 *
 * Written LAST, after every report chunk has landed, so a receipt only ever
 * exists for a report that was fully published.
 */
export async function writeReceipt(orderId: string, body: string): Promise<{
  signature: string;
  hash: string;
}> {
  const hash = reportHash(body);
  const signature = await sendAsAgent([
    getAddMemoInstruction({ memo: `chp:1:done:${orderId}:${hash}` }),
  ]);
  return { signature, hash };
}

/**
 * Refund a job the agent failed to deliver by its committed deadline.
 * The memo makes the refund as auditable as the receipt would have been.
 */
export async function sendRefund(opts: {
  orderId: string;
  to: string;
  lamports: number;
  reason: 'overdue' | 'failed';
}): Promise<string> {
  return sendAsAgent([
    getTransferSolInstruction({
      source: agentSigner,
      destination: address(opts.to),
      amount: BigInt(opts.lamports),
    }),
    getAddMemoInstruction({ memo: `chp:1:refund:${opts.orderId}:${opts.reason}` }),
  ]);
}
