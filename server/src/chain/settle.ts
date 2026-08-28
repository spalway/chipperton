import { type Signature } from '@solana/kit';
import {
  FindReferenceError,
  ValidateTransferError,
  findReference,
  validateTransfer,
} from '@solana/pay';
import { type Address } from '@solana/kit';
import { rpcPay, vaultAddress } from './clients.ts';
import { LAMPORTS_PER_SOL, paymentMemo } from './orders.ts';

export type SettleResult =
  | { kind: 'not-found' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'settled'; signature: string; paidAt: Date; payerWallet: string };

/**
 * Determine whether an order has actually been paid.
 *
 * The two steps are NOT interchangeable and both are required:
 *
 *  1. `findReference` locates a transaction mentioning our reference key. This
 *     proves nothing on its own — reference keys are trivially spoofable, and
 *     anyone can insert ours into a transaction that pays us nothing.
 *
 *  2. `validateTransfer` is the actual security boundary. It requires the
 *     transfer to be the last instruction, and checks the amount from pre/post
 *     balance metadata (post - pre >= expected) rather than trusting decoded
 *     instruction data. It also verifies the memo.
 *
 * Skipping step 2 is how you accept a payment of zero.
 */
export async function settleOrder(opts: {
  orderId: string;
  reference: string;
  amountLamports: number;
  splToken?: string;
}): Promise<SettleResult> {
  let signature: Signature;

  try {
    const found = await findReference(rpcPay, opts.reference as Address, {
      commitment: 'confirmed',
    });
    signature = found.signature;
  } catch (err) {
    if (err instanceof FindReferenceError) return { kind: 'not-found' };
    throw err;
  }

  let blockTime: bigint | null = null;
  try {
    const tx = await validateTransfer(
      rpcPay,
      signature,
      {
        recipient: vaultAddress,
        amount: opts.amountLamports / LAMPORTS_PER_SOL,
        reference: opts.reference as Address,
        memo: paymentMemo(opts.orderId),
        ...(opts.splToken ? { splToken: opts.splToken as Address } : {}),
      },
      { commitment: 'confirmed' },
    );
    blockTime = tx.blockTime === null ? null : BigInt(tx.blockTime);
  } catch (err) {
    if (err instanceof ValidateTransferError) {
      return { kind: 'invalid', reason: err.message };
    }
    throw err;
  }

  const payerWallet = await feePayerOf(signature);
  if (!payerWallet) return { kind: 'invalid', reason: 'could not resolve fee payer' };

  return {
    kind: 'settled',
    signature,
    // blockTime is the cluster-agreed wall clock. This is what makes turnaround
    // a measured fact rather than something we assert — see PLAN.md.
    paidAt: blockTime === null ? new Date() : new Date(Number(blockTime) * 1000),
    payerWallet,
  };
}

/** The fee payer is the first account key, and is who we refund. */
async function feePayerOf(signature: Signature): Promise<string | null> {
  const tx = await rpcPay
    .getTransaction(signature, {
      encoding: 'jsonParsed',
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    .send();

  const keys = tx?.transaction?.message?.accountKeys;
  if (!keys || keys.length === 0) return null;
  return keys[0]!.pubkey.toString();
}
