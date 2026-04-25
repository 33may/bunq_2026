/**
 * useChat — subscribes to one chat thread (DM or reference) and exposes
 * `{ messages, send, loading, error }`.
 *
 * Architecture:
 *   • One process-wide WebSocket connection (lazily opened on first use)
 *     receives EVERY chat.new event for the signed-in user across all
 *     their threads. We fan out locally to per-thread listeners.
 *   • Initial history is fetched via REST on mount.
 *   • Sending uses REST POST; the server broadcasts and our own socket
 *     receives the echo, which appends to the list. Optimistic-add with
 *     id-dedup keeps the input feeling snappy without races.
 *
 * Thread identity is the (kind, key) pair where:
 *   - DM:   kind='dm',  key=<peer user id>   (server canonicalizes both ways)
 *   - REF:  kind='split' | 'split_request', key=<that id>
 */
import React from 'react'

import {
  listChat, sendChat, markChatRead, openChatSocket,
} from '../api.js'

// ── singleton socket + per-thread listener registry ─────────────────────
let _ws = null
let _wsState = 'idle' // 'idle' | 'connecting' | 'open' | 'closed'
let _listeners = new Set() // each listener gets every envelope
let _reconnectTimer = null

function _ensureSocket() {
  if (_ws && (_wsState === 'open' || _wsState === 'connecting')) return _ws
  _wsState = 'connecting'
  try {
    _ws = openChatSocket()
  } catch (e) {
    _wsState = 'closed'
    console.warn('[chat] failed to open ws', e)
    _scheduleReconnect()
    return null
  }
  _ws.addEventListener('open', () => { _wsState = 'open' })
  _ws.addEventListener('message', (ev) => {
    try {
      const env = JSON.parse(ev.data)
      for (const fn of _listeners) fn(env)
    } catch (e) {
      console.warn('[chat] bad ws frame', e)
    }
  })
  _ws.addEventListener('close', () => {
    _wsState = 'closed'
    _ws = null
    _scheduleReconnect()
  })
  _ws.addEventListener('error', () => {
    // close handler will fire next; reconnect is scheduled there.
  })
  return _ws
}

function _scheduleReconnect() {
  if (_reconnectTimer) return
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null
    if (_listeners.size > 0) _ensureSocket()
  }, 1500)
}

function _addListener(fn) {
  _listeners.add(fn)
  _ensureSocket()
  return () => {
    _listeners.delete(fn)
    if (_listeners.size === 0 && _ws) {
      // No one's listening; let the server-side socket time out naturally
      // by closing locally. Hook will re-open on next mount.
      try { _ws.close() } catch { /* noop */ }
      _ws = null
      _wsState = 'closed'
    }
  }
}

// ── thread key helpers (mirror of services/chats.py) ────────────────────
function _matchesThread(env, { kind, key, meId }) {
  const m = env?.message
  if (!m) return false
  if (m.thread_kind !== kind) return false
  if (kind === 'dm') {
    // server stores canonical "<a>|<b>"; key is the *peer* id from our side.
    if (!meId) return false
    const parts = String(m.thread_key).split('|')
    return parts.length === 2 && parts.includes(meId) && parts.includes(key)
  }
  return m.thread_key === key
}

// ── the hook ────────────────────────────────────────────────────────────
export function useChat({ kind, key, meId, enabled = true } = {}) {
  const [messages, setMessages] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  // Refresh from REST. Used on mount + as a fallback when WS is down.
  const refresh = React.useCallback(async () => {
    if (!enabled || !kind || !key) return
    setLoading(true); setError(null)
    try {
      const params = kind === 'dm' ? { peerId: key } : { kind, key }
      const rows = await listChat(params)
      setMessages(rows)
    } catch (e) {
      if (e.status !== 401) setError(e)
    } finally {
      setLoading(false)
    }
  }, [enabled, kind, key])

  React.useEffect(() => { refresh() }, [refresh])

  // Subscribe to incoming WS frames; append matching ones to local list.
  React.useEffect(() => {
    if (!enabled || !kind || !key) return undefined
    const off = _addListener((env) => {
      if (env?.type !== 'chat.new') return
      if (!_matchesThread(env, { kind, key, meId })) return
      setMessages(prev => {
        // de-dup by id (echo of our own POST may race the WS push)
        if (prev.some(m => m.id === env.message.id)) return prev
        return [...prev, env.message]
      })
    })
    return off
  }, [enabled, kind, key, meId])

  // Mark-read on mount + whenever new incoming messages land.
  React.useEffect(() => {
    if (!enabled || !kind || !key || !meId) return
    const hasUnreadIncoming = messages.some(m => m.sender_id !== meId && !m.read)
    if (!hasUnreadIncoming) return
    markChatRead({ kind, key }).catch(() => { /* best effort */ })
  }, [enabled, kind, key, meId, messages])

  const send = React.useCallback(async (body, opts = {}) => {
    if (!body || !body.trim()) return
    const params = kind === 'dm'
      ? { peerId: key, body: body.trim(), ...opts }
      : { kind, key, body: body.trim(), ...opts }
    const msg = await sendChat(params)
    // Optimistic insert (ws echo will also arrive; useChat.dedup handles it)
    setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
    return msg
  }, [kind, key])

  return { messages, loading, error, send, refresh }
}
