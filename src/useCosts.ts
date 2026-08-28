import { useEffect, useState } from 'react'
import { getCosts, hasApi, type CostsResponse } from './api'

/**
 * The spending ledger. Fetched separately from the shared snapshot because
 * only the activity feed and the costs page need it — no reason to make every
 * page pay for it.
 */
export function useCosts() {
  const [state, setState] = useState<{
    costs: CostsResponse | null
    loading: boolean
    error: string | null
  }>({ costs: null, loading: hasApi(), error: null })

  useEffect(() => {
    if (!hasApi()) return
    const ac = new AbortController()
    getCosts(ac.signal)
      .then((costs) => setState({ costs, loading: false, error: null }))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setState({
          costs: null,
          loading: false,
          error: e instanceof Error ? e.message : 'request failed',
        })
      })
    return () => ac.abort()
  }, [])

  return state
}
