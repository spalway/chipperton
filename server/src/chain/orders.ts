import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
} from '@solana/kit';
import { createTransfer, encodeURL } from '@solana/pay';
import { rpcPay, vaultAddress } from './clients.ts';

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Memo carried by the buyer's payment. Mirrored by the agent's receipt. */
export function paymentMemo(orderId: string): string {
  return `chp:1:${orderId}`;
}

/**
 * A fresh single-use reference key. This is what lets us find the payment later
 * without the buyer telling us anything.
 *
 * NOTE: a reference proves only that *a* transaction mentioned it. Anyone can
 * insert it into any transaction. `settleOrder` must still validate the transfer.
 */
export async function newReference(): Promise<Address> {
  return (await generateKeyPairSigner()).address;
}

export interface BuiltOrderTx {
  /** Base64 wire transaction, unsigned, for a browser wallet to sign. */
  transaction: string;
  /** Solana Pay URL for the mobile / QR path. */
  payUrl: string;
  blockhash: string;
  lastValidBlockHeight: string;
}

/**
 * Build the unsigned payment transaction for an order.
 *
 * The buyer is a noop signer here: we compose the message and hand back wire
 * bytes for their wallet to sign. The server never touches the buyer's key.
 */
export async function buildOrderTransaction(opts: {
  orderId: string;
  payer: string;
  amountLamports: number;
  reference: Address;
  splToken?: Address;
}): Promise<BuiltOrderTx> {
  const payer = createNoopSigner(address(opts.payer));
  const memo = paymentMemo(opts.orderId);

  // @solana/pay takes `amount` in whole token units, not base units.
  const amount = opts.amountLamports / LAMPORTS_PER_SOL;

  const instructions = await createTransfer(rpcPay, payer, {
    recipient: vaultAddress,
    amount,
    reference: opts.reference,
    memo,
    ...(opts.splToken ? { splToken: opts.splToken } : {}),
  });

  const { value: blockhash } = await rpcPay.getLatestBlockhash().send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(payer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  );

  const url = encodeURL({
    recipient: vaultAddress,
    amount,
    reference: opts.reference,
    memo,
    label: 'chipperton',
    message: `job ${opts.orderId}`,
    ...(opts.splToken ? { splToken: opts.splToken } : {}),
  });

  return {
    transaction: getBase64EncodedWireTransaction(compileTransaction(message)),
    payUrl: url.toString(),
    blockhash: blockhash.blockhash,
    lastValidBlockHeight: blockhash.lastValidBlockHeight.toString(),
  };
}
