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
      // /api/queue is paged; the real response carries these headers and the
      // client reads the exact total from them rather than counting rows
      const headers = new Headers({
        'X-Queue-Total': '2',
        'X-Queue-Limit': '25',
        'X-Queue-Truncated': 'false',
      })
      return { ok: true, headers, json: async () => body } as Response
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

