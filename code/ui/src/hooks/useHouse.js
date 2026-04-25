/**
 * useHouse — fetches the signed-in user's household.
 *
 * Returns `{ house, loading, error, refresh }`. `house` is null while loading
 * or when /house 401s (caller should gate on useMe().status first).
 */
import React from 'react'

import { getHouse } from '../api.js'

export function useHouse() {
  const [house, setHouse] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  const refresh = React.useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setHouse(await getHouse())
    } catch (e) {
      setHouse(null)
      if (e.status !== 401) setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { refresh() }, [refresh])
  return { house, loading, error, refresh }
}
