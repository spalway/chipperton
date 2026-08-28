import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The rule under test: a service card must survive `priceUsd` being null.
 *
 * The server returns null whenever the SOL price feed fails, rather than a
 * stale or invented number. If the card leads with USD, a feed outage leaves an
 * item with no price at all — and rendering the null as "$0.00" would be worse,
 * advertising paid work as free. The exact SOL figure is always present, so it
 * is the one that leads.
 */

const SERVICE = {
  id: 'safety',
  name: 'Token safety check',
  short: 'Mint & freeze authority, LP status, holder concentration',
  long: 'Mint and freeze authority, LP status and lock, holder concentration.',
  priceLamports: 50_000_000,
  priceSol: 0.05,
  priceUsd: 5.337107204740733 as number | null,
  estMinutes: 8,
  active: true,
}

const STATUS = {
  vaultAddress: 'vault',
  hotWalletAddress: 'hot',
  vaultLamports: 0,
  vaultUsd: 0,
  dailyCostUsd: 18.4,
  measuredDailyCostUsd: null,
  dailyCostBasis: 'declared' as const,
  runwayDays: 0,
  backlog: 0,
  deliveredToday: 0,
  hotWalletLamports: 0,
  refundLiabilityLamports: 0,
  canHonourRefunds: true,
  lastTickAt: null,
  tickIntervalSeconds: 900,
  nextTickAt: null,
  medianTurnaroundMinutes: null,
  payCluster: 'devnet',
  chipsEnabled: false,
  vaultUrl: null,
  hotWalletUrl: null,
}

const mount = async (priceUsd: number | null) => {
  vi.resetModules()
  vi.stubEnv('VITE_API_URL', 'https://api.example')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.includes('/api/status')
        ? STATUS
        : url.includes('/api/services')
          ? [{ ...SERVICE, priceUsd }]
          : []
      const headers = new Headers({ 'X-Queue-Total': '0', 'X-Queue-Limit': '25' })
      return { ok: true, headers, json: async () => body } as Response
    }),
  )
  const [{ default: Shop }, { default: WalletProvider }, { default: LiveDataProvider }] =
    await Promise.all([
      import('./Shop'),
      import('../WalletProvider'),
      import('../LiveDataProvider'),
    ])
  render(
    <LiveDataProvider>
      <WalletProvider>
        <Shop />
      </WalletProvider>
    </LiveDataProvider>,
  )
  await waitFor(() => expect(screen.getByText(/Token safety check/)).toBeInTheDocument())
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('shop pricing shows both figures', () => {
  it('leads with the exact SOL price and marks USD as approximate', async () => {
    await mount(5.337107204740733)
    expect(screen.getByText('0.05 SOL')).toBeInTheDocument()
    // the tilde is load-bearing: this figure is recomputed every 30 seconds
    expect(screen.getByText('~$5.34')).toBeInTheDocument()
  })

  it('never renders the raw float that the API actually sends', async () => {
    await mount(5.337107204740733)
    expect(document.body.textContent).not.toContain('5.337107')
  })

  it('still shows a price when the USD feed returned null', async () => {
    // The hard requirement. A feed outage must not leave the card priceless.
    await mount(null)
    expect(screen.getByText('0.05 SOL')).toBeInTheDocument()
  })

  it('shows no dollar figure at all — not $0.00 — when USD is null', async () => {
    await mount(null)
    // "$0.00" would advertise a paid job as free
    expect(document.body.textContent).not.toContain('$0.00')
    expect(document.body.textContent).not.toMatch(/~\$/)
  })
})
