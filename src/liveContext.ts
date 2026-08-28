import { createContext } from 'react'
import type { QueuePage, ServiceResponse, StatusResponse } from './api'

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
  /** Re-fetch everything. Placing an order changes the backlog. */
  refresh: () => void
}

/**
 * Null when no provider is mounted, in which case each consumer falls back to
 * fetching for itself. That fallback exists so a component can still be tested
 * in isolation; in the app the provider is always present, and one fetch feeds
 * every panel. Independent fetchers could return different snapshots of the
 * same instant, which on this site means two panels quoting different clusters.
 */
export const LiveContext = createContext<LiveData | null>(null)
