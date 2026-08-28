import type { ReactNode } from 'react'
import { LiveContext } from './liveContext'
import { useLiveFetch } from './useLiveData'

/**
 * Fetches status, services and queue once and shares the result with every
 * panel. Without this each panel fetched for itself, which meant a page could
 * render two snapshots of the same instant side by side.
 */
export default function LiveDataProvider({ children }: { children: ReactNode }) {
  const live = useLiveFetch(true)
  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>
}
