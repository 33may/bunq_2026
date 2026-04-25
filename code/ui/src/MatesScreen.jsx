import React from 'react'
import { BF_COLORS, SF, SFR, Avatar, List, ListRow, Chat, CardRow } from './components'
import * as registry from './ai/pageContextRegistry'
import { useChat } from './hooks/useChat'
import { previewSettle, doSettle } from './api'

// Mates list and per-mate detail page. Housemates + balances come from the
// real backend (/housemates + /splits); 1:1 chat is wired to the
// chat WebSocket via useChat — DM thread keyed by the peer user id.

function fmtEuro(n) {
  return `€${Math.abs(n).toFixed(2).replace('.', ',')}`
}

// Net = sum of pending/failed SplitRequests between me and one peer
// (positive = they owe me). Same convention as BalanceHero / get_balance_with.
function _netWith(splits, meId, peerId) {
  let amt = 0
  for (const s of (splits || [])) {
    for (const r of (s.requests || [])) {
      if (r.status === 'accepted' || r.status === 'revoked' || r.status === 'rejected') continue
      if (s.payer_id === meId && r.debtor_id === peerId) amt += Number(r.amount)
      else if (s.payer_id === peerId && r.debtor_id === meId) amt -= Number(r.amount)
    }
  }
  return amt
}

// Open positions = the same pending/failed requests, formatted for the list.
function _openPositionsWith(splits, meId, peerId) {
  const out = []
  for (const s of (splits || [])) {
    for (const r of (s.requests || [])) {
      if (r.status === 'accepted' || r.status === 'revoked' || r.status === 'rejected') continue
      const isMineOnPeer = s.payer_id === meId && r.debtor_id === peerId
      const isPeerOnMe   = s.payer_id === peerId && r.debtor_id === meId
      if (!isMineOnPeer && !isPeerOnMe) continue
      out.push({
        id: r.id,
        type: 'request',
        from: s.payer_name || 'someone',
        title: s.title || 'request',
        sub: s.note || 'request',
        amt: Number(r.amount),
        side: isMineOnPeer ? 'they-owe' : 'owe-them',
        split: s,
        request: r,
      })
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────
// MatesScreen — list of housemates, one row each, with last activity
// ─────────────────────────────────────────────────────────────────────
export function MatesScreen({ onOpenMate, me, housemates, splits }) {
  const others = (housemates || []).filter(m => !m.is_me)

  const summary = others.reduce((acc, m) => {
    const n = _netWith(splits, me?.id, m.id)
    acc.youOwe += n < 0 ? -n : 0
    acc.youGet += n > 0 ?  n : 0
    return acc
  }, { youOwe: 0, youGet: 0 })

  return (
    <div style={{ background: BF_COLORS.bg, minHeight: '100%', paddingTop: 62 }}>
      <div style={{ padding: '10px 20px 18px' }}>
        <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, fontWeight: 500 }}>
          house chat & ledgers
        </div>
        <div style={{
          fontFamily: SFR, fontSize: 26, fontWeight: 800, color: BF_COLORS.text,
          letterSpacing: -0.6, marginTop: 2,
        }}>
          mates
        </div>
      </div>

      <div style={{ padding: '0 20px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SummaryTile label="you owe"     amount={summary.youOwe} color={BF_COLORS.coral} />
        <SummaryTile label="you're owed" amount={summary.youGet} color={BF_COLORS.green} />
      </div>

      <div style={{ padding: '0 20px' }}>
        <div style={{
          fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, fontWeight: 600,
          letterSpacing: 0.5, textTransform: 'uppercase',
          padding: '0 4px 8px',
        }}>
          housemates
        </div>
        {others.length === 0 ? (
          <div style={{
            padding: '20px 16px', borderRadius: 16,
            background: 'rgba(255,255,255,0.03)',
            fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, textAlign: 'center',
          }}>
            no other housemates yet.
          </div>
        ) : (
          <List>
            {others.map(m => {
              const n = _netWith(splits, me?.id, m.id)
              return (
                <ListRow
                  key={m.id}
                  onClick={() => onOpenMate?.({
                    id: m.id, name: m.name,
                    initial: (m.name || '?')[0].toUpperCase(),
                    color: m.color || BF_COLORS.amber,
                  })}
                  leading={<Avatar
                    initial={(m.name || '?')[0].toUpperCase()}
                    color={m.color || BF_COLORS.amber} size={42}
                  />}
                  title={m.name}
                  sub="open chat"
                  trailing={<NetPill net={n} />}
                />
              )
            })}
          </List>
        )}
      </div>

      <div style={{ height: 180 }} />
    </div>
  )
}

function SummaryTile({ label, amount, color }) {
  return (
    <div style={{
      background: BF_COLORS.card, borderRadius: 18, padding: '14px 14px 12px',
      border: `0.5px solid ${BF_COLORS.hairline}`,
    }}>
      <div style={{
        fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>{label}</div>
      <div style={{
        fontFamily: SFR, fontSize: 22, fontWeight: 800, color, letterSpacing: -0.5,
        marginTop: 4,
      }}>
        {fmtEuro(amount)}
      </div>
    </div>
  )
}

function NetPill({ net }) {
  if (Math.abs(net) < 0.005) {
    return (
      <span style={{
        fontFamily: SF, fontSize: 12, fontWeight: 600, color: BF_COLORS.ter,
        padding: '4px 10px', borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
      }}>even</span>
    )
  }
  const positive = net > 0
  return (
    <span style={{
      fontFamily: SFR, fontSize: 13, fontWeight: 800,
      color: positive ? BF_COLORS.green : BF_COLORS.coral,
      padding: '4px 10px', borderRadius: 10,
      background: positive ? 'rgba(0,210,106,0.12)' : 'rgba(255,106,78,0.14)',
      letterSpacing: -0.2, whiteSpace: 'nowrap',
    }}>
      {positive ? '+' : '−'}{fmtEuro(net)}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────
// MatePage — bottom-half pinned chat with header + summary above.
//
// Layout (top → bottom):
//   1. header                — pinned, ~62px
//   2. top section (compact) — hero (avatar + net), open positions list
//   3. chat panel            — flex: 1, message list scrolls inside,
//                              composer pinned to its bottom
//
// Everything stays inside the iPhone frame; only the chat message list
// scrolls. New messages auto-stick to the bottom; users that scroll up to
// read history are not yanked back.
// ─────────────────────────────────────────────────────────────────────
export function MatePage({ mate, me, splits, open, onClose, onOpenItem, onSettle }) {
  React.useEffect(() => {
    if (!open || !mate) return
    registry.register('mate_detail', () => ({
      mate: { id: mate.id, name: mate.name },
    }))
    return () => registry.unregister('mate_detail')
  }, [open, mate])

  // useChat OWNS the WebSocket connection — opens on mount, closes on
  // unmount. Keeping the page mounted (open=false) would keep the socket
  // open; we render null when closed so the connection cycles cleanly.
  const peerId = mate?.id || null
  const { messages, send } = useChat({
    kind: 'dm', key: peerId, meId: me?.id, enabled: !!(open && peerId && me?.id),
  })

  if (!mate) return null
  const net = _netWith(splits, me?.id, mate.id)
  const positive = net > 0
  const positions = _openPositionsWith(splits, me?.id, mate.id)
  const peer = { name: mate.name, initial: mate.initial, color: mate.color }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 380,
      background: BF_COLORS.bg,
      transform: open ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* sticky header */}
      <div style={{
        padding: '54px 16px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(to bottom, #000 70%, rgba(0,0,0,0))',
        flexShrink: 0,
      }}>
        <button onClick={onClose} style={{
          width: 36, height: 36, borderRadius: 18,
          background: BF_COLORS.cardHi, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M10 3L4 7l6 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={{
          fontFamily: SFR, fontSize: 17, fontWeight: 800, color: BF_COLORS.text,
          letterSpacing: -0.3,
        }}>{mate.name}</div>
        <div style={{ width: 36 }} />
      </div>

      {/* compact top section — hero + open positions. Lays out at natural
          height; the chat panel below soaks up the remaining space. */}
      <div style={{ padding: '0 20px 12px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '6px 0 14px',
        }}>
          <Avatar initial={mate.initial} color={mate.color} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: SFR, fontSize: 18, fontWeight: 800, color: BF_COLORS.text,
              letterSpacing: -0.3,
            }}>{mate.name}</div>
            <NetSubline net={net} positive={positive} />
          </div>
          {/* Settle-up button — only when there's something open to net.
              Tapping opens the immutable confirm sheet. */}
          {positions.length > 0 && (
            <button
              onClick={() => onSettle?.(mate)}
              style={{
                padding: '8px 14px', borderRadius: 14, border: 'none',
                background: BF_COLORS.lime, color: '#000',
                fontFamily: SFR, fontSize: 13, fontWeight: 800, letterSpacing: -0.1,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              settle up
            </button>
          )}
        </div>

        {positions.length > 0 && (
          <>
            <SectionHeader label={`open · ${positions.length}`} />
            <List>
              {positions.slice(0, 3).map(o => (
                <ListRow
                  key={o.id}
                  onClick={() => onOpenItem?.(o)}
                  leading={<KindGlyph kind={o.type} />}
                  title={o.title}
                  sub={o.sub}
                  trailing={
                    <span style={{
                      fontFamily: SFR, fontSize: 13, fontWeight: 800,
                      color: o.side === 'they-owe' ? BF_COLORS.green : BF_COLORS.coral,
                      letterSpacing: -0.2,
                    }}>
                      {o.side === 'they-owe' ? '+' : '−'}{fmtEuro(o.amt)}
                    </span>
                  }
                />
              ))}
            </List>
          </>
        )}
      </div>

      {/* chat — fills remaining bottom area, internally scrollable */}
      <div style={{
        flex: 1, minHeight: 0,
        padding: '8px 20px 24px',
        display: 'flex', flexDirection: 'column',
        borderTop: `1px solid ${BF_COLORS.hairline}`,
        background: '#0A0A0C',
      }}>
        <div style={{
          fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, fontWeight: 600,
          letterSpacing: 0.5, textTransform: 'uppercase',
          padding: '6px 4px 8px', flexShrink: 0,
        }}>
          chat with {mate.name}
        </div>
        <Chat
          fillHeight
          peer={peer}
          meId={me?.id}
          messages={messages}
          onSend={(t) => send(t)}
          renderAttachment={({ kind, id }) => (
            <AttachmentPreview kind={kind} id={id} splits={splits} onOpen={onOpenItem} />
          )}
          placeholder={`message ${mate.name}…`}
        />
      </div>
    </div>
  )
}

function NetSubline({ net, positive }) {
  if (Math.abs(net) < 0.005) {
    return (
      <div style={{
        fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, marginTop: 2,
      }}>all settled</div>
    )
  }
  const c = positive ? BF_COLORS.green : BF_COLORS.coral
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
      <span style={{
        fontFamily: SFR, fontSize: 18, fontWeight: 800, color: c, letterSpacing: -0.3,
      }}>
        {positive ? '+' : '−'}{fmtEuro(net)}
      </span>
      <span style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.sub }}>
        {positive ? 'they owe you' : 'you owe them'}
      </span>
    </div>
  )
}

// AttachmentPreview — resolves a (kind, id) reference against the
// in-memory `splits` payload and renders a CardRow above the bubble.
// In split-attachment case, id may be a Split.id; in split_request case,
// id is a SplitRequest.id (we walk every split to find it). When the
// item isn't loaded (e.g. created in another session), we fall back to
// a generic open chip.
function AttachmentPreview({ kind, id, splits, onOpen }) {
  const { item, label, amount } = React.useMemo(() => {
    if (kind === 'split') {
      const s = (splits || []).find(x => x.id === id)
      return s
        ? { item: { type: 'bill', split: s, title: s.title, amt: Number(s.total), id: s.id },
            label: s.title || 'split',
            amount: Number(s.total) }
        : { item: null, label: 'split', amount: null }
    }
    if (kind === 'split_request') {
      for (const s of (splits || [])) {
        const r = (s.requests || []).find(x => x.id === id)
        if (r) {
          return {
            item: {
              type: 'request', split: s, request: r,
              from: s.payer_name || 'someone',
              title: s.title || 'request',
              note: s.note || '',
              amt: Number(r.amount),
            },
            label: s.title || 'request',
            amount: Number(r.amount),
          }
        }
      }
    }
    return { item: null, label: kind, amount: null }
  }, [kind, id, splits])

  return (
    <CardRow
      title={label}
      sub={kind === 'split' ? 'split' : 'request'}
      amount={amount ?? undefined}
      cta={item ? 'open' : 'open'}
      onClick={(e) => { e.stopPropagation(); if (item) onOpen?.(item) }}
    />
  )
}

function SectionHeader({ label }) {
  return (
    <div style={{
      fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, fontWeight: 600,
      letterSpacing: 0.5, textTransform: 'uppercase',
      padding: '0 4px 8px',
    }}>{label}</div>
  )
}

function KindGlyph({ kind }) {
  const c = kind === 'planned' ? BF_COLORS.coral : BF_COLORS.amber
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 12,
      background: `${c}22`, border: `0.5px solid ${c}33`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {kind === 'planned' ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="11" rx="2" stroke={c} strokeWidth="1.4"/>
          <path d="M2 6h12" stroke={c} strokeWidth="1.4"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h7M7 4l-4 4 4 4M11 3v10" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// SettleSheet — slide-up confirm sheet for settle-up.
//
// On open we GET /settle-up/{peer}/preview to learn (net, direction,
// open_count). The amount is IMMUTABLE here — the user just confirms.
// Tapping the action posts to /settle-up/{peer}, which:
//   • revokes every open SplitRequest in the pair
//   • creates ONE new SplitRequest for the net in the right direction
// On success we call onDone(result) so the host can refresh splits.
// ─────────────────────────────────────────────────────────────────────
export function SettleSheet({ peer, open, onClose, onDone }) {
  const [preview, setPreview] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy]       = React.useState(false)
  const [error, setError]     = React.useState(null)

  React.useEffect(() => {
    if (!open || !peer?.id) return
    setPreview(null); setError(null); setLoading(true)
    previewSettle(peer.id)
      .then(setPreview)
      .catch(e => setError(e?.body?.detail || e?.message || 'failed'))
      .finally(() => setLoading(false))
  }, [open, peer?.id])

  const confirm = async () => {
    if (!peer?.id || busy) return
    setBusy(true); setError(null)
    try {
      const result = await doSettle(peer.id)
      onDone?.(result)
      onClose?.()
    } catch (e) {
      setError(e?.body?.detail || e?.message || 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 720,
      transform: open ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)',
      pointerEvents: open ? 'auto' : 'none',
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div onClick={onClose} style={{ flex: 1 }} />
      <div style={{
        background: BF_COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '14px 20px 24px',
        boxShadow: '0 -12px 48px rgba(0,0,0,0.4)',
      }}>
        {/* drag pill */}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.2)',
          margin: '0 auto 18px',
        }} />

        <div style={{
          fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, fontWeight: 600,
          letterSpacing: 0.6, textTransform: 'uppercase',
        }}>
          settle up with
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginTop: 6,
        }}>
          <Avatar
            initial={(peer?.name || '?')[0].toUpperCase()}
            color={peer?.color || BF_COLORS.amber}
            size={42}
          />
          <div style={{
            fontFamily: SFR, fontSize: 22, fontWeight: 800, color: BF_COLORS.text,
            letterSpacing: -0.4,
          }}>{peer?.name || 'someone'}</div>
        </div>

        <div style={{ marginTop: 18, minHeight: 84 }}>
          {loading && <Skeleton />}
          {!loading && preview && <PreviewBlock preview={preview} />}
          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 12,
              background: 'rgba(255,77,94,0.10)', border: '0.5px solid rgba(255,77,94,0.32)',
              fontFamily: SF, fontSize: 12, color: BF_COLORS.coral, marginTop: 10,
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1, height: 50, borderRadius: 16, border: 'none',
              background: 'rgba(255,255,255,0.06)', color: BF_COLORS.text,
              fontFamily: SF, fontSize: 14, fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
            }}
          >cancel</button>
          <button
            onClick={confirm}
            disabled={busy || loading || !preview || preview.direction === 'even'}
            style={{
              flex: 2, height: 50, borderRadius: 16, border: 'none',
              background: busy || loading || !preview || preview.direction === 'even'
                ? 'rgba(255,255,255,0.10)'
                : BF_COLORS.lime,
              color: '#000',
              fontFamily: SFR, fontSize: 15, fontWeight: 800, letterSpacing: -0.2,
              cursor: busy || loading ? 'default' : 'pointer',
            }}
          >
            {busy ? 'settling…'
              : preview?.direction === 'even' ? 'already even'
              : preview ? `settle · €${preview.net_amount.replace('.', ',')}`
              : 'settle up'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{
      height: 64, borderRadius: 14, background: 'rgba(255,255,255,0.04)',
      animation: 'settlePulse 1.2s ease-in-out infinite',
    }}>
      <style>{`
        @keyframes settlePulse {
          0%, 100% { opacity: 0.6; }
          50%      { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function PreviewBlock({ preview }) {
  const dir = preview.direction
  const amt = `€${preview.net_amount.replace('.', ',')}`
  if (dir === 'even') {
    return (
      <div style={{
        padding: '12px 14px', borderRadius: 14,
        background: 'rgba(255,255,255,0.03)',
        fontFamily: SF, fontSize: 13.5, color: BF_COLORS.sub, lineHeight: 1.45,
      }}>
        nothing to settle — you're already even.
        {preview.open_count > 0 && ` (${preview.open_count} stale open request${preview.open_count === 1 ? '' : 's'} will be cleared.)`}
      </div>
    )
  }
  const verb = dir === 'incoming' ? 'they pay you' : 'you pay them'
  const tone = dir === 'incoming' ? BF_COLORS.green : BF_COLORS.coral
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 14,
      background: 'rgba(255,255,255,0.03)',
      border: `0.5px solid ${BF_COLORS.hairline}`,
    }}>
      <div style={{
        fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>{verb}</div>
      <div style={{
        fontFamily: SFR, fontSize: 32, fontWeight: 800, color: tone,
        letterSpacing: -0.6, marginTop: 4, lineHeight: 1,
      }}>{amt}</div>
      <div style={{
        fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, marginTop: 8,
      }}>
        nets <strong style={{ color: BF_COLORS.text, fontWeight: 700 }}>
          {preview.open_count} open request{preview.open_count === 1 ? '' : 's'}
        </strong>{' '}
        into one direct request. the rest get marked settled.
      </div>
    </div>
  )
}
