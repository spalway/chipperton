import { describe, expect, it } from 'vitest'
import { chainFor, clusterLabel, isSignature, isSolanaAddress, short } from './wallet'

// A real mint (32 bytes) and a real-shaped signature (64 bytes).
const MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
const SIG =
  '5wHu1qwD4kLLq1SWnbfeJPZbLnUZKhrXhFB3XdYqrfCHHzCk9k3TWzWZZR3JGDrKZ5EMWuqUW5JYVCjLQxTQrbEB'

describe('chainFor — the cluster/chain vocabulary mismatch', () => {
  it('maps mainnet-beta to solana:mainnet', () => {
    // The trap: Solana says "mainnet-beta", the Wallet Standard says
    // "solana:mainnet". Passing the cluster through unchanged yields
    // "solana:mainnet-beta", which no wallet advertises — so signing would
    // break on the flip to mainnet, with no error until a real buyer paid.
    expect(chainFor('mainnet-beta')).toBe('solana:mainnet')
    expect(chainFor('mainnet')).toBe('solana:mainnet')
  })

  it('maps devnet and testnet', () => {
    expect(chainFor('devnet')).toBe('solana:devnet')
    expect(chainFor('testnet')).toBe('solana:testnet')
  })

  it('returns null for an unknown cluster instead of defaulting to devnet', () => {
    // Defaulting here would sign on a chain the server did not name and then
    // render a success screen for a payment that never reached the vault.
    // Refusing is the only safe answer.
    expect(chainFor('mainnet-beta-2')).toBeNull()
    expect(chainFor('localnet')).toBeNull()
    expect(chainFor('')).toBeNull()
    expect(chainFor(null)).toBeNull()
    expect(chainFor(undefined)).toBeNull()
  })

  it('never silently yields a devnet chain for a mainnet cluster', () => {
    // the specific catastrophe: real money signed onto the wrong network
    expect(chainFor('mainnet-beta')).not.toBe('solana:devnet')
  })
})

describe('clusterLabel', () => {
  it('says "mainnet", not "mainnet-beta", to a buyer', () => {
    expect(clusterLabel('mainnet-beta')).toBe('mainnet')
    expect(clusterLabel('devnet')).toBe('devnet')
  })

  it('does not invent a cluster it was not told', () => {
    expect(clusterLabel(null)).toBe('unknown')
  })
})

describe('input validation — addresses are 32 bytes, signatures are 64', () => {
  it('accepts a real mint as an address', () => {
    expect(isSolanaAddress(MINT)).toBe(true)
    expect(isSolanaAddress(` ${MINT} `)).toBe(true)
  })

  it('rejects a signature as an address', () => {
    // These are not interchangeable. One validator for both would either
    // accept 64-byte junk as an address or reject every valid signature.
    expect(isSolanaAddress(SIG)).toBe(false)
  })

  it('accepts a signature as a signature and rejects an address', () => {
    expect(isSignature(SIG)).toBe(true)
    expect(isSignature(MINT)).toBe(false)
  })

  it('rejects non-base58 and truncated input without throwing', () => {
    for (const bad of ['', 'hello world', '0OIl', MINT.slice(0, 20), `${MINT}xx`]) {
      expect(isSolanaAddress(bad)).toBe(false)
      expect(isSignature(bad)).toBe(false)
    }
  })
})

describe('short', () => {
  it('abbreviates long values and leaves short ones alone', () => {
    expect(short(MINT)).toBe('DezX…B263')
    expect(short('abc')).toBe('abc')
  })
})
