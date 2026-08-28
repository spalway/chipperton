import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  sendAndConfirmTransactionFactory,
} from '@solana/kit';
import { config } from '../config.ts';

/**
 * Payments cluster (devnet in v1). Everything involving money goes here.
 */
export const rpcPay = createSolanaRpc(config.rpcPay);
export const rpcPaySubscriptions = createSolanaRpcSubscriptions(config.rpcPaySubscriptions);

/**
 * Data cluster — ALWAYS mainnet, regardless of where payments settle.
 * Read-only: no signer is ever attached to this client.
 */
export const rpcData = createSolanaRpc(config.rpcData);

export const sendAndConfirm = sendAndConfirmTransactionFactory({
  rpc: rpcPay,
  rpcSubscriptions: rpcPaySubscriptions,
});

/** Where payments land. */
export const vaultAddress = address(config.vaultAddress);

/**
 * The agent's hot signer. Signs receipts and refunds; never holds the treasury.
 * Accepts either a JSON byte array (solana-keygen output) or a base64 blob.
 */
async function loadAgentSigner() {
  const raw = config.agentHotSecret.trim();
  let bytes: Uint8Array;

  if (raw.startsWith('[')) {
    bytes = Uint8Array.from(JSON.parse(raw) as number[]);
  } else {
    bytes = Uint8Array.from(Buffer.from(raw, 'base64'));
  }

  if (bytes.length !== 64) {
    throw new Error(
      `AGENT_HOT_SECRET must decode to 64 bytes, got ${bytes.length}. ` +
        'Use the JSON array from `solana-keygen new -o agent-hot.json`.',
    );
  }
  return createKeyPairSignerFromBytes(bytes);
}

export const agentSigner = await loadAgentSigner();

export function explorerTx(signature: string): string {
  const q = config.payCluster === 'mainnet-beta' ? '' : `?cluster=${config.payCluster}`;
  return `https://solscan.io/tx/${signature}${q}`;
}
