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

// ── housemates ─────────────────────────────────────────────────────────
export const listHousemates = () => req('/housemates')

// ── feed posts ─────────────────────────────────────────────────────────
export const listPosts = () => req('/posts')
export const createPost = (text) => req('/posts', { method: 'POST', body: { text } })
export const getPost = (id) => req(`/posts/${id}`)
export const addComment = (postId, text) =>
  req(`/posts/${postId}/comments`, { method: 'POST', body: { text } })
export const createSplitOnPost = (postId, body) =>
  req(`/posts/${postId}/split`, { method: 'POST', body })

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
