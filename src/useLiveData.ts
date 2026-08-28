import { useEffect, useState } from 'react'
import { getQueue, getServices, getStatus, hasApi, type QueueResponse, type ServiceResponse, type StatusResponse } from './api'

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
  queue: QueueResponse[] | null
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
