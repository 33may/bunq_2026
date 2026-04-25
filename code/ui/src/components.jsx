import React from 'react'
import { BF_COLORS, SF, SFR } from './tokens'
export { BF_COLORS, SF, SFR }

// ── timeLabel — relative day → label (today / tomorrow / in N days / 22 apr) ─
export function timeLabel(offsetDays) {
  if (offsetDays === 0) return 'today';
  if (offsetDays === 1) return 'tomorrow';
  if (offsetDays >= 2 && offsetDays <= 5) return `in ${offsetDays} days`;
  const base = new Date(2025, 3, 22);
  base.setDate(base.getDate() + offsetDays);
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  return `${base.getDate()} ${months[base.getMonth()]}`;
}

// ── Avatar ─────────────────────────────────────────────────────────
export function Avatar({ initial, color, size = 28, border = false, ring }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, color: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: SFR, fontSize: size * 0.42, fontWeight: 800,
      border: border ? `2px solid ${BF_COLORS.bg}` : 'none',
      boxShadow: ring ? `0 0 0 2px ${ring}` : 'none',
      flexShrink: 0,
    }}>{initial}</div>
  );
}

// ── Euro amount with split fraction ────────────────────────────────
export function Euro({ amount, big = 28, small = 16, color = '#fff', weight = 800, dim = true }) {
  const neg = amount < 0;
  const [i, d] = Math.abs(amount).toFixed(2).split('.');
  return (
    <span style={{ fontFamily: SFR, color, fontWeight: weight, letterSpacing: -0.5, lineHeight: 1 }}>
      <span style={{ fontSize: big }}>{neg ? '−' : ''}€{Number(i).toLocaleString('de-DE')}</span>
      <span style={{ fontSize: small, opacity: dim ? 0.55 : 1, marginLeft: 1 }}>,{d}</span>
    </span>
  );
}

// ── Chip ───────────────────────────────────────────────────────────
export function Chip({ label, color, bg = 'rgba(255,255,255,0.08)', dot = true }) {
  return (
    <div style={{
      height: 22, padding: '0 9px', borderRadius: 11,
      background: bg, display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: SF, fontSize: 11, fontWeight: 700, color,
      letterSpacing: 0.2, textTransform: 'lowercase',
    }}>
      {dot && <div style={{ width: 6, height: 6, borderRadius: 3, background: color }} />}
      {label}
    </div>
  );
}

// ── Card — dark rounded container with optional left accent stripe ─
export function Card({ children, accent, padding = 16, radius = 22, hairline = true, style, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: BF_COLORS.card, borderRadius: radius, padding,
      position: 'relative', overflow: 'hidden',
      border: hairline ? `0.5px solid ${BF_COLORS.hairline}` : 'none',
      cursor: onClick ? 'pointer' : 'default',
      ...style,
    }}>
      {accent && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: accent }} />
      )}
      {children}
    </div>
  );
}

// ── List — bordered grouped container of ListRow children ──────────
export function List({ children, radius = 20, style }) {
  const arr = React.Children.toArray(children);
  return (
    <div style={{ background: BF_COLORS.card, borderRadius: radius, overflow: 'hidden', ...style }}>
      {arr.map((c, i) =>
        React.isValidElement(c)
          ? React.cloneElement(c, { _divider: i < arr.length - 1, key: c.key ?? i })
          : c
      )}
    </div>
  );
}

// ── ListRow — leading | (title + sub) | trailing ───────────────────
export function ListRow({ leading, title, sub, titleAfter, trailing, onClick, _divider = false }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      borderBottom: _divider ? `1px solid ${BF_COLORS.hairline}` : 'none',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {leading && <div style={{ flexShrink: 0 }}>{leading}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontFamily: SF, fontSize: 15, fontWeight: 600, color: BF_COLORS.text,
            letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{title}</span>
          {titleAfter}
        </div>
        {sub && (
          <div style={{
            fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{sub}</div>
        )}
      </div>
      {trailing != null && <div style={{ flexShrink: 0 }}>{trailing}</div>}
    </div>
  );
}

// ── Chat — direct chat thread between you and one other person ──────
// Reusable shell. Caller owns the message list + onSend.
//   peer: { name, initial, color }
//   me:   { name, initial, color }   (defaults to a generic "me")
//   thread: [{ from: 'me'|'them', text, ago }]
//   onSend(text): append a new message
export function Chat({ peer, me, thread, onSend, placeholder, compact = false }) {
  const meActor = me || { name: 'me', initial: 'M', color: BF_COLORS.green }
  const [draft, setDraft] = React.useState('')
  const submit = () => {
    const t = draft.trim()
    if (!t) return
    onSend?.(t)
    setDraft('')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {thread.length === 0 && (
        <div style={{
          fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, letterSpacing: -0.1,
          padding: '6px 2px',
        }}>
          no messages yet — drop them a line.
        </div>
      )}
      {thread.map((m, i) => {
        const mine = m.from === 'me'
        const who = mine ? meActor : peer
        return (
          <div key={i} style={{
            display: 'flex', flexDirection: mine ? 'row-reverse' : 'row',
            alignItems: 'flex-end', gap: 8,
          }}>
            <Avatar initial={who.initial} color={who.color} size={compact ? 24 : 26} />
            <div style={{ maxWidth: '75%' }}>
              <div style={{
                padding: '8px 12px',
                borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: mine ? 'rgba(184,240,74,0.14)' : 'rgba(255,255,255,0.05)',
                border: mine
                  ? '0.5px solid rgba(184,240,74,0.28)'
                  : `0.5px solid ${BF_COLORS.hairline}`,
                color: BF_COLORS.text,
                fontFamily: SF, fontSize: 13.5, lineHeight: 1.4, letterSpacing: -0.1,
              }}>
                {m.text}
              </div>
              <div style={{
                fontFamily: SF, fontSize: 10.5, color: BF_COLORS.ter,
                marginTop: 3, padding: '0 6px',
                textAlign: mine ? 'right' : 'left',
              }}>
                {m.ago}
              </div>
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder={placeholder || `message ${peer?.name || ''}…`}
          style={{
            flex: 1, height: 40, padding: '0 14px', borderRadius: 20,
            background: 'rgba(255,255,255,0.04)',
            border: `0.5px solid ${BF_COLORS.hairline}`,
            color: BF_COLORS.text, outline: 'none',
            fontFamily: SF, fontSize: 13.5, letterSpacing: -0.1,
          }}
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          style={{
            width: 40, height: 40, borderRadius: 20, border: 'none',
            background: draft.trim() ? BF_COLORS.lime : 'rgba(255,255,255,0.08)',
            color: '#000', cursor: draft.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 12V2M3 6l4-4 4 4" stroke={draft.trim() ? '#000' : 'rgba(255,255,255,0.3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── SplitTracker — segmented bar + per-person paid/pending rows ─────
// Used wherever an item is split across multiple housemates: planned
// items, requests with a shared receipt, completed bills, etc.
//
// `members`: [{ name, initial, color, paid, isMe }]
// `perPerson`: amount each person owes (€)
// `total`: full amount (€)
// `label`: section label (defaults to "split")
export function SplitTracker({ members, perPerson, total, label = 'split' }) {
  const paidCount = members.filter(m => m.paid).length
  return (
    <div style={{ padding: '0 16px 20px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 4px 8px',
      }}>
        <div style={{
          fontFamily: SF, fontSize: 12, fontWeight: 600, color: BF_COLORS.sub,
          textTransform: 'uppercase', letterSpacing: 0.8,
        }}>
          {label} · {paidCount}/{members.length} paid
        </div>
        <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub }}>
          total €{total.toFixed(2).replace('.', ',')}
        </div>
      </div>
      <div style={{
        background: BF_COLORS.card, borderRadius: 20, overflow: 'hidden',
        border: `0.5px solid ${BF_COLORS.hairline}`,
      }}>
        {/* segmented bar — paid = solid, pending = dim with dashed border */}
        <div style={{ padding: '14px 14px 10px' }}>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
            {members.map((p, i) => (
              <div key={i} style={{
                flex: 1,
                background: p.paid ? p.color : `${p.color}33`,
                border: p.paid ? 'none' : `1px dashed ${p.color}66`,
                boxSizing: 'border-box',
              }} />
            ))}
          </div>
        </div>
        {/* per-person rows */}
        <div>
          {members.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px',
              borderTop: `1px solid ${BF_COLORS.hairline}`,
            }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Avatar initial={p.initial} color={p.color} size={28} />
                {p.paid && (
                  <div style={{
                    position: 'absolute', bottom: -2, right: -2,
                    width: 14, height: 14, borderRadius: 7,
                    background: BF_COLORS.green,
                    border: `2px solid ${BF_COLORS.card}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                      <path d="M1 3.5l1.5 1.5L6 1.5" stroke="#000" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: SF, fontSize: 14, fontWeight: 600, color: BF_COLORS.text,
                  letterSpacing: -0.1, display: 'flex', alignItems: 'center', gap: 6,
                  flexWrap: 'wrap',
                }}>
                  <span>
                    {p.name}{p.isMe && <span style={{ color: BF_COLORS.sub, fontWeight: 500 }}> · you</span>}
                  </span>
                  {p.isPayer && (
                    <span style={{
                      padding: '1px 7px', borderRadius: 7,
                      background: 'rgba(184,240,74,0.16)',
                      color: BF_COLORS.lime,
                      fontFamily: SF, fontSize: 10, fontWeight: 800,
                      letterSpacing: 0.3, textTransform: 'uppercase', lineHeight: 1.4,
                    }}>paid bill</span>
                  )}
                </div>
                <div style={{
                  fontFamily: SF, fontSize: 11, fontWeight: 500,
                  color: (p.isPayer || p.paid) ? BF_COLORS.green : BF_COLORS.ter,
                  marginTop: 1, letterSpacing: 0.1,
                }}>
                  {p.isPayer ? `fronted €${total.toFixed(2).replace('.', ',')}` : (p.paid ? 'paid' : (p.isMe ? 'your share' : 'pending'))}
                </div>
              </div>
              <div style={{
                fontFamily: SFR, fontSize: 14, fontWeight: 700,
                color: p.paid ? BF_COLORS.ter : BF_COLORS.text,
                letterSpacing: -0.2,
                textDecoration: p.paid ? 'line-through' : 'none',
                textDecorationColor: p.paid ? BF_COLORS.ter : undefined,
              }}>
                €{perPerson.toFixed(2).replace('.', ',')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── ExpenseCard — shared card for requests / spawned splits ────────
// Header row: avatar + "name verb" + ago + amount on the right.
// Inline preview row: emoji + title + note.
// Optional accept / decline footer.
// Whole card tappable via onClick (action buttons stopPropagation).
export function ExpenseCard({
  from,             // { name, color }
  verb = 'requested',
  ago,
  amount,
  emoji,
  title,
  note,
  onClick,
  onAccept,
  onDecline,
  showActions = true,
}) {
  const agoLabel = !ago ? null
    : (ago === 'yesterday' || ago === 'today' || ago.includes('ago'))
      ? ago : `${ago} ago`;
  return (
    <Card radius={20} padding="14px 14px 12px" hairline={false} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar initial={from.name[0].toUpperCase()} color={from.color} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SF, fontSize: 14, color: BF_COLORS.text, letterSpacing: -0.1 }}>
            <span style={{ fontWeight: 700 }}>{from.name}</span>
            <span style={{ color: BF_COLORS.sub, fontWeight: 500 }}> {verb}</span>
          </div>
          {agoLabel && (
            <div style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, marginTop: 1 }}>
              {agoLabel}
            </div>
          )}
        </div>
        <div style={{
          flexShrink: 0, fontFamily: SFR, fontSize: 18, fontWeight: 800,
          color: BF_COLORS.text, letterSpacing: -0.3, whiteSpace: 'nowrap',
        }}>
          €{amount.toFixed(2).replace('.', ',')}
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginTop: 12, padding: '10px 12px',
        background: 'rgba(255,255,255,0.04)', borderRadius: 14,
      }}>
        <div style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: SF, fontSize: 14, fontWeight: 600, color: BF_COLORS.text,
            letterSpacing: -0.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{title}</div>
          <div style={{
            fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{note}</div>
        </div>
      </div>
      {showActions && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <div
            onClick={(e) => { e.stopPropagation(); onAccept?.(); }}
            style={{
              flex: 1, height: 38, borderRadius: 12, background: BF_COLORS.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: SF, fontSize: 14, fontWeight: 700, color: '#000', letterSpacing: -0.1,
              cursor: 'pointer',
            }}
          >accept</div>
          <div
            onClick={(e) => { e.stopPropagation(); onDecline?.(); }}
            style={{
              flex: 1, height: 38, borderRadius: 12,
              background: 'rgba(255,255,255,0.06)',
              border: `0.5px solid ${BF_COLORS.hairline}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: SF, fontSize: 14, fontWeight: 600, color: BF_COLORS.sub, letterSpacing: -0.1,
              cursor: 'pointer',
            }}
          >decline</div>
        </div>
      )}
    </Card>
  );
}

// ── Post — feed thread starter card (avatar header + body + reply footer)
// Tappable card; opens its thread page via onClick. Attachment slot below
// body for inline scan / split / poll / event renders.
export function Post({
  author,
  time,
  text,
  attachment,
  replyCount = 0,
  replyAvatars = [],
  lastActivity,
  onClick,
  accent,
}) {
  const hasFooter = replyCount > 0 || lastActivity || replyAvatars.length > 0;
  return (
    <Card onClick={onClick} accent={accent} padding={16} radius={22}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Avatar initial={author.initial} color={author.color} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
            <span style={{
              fontFamily: SFR, fontSize: 15, fontWeight: 700,
              color: BF_COLORS.text, letterSpacing: -0.2,
            }}>{author.name}</span>
            <span style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.sub }}>· {time}</span>
          </div>
          <div style={{
            fontFamily: SF, fontSize: 14.5, fontWeight: 400,
            color: BF_COLORS.text, letterSpacing: -0.1, lineHeight: 1.45,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {text}
          </div>
          {attachment && <div style={{ marginTop: 12 }}>{attachment}</div>}
          {hasFooter && (
            <div style={{
              marginTop: 14, paddingTop: 12,
              borderTop: `1px solid ${BF_COLORS.hairline}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M3 4a2 2 0 012-2h4a2 2 0 012 2v3a2 2 0 01-2 2H6.5L4 11V9a2 2 0 01-1-2V4z"
                    stroke={BF_COLORS.sub} strokeWidth="1.3" strokeLinejoin="round"
                  />
                </svg>
                <span style={{
                  fontFamily: SF, fontSize: 12.5, fontWeight: 600, color: BF_COLORS.sub,
                }}>{replyCount}</span>
              </div>
              {replyAvatars.length > 0 && (
                <div style={{ display: 'flex' }}>
                  {replyAvatars.slice(0, 3).map((a, i) => (
                    <div key={i} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                      <Avatar initial={a.initial} color={a.color} size={20} border />
                    </div>
                  ))}
                </div>
              )}
              {lastActivity && (
                <span style={{
                  marginLeft: 'auto', fontFamily: SF, fontSize: 12, color: BF_COLORS.sub,
                }}>{lastActivity}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── AIBadge — lime-gradient sparkle tile ───────────────────────────
export function AIBadge({ size = 36, radius = 12 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: 'linear-gradient(135deg, #B8F04A, #00D26A)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 18 18" fill="none">
        <path d="M9 2l1.8 4.7L15.5 8l-4.7 1.3L9 14l-1.8-4.7L2.5 8l4.7-1.3L9 2z" fill="#000"/>
      </svg>
    </div>
  );
}

// ── AIPlan — AI-authored card: badge + headline + sub + actions ────
export function AIPlan({ headline, sub, primary, secondary, accent = true, compact = false, bare = false }) {
  const Inner = (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <AIBadge size={compact ? 26 : 36} radius={compact ? 8 : 12} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: SFR, fontSize: compact ? 14 : 17, fontWeight: 700, color: BF_COLORS.text,
            letterSpacing: -0.3, lineHeight: 1.25,
          }}>{headline}</div>
          {sub && (
            <div style={{
              fontFamily: SF, fontSize: compact ? 12 : 13, color: BF_COLORS.sub,
              marginTop: 4, lineHeight: 1.35,
            }}>{sub}</div>
          )}
        </div>
      </div>
      {(primary || secondary) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {primary && (
            <div onClick={primary.onClick} style={{
              flex: 1, height: 38, borderRadius: 19, background: primary.color || BF_COLORS.green,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: SF, fontSize: 14, fontWeight: 700, color: '#000', letterSpacing: -0.1,
              cursor: 'pointer',
            }}>{primary.label}</div>
          )}
          {secondary && (
            <div onClick={secondary.onClick} style={{
              width: 38, height: 38, borderRadius: 19, background: BF_COLORS.cardHi,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16">
                <path d="M4 6l4 4 4-4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
        </div>
      )}
    </>
  );
  if (bare) return Inner;
  return (
    <Card accent={accent ? BF_COLORS.lime : undefined} radius={compact ? 16 : 22} padding={compact ? 12 : 16}>
      {Inner}
    </Card>
  );
}

// ── AIPreview — small "tail of conversation" pill above the ChatBar ──
// Renders one of three states:
//   • thinking — three lime dots, low-key
//   • streaming — the partial AI text with a blinking caret
//   • done — the full message, optionally with a single trailing action button
// Tapping the body dispatches `bunq:ai-toggle` so the user can jump into the
// full AIWindow to see history.
export function AIPreview({ tail }) {
  if (!tail) return null
  const open = () => window.dispatchEvent(new Event('bunq:ai-toggle'))
  return (
    <div
      onClick={open}
      style={{
        // Pops out above the ChatBar's text-input zone: narrow, fully rounded,
        // small gap to the dock so it reads as a separate floating bubble.
        position: 'relative',
        margin: '0 30px 5px',
        padding: '16px 16px 18px',
        borderRadius: '22px 22px 11px 11px',
        overflow: 'hidden',
        // Middle ground: dark-tinted bg dims the content behind enough that
        // a small blur won't bleed bright pixels past the rounded clip.
        // No `saturate()` — that's what amplified the halo before.
        // `isolation` pins the stacking context, `translateZ(0)` forces a
        // GPU layer so the blur is composited cleanly inside the rounded box.
        background: 'rgba(20,20,24,0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        isolation: 'isolate',
        transform: 'translateZ(0)',
        border: '0.5px solid rgba(255,255,255,0.08)',
        boxShadow:
          '0 6px 14px rgba(0,0,0,0.28), inset 0 0.5px 0 rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', gap: 12,
        cursor: 'pointer',
        animation: 'aiPreviewIn 220ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <AIBadge size={26} radius={9} />
        <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
          {tail.kind === 'thinking' ? (
            <AIThinkingDots />
          ) : (
            <div style={{
              fontFamily: SF, fontSize: 13.5, lineHeight: 1.45,
              color: BF_COLORS.text, letterSpacing: -0.1,
              display: '-webkit-box', WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {tail.text}
              {tail.kind === 'streaming' && (
                <span style={{
                  display: 'inline-block', width: 7, height: 14,
                  marginLeft: 2, verticalAlign: '-2px',
                  background: BF_COLORS.lime, borderRadius: 1.5,
                  animation: 'aiCaret 900ms steps(2) infinite',
                }} />
              )}
            </div>
          )}
        </div>
        {/* simple inline button — only when there's no rich preview attached */}
        {tail.kind === 'done' && tail.action && !tail.action.preview && (
          <button
            onClick={(e) => { e.stopPropagation(); tail.action.onClick?.() }}
            style={{
              flexShrink: 0, alignSelf: 'center',
              height: 30, padding: '0 12px', borderRadius: 15,
              background: BF_COLORS.lime, color: '#000', border: 'none',
              fontFamily: SF, fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
              cursor: 'pointer',
            }}
          >
            {tail.action.label}
          </button>
        )}
      </div>

      {/* rich preview card — what the AI prepared, with a clear review CTA */}
      {tail.kind === 'done' && tail.action?.preview && (
        <AIActionCard action={tail.action} />
      )}

      <style>{`
        @keyframes aiPreviewIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes aiCaret { 50% { opacity: 0; } }
        @keyframes aiDot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40%           { opacity: 1;    transform: translateY(-2px); }
        }
      `}</style>
    </div>
  )
}

// Renders a richer "what the AI prepared" card inside the preview.
// Each `action.preview.kind` gets its own visual.
export function AIActionCard({ action }) {
  const p = action.preview || {}
  const onClick = (e) => { e.stopPropagation(); action.onClick?.() }

  if (p.kind === 'request') {
    return (
      <CardRow
        title={action.summary || 'request'}
        amount={p.amount}
        cta={action.label || 'review'}
        onClick={onClick}
      />
    )
  }

  if (p.kind === 'split') {
    return (
      <CardRow
        title={action.summary || `split €${Number(p.total).toFixed(2)}`}
        sub={`${(p.participant_user_ids || []).length} people`}
        cta={action.label || 'review split'}
        onClick={onClick}
      />
    )
  }

  if (p.kind === 'pay_request') {
    return (
      <CardRow
        title={action.summary || 'pay request'}
        cta={action.label || 'open'}
        onClick={onClick}
      />
    )
  }

  if (p.kind === 'scan') {
    return (
      <CardRow
        title={action.summary || 'scan a receipt'}
        cta={action.label || 'open camera'}
        onClick={onClick}
      />
    )
  }

  // generic fallback
  return (
    <button onClick={onClick} style={{
      height: 38, borderRadius: 19, border: 'none',
      background: BF_COLORS.lime, color: '#000',
      fontFamily: SF, fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
      cursor: 'pointer',
    }}>{action.label || 'open'}</button>
  )
}

function CardRow({ title, sub, amount, cta, onClick }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '0.5px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: 10,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: SF, fontSize: 13, fontWeight: 600, color: BF_COLORS.text,
          letterSpacing: -0.1, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{title}</div>
        {sub && <div style={{
          fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, marginTop: 2,
        }}>{sub}</div>}
        {amount != null && (
          <div style={{
            fontFamily: SFR, fontSize: 15, fontWeight: 800, color: BF_COLORS.lime,
            letterSpacing: -0.3, marginTop: 2,
          }}>€{Number(amount).toFixed(2).replace('.', ',')}</div>
        )}
      </div>
      <button onClick={onClick} style={{
        flexShrink: 0, height: 36, padding: '0 14px', borderRadius: 18,
        background: BF_COLORS.lime, color: '#000', border: 'none',
        fontFamily: SF, fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
        cursor: 'pointer',
      }}>{cta}</button>
    </div>
  )
}

function AIThinkingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: 18 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: 3, background: BF_COLORS.lime,
          animation: `aiDot 1.1s ease-in-out ${i * 0.14}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ── AIPreviewShowTab — wide chevron-up tab above the ChatBar ─────────
// Only rendered when there's a hidden preview to restore. Mirrors the
// down-chevron on the preview itself, so it reads as the same affordance.
export function AIPreviewShowTab({ onClick }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', marginBottom: 4,
    }}>
      <button
        onClick={onClick}
        aria-label="show preview"
        style={{
          width: 64, height: 18, borderRadius: '9px 9px 9px 9px',
          background: 'rgba(20,20,24,0.72)',
          border: '0.5px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0,
        }}
      >
        <svg width="22" height="9" viewBox="0 0 22 9" fill="none">
          <path d="M2 7l9-5 9 5" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}

// ── ChatBar — glassy AI input pill ───────────────────────────────────
// Three independent zones:
//   • leading arrow — taps `bunq:ai-toggle` to open/close the AIWindow.
//                     Rotates 180° when `aiOpen` so it reads as a close affordance.
//   • text input   — typing here does NOT open the window. Enter or the trailing
//                     send button dispatches `bunq:ai-send` with the text.
//   • trailing icon — mic when empty; lime send-arrow when there's text.
// Both events are global so the app root can react without prop-drilling.
export function ChatBar({ placeholder = 'ask, or split a receipt…', aiOpen = false }) {
  const [value, setValue] = React.useState('')
  const [listening, setListening] = React.useState(false)
  const [transcribing, setTranscribing] = React.useState(false)
  const recorderRef = React.useRef(null)
  const chunksRef = React.useRef([])
  const streamRef = React.useRef(null)
  const hasText = value.trim().length > 0

  const toggleAi = () => window.dispatchEvent(new Event('bunq:ai-toggle'))
  const send = () => {
    const text = value.trim()
    if (!text) return
    window.dispatchEvent(new CustomEvent('bunq:ai-send', { detail: { text } }))
    setValue('')
  }

  // Pick the best mime type this browser supports. Whisper accepts webm/mp4/m4a/wav/ogg.
  const pickMimeType = () => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',      // Safari
      'audio/ogg;codecs=opus',
    ]
    const MR = typeof window !== 'undefined' && window.MediaRecorder
    if (!MR) return ''
    return candidates.find(t => MR.isTypeSupported?.(t)) || ''
  }

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const startListening = async () => {
    if (listening || transcribing) return
    try {
      console.log('[mic] requesting user media…')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      console.log('[mic] picked mimeType:', mimeType || '(browser default)')
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      console.log('[mic] MediaRecorder created — rec.mimeType=', rec.mimeType, 'state=', rec.state)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data?.size) {
          chunksRef.current.push(e.data)
          console.log('[mic] chunk', chunksRef.current.length, 'size=', e.data.size, 'type=', e.data.type)
        }
      }
      rec.onerror = (e) => console.warn('[mic] recorder error', e)
      rec.onstop = async () => {
        console.log('[mic] onstop — chunks=', chunksRef.current.length)
        stopTracks()
        const type = rec.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        chunksRef.current = []
        console.log('[mic] blob size=', blob.size, 'type=', blob.type)
        if (blob.size === 0) {
          console.warn('[mic] empty blob — nothing to send')
          return
        }
        const ext = type.includes('mp4') ? 'm4a'
                  : type.includes('ogg') ? 'ogg'
                  : 'webm'
        const filename = `clip.${ext}`
        setTranscribing(true)
        const t0 = performance.now()
        try {
          const fd = new FormData()
          fd.append('audio', blob, filename)
          console.log('[transcribe] POST /transcribe — filename=', filename, 'bytes=', blob.size)
          const res = await fetch('/transcribe', { method: 'POST', body: fd })
          const elapsed = Math.round(performance.now() - t0)
          console.log('[transcribe] status=', res.status, 'in', elapsed, 'ms')
          if (!res.ok) {
            const body = await res.text().catch(() => '')
            console.warn('[transcribe] error body:', body)
            throw new Error(`transcribe ${res.status}: ${body || '(empty)'}`)
          }
          const { text } = await res.json()
          console.log('[transcribe] got text:', JSON.stringify(text))
          if (text) setValue(v => v ? `${v} ${text}` : text)
        } catch (err) {
          console.warn('[transcribe] failed', err)
        } finally {
          setTranscribing(false)
        }
      }
      recorderRef.current = rec
      rec.start()
      console.log('[mic] recording started')
      setListening(true)
    } catch (err) {
      console.warn('[mic] permission denied or unavailable', err)
      stopTracks()
      setListening(false)
    }
  }

  const stopListening = () => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    setListening(false)
  }

  const toggleListening = () => (listening ? stopListening() : startListening())

  React.useEffect(() => () => {
    // Cleanup mic if the component unmounts mid-recording.
    stopTracks()
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* ignore */ }
    }
  }, [])

  return (
    <div style={{
      height: 54, borderRadius: 27, position: 'relative', overflow: 'hidden',
      boxShadow: '0 6px 14px rgba(0,0,0,0.28)',
      isolation: 'isolate',
      transform: 'translateZ(0)',
    }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 27,
        background: 'rgba(20,20,24,0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '0.5px solid rgba(255,255,255,0.08)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 27,
        boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.06)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'relative', zIndex: 1, height: '100%',
        display: 'flex', alignItems: 'center',
        padding: '0 8px 0 6px', gap: 10,
      }}>
        {/* leading arrow — open / close AI */}
        <div onClick={toggleAi} style={{
          width: 38, height: 38, borderRadius: 19, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none" style={{
            opacity: 0.95,
            transform: aiOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}>
            <path d="M11 18V5M5 11l6-6 6 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* input area — text input OR live waveform when listening/transcribing */}
        {listening || transcribing ? (
          <ChatBarWaveform />
        ) : (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && hasText) send() }}
            placeholder={placeholder}
            style={{
              flex: 1, minWidth: 0, height: '100%',
              background: 'transparent', border: 'none', outline: 'none',
              fontFamily: SF, fontSize: 15, color: '#fff',
              letterSpacing: -0.2, padding: '0 4px',
            }}
          />
        )}

        {/* trailing — mic / stop / send */}
        <div
          onClick={transcribing ? undefined : (listening ? toggleListening : (hasText ? send : toggleListening))}
          style={{
            width: 42, height: 42, borderRadius: 21, flexShrink: 0,
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: hasText
              ? 'linear-gradient(135deg, #B8F04A, #00D26A)'
              : listening
                ? '#FF4D5E'
                : transcribing
                  ? 'rgba(255,255,255,0.1)'
                  : 'transparent',
            cursor: transcribing ? 'default' : 'pointer',
            opacity: transcribing ? 0.7 : 1,
            transition: 'background 180ms ease',
          }}
        >
          {/* listening pulse ring */}
          {listening && (
            <span style={{
              position: 'absolute', inset: -4, borderRadius: 25,
              border: '1.5px solid rgba(255,77,94,0.6)',
              animation: 'aiPulseRing 1.4s ease-out infinite',
              pointerEvents: 'none',
            }} />
          )}
          {hasText ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 15V3M3 9l6-6 6 6" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : transcribing ? (
            // spinner while Whisper is working
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ animation: 'aiSpin 0.9s linear infinite' }}>
              <circle cx="9" cy="9" r="6.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.8"/>
              <path d="M9 2.5a6.5 6.5 0 0 1 6.5 6.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          ) : listening ? (
            // stop square
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="2" width="10" height="10" rx="2" fill="#fff"/>
            </svg>
          ) : (
            <svg width="18" height="22" viewBox="0 0 18 22" fill="none" style={{ opacity: 0.9 }}>
              <rect x="6" y="2" width="6" height="11" rx="3" stroke="#fff" strokeWidth="1.5" fill="none"/>
              <path d="M2.5 11c0 3.6 2.9 6.5 6.5 6.5s6.5-2.9 6.5-6.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <path d="M9 17.5V21" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
        </div>
      </div>

      <style>{`
        @keyframes aiWave {
          0%, 100% { transform: scaleY(0.25); }
          50%      { transform: scaleY(1); }
        }
        @keyframes aiPulseRing {
          0%   { transform: scale(0.85); opacity: 0.9; }
          80%  { transform: scale(1.4);  opacity: 0; }
          100% { transform: scale(1.4);  opacity: 0; }
        }
        @keyframes aiSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── ChatBarWaveform — animated bars shown while the mic is "listening" ──
function ChatBarWaveform() {
  // Per-bar pseudo-random heights and offsets so the animation feels organic.
  const bars = React.useMemo(
    () => Array.from({ length: 18 }, (_, i) => ({
      maxScale: 0.5 + Math.sin(i * 1.7) * 0.25 + 0.5,
      delay: (i * 0.06).toFixed(2),
      duration: 0.7 + ((i * 13) % 5) * 0.08,
    })),
    []
  )
  return (
    <div style={{
      flex: 1, height: '100%', minWidth: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 4, padding: '0 6px', overflow: 'hidden',
    }}>
      {bars.map((b, i) => (
        <div key={i} style={{
          width: 3, height: 22 * b.maxScale,
          borderRadius: 2,
          background: 'linear-gradient(180deg, #B8F04A, #00D26A)',
          transformOrigin: 'center',
          animation: `aiWave ${b.duration}s ease-in-out ${b.delay}s infinite`,
        }} />
      ))}
    </div>
  )
}
