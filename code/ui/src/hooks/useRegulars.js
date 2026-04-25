/**
 * useRegulars — recurring household bills (rent, utilities, subs).
 *
 * Server already returns rows sorted by next_due ascending and includes
 * `days_until_due` so the UI can label rows ("today", "in 3 days", "12 may")
 * without doing date math.
 */
import React from 'react'

import { listRegulars } from '../api.js'

export function useRegulars({ enabled = true } = {}) {
  const [regulars, setRegulars] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  const refresh = React.useCallback(async () => {
    if (!enabled) return
    setLoading(true); setError(null)
    try {
      setRegulars(await listRegulars())
    } catch (e) {
      setRegulars([])
      if (e.status !== 401) setError(e)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  React.useEffect(() => { refresh() }, [refresh])
  return { regulars, loading, error, refresh }
}
