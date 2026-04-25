/**
 * useMe — the currently-signed-in bunq user (or null).
 *
 * `status` is 'loading' on mount, 'anon' if /me 401s, 'signed-in' with `user`
 * otherwise. Exposes `refresh()` so a newly-completed OAuth callback or a
 * logout can update the state without a page reload.
 */
import React from 'react'

import { getMe } from '../api.js'

export function useMe() {
  const [user, setUser] = React.useState(null)
  const [status, setStatus] = React.useState('loading') // 'loading' | 'anon' | 'signed-in'

  const refresh = React.useCallback(async () => {
    try {
      const me = await getMe()
      setUser(me)
      setStatus('signed-in')
    } catch (err) {
      if (err.status === 401) {
        setUser(null)
        setStatus('anon')
      } else {
        console.warn('[useMe] unexpected error', err)
        setUser(null)
        setStatus('anon')
      }
    }
  }, [])

  React.useEffect(() => { refresh() }, [refresh])

  return { user, status, refresh }
}
