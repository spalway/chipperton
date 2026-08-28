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

/**
 * Explorer links are built HERE, not in the client.
 *
 * The cluster is a server concern — payments are on devnet today and move to
 * mainnet later. A client that hardcodes `?cluster=devnet` keeps rendering
 * links that resolve, to the wrong chain, on the day we flip. Nothing would
 * error; every signature would simply not be found, or worse, collide.
 */
function clusterQuery(): string {
  return config.payCluster === 'mainnet-beta' ? '' : `?cluster=${config.payCluster}`;
}

/**
 * Primary transaction link: the OFFICIAL Solana Explorer, not Solscan.
 *
 * Solscan does not decode SPL Memo instruction data. It renders our report
 * chunks as "Memo Program V2: Unknown" and the memo text appears nowhere on
 * the page — verified against a live chunk transaction. Since the entire point
 * of publishing reports on-chain is that a stranger can read them, linking to
 * an explorer that hides the payload defeats the feature.
 *
 * explorer.solana.com renders the full memo text inline.
 */
export function explorerTx(signature: string): string {
  const q = config.payCluster === 'mainnet-beta' ? '' : `?cluster=${config.payCluster}`;
  return `https://explorer.solana.com/tx/${signature}${q}`;
}

/** Secondary link, for people who prefer Solscan's balance/token views. */
export function solscanTx(signature: string): string {
  return `https://solscan.io/tx/${signature}${clusterQuery()}`;
}

/** Accounts are fine on Solscan — balances and history render properly there. */
export function explorerAddress(addr: string): string {
  return `https://solscan.io/account/${addr}${clusterQuery()}`;
}

/** null in, null out — so a client can render the link or nothing at all. */
export function explorerTxOrNull(signature: string | null): string | null {
  return signature ? explorerTx(signature) : null;
}
