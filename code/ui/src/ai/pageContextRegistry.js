// code/ui/src/ai/pageContextRegistry.js
// One active page at a time — the topmost-open one. Pages call register on
// mount; later registrations overwrite earlier ones (ordering matches DOM
// stacking since later-mounted overlay sheets register last).

let active = null  // { pageId, getContext }
const order = []   // stack of registered pages

export function register(pageId, getContext) {
  // remove any prior entry for this page
  const i = order.findIndex(p => p.pageId === pageId)
  if (i >= 0) order.splice(i, 1)
  order.push({ pageId, getContext })
  active = order[order.length - 1]
}

export function unregister(pageId) {
  const i = order.findIndex(p => p.pageId === pageId)
  if (i >= 0) order.splice(i, 1)
  active = order[order.length - 1] || null
}

export function snapshot() {
  if (!active) return null
  try {
    const data = active.getContext() || {}
    return { page_id: active.pageId, data }
  } catch (e) {
    console.error('[ai] context.error', active.pageId, e)
    return null
  }
}

// stable JSON-stringify: sorted keys at every level. Used for hash-dedupe.
export function stableHash(value) {
  const seen = new WeakSet()
  const stringify = (v) => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '"[circular]"'
      seen.add(v)
      if (Array.isArray(v)) return '[' + v.map(stringify).join(',') + ']'
      const keys = Object.keys(v).sort()
      return '{' + keys.map(k => JSON.stringify(k) + ':' + stringify(v[k])).join(',') + '}'
    }
    return JSON.stringify(v)
  }
  return stringify(value)
}
