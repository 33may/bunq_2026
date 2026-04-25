/**
 * Thin fetch wrapper for the flatmate api.
 *
 * Default base URL is empty string → relative paths, served through the Vite
 * proxy in dev (`vite.config.js`) so cookies are same-origin. Override with
 * VITE_API_BASE=http://127.0.0.1:8000 to bypass the proxy.
 *
 * All requests send `credentials: 'include'` so the bunq_user session cookie
 * set by /auth/bunq/callback is carried on every call.
 */

export const API_BASE = import.meta.env.VITE_API_BASE || ''

async function req(path, { method = 'GET', body, isFormData = false } = {}) {
  const opts = { method, headers: {}, credentials: 'include' }
  if (body !== undefined) {
    if (isFormData) {
      opts.body = body
    } else {
      opts.headers['content-type'] = 'application/json'
      opts.body = JSON.stringify(body)
    }
  }
  const r = await fetch(`${API_BASE}${path}`, opts)
  const text = await r.text()
  const data = text ? JSON.parse(text) : null
  if (!r.ok) {
    const err = new Error(`${method} ${path} → ${r.status}`)
    err.status = r.status
    err.body = data
    throw err
  }
  return data
}

// ── auth / session ─────────────────────────────────────────────────────
export const getMe = () => req('/me')
export const listUsers = () => req('/users')
export const connectBunq = (label) => req('/auth/bunq/callback', { method: 'POST', body: { label } })
export const logoutSession = () => req('/session/logout', { method: 'POST' })

// ── house ──────────────────────────────────────────────────────────────
export const getHouse = () => req('/house')

// ── bunq (live) ────────────────────────────────────────────────────────
export const getMyBunq = () => req('/me/bunq')
export const listMyPayments = (count = 50) => req(`/me/bunq/payments?count=${count}`)

// ── splits + per-debtor requests (one entity, two access patterns) ─────
export const listSplits = (mineOnly = false) =>
  req(`/splits${mineOnly ? '?mine_only=true' : ''}`)
export const getSplit = (id) => req(`/splits/${id}`)
export const getRequest = (id) => req(`/requests/${id}`)
export const refreshSplit = (id) => req(`/splits/${id}/refresh`, { method: 'POST' })
export const createSplit = (body) => req('/splits', { method: 'POST', body })
export const createRequest = (body) => req('/requests', { method: 'POST', body })
export const acceptSplitRequest = (splitId, rid) =>
  req(`/splits/${splitId}/requests/${rid}/accept`, { method: 'POST' })
export const declineSplitRequest = (splitId, rid) =>
  req(`/splits/${splitId}/requests/${rid}/decline`, { method: 'POST' })

// ── scans ──────────────────────────────────────────────────────────────
export const uploadScan = (file) => {
  const fd = new FormData()
  fd.append('file', file, file.name || 'receipt.jpg')
  return req('/scans', { method: 'POST', body: fd, isFormData: true })
}

export const getScan = (id) => req(`/scans/${id}`)
export const listScans = () => req('/scans')
export const deleteScan = (id) => req(`/scans/${id}`, { method: 'DELETE' })

export const patchScan = (id, patch) =>
  req(`/scans/${id}`, { method: 'PATCH', body: patch })

export const patchLineItem = (id, lid, patch) =>
  req(`/scans/${id}/line-items/${lid}`, { method: 'PATCH', body: patch })

export const setAssignments = (id, assignments) =>
  req(`/scans/${id}/assignments`, { method: 'POST', body: { assignments } })

export const aiAssign = (id, prompt) =>
  req(`/scans/${id}/ai-assignments`, { method: 'POST', body: { prompt } })

export const finalizeScan = (id, body) =>
  req(`/scans/${id}/finalize`, { method: 'POST', body: body || undefined })

// Resolve the API URL for a scan's stored image. Streams via the API so
// cookies / permissions stay coherent regardless of local-vs-S3 backend.
export const scanImageUrl = (id) => `${API_BASE}/scans/${id}/image`

// Attach a receipt image to an existing split (post-creation). Reuses
// the scans table — server creates a Scan row, saves the file, links it
// via split.source_scan_id, and returns the updated split.
export const uploadSplitReceipt = (splitId, file) => {
  const fd = new FormData()
  fd.append('file', file, file.name || 'receipt.jpg')
  return req(`/splits/${splitId}/receipt`, { method: 'POST', body: fd, isFormData: true })
}

// ── housemates ─────────────────────────────────────────────────────────
export const listHousemates = () => req('/housemates')

// ── personal profile MD ────────────────────────────────────────────────
// The agent reads/proposes edits via MCP; this is the human-facing read/save.
export const getMyProfile = () => req('/me/profile')
export const putMyProfile = (text) => req('/me/profile', { method: 'PUT', body: { text } })

// ── feed posts ─────────────────────────────────────────────────────────
export const listPosts = () => req('/posts')
export const createPost = (text) => req('/posts', { method: 'POST', body: { text } })
export const getPost = (id) => req(`/posts/${id}`)
export const addComment = (postId, text) =>
  req(`/posts/${postId}/comments`, { method: 'POST', body: { text } })
export const createSplitOnPost = (postId, body) =>
  req(`/posts/${postId}/split`, { method: 'POST', body })

// ── regulars ───────────────────────────────────────────────────────────
// Recurring household bills (rent/utilities/subs). Server returns each row
// with computed next_due + days_until_due so the UI just sorts by it.
export const listRegulars = () => req('/regulars')

// ── notifications ──────────────────────────────────────────────────────
// Server derives events from posts/comments/splits; UI tracks unread via
// localStorage `bf:lastSeenNotifAt`.
export const listNotifications = (limit = 50) =>
  req(`/notifications?limit=${limit}`)

// ── settle-up ──────────────────────────────────────────────────────────
// Net all open SplitRequests with `peerId` (in either direction), revoke
// them, and create one direct SplitRequest for the net difference.
export const previewSettle = (peerId) => req(`/settle-up/${peerId}/preview`)
export const doSettle = (peerId) => req(`/settle-up/${peerId}`, { method: 'POST' })

// ── chat ───────────────────────────────────────────────────────────────
// Three thread shapes share one table, discriminated server-side:
//   • dm            — listChat({ peerId })          / sendChat({ peerId, body, attachment? })
//   • split         — listChat({ kind:'split', key }) / sendChat({ kind:'split', key, body })
//   • split_request — same with kind:'split_request'
const _qs = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

export function listChat({ peerId, kind, key, limit = 200 } = {}) {
  const q = _qs({ peer_id: peerId, kind, key, limit })
  return req(`/chats${q ? `?${q}` : ''}`)
}

export function sendChat({ peerId, kind, key, body, attachment_kind, attachment_id }) {
  return req('/chats', {
    method: 'POST',
    body: { peer_id: peerId, kind, key, body, attachment_kind, attachment_id },
  })
}

export function markChatRead({ kind, key }) {
  // For dm: pass kind:'dm', key=peerId (server canonicalizes)
  return req('/chats/read', { method: 'POST', body: { kind, key } })
}

// Opens a WebSocket to the user-level /ws/chats endpoint. Cookies travel
// automatically (same-origin via vite proxy in dev, same-origin in prod).
// Returns the raw WebSocket so the caller controls onmessage / close.
export function openChatSocket() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // VITE_API_BASE may be a full http(s) URL when bypassing the proxy.
  const base = API_BASE
    ? API_BASE.replace(/^http/, 'ws')
    : `${proto}//${window.location.host}`
  return new WebSocket(`${base}/ws/chats`)
}

// ── polling helper ─────────────────────────────────────────────────────
/**
 * Poll GET /scans/:id until status is parsed or failed, or timeout.
 * Returns the final scan payload; throws on timeout or failed.
 */
export async function waitForParse(id, { intervalMs = 1000, timeoutMs = 60000 } = {}) {
  const start = Date.now()
  while (true) {
    const scan = await getScan(id)
    if (scan.status === 'parsed') return scan
    if (scan.status === 'failed') {
      const err = new Error(scan.error || 'scan parsing failed')
      err.scan = scan
      throw err
    }
    if (Date.now() - start > timeoutMs) {
      const err = new Error('scan parsing timeout')
      err.scan = scan
      throw err
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
