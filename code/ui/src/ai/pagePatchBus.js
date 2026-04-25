// code/ui/src/ai/pagePatchBus.js
// Tiny pub/sub for AI-driven page patches. Pages subscribe to the kinds
// they accept; the AI controller calls emit() when a page_patch event
// arrives over the SSE stream.

const handlers = new Map()  // kind → Set<fn>

export function on(kind, fn) {
  if (!handlers.has(kind)) handlers.set(kind, new Set())
  handlers.get(kind).add(fn)
  return () => off(kind, fn)
}

export function off(kind, fn) {
  handlers.get(kind)?.delete(fn)
}

export function emit(kind, payload) {
  const set = handlers.get(kind)
  if (!set || set.size === 0) {
    console.warn('[ai] page_patch unhandled', kind, payload)
    return false
  }
  for (const fn of set) {
    try { fn(payload) }
    catch (e) { console.error('[ai] page_patch handler error', kind, e) }
  }
  return true
}
