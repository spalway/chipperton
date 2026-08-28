import { useCallback, useContext, useEffect, useState } from 'react'
import { getQueue, getServices, getStatus, hasApi } from './api'
import { adaptQueueRow, adaptService } from './adapt'
import { JOBS, SERVICES } from './data'
import { LiveContext, type LiveData } from './liveContext'

export type { DataSource, LiveData } from './liveContext'

const IDLE: Omit<LiveData, 'refresh'> = {
  source: 'sample',
  error: null,
  status: null,
  services: null,
  queue: null,
  loading: false,
}

/**
 * Live services/queue when the API answered, sample constants otherwise —
 * and a flag saying which, so callers can disclose it. Never mixed.
 */
export function useResolved() {
  const live = useLiveData()
  const isLive = live.source === 'live'
  return {
    isLive,
    source: live.source,
    error: live.error,
    status: live.status,
    refresh: live.refresh,
    services: isLive && live.services ? live.services.map(adaptService) : SERVICES,
    queue: isLive && live.queue ? live.queue.rows.map(adaptQueueRow) : JOBS,
    /**
     * Exact count across the whole queue, from X-Queue-Total. NEVER use the
     * length of the rows above — /api/queue is paged at 25, so a row count is
     * "in this page" wearing the label "in total".
     */
    queueTotal: isLive ? (live.queue?.total ?? 0) : JOBS.length,
    /** true when there are more orders than this page shows */
    queueTruncated: isLive ? (live.queue?.truncated ?? false) : false,
    queueLimit: isLive ? (live.queue?.limit ?? 0) : JOBS.length,
    /** true when the API answered and genuinely has no rows */
    emptyQueue: isLive && (live.queue?.rows.length ?? 0) === 0,
    /**
     * Delivered since UTC midnight. Server-side when live — counting delivered
     * rows in the visible queue would silently mean "delivered in this page of
     * results", which is the sampling-window error in miniature.
     */
    deliveredToday: isLive
      ? (live.status?.deliveredToday ?? 0)
      : JOBS.filter((j) => j.status === 'delivered').length,
  }
}

/**
 * The shared snapshot, from the provider when one is mounted.
 *
 * Without a provider this fetches for itself — the isolated-component case.
 * Hooks must run unconditionally, so the fallback fetcher always runs and its
 * result is simply discarded when the context wins.
 */
export function useLiveData(): LiveData {
  const shared = useContext(LiveContext)
  const own = useLiveFetch(shared == null)
  return shared ?? own
}

/**
 * The actual fetching. `enabled` is false in every consumer once a provider is
 * mounted, so the request goes out exactly once per page rather than once per
 * panel that happens to want a number.
 */
export function useLiveFetch(enabled = true): LiveData {
  const [nonce, setNonce] = useState(0)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  const [data, setData] = useState<Omit<LiveData, 'refresh'>>(() =>
    enabled && hasApi() ? { ...IDLE, loading: true } : IDLE,
  )

  useEffect(() => {
    if (!enabled || !hasApi()) return
    const ac = new AbortController()

    Promise.all([getStatus(ac.signal), getServices(ac.signal), getQueue(ac.signal)])
      .then(([status, services, queue]) =>
        setData({ source: 'live', error: null, status, services, queue, loading: false }),
      )
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setData({
          ...IDLE,
          source: 'error',
          error: e instanceof Error ? e.message : 'request failed',
        })
      })

    return () => ac.abort()
  }, [enabled, nonce])

  return { ...data, refresh }
}
