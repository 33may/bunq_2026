/**
 * usePayments — recent bunq Payment events for the current user.
 * Drives the Home "Completed" section (real money movements).
 */
import React from 'react'

import { listMyPayments } from '../api.js'

export function usePayments({ count = 50, enabled = true } = {}) {
  const [payments, setPayments] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  const refresh = React.useCallback(async () => {
    if (!enabled) return
    setLoading(true); setError(null)
    try {
      setPayments(await listMyPayments(count))
    } catch (e) {
      setPayments([])
      if (e.status !== 401) setError(e)
    } finally {
      setLoading(false)
    }
  }, [enabled, count])

  React.useEffect(() => { refresh() }, [refresh])
  return { payments, loading, error, refresh }
}
