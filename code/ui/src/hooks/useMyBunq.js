/**
 * useMyBunq — live bunq accounts for the current user.
 *
 * Hits GET /me/bunq, which in turn calls the bunq sandbox API on the
 * server. Refreshable. Error-tolerant: `error` is set, data stays null.
 */
import React from 'react'

import { getMyBunq } from '../api.js'

export function useMyBunq({ enabled = true } = {}) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  const refresh = React.useCallback(async () => {
    if (!enabled) return
    setLoading(true); setError(null)
    try {
      setData(await getMyBunq())
    } catch (e) {
      setData(null)
      if (e.status !== 401) setError(e)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  React.useEffect(() => { refresh() }, [refresh])
  return { data, loading, error, refresh }
}
