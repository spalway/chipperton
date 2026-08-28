import { useEffect, useState } from 'react'
import { getReport, hasApi, type ReportResponse } from './api'

/**
 * Fetches a delivered report.
 *
 * Gated on the caller passing an id only when `reportHash` exists — a refunded
 * order has no report and never will, and the endpoint 404s to say so.
 */
export function useReport(orderId: string | null) {
  const [state, setState] = useState<{
    report: ReportResponse | null
    loading: boolean
    error: string | null
  }>({ report: null, loading: false, error: null })

  useEffect(() => {
    if (!orderId || !hasApi()) {
      setState({ report: null, loading: false, error: null })
      return
    }
    const ac = new AbortController()
    setState({ report: null, loading: true, error: null })
    getReport(orderId, ac.signal)
      .then((report) => setState({ report, loading: false, error: null }))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setState({
          report: null,
          loading: false,
          error: e instanceof Error ? e.message : 'request failed',
        })
      })
    return () => ac.abort()
  }, [orderId])

  return state
}
