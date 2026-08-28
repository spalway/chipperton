/**
 * Wallet discovery and signing, on the Wallet Standard directly.
 *
 * No wallet-adapter and no @solana/web3.js. The server hands us a fully built,
 * unsigned wire transaction and the wallet's own `solana:signAndSendTransaction`
 * takes raw bytes — so there is nothing here to deserialise, no blockhash to
 * manage, and no RPC client to point at a cluster. Every wallet that matters
 * (Phantom, Solflare, Backpack, Coinbase) registers itself through the standard.
 */

import { getWallets } from '@wallet-standard/app'
import type { Wallet, WalletAccount } from '@wallet-standard/base'
import {
  SolanaSignAndSendTransaction,
  type SolanaSignAndSendTransactionFeature,
} from '@solana/wallet-standard-features'
import {
  SOLANA_DEVNET_CHAIN,
  SOLANA_MAINNET_CHAIN,
  SOLANA_TESTNET_CHAIN,
} from '@solana/wallet-standard-chains'
import bs58 from 'bs58'

/**
 * Map the server's cluster name onto a Wallet Standard chain id.
 *
 * These two vocabularies do not match and the mismatch is silent: Solana calls
 * it `mainnet-beta`, the Wallet Standard calls it `solana:mainnet`. Passing the
 * cluster through unchanged yields `solana:mainnet-beta`, which no wallet
 * advertises — so the flip to mainnet would break signing with no error until a
 * real buyer tried to pay.
 *
 * An unrecognised cluster returns null rather than guessing. Defaulting to
 * devnet here would mean signing against the wrong chain quietly, which is worse
 * than refusing: the user would see a success screen for a payment that never
 * reached the vault.
 */
export function chainFor(payCluster: string | null | undefined): string | null {
  switch (payCluster) {
    case 'mainnet-beta':
    case 'mainnet':
      return SOLANA_MAINNET_CHAIN
    case 'devnet':
      return SOLANA_DEVNET_CHAIN
    case 'testnet':
      return SOLANA_TESTNET_CHAIN
    default:
      return null
  }
}

/** Human label for the cluster, used wherever we tell someone what they're paying on. */
export const clusterLabel = (payCluster: string | null | undefined) =>
  payCluster === 'mainnet-beta' || payCluster === 'mainnet' ? 'mainnet' : (payCluster ?? 'unknown')

export const canSignAndSend = (w: Wallet): boolean => SolanaSignAndSendTransaction in w.features

/** Does this wallet advertise the chain we intend to settle on? */
export const supportsChain = (w: Wallet, chain: string | null): boolean =>
  chain != null && w.chains.includes(chain as `${string}:${string}`)

// ── registry ──────────────────────────────────────────────────────────────
// useSyncExternalStore requires a referentially stable snapshot. `wallets.get()`
// is not guaranteed to return the same array twice, so we cache it and only
// swap the reference when a register/unregister event actually fires.

const listeners = new Set<() => void>()
let snapshot: readonly Wallet[] = []
let started = false

const emit = () => listeners.forEach((l) => l())

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  const api = getWallets()
  snapshot = api.get()
  const refresh = () => {
    snapshot = api.get()
    emit()
  }
  api.on('register', refresh)
  api.on('unregister', refresh)
}

export function subscribeWallets(cb: () => void): () => void {
  start()
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function walletsSnapshot(): readonly Wallet[] {
  start()
  return snapshot
}

/** Server-rendered snapshot: no wallets, never a loading state. */
export const walletsServerSnapshot = (): readonly Wallet[] => []

// ── connect / sign ────────────────────────────────────────────────────────

type ConnectFeature = {
  'standard:connect': { connect: () => Promise<{ accounts: readonly WalletAccount[] }> }
}
type DisconnectFeature = { 'standard:disconnect': { disconnect: () => Promise<void> } }
type EventsFeature = {
  'standard:events': { on: (e: 'change', cb: (p: { accounts?: readonly WalletAccount[] }) => void) => () => void }
}

export async function connectWallet(w: Wallet): Promise<WalletAccount> {
  const f = w.features as Partial<ConnectFeature>
  const connect = f['standard:connect']
  if (!connect) throw new Error(`${w.name} does not support connecting`)
  const { accounts } = await connect.connect()
  const account = accounts[0]
  if (!account) throw new Error(`${w.name} returned no accounts`)
  return account
}

export async function disconnectWallet(w: Wallet): Promise<void> {
  const f = w.features as Partial<DisconnectFeature>
  // not every wallet implements disconnect; dropping our own reference is
  // the part that matters, so a missing feature is not an error
  await f['standard:disconnect']?.disconnect().catch(() => {})
}

export function onAccountChange(w: Wallet, cb: (a: WalletAccount | null) => void): () => void {
  const f = w.features as Partial<EventsFeature>
  const events = f['standard:events']
  if (!events) return () => {}
  return events.on('change', ({ accounts }) => {
    if (accounts) cb(accounts[0] ?? null)
  })
}

/**
 * Sign and submit the server-built transaction, returning the base58 signature.
 *
 * `chain` is passed explicitly and comes from the server's `payCluster`. A
 * wallet sitting on a different network than the one the order was priced on
 * will reject this rather than settle on the wrong chain.
 */
export async function signAndSend(
  w: Wallet,
  account: WalletAccount,
  transactionBase64: string,
  chain: string,
): Promise<string> {
  const feature = (w.features as Partial<SolanaSignAndSendTransactionFeature>)[
    SolanaSignAndSendTransaction
  ]
  if (!feature) throw new Error(`${w.name} cannot send transactions`)

  const [out] = await feature.signAndSendTransaction({
    account,
    chain: chain as `${string}:${string}`,
    transaction: base64ToBytes(transactionBase64),
  })
  if (!out) throw new Error('wallet returned no signature')
  // the standard returns raw signature bytes; every explorer speaks base58
  return bs58.encode(out.signature)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** `Abcd…wxyz` — addresses and signatures are too long to show in full. */
export const short = (s: string, lead = 4, tail = 4) =>
  s.length <= lead + tail + 1 ? s : `${s.slice(0, lead)}…${s.slice(-tail)}`

/**
 * Is this a real Solana address?
 *
 * The server rejects a bad `input` with a 400, but a round trip to learn you
 * typed 43 characters instead of 44 is a poor way to find out. Same check the
 * server runs: base58, decoding to exactly 32 bytes.
 */
export function isSolanaAddress(s: string): boolean {
  const t = s.trim()
  if (t.length < 32 || t.length > 44) return false
  try {
    return bs58.decode(t).length === 32
  } catch {
    return false
  }
}

/** Transaction signatures are 64 bytes, not 32 — a different check entirely. */
export function isSignature(s: string): boolean {
  const t = s.trim()
  try {
    return bs58.decode(t).length === 64
  } catch {
    return false
  }
}
