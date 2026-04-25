import React from 'react'
import { BF_COLORS, SF, SFR, AIBadge, AIActionCard, PrettyToolResult, PrettyArgs } from './components'

// AIWindow — slide-up sheet that sits between the top of the device and the
// app-root Dock. The Dock's ChatBar acts as the composer (its arrow-up flips
// to chevron-down to close). No internal composer here.

const DOCK_HEIGHT = 164

export function AIWindow({ open, onClose, messages, liveTail }) {
  const scrollerRef = React.useRef(null)
  const items = messages && messages.length > 0
    ? messages
    : [{ role: 'ai', text: "hey — what should we sort?" }]

  React.useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      scrollerRef.current?.scrollTo({ top: 99999, behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(t)
  }, [items, open, liveTail?.text, liveTail?.tools?.length])

  const suggestions = [
    'settle up with lena',
    "what's my net this month?",
    'split the last receipt',
  ]

  return (
    <div
      onClick={onClose}
      style={{
        // Full device dim. `overflow: hidden` clips the sliding sheet so the
        // closed (translateY) state can't extend the page or be revealed by
        // scrolling the underlying screen.
        position: 'absolute', inset: 0, zIndex: 600,
        overflow: 'hidden',
        background: open ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0)',
        transition: 'background 240ms ease',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          // Sheet runs to the device bottom (no gap behind the dock's
          // transparent gradient). The Dock (z 700) sits ON TOP of the sheet
          // so the ChatBar input is still visible and interactive.
          position: 'absolute', left: 0, right: 0, bottom: 0,
          top: '10%',
          background: BF_COLORS.cardElev,
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.06) inset',
          transform: open ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* lime-tinted top glow — signals AI surface */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 160,
          background: 'radial-gradient(120% 100% at 50% 0%, rgba(184,240,74,0.10) 0%, rgba(184,240,74,0.04) 35%, rgba(0,0,0,0) 70%)',
          pointerEvents: 'none', borderRadius: '24px 24px 0 0',
        }} />

        {/* grab handle — tap to close */}
        <div onClick={onClose} style={{
          display: 'flex', justifyContent: 'center',
          padding: '10px 0 8px', cursor: 'pointer',
        }}>
          <div style={{ width: 44, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.22)' }} />
        </div>

        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '4px 16px 12px',
        }}>
          <AIBadge size={28} radius={9} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SFR, fontSize: 16, fontWeight: 800, color: BF_COLORS.text, letterSpacing: -0.3 }}>
              ai
            </div>
            <div style={{ fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, marginTop: 1, letterSpacing: 0.1 }}>
              house copilot · always here
            </div>
          </div>
        </div>

        {/* transcript — fills sheet, no internal composer (root Dock owns it) */}
        <div ref={scrollerRef} style={{
          flex: 1, overflowY: 'auto',
          padding: `6px 16px ${DOCK_HEIGHT + 12}px`,
          display: 'flex', flexDirection: 'column', gap: 10,
          overscrollBehavior: 'contain',
        }}>
          {items.map((m, i) => (
            <Bubble key={i} role={m.role} action={m.action} tools={m.tools}>{m.text}</Bubble>
          ))}

          {liveTail && (
            <Bubble role="ai" tools={liveTail.tools} live={liveTail.kind}>
              {liveTail.kind === 'thinking' ? '…' : (liveTail.text || '')}
            </Bubble>
          )}

          {items.length <= 1 && !liveTail && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {suggestions.map(s => (
                <div key={s} style={{
                  padding: '8px 12px', borderRadius: 14,
                  background: 'rgba(184,240,74,0.08)', border: '0.5px solid rgba(184,240,74,0.28)',
                  fontFamily: SF, fontSize: 12.5, fontWeight: 600, color: BF_COLORS.lime,
                  letterSpacing: -0.1, cursor: 'pointer',
                }}>{s}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Bubble({ role, children, action, tools, live }) {
  const me = role === 'me'
  const streaming = live === 'streaming'
  return (
    <div style={{
      display: 'flex', justifyContent: me ? 'flex-end' : 'flex-start',
      flexDirection: 'column',
      alignItems: me ? 'flex-end' : 'flex-start',
      gap: (action?.preview || (tools && tools.length)) ? 8 : 0,
    }}>
      {tools && tools.length > 0 && <ToolTrace tools={tools} liveOpen={!!live} />}
      <div style={{
        maxWidth: '82%',
        padding: '10px 14px',
        borderRadius: me ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: me ? BF_COLORS.cardHi : BF_COLORS.card,
        border: me ? 'none' : `0.5px solid ${BF_COLORS.hairline}`,
        fontFamily: SF, fontSize: 14, lineHeight: 1.4,
        color: BF_COLORS.text, letterSpacing: -0.1,
        opacity: live === 'thinking' ? 0.6 : 1,
      }}>
        {children}
        {streaming && (
          <span style={{
            display: 'inline-block', width: 7, height: 14,
            marginLeft: 2, verticalAlign: '-2px',
            background: BF_COLORS.lime, borderRadius: 1.5,
            animation: 'aiCaret 900ms steps(2) infinite',
          }} />
        )}
      </div>
      {action?.preview && (
        <div style={{ maxWidth: '92%', width: '100%' }}>
          <AIActionCard action={action} />
        </div>
      )}
    </div>
  )
}

function ToolTrace({ tools, liveOpen = false }) {
  const [open, setOpen] = React.useState(liveOpen)
  React.useEffect(() => {
    if (liveOpen) setOpen(true)
  }, [liveOpen])
  const stripPrefix = (t) => t?.replace(/^mcp__bunq__/, '') ?? '?'
  return (
    <div style={{ maxWidth: '92%', width: '100%' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '6px 10px',
          borderRadius: 10,
          background: 'rgba(184,240,74,0.05)',
          border: '0.5px solid rgba(184,240,74,0.20)',
          fontFamily: SF, fontSize: 11, color: BF_COLORS.sub,
          cursor: 'pointer', letterSpacing: 0.1,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{ color: BF_COLORS.lime, fontWeight: 700 }}>tools</span>
        <span>{tools.length} call{tools.length === 1 ? '' : 's'}</span>
        <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tools.map((t, i) => (
            <div key={i} style={{
              padding: '8px 10px',
              borderRadius: 10,
              background: 'rgba(0,0,0,0.25)',
              border: `0.5px solid ${BF_COLORS.hairline}`,
              fontFamily: 'SF Mono, ui-monospace, monospace',
              fontSize: 11, color: BF_COLORS.text, lineHeight: 1.4,
            }}>
              <div style={{ color: BF_COLORS.lime, fontWeight: 700 }}>
                {stripPrefix(t.tool)}
                {t.ok === false && <span style={{ color: '#FF7A8A', marginLeft: 6 }}>· error</span>}
                {t.ok === null && <span style={{ color: BF_COLORS.sub, marginLeft: 6 }}>· running…</span>}
              </div>
              <PrettyArgs args={t.args} tool={t.tool} />
              {t.content != null && t.content !== '' && (
                <div style={{ marginTop: 6 }}>
                  <PrettyToolResult tool={t.tool} content={t.content} ok={t.ok !== false} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
