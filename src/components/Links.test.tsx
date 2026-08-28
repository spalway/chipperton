import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The rule under test: a link is rendered only when there is somewhere for it
 * to go.
 *
 * Both the X handle and the $CHIPS mint arrive null until they are set, and the
 * mint stays null until launch day. A control that renders anyway — with `href="#"`
 * or a placeholder address — asserts something the system does not have. That is
 * exactly the "agent registry →" bug, which shipped a dead link promising a
 * registry entry that was never created.
 */

const BASE = {
  vaultAddress: 'vault',
  hotWalletAddress: 'hot',
  vaultLamports: 0,
  vaultUsd: 0,
  dailyCostUsd: 18.4,
  measuredDailyCostUsd: null,
  dailyCostBasis: 'declared' as const,
  runwayDays: null,
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
  chipsMint: null as string | null,
  chipsUrl: null as string | null,
  chipsDiscountPct: 10,
  twitterHandle: null as string | null,
  twitterUrl: null as string | null,
  // widened, not literal null — overrides supply real URLs in the live cases
  vaultUrl: null as string | null,
  hotWalletUrl: null as string | null,
}

const MINT = 'BvSTr4pMintExample11111111111111111111111111'

const mount = async (
  which: 'x' | 'header',
  overrides: Partial<typeof BASE> = {},
) => {
  vi.resetModules()
  vi.stubEnv('VITE_API_URL', 'https://api.example')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.includes('/api/status') ? { ...BASE, ...overrides } : []
      const headers = new Headers({ 'X-Queue-Total': '0', 'X-Queue-Limit': '25' })
      return { ok: true, headers, json: async () => body } as Response
    }),
  )
  const [{ default: Cmp }, { default: LiveDataProvider }] = await Promise.all([
    which === 'x' ? import('./XLink') : import('./PageHeader'),
    import('../LiveDataProvider'),
  ])
  render(
    <LiveDataProvider>
      <Cmp />
    </LiveDataProvider>,
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('X link', () => {
  it('renders nothing at all when the server has no handle', async () => {
    await mount('x')
    await waitFor(() => expect(document.querySelector('.xlink')).toBeNull())
  })

  it('renders the handle with an @ the server did not send', async () => {
    await mount('x', {
      twitterHandle: 'chippertonfun',
      twitterUrl: 'https://x.com/chippertonfun',
    })
    const a = await screen.findByText(/@chippertonfun/)
    expect(a.closest('a')).toHaveAttribute('href', 'https://x.com/chippertonfun')
  })

  it('does not render a handle without a URL to open', async () => {
    // half-configured is not a link
    await mount('x', { twitterHandle: 'chippertonfun', twitterUrl: null })
    await waitFor(() => expect(document.querySelector('.xlink')).toBeNull())
  })
})

describe('$CHIPS contract address', () => {
  it('shows the placeholder — never a dead link — before launch', async () => {
    await mount('header')
    expect(await screen.findByText(/not deployed yet/)).toBeInTheDocument()
    expect(document.querySelector('.ca')).toBeNull()
  })

  it('links the mint to pump.fun once both exist', async () => {
    await mount('header', {
      chipsMint: MINT,
      chipsUrl: `https://pump.fun/coin/${MINT}`,
      chipsEnabled: true,
    })
    const a = await waitFor(() => {
      const el = document.querySelector('.ca')
      expect(el).not.toBeNull()
      return el as HTMLAnchorElement
    })
    expect(a).toHaveAttribute('href', `https://pump.fun/coin/${MINT}`)
    // full address in the title so it is copyable, truncated on screen
    expect(a).toHaveAttribute('title', MINT)
  })

  it('shows a mint without inventing a URL for it', async () => {
    // a fabricated pump.fun link is worse than a plain address
    await mount('header', { chipsMint: MINT, chipsUrl: null })
    await waitFor(() => expect(screen.getByTitle(MINT)).toBeInTheDocument())
    expect(document.querySelector('.ca')).toBeNull()
  })

  it('takes the discount from the server, not a client constant', async () => {
    // if the two ever disagree the header advertises terms orders will refuse
    await mount('header', { chipsDiscountPct: 15 })
    expect(await screen.findByText(/15% off/)).toBeInTheDocument()
  })
})

describe('agenda — derived, and empty means done', () => {
  const mountOverview = async (agenda?: unknown) => {
    vi.resetModules()
    vi.stubEnv('VITE_API_URL', 'https://api.example')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url.includes('/api/status')
          ? { ...BASE, ...(agenda === undefined ? {} : { agenda }) }
          : []
        const headers = new Headers({ 'X-Queue-Total': '0', 'X-Queue-Limit': '25' })
        return { ok: true, headers, json: async () => body } as Response
      }),
    )
    const [{ default: Overview }, { default: WalletProvider }, { default: LiveDataProvider }] =
      await Promise.all([
        import('../pages/Overview'),
        import('../WalletProvider'),
        import('../LiveDataProvider'),
      ])
    render(
      <LiveDataProvider>
        <WalletProvider>
          <Overview go={() => {}} openJob={() => {}} />
        </WalletProvider>
      </LiveDataProvider>,
    )
  }

  it('never shows the invented EARN/SPEND/PASS prose when live', async () => {
    // "Cleared six jobs" and "+$54.00 net" were constants rendered in live mode,
    // indistinguishable from real activity to a reader.
    await mountOverview([])
    await waitFor(() => expect(screen.getByText(/Nothing outstanding/)).toBeInTheDocument())
    expect(document.body.textContent).not.toContain('Cleared six jobs')
    expect(document.body.textContent).not.toContain('+$54.00')
  })

  it('treats an empty agenda as success, not as missing data', async () => {
    await mountOverview([])
    expect(await screen.findByText(/Nothing outstanding/)).toBeInTheDocument()
  })

  it('renders nothing rather than "nothing outstanding" when the server sent no agenda', async () => {
    // absent is unknown; empty is a claim. They must not render the same.
    await mountOverview(undefined)
    await waitFor(() => expect(screen.queryByText(/Cleared six jobs/)).toBeNull())
    expect(screen.queryByText(/Nothing outstanding/)).toBeNull()
  })

  it('keeps blocked and waiting visually distinct', async () => {
    await mountOverview([
      { kind: 'blocked', title: 'Not accepting orders', detail: 'd1', clearsWhen: 'funded' },
      { kind: 'waiting', title: '$CHIPS not launched', detail: 'd2', clearsWhen: 'mint set' },
    ])
    await waitFor(() => expect(screen.getByText('Not accepting orders')).toBeInTheDocument())
    expect(document.querySelector('.tg.ag-blocked')).not.toBeNull()
    expect(document.querySelector('.tg.ag-waiting')).not.toBeNull()
    expect(screen.getByText(/clears when funded/)).toBeInTheDocument()
  })
})

describe('the two wallet links', () => {
  const mountOverview = async (overrides: Partial<typeof BASE> = {}) => {
    vi.resetModules()
    vi.stubEnv('VITE_API_URL', 'https://api.example')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url.includes('/api/status') ? { ...BASE, ...overrides } : []
        const headers = new Headers({ 'X-Queue-Total': '0', 'X-Queue-Limit': '25' })
        return { ok: true, headers, json: async () => body } as Response
      }),
    )
    const [{ default: Overview }, { default: WalletProvider }, { default: LiveDataProvider }] =
      await Promise.all([
        import('../pages/Overview'),
        import('../WalletProvider'),
        import('../LiveDataProvider'),
      ])
    render(
      <LiveDataProvider>
        <WalletProvider>
          <Overview go={() => {}} openJob={() => {}} />
        </WalletProvider>
      </LiveDataProvider>,
    )
  }

  const LIVE = {
    vaultAddress: 'VAULTaddr1111111111111111111111111111111111',
    vaultUrl: 'https://solscan.io/account/VAULTaddr1111111111111111111111111111111111',
    hotWalletAddress: 'HOTaddr111111111111111111111111111111111111',
    hotWalletUrl: 'https://solscan.io/account/HOTaddr111111111111111111111111111111111111',
  }

  it('renders both, bracketed and named', async () => {
    await mountOverview(LIVE)
    expect(await screen.findByText('[hot] ↗')).toHaveAttribute('href', LIVE.hotWalletUrl)
    expect(screen.getByText('[vault] ↗')).toHaveAttribute('href', LIVE.vaultUrl)
  })

  it('says which wallet is which, since they are not interchangeable', async () => {
    await mountOverview(LIVE)
    const hot = await screen.findByText('[hot] ↗')
    // the asymmetry is the point: thin on purpose, and what refunds come from
    expect(hot.getAttribute('title')).toMatch(/refunds/)
    expect(hot.getAttribute('title')).toContain(LIVE.hotWalletAddress)
    expect(screen.getByText('[vault] ↗').getAttribute('title')).toMatch(/every payment/)
  })

  it('renders neither in sample mode rather than inert labels', async () => {
    // a bracketed [vault] with no href is a placeholder wearing a link's clothes
    vi.resetModules()
    vi.stubEnv('VITE_API_URL', '')
    const [{ default: Overview }, { default: WalletProvider }, { default: LiveDataProvider }] =
      await Promise.all([
        import('../pages/Overview'),
        import('../WalletProvider'),
        import('../LiveDataProvider'),
      ])
    render(
      <LiveDataProvider>
        <WalletProvider>
          <Overview go={() => {}} openJob={() => {}} />
        </WalletProvider>
      </LiveDataProvider>,
    )
    await waitFor(() => expect(screen.queryByText('[vault] ↗')).toBeNull())
    expect(screen.queryByText('[hot] ↗')).toBeNull()
  })

  it('shows one wallet when only one is reported', async () => {
    // gated separately, so a missing hot url does not hide the vault
    await mountOverview({ ...LIVE, hotWalletUrl: null })
    expect(await screen.findByText('[vault] ↗')).toBeInTheDocument()
    expect(screen.queryByText('[hot] ↗')).toBeNull()
  })
})
