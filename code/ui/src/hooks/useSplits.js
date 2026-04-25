/**
 * useSplits — list of splits in the house. Each split carries its
 * per-debtor SplitRequests (status: pending/accepted/rejected/failed).
 *
 * `mineOnly=true` filters to splits I'm payer or debtor on.
 */
import React from 'react'

import { listSplits } from '../api.js'

export function useSplits({ mineOnly = false, enabled = true } = {}) {
  const [splits, setSplits] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  const refresh = React.useCallback(async () => {
    if (!enabled) return
    setLoading(true); setError(null)
    try {
      setSplits(await listSplits(mineOnly))
    } catch (e) {
      setSplits([])
      if (e.status !== 401) setError(e)
    } finally {
      setLoading(false)
    }
  }, [enabled, mineOnly])

  React.useEffect(() => { refresh() }, [refresh])
  return { splits, loading, error, refresh }
}
