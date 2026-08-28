import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The rule under test:
 *
 *   0    = measured, and it is genuinely zero  → render it
 *   null = not yet measurable                  → say so
 *
 * Neither may fall back to a sample constant. Falling back on a live `null`
 * overstates confidence; labelling a live `0` as "sample" understates it.
 * Both are the same bug in opposite directions.
 */

/**
 * Mirrors the shape emitted by `scripts/contract.ts` against the live server —
 * an observation of the API, not a guess at it. Keep it in step with that output.
 */
const LIVE_STATUS = {
  vaultAddress: '8CzzawseMJZ872gxvAHWpzDwZ6WwRs7qGJhrK6MezWnV',
  vaultLamports: 0,
  vaultUsd: 0,
  dailyCostUsd: 18.4,
  measuredDailyCostUsd: null,
  dailyCostBasis: 'declared' as const,
  runwayDays: 0,
  backlog: 0,
  deliveredToday: 0,
  hotWalletLamports: 2_399_990_000,
  refundLiabilityLamports: 0,
  canHonourRefunds: true,
  lastTickAt: '2026-08-28T05:35:58.826+00:00',
  tickIntervalSeconds: 900,
  nextTickAt: '2026-08-28T05:50:58.826Z',
  medianTurnaroundMinutes: null,
  payCluster: 'devnet',
  chipsEnabled: false,
}

const mountWithApi = async (
  base: string | undefined,
  ok = true,
  overrides: Partial<typeof LIVE_STATUS> = {},
) => {
  vi.resetModules()
  vi.stubEnv('VITE_API_URL', base ?? '')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (!ok) throw new Error('connection refused')
      const body = url.includes('/api/status') ? { ...LIVE_STATUS, ...overrides } : []
      return { ok: true, json: async () => body } as Response
    }),
  )
  const { default: Status } = await import('./Status')
  render(<Status go={() => {}} />)
}

beforeEach(() => vi.useRealTimers())
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Status — provenance', () => {
  it('discloses sample figures when no API is configured', async () => {
    await mountWithApi(undefined)
    expect(await screen.findByText(/Sample figures/i)).toBeInTheDocument()
  })

  it('discloses fallback when a configured API is unreachable', async () => {
    await mountWithApi('http://localhost:9', false)
    await waitFor(() => expect(screen.getByText(/Sample figures/i)).toBeInTheDocument())
    expect(screen.getByText(/unreachable/i)).toBeInTheDocument()
  })

  it('does NOT claim sample data when live figures are real zeros', async () => {
    await mountWithApi('http://localhost:8787')
    await waitFor(() => expect(screen.queryByText(/Sample figures/i)).not.toBeInTheDocument())
  })
})

describe('Status — 0 vs null', () => {
  it('renders a measured zero runway as 0.0d, not a sample number', async () => {
    await mountWithApi('http://localhost:8787')
    await waitFor(() => expect(screen.getByText('0.0d')).toBeInTheDocument())
    // the sample constant must not leak through
    expect(screen.queryByText(/49\.9d/)).not.toBeInTheDocument()
  })

  it('renders a null turnaround as "nothing delivered yet", not a sample average', async () => {
    await mountWithApi('http://localhost:8787')
    await waitFor(() =>
      expect(screen.getByText(/nothing delivered yet/i)).toBeInTheDocument(),
    )
    expect(screen.queryByText(/est\. wait/i)).not.toBeInTheDocument()
  })

  it('renders a counted zero backlog as "0 jobs"', async () => {
    await mountWithApi('http://localhost:8787')
    await waitFor(() => expect(screen.getByText('0 jobs')).toBeInTheDocument())
  })

  it('renders a counted zero deliveredToday without inventing one', async () => {
    await mountWithApi('http://localhost:8787')
    await waitFor(() => expect(screen.getByText('0 jobs')).toBeInTheDocument())
  })

  it('lets dailyCostBasis decide the wording', async () => {
    await mountWithApi('http://localhost:8787')
    await waitFor(() =>
      expect(screen.getByText(/declared · compute \+ inference/i)).toBeInTheDocument(),
    )
    expect(screen.queryByText(/measured · compute/i)).not.toBeInTheDocument()
  })
})

describe('Status — solvency', () => {
  // "Can it honour what it already owes" is the meaningful liveness signal:
  // refunds pay from the hot wallet while payments fill the vault, so it can
  // degrade silently and discover it exactly when it owes someone money.
  it('reports that it can honour refunds when the hot wallet covers liability', async () => {
    await mountWithApi('http://localhost:8787')
    await waitFor(() => expect(screen.getByText(/Can honour refunds/i)).toBeInTheDocument())
    expect(screen.getByText(/accepting new work/i)).toBeInTheDocument()
  })

  it('warns and states work has stopped when it cannot cover liability', async () => {
    await mountWithApi('http://localhost:8787', true, {
      canHonourRefunds: false,
      hotWalletLamports: 1_000_000,
      refundLiabilityLamports: 100_000_000,
    })
    await waitFor(() =>
      expect(screen.getByText(/Cannot cover outstanding refunds/i)).toBeInTheDocument(),
    )
    expect(screen.getByText(/stopped accepting new work/i)).toBeInTheDocument()
    expect(screen.queryByText(/Can honour refunds/i)).not.toBeInTheDocument()
  })
})
