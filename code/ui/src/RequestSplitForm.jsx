import React from 'react'
import { BF_COLORS, SF, SFR, Avatar } from './components'
import { createRequest, createSplit } from './api.js'
import * as registry from './ai/pageContextRegistry'
import * as bus from './ai/pagePatchBus'
import { log } from './ai/log'

// RequestSplitForm — one full-screen sheet, two modes.
//
//   • mode="request" — you (implicit recipient) ask one person for money
//   • mode="split"   — pick a payer + the people who owe; equal split for now
//
// Same layout, only the people section differs. Slides up like ItemPage.
// Roster comes from /housemates; submit fires the bunq-backed endpoints.

const fmt = (cents) =>
  `€${Math.floor(cents / 100).toLocaleString('de-DE')},${String(cents % 100).padStart(2, '0')}`

// Map the backend `HousemateOut` shape to what this form needs.
function toRosterPerson(h) {
  return {
    id: h.id,
    name: h.name,
    color: h.color || BF_COLORS.green,
    initial: (h.name || '?').slice(0, 1).toUpperCase(),
    isMe: !!h.is_me,
  }
}

export function RequestSplitForm({ mode, open, onClose, onSubmit, housemates, prefill }) {
  // Roster: backend rows → form person shape. Empty while loading — submit is
  // disabled in that case (canSubmit gates on at least one selected id).
  const HOUSE = React.useMemo(
    () => (housemates || []).map(toRosterPerson),
    [housemates],
  );
  const me = HOUSE.find(p => p.isMe) || null;
  const myId = me?.id || null;
  // Always mounted while the slide-out animates. `mode` is the active mode.
  const safeMode = mode || 'request'
  const isRequest = safeMode === 'request'

  const [cents, setCents] = React.useState(0)
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  // request: single recipient (the person being asked)
  const [recipientId, setRecipientId] = React.useState(null)
  // split: payer + multi recipients (people who owe)
  const [payerId, setPayerId] = React.useState(myId)
  const [splitWith, setSplitWith] = React.useState([])
  // due date — defaults to 7 days from system today; native picker opens on tap
  const [dueDate, setDueDate] = React.useState(null)
  const [calOpen, setCalOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState(null)

  // reset when opening with a new mode. Defaults payer to "me" once the
  // roster has loaded (myId is null on first mount).
  React.useEffect(() => {
    if (!open) return
    setCents(0); setTitle(''); setDescription(''); setRecipientId(null)
    setPayerId(myId); setSplitWith([])
    setDueDate(null); setSubmitting(false); setErrorMsg(null)
  }, [open, mode, myId])

  // Store parent_post_id + source_scan_id from prefill so we can forward
  // them on submit. Refs (not state) — they don't drive any UI.
  const parentPostIdRef = React.useRef(null)
  const sourceScanIdRef = React.useRef(null)

  // Apply prefill once when the form opens (sparse merge — only overwrite
  // fields that are present in the prefill object).
  React.useEffect(() => {
    if (!open || !prefill) return
    parentPostIdRef.current = prefill.parent_post_id ?? null
    sourceScanIdRef.current = prefill.source_scan_id ?? null
    if (prefill.amount !== undefined)   setCents(Math.round(prefill.amount * 100))
    if (prefill.total !== undefined)    setCents(Math.round(prefill.total * 100))
    if (prefill.title !== undefined)    setTitle(prefill.title)
    if (prefill.description !== undefined) setDescription(prefill.description)
    // request mode: to_user_id → recipientId
    if (prefill.to_user_id !== undefined) setRecipientId(prefill.to_user_id)
    // split mode: payer_user_id → payerId, participant_user_ids → splitWith
    if (prefill.payer_user_id !== undefined) setPayerId(prefill.payer_user_id)
    if (prefill.participant_user_ids !== undefined) setSplitWith(prefill.participant_user_ids)
  }, [open])  // intentionally only on open — prefill is stable for a given open

  // Register page context while the form is open.
  React.useEffect(() => {
    if (!open) return
    registry.register('request_form', () => ({
      mode: safeMode,
      draft: {
        cents, title, description,
        recipientId, payerId, splitWith,
      },
    }))
    return () => registry.unregister('request_form')
  }, [open, safeMode, cents, title, description, recipientId, payerId, splitWith])

  // Subscribe to patch bus while open.
  React.useEffect(() => {
    if (!open) return
    return bus.on('request_form_fill', (payload) => {
      log.patchApply('request_form_fill', 'request_form', true)
      if (payload.total !== undefined)        setCents(Math.round(payload.total * 100))
      if (payload.amount !== undefined)       setCents(Math.round(payload.amount * 100))
      if (payload.title !== undefined)        setTitle(payload.title)
      if (payload.description !== undefined)  setDescription(payload.description)
      if (payload.payer_id !== undefined)     setPayerId(payload.payer_id)
      if (payload.debtors !== undefined)      setSplitWith(payload.debtors)
      if (payload.to_user_id !== undefined)   setRecipientId(payload.to_user_id)
    })
  }, [open])

  const append = (d) => setCents(c => Math.min(99999999, c * 10 + d))
  const back   = () => setCents(c => Math.floor(c / 10))

  const canSubmit = !submitting && (isRequest
    ? cents > 0 && recipientId
    : cents > 0 && splitWith.length > 0 && payerId)

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true); setErrorMsg(null)
    const amountEur = cents / 100
    const payload = {
      mode: safeMode,
      amount: amountEur,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      dueDate,
    }
    try {
      if (isRequest) {
        const res = await createRequest({
          to_user_id: recipientId,
          amount: amountEur,
          title: payload.title,
          description: payload.description,
          ...(sourceScanIdRef.current ? { source_scan_id: sourceScanIdRef.current } : {}),
        })
        onSubmit?.({ ...payload, recipient: recipientId, result: res })
      } else {
        const res = await createSplit({
          payer_user_id: payerId,
          participant_user_ids: splitWith,
          total: amountEur,
          title: payload.title,
          description: payload.description,
          ...(parentPostIdRef.current ? { parent_post_id: parentPostIdRef.current } : {}),
          ...(sourceScanIdRef.current ? { source_scan_id: sourceScanIdRef.current } : {}),
        })
        onSubmit?.({ ...payload, payer: payerId, splitWith, result: res })
      }
    } catch (err) {
      // api.js throws { status, body } on non-2xx — surface the backend detail
      const detail = err?.body?.detail || err?.message || 'failed to send'
      setErrorMsg(String(detail))
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 400,
      background: BF_COLORS.bg,
      transform: open ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* header */}
      <div style={{
        padding: '54px 16px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
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
          letterSpacing: -0.3, textTransform: 'lowercase',
        }}>
          {isRequest ? 'request' : 'split'}
        </div>
        <div style={{ width: 36 }} />
      </div>

      {/* scrollable upper area — amount + meta */}
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <Amount cents={cents} mode={safeMode} splitN={isRequest ? 1 : splitWith.length} />

        {/* name + due-date row, then description below */}
        <div style={{ padding: '8px 20px 12px', display: 'flex', gap: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isRequest ? 'name (e.g. rent)' : 'name (e.g. groceries)'}
            style={{
              flex: 1, minWidth: 0, height: 48, padding: '0 14px', borderRadius: 14,
              background: BF_COLORS.card, border: `0.5px solid ${BF_COLORS.hairline}`,
              color: BF_COLORS.text, fontFamily: SF, fontSize: 14, fontWeight: 600,
              letterSpacing: -0.1, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <DateButton value={dueDate} onOpen={() => setCalOpen(true)} />
        </div>
        <div style={{ padding: '0 20px 18px' }}>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="add a description"
            style={{
              width: '100%', height: 44, padding: '0 14px', borderRadius: 12,
              background: 'transparent',
              border: `0.5px solid ${BF_COLORS.hairline}`,
              color: BF_COLORS.text, fontFamily: SF, fontSize: 13,
              letterSpacing: -0.1, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* people */}
        {isRequest ? (
          <Section label="ask">
            <ChipRow
              people={HOUSE.filter(p => !p.isMe)}
              selectedIds={recipientId ? [recipientId] : []}
              onTap={(p) => setRecipientId(recipientId === p.id ? null : p.id)}
            />
          </Section>
        ) : (
          <>
            <Section label="paid by">
              <ChipRow
                people={HOUSE}
                selectedIds={payerId ? [payerId] : []}
                onTap={(p) => setPayerId(p.id)}
              />
            </Section>
            <Section label={`split with · ${splitWith.length} ${splitWith.length === 1 ? 'person' : 'people'}`}>
              <ChipRow
                people={HOUSE}
                selectedIds={splitWith}
                onTap={(p) => setSplitWith(s => s.includes(p.id) ? s.filter(id => id !== p.id) : [...s, p.id])}
              />
              {splitWith.length > 1 && cents > 0 && (
                <div style={{
                  marginTop: 12, fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, letterSpacing: -0.1,
                }}>
                  each owes <span style={{ color: BF_COLORS.lime, fontWeight: 700 }}>
                    {fmt(Math.round(cents / splitWith.length))}
                  </span>
                </div>
              )}
            </Section>
          </>
        )}
      </div>

      {/* bottom block — CTA above the numpad, numpad lifted ~10% off the bottom */}
      <div style={{
        flexShrink: 0,
        padding: '0 16px',
        paddingBottom: '10%',
        background: 'linear-gradient(to top, #000 65%, rgba(0,0,0,0))',
      }}>
        {errorMsg && (
          <div style={{
            marginBottom: 10, padding: '10px 12px', borderRadius: 12,
            background: 'rgba(255,77,94,0.1)',
            border: '0.5px solid rgba(255,77,94,0.32)',
            color: BF_COLORS.red,
            fontFamily: SF, fontSize: 12, letterSpacing: -0.1,
          }}>
            {errorMsg}
          </div>
        )}
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            width: '100%', height: 54, borderRadius: 27, border: 'none',
            background: canSubmit ? BF_COLORS.lime : 'rgba(255,255,255,0.08)',
            color: canSubmit ? '#000' : BF_COLORS.ter,
            fontFamily: SF, fontSize: 15, fontWeight: 700, letterSpacing: -0.2,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            marginBottom: 14,
          }}
        >
          {submitting
            ? (isRequest ? 'sending…' : 'sending split…')
            : `${isRequest ? 'request' : 'send split'} · ${fmt(cents)}`}
        </button>
        <Numpad onDigit={append} onBack={back} />
      </div>

      {calOpen && (
        <CalendarSheet
          value={dueDate}
          onChange={(d) => { setDueDate(d); setCalOpen(false) }}
          onClose={() => setCalOpen(false)}
        />
      )}
    </div>
  )
}

function Amount({ cents, mode, splitN }) {
  const main = fmt(cents)
  const showShare = mode === 'split' && splitN > 1 && cents > 0
  return (
    <div style={{
      padding: '14px 20px 8px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    }}>
      <div style={{
        fontFamily: SFR, fontSize: 56, fontWeight: 800,
        color: cents > 0 ? BF_COLORS.text : BF_COLORS.ter,
        letterSpacing: -2, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
      }}>{main}</div>
      <div style={{
        fontFamily: SF, fontSize: 12, color: BF_COLORS.sub,
        textTransform: 'uppercase', letterSpacing: 0.6,
      }}>
        {mode === 'request' ? 'they owe you' : showShare
          ? `${splitN} × ${fmt(Math.round(cents / splitN))}`
          : 'total'}
      </div>
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ padding: '0 20px 18px' }}>
      <div style={{
        fontFamily: SF, fontSize: 11, fontWeight: 600, color: BF_COLORS.sub,
        letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10, padding: '0 4px',
      }}>{label}</div>
      {children}
    </div>
  )
}

function ChipRow({ people, selectedIds, onTap }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {people.map(p => {
        const on = selectedIds.includes(p.id)
        return (
          <button key={p.id} onClick={() => onTap(p)} style={{
            height: 36, padding: '0 4px 0 10px', borderRadius: 18,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: on ? `${p.color}22` : 'rgba(255,255,255,0.04)',
            border: `0.5px solid ${on ? `${p.color}88` : BF_COLORS.hairline}`,
            color: on ? p.color : BF_COLORS.text,
            fontFamily: SF, fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
            cursor: 'pointer',
            transition: 'background 160ms ease, border-color 160ms ease, color 160ms ease',
          }}>
            {p.name}{p.isMe && <span style={{ opacity: 0.6, fontWeight: 500 }}>·you</span>}
            <Avatar initial={p.initial} color={p.color} size={26} />
          </button>
        )
      })}
    </div>
  )
}

// ── date helpers ───────────────────────────────────────────────────
// `new Date()` reads the user's actual current date — the labels below
// derive everything from that, so "today" is genuinely today.
function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function dateLabel(value) {
  if (!value) return '—'
  const today = new Date()
  const todayY = ymd(today)
  if (value === todayY) return 'today'

  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const [y, m, d] = value.split('-').map(Number)
  const v = new Date(y, m - 1, d)
  const days = Math.round((v - t) / 86400000)
  if (days === 1) return 'tomorrow'
  if (days >= 2 && days <= 6) return `in ${days}d`
  if (days === -1) return 'yesterday'
  if (days < -1 && days >= -6) return `${-days}d ago`
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
  return `${d} ${months[m - 1]}`
}

function DateButton({ value, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{
        flexShrink: 0,
        height: 48, padding: '0 14px', borderRadius: 14,
        background: BF_COLORS.card, border: `0.5px solid ${BF_COLORS.hairline}`,
        color: BF_COLORS.text, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontFamily: SF, fontSize: 13, fontWeight: 600, letterSpacing: -0.1,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="11" rx="2" stroke="#fff" strokeWidth="1.4"/>
        <path d="M2 6h12" stroke="#fff" strokeWidth="1.4"/>
        <path d="M5 1.5v3M11 1.5v3" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
      <span style={{ color: BF_COLORS.sub }}>due</span>
      <span>{dateLabel(value)}</span>
    </button>
  )
}

// ── CalendarSheet — bottom-sheet calendar; tap outside (dim) to close ──
function CalendarSheet({ value, onChange, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end',
        animation: 'calFade 200ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: BF_COLORS.cardElev,
          borderRadius: '24px 24px 0 0',
          padding: '12px 16px 28px',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
          animation: 'calSlideUp 260ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div style={{
          width: 38, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.18)',
          margin: '0 auto 14px',
        }} />
        <CalendarGrid value={value} onChange={onChange} onClear={() => onChange(null)} />
      </div>
      <style>{`
        @keyframes calFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes calSlideUp {
          from { transform: translateY(100%) }
          to   { transform: translateY(0) }
        }
      `}</style>
    </div>
  )
}

function CalendarGrid({ value, onChange, onClear }) {
  const today = new Date()
  const todayY = ymd(today)
  const todayBoundary = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()

  // current visible month, anchored to selected value when present
  const [view, setView] = React.useState(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number)
      return new Date(y, m - 1, 1)
    }
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })

  const year = view.getFullYear()
  const m = view.getMonth()
  const monthName = ['january','february','march','april','may','june','july','august','september','october','november','december'][m]
  const daysInMonth = new Date(year, m + 1, 0).getDate()
  // Mon-first weekday index
  const startOffset = (new Date(year, m, 1).getDay() + 6) % 7

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const goPrev = () => setView(new Date(year, m - 1, 1))
  const goNext = () => setView(new Date(year, m + 1, 1))

  return (
    <div>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, padding: '0 4px',
      }}>
        <div style={{
          fontFamily: SFR, fontSize: 18, fontWeight: 800, color: BF_COLORS.text,
          letterSpacing: -0.4,
        }}>
          {monthName} <span style={{ color: BF_COLORS.sub, fontWeight: 600 }}>{year}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {value && (
            <button
              onClick={onClear}
              style={{
                height: 28, padding: '0 10px', borderRadius: 14,
                background: 'rgba(255,77,94,0.12)',
                border: '0.5px solid rgba(255,77,94,0.32)',
                color: BF_COLORS.red, cursor: 'pointer',
                fontFamily: SF, fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
                marginRight: 4,
              }}
            >clear</button>
          )}
          <NavBtn onClick={goPrev} dir="prev" />
          <NavBtn onClick={goNext} dir="next" />
        </div>
      </div>

      {/* weekday header */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4,
        marginBottom: 6,
      }}>
        {['mo','tu','we','th','fr','sa','su'].map((w, i) => (
          <div key={i} style={{
            textAlign: 'center', fontFamily: SF, fontSize: 11, fontWeight: 600,
            color: BF_COLORS.ter, letterSpacing: 0.4, textTransform: 'lowercase',
            paddingBottom: 4,
          }}>{w}</div>
        ))}
      </div>

      {/* day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (d == null) return <div key={i} style={{ height: 38 }} />
          const iso = ymd(new Date(year, m, d))
          const cellTime = new Date(year, m, d).getTime()
          const isPast = cellTime < todayBoundary
          const isToday = iso === todayY
          const isSelected = iso === value
          return (
            <button
              key={i}
              onClick={() => !isPast && onChange(iso)}
              disabled={isPast}
              style={{
                height: 38, borderRadius: 12, border: 'none',
                background: isSelected ? BF_COLORS.lime
                  : isToday ? 'rgba(184,240,74,0.10)' : 'transparent',
                color: isSelected ? '#000'
                  : isPast ? BF_COLORS.ter
                  : isToday ? BF_COLORS.lime
                  : BF_COLORS.text,
                fontFamily: SFR, fontSize: 14,
                fontWeight: isSelected || isToday ? 800 : 600,
                letterSpacing: -0.2,
                cursor: isPast ? 'not-allowed' : 'pointer',
                opacity: isPast ? 0.4 : 1,
                transition: 'background 140ms ease',
              }}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NavBtn({ onClick, dir }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 36, height: 32, borderRadius: 10,
        background: 'rgba(255,255,255,0.05)',
        border: `0.5px solid ${BF_COLORS.hairline}`,
        color: BF_COLORS.text, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg width="10" height="14" viewBox="0 0 10 14" fill="none" style={{
        transform: dir === 'prev' ? 'none' : 'scaleX(-1)',
      }}>
        <path d="M8 1L2 7l6 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

function Numpad({ onDigit, onBack }) {
  const Key = ({ children, onClick, ariaLabel }) => (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        height: 56, borderRadius: 16,
        background: 'rgba(255,255,255,0.04)',
        border: `0.5px solid ${BF_COLORS.hairline}`,
        color: BF_COLORS.text,
        fontFamily: SFR, fontSize: 22, fontWeight: 700, letterSpacing: -0.5,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
  return (
    <div style={{
      padding: '12px 20px 8px',
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
    }}>
      {[1,2,3,4,5,6,7,8,9].map(d => (
        <Key key={d} onClick={() => onDigit(d)} ariaLabel={`digit ${d}`}>{d}</Key>
      ))}
      <div />
      <Key onClick={() => onDigit(0)} ariaLabel="digit 0">0</Key>
      <Key onClick={onBack} ariaLabel="backspace">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M7 5L2 11l5 6h12a2 2 0 002-2V7a2 2 0 00-2-2H7z" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
          <path d="M11 9l5 4M16 9l-5 4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      </Key>
    </div>
  )
}
