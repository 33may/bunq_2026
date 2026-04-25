import React from 'react'
import { BF_COLORS, SF, SFR, Avatar, Card, List, ListRow, Chat, SplitTracker } from './components'
import * as registry from './ai/pageContextRegistry'
import { log } from './ai/log'

// HOUSE — single source of truth used across mates / per-person views.
// In a real app this comes from the backend; for the prototype each mate
// also carries a small mocked transactions log + active-positions list so
// we can render the per-person screen without real data.
const NET = {
  // me's net per person (positive = they owe me, negative = i owe them)
  lena:  80.20,
  sam:  -42.60,
  alex: -12.40,
}

const HOUSE_MATES = [
  {
    id: 'lena', name: 'lena', initial: 'L', color: BF_COLORS.amber,
    last: { text: "i grabbed dish soap, added to the split", from: 'them', ago: '14m' },
    open: [
      // Each open position is a full item shape so tapping it can hand off to ItemPage.
      { id: 'r-cleaning', type: 'request', from: 'lena', fromColor: BF_COLORS.amber, ago: '14m',
        title: 'cleaning supplies', note: 'dm, mop + spray · split 4 ways', amt: 6.20, total: 24.80,
        emoji: '🧽', hasReceipt: false, message: 'grabbed a full set, splitting across the house',
        side: 'owe-them' },
      { id: 'p-rent', type: 'planned', days: 0, color: BF_COLORS.coral, emoji: '🏠',
        title: 'rent · may', sub: 'monthly · auto-pay 18:00', amt: 612.50,
        side: 'owe-them' },
    ],
    history: [
      { id: 't1', when: 'today',    kind: 'received', amount:  18.40, label: 'pizza night settle-up' },
      { id: 't2', when: 'apr 18',   kind: 'sent',     amount:  26.00, label: 'energy · mar share' },
      { id: 't3', when: 'apr 12',   kind: 'received', amount:   4.20, label: 'split adjust · paper goods' },
      { id: 't4', when: 'apr 03',   kind: 'sent',     amount: 612.50, label: 'rent · apr' },
    ],
  },
  {
    id: 'sam', name: 'sam', initial: 'S', color: BF_COLORS.pink,
    last: { text: "wanna do thai for dinner?", from: 'them', ago: '2h' },
    open: [
      { id: 'r-pizza', type: 'request', from: 'sam', fromColor: BF_COLORS.pink, ago: '2h',
        title: 'pizza night', note: 'four seasons · split 3 ways', amt: 8.50, total: 42.50,
        emoji: '🍕', hasReceipt: true,
        myItems: [
          { name: 'margherita', price: 12.50 },
          { name: 'diavola',    price: 14.00 },
          { name: 'sparkling water', price: 3.00 },
        ],
        message: 'grabbed yours when i went — pay whenever!',
        side: 'they-owe' },
    ],
    history: [
      { id: 's1', when: 'mon',     kind: 'received', amount:  8.50, label: 'pizza night your share' },
      { id: 's2', when: 'apr 10',  kind: 'sent',     amount: 22.00, label: 'beers · house party' },
      { id: 's3', when: 'mar 28',  kind: 'received', amount: 14.00, label: 'concert tickets' },
    ],
  },
  {
    id: 'alex', name: 'alex', initial: 'A', color: BF_COLORS.blue,
    last: { text: "you sent €18,00", from: 'me', ago: '5h' },
    open: [
      { id: 'r-uber', type: 'request', from: 'alex', fromColor: BF_COLORS.blue, ago: '5h',
        title: 'uber back from centraal', note: 'last night 🌙', amt: 18.00,
        emoji: '🚗', hasReceipt: false,
        message: 'for the uber back from centraal last night',
        side: 'they-owe' },
    ],
    history: [
      { id: 'a1', when: '5h',     kind: 'sent',     amount:  18.00, label: 'uber back from centraal' },
      { id: 'a2', when: 'apr 15', kind: 'received', amount:   5.20, label: 'paper goods share' },
      { id: 'a3', when: 'apr 02', kind: 'sent',     amount:  12.50, label: 'spotify · split 4 ways' },
    ],
  },
]

function fmtEuro(n) {
  return `€${Math.abs(n).toFixed(2).replace('.', ',')}`
}

// ─────────────────────────────────────────────────────────────────────
// MatesScreen — list of housemates, one row each, with last activity
// ─────────────────────────────────────────────────────────────────────
export function MatesScreen({ onOpenMate }) {
  const summary = HOUSE_MATES.reduce((acc, m) => {
    const n = NET[m.id] || 0
    acc.youOwe   += n < 0 ? -n : 0
    acc.youGet   += n > 0 ?  n : 0
    return acc
  }, { youOwe: 0, youGet: 0 })

  return (
    <div style={{ background: BF_COLORS.bg, minHeight: '100%', paddingTop: 62 }}>
      {/* greeting / overview */}
      <div style={{ padding: '10px 20px 18px' }}>
        <div style={{
          fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, fontWeight: 500,
        }}>
          house chat & ledgers
        </div>
        <div style={{
          fontFamily: SFR, fontSize: 26, fontWeight: 800, color: BF_COLORS.text,
          letterSpacing: -0.6, marginTop: 2,
        }}>
          mates
        </div>
      </div>

      {/* you owe / you get split panels */}
      <div style={{ padding: '0 20px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SummaryTile
          label="you owe"
          amount={summary.youOwe}
          color={BF_COLORS.coral}
        />
        <SummaryTile
          label="you're owed"
          amount={summary.youGet}
          color={BF_COLORS.green}
        />
      </div>

      {/* mates list */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, fontWeight: 600,
          letterSpacing: 0.5, textTransform: 'uppercase',
          padding: '0 4px 8px',
        }}>
          housemates
        </div>
        <List>
          {HOUSE_MATES.map(m => {
            const n = NET[m.id] || 0
            return (
              <ListRow
                key={m.id}
                onClick={() => onOpenMate?.(m)}
                leading={<Avatar initial={m.initial} color={m.color} size={42} />}
                title={m.name}
                sub={m.last ? (m.last.from === 'me' ? `you: ${m.last.text}` : m.last.text) : 'no messages yet'}
                titleAfter={
                  <span style={{
                    fontFamily: SF, fontSize: 11, color: BF_COLORS.ter,
                  }}>· {m.last?.ago}</span>
                }
                trailing={
                  <NetPill net={n} />
                }
              />
            )
          })}
        </List>
      </div>

      {/* spacer for absolutely-positioned root Dock */}
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
  if (net === 0) {
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
// MatePage — full sheet for one mate. Header + actions + open positions
//            + transactions + chat. Slides up like ItemPage.
// ─────────────────────────────────────────────────────────────────────
export function MatePage({ mate, open, onClose, onOpenItem }) {
  const [tab, setTab] = React.useState('chat') // 'chat' | 'history'
  const [thread, setThread] = React.useState([])

  // reset & seed thread when opening
  React.useEffect(() => {
    if (!open || !mate) return
    setTab('chat')
    setThread(mate.last
      ? [{ from: mate.last.from, text: mate.last.text, ago: mate.last.ago }]
      : [])
  }, [open, mate])

  React.useEffect(() => {
    if (!open || !mate) return
    registry.register('mate_detail', () => ({
      mate: { id: mate.id, name: mate.name },
      net_balance: mate.netBalance ?? null,
      recent_items: (mate.items || []).slice(0, 8).map(it => ({
        id: it.id, kind: it.type, title: it.title, amount: it.amount,
      })),
    }))
    return () => registry.unregister('mate_detail')
  }, [open, mate?.id])

  if (!mate) return null
  const net = NET[mate.id] || 0
  const peer = { name: mate.name, initial: mate.initial, color: mate.color }
  const positive = net > 0

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

      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', paddingBottom: 200 }}>
        {/* hero */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '6px 20px 20px', gap: 10,
        }}>
          <Avatar initial={mate.initial} color={mate.color} size={72} />
          <div style={{
            fontFamily: SFR, fontSize: 22, fontWeight: 800, color: BF_COLORS.text,
            letterSpacing: -0.4,
          }}>{mate.name}</div>
          <NetHero net={net} positive={positive} />
        </div>

        {/* quick actions — pay/remind + request (split lives elsewhere) */}
        <div style={{
          padding: '0 20px 20px',
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10,
        }}>
          <ActionTile color={BF_COLORS.green} label={positive ? 'remind' : 'pay'} icon={
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
              <path d="M11 4v14M4 11l7-7 7 7" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          } />
          <ActionTile color={BF_COLORS.amber} label="request" icon={
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
              <path d="M4 11h9M9 6l-5 5 5 5M14 4v14" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          } />
        </div>

        {/* open positions */}
        {mate.open && mate.open.length > 0 && (
          <div style={{ padding: '0 20px 20px' }}>
            <SectionHeader label={`open · ${mate.open.length}`} />
            <List>
              {mate.open.map(o => (
                <ListRow
                  key={o.id}
                  onClick={() => onOpenItem?.(o)}
                  leading={<KindGlyph kind={o.type} />}
                  title={o.title}
                  sub={o.type === 'planned' ? 'planned · monthly' : 'request'}
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
          </div>
        )}

        {/* tab switcher */}
        <div style={{ padding: '0 20px 8px' }}>
          <div style={{
            display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)',
            borderRadius: 12, padding: 3,
          }}>
            <TabPill active={tab === 'chat'}    onClick={() => setTab('chat')}    label="chat" />
            <TabPill active={tab === 'history'} onClick={() => setTab('history')} label="history" />
          </div>
        </div>

        {tab === 'chat' ? (
          <div style={{ padding: '8px 20px 0' }}>
            <Chat
              peer={peer}
              thread={thread}
              onSend={(text) => setThread(s => [...s, { from: 'me', text, ago: 'just now' }])}
              placeholder={`message ${mate.name}…`}
            />
          </div>
        ) : (
          <div style={{ padding: '8px 20px 0' }}>
            <List>
              {(mate.history || []).map(t => (
                <ListRow
                  key={t.id}
                  leading={<TxnGlyph kind={t.kind} />}
                  title={t.label}
                  sub={t.when}
                  trailing={
                    <span style={{
                      fontFamily: SFR, fontSize: 13, fontWeight: 800,
                      color: t.kind === 'received' ? BF_COLORS.green : BF_COLORS.text,
                      letterSpacing: -0.2,
                    }}>
                      {t.kind === 'received' ? '+' : '−'}{fmtEuro(t.amount)}
                    </span>
                  }
                />
              ))}
            </List>
          </div>
        )}
      </div>
    </div>
  )
}

function NetHero({ net, positive }) {
  if (net === 0) {
    return (
      <div style={{
        fontFamily: SFR, fontSize: 18, fontWeight: 700, color: BF_COLORS.sub,
        letterSpacing: -0.3,
      }}>all settled</div>
    )
  }
  const c = positive ? BF_COLORS.green : BF_COLORS.coral
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
      }}>
        {positive ? 'they owe you' : 'you owe them'}
      </div>
      <div style={{
        fontFamily: SFR, fontSize: 36, fontWeight: 800, color: c, letterSpacing: -1,
      }}>
        {positive ? '+' : '−'}{fmtEuro(net)}
      </div>
    </div>
  )
}

function ActionTile({ color, label, icon }) {
  return (
    <button style={{
      background: color, borderRadius: 18, border: 'none',
      padding: '14px 12px',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
      cursor: 'pointer',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: 'rgba(0,0,0,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</div>
      <div style={{
        fontFamily: SF, fontSize: 13, fontWeight: 700, color: '#000', letterSpacing: -0.1,
      }}>{label}</div>
    </button>
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

function TabPill({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, height: 32, borderRadius: 9, border: 'none',
      background: active ? BF_COLORS.text : 'transparent',
      color: active ? '#000' : BF_COLORS.sub,
      fontFamily: SF, fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
      cursor: 'pointer',
    }}>{label}</button>
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

function TxnGlyph({ kind }) {
  const sent = kind === 'sent'
  const c = sent ? BF_COLORS.coral : BF_COLORS.green
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 18,
      background: `${c}22`, border: `0.5px solid ${c}33`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{
        transform: sent ? 'rotate(0deg)' : 'rotate(180deg)',
      }}>
        <path d="M7 2v9M3 7l4 4 4-4" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}
