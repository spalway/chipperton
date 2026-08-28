import { useEffect, useState } from 'react'
import { getQueue, getServices, getStatus, hasApi, type QueuePage, type ServiceResponse, type StatusResponse } from './api'
import { adaptQueueRow, adaptService } from './adapt'
import { JOBS, SERVICES } from './data'

/**
 * Where the numbers on screen came from.
 *
 * 'sample'  — no API configured; the page is showing illustrative constants.
 * 'live'    — fetched from the server.
 * 'error'   — an API is configured but unreachable; we fell back to constants.
 *
 * The UI MUST surface anything other than 'live'. Rendering sample constants
 * without saying so is the same failure as labelling a declared cost as measured.
 */
export type DataSource = 'sample' | 'live' | 'error'

export type LiveData = {
  source: DataSource
  error: string | null
  status: StatusResponse | null
  services: ServiceResponse[] | null
  queue: QueuePage | null
  loading: boolean
}

const IDLE: LiveData = {
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

export function useLiveData(): LiveData {
  const [data, setData] = useState<LiveData>(() =>
    hasApi() ? { ...IDLE, loading: true } : IDLE,
  )

  useEffect(() => {
    if (!hasApi()) return
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
  }, [])

  return data
}
