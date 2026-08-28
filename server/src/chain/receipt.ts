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
import { getTransferSolInstruction } from '@solana-program/system';
import { agentSigner, rpcPay, sendAndConfirm } from './clients.ts';

/**
 * The report hash committed on-chain. Short enough to fit a memo comfortably,
 * long enough that finding a collision isn't worth anyone's afternoon.
 */
export function reportHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 16);
}

/** Send a transaction signed by the agent, and return its signature. */
async function sendAsAgent(instructions: Instruction[]): Promise<string> {
  const { value: blockhash } = await rpcPay.getLatestBlockhash().send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(agentSigner, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  );

  const signed = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(signed);
  await sendAndConfirm(signed, { commitment: 'confirmed' });
  return getSignatureFromTransaction(signed);
}

/**
 * The receipt. Signed by the agent, so it is attributable to the agent, and it
 * commits to the delivered report's hash — anyone holding the report can hash
 * it and check the chain. Only the hash goes on-chain, never the report body or
 * the address the buyer asked about.
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
