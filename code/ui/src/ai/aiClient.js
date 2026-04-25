// code/ui/src/ai/aiClient.js
// Async iterator over POST /ai/chat. Yields { type, ... } events.

import { API_BASE } from '../api'

export async function* chat({ message, history, page_context, client_turn_id, signal } = {}) {
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    credentials: 'include',
    body: JSON.stringify({
      message, history: history || [],
      page_context: page_context || null,
      client_turn_id,
    }),
    signal,
  })
  if (!res.ok) {
    const err = new Error(`POST /ai/chat → ${res.status}`)
    err.status = res.status
    try { err.body = await res.json() } catch {}
    throw err
  }
  if (!res.body) throw new Error('no response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const ev = parseFrame(frame)
      if (ev) yield ev
    }
  }
}

function parseFrame(frame) {
  // Skip comment lines (": ping").
  let type = null, dataLines = []
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) type = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (!type || dataLines.length === 0) return null
  let data
  try { data = JSON.parse(dataLines.join('\n')) }
  catch { return null }
  return { type, ...data }
}
