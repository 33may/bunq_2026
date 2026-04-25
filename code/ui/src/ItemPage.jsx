import React from 'react'
import { BF_COLORS, SF, SFR, Avatar, timeLabel, SplitTracker, Chat } from './components'
import * as registry from './ai/pageContextRegistry'
import { log } from './ai/log'
// (we don't import tokens.js directly because BF_COLORS/SF/SFR are re-imported via components)

// ─────────────────────────────────────────────────────────────
// ITEM PAGE — shared layout, type-specific content
// ─────────────────────────────────────────────────────────────

// type-specific style tokens (chip color + accent)
const TYPE_META = {
  planned:      { label: 'planned',      color: BF_COLORS.coral },
  request:      { label: 'request',      color: BF_COLORS.coral },
  bill:         { label: 'bill',         color: BF_COLORS.amber },
  subscription: { label: 'subscription', color: BF_COLORS.purple },
  insight:      { label: 'insight',      color: BF_COLORS.lime },
  completed:    { label: 'completed',    color: BF_COLORS.green },
};

// generic section header inside the page
function ItemSection({ title, right, children, pad = true }) {
  return (
    <div style={{ padding: '0 16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px' }}>
        <div style={{ fontFamily: SF, fontSize: 12, fontWeight: 600, color: BF_COLORS.sub, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {title}
        </div>
        {right && <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub }}>{right}</div>}
      </div>
      <div style={{
        background: BF_COLORS.card, borderRadius: 20,
        padding: pad ? 14 : 0, border: `0.5px solid ${BF_COLORS.hairline}`,
      }}>
        {children}
      </div>
    </div>
  );
}

function Placeholder({ label, height = 100 }) {
  return (
    <div style={{
      height, borderRadius: 14,
      background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 10px, rgba(255,255,255,0.06) 10px 20px)',
      border: `1px dashed ${BF_COLORS.hairline}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, fontWeight: 500,
      color: BF_COLORS.ter, letterSpacing: 0.4,
    }}>
      {label}
    </div>
  );
}

// content zones — one per type. Blockout for now; we'll flesh out per type next.
function PlannedContent({ item }) {
  const color = item.color || TYPE_META.planned.color;
  const amt = item.amt || 0;

  // Mock data derived from the item
  const cadence = item.sub?.split('·')[0]?.trim() || 'monthly';
  const splitMatch = /split\s+(\d+)\s+ways?/i.exec(item.sub || '');
  const ways = splitMatch ? parseInt(splitMatch[1], 10) : 1;
  const perPerson = ways > 1 ? amt / ways : amt;

  // housemates (from my POV)
  const me = { name: 'you', color: BF_COLORS.green, initial: 'M', paid: false, isMe: true };
  const others = [
    { name: 'lena', color: BF_COLORS.amber, initial: 'L', paid: true  },
    { name: 'sam',  color: BF_COLORS.pink,  initial: 'S', paid: true  },
    { name: 'alex', color: BF_COLORS.blue,  initial: 'A', paid: false },
  ];
  const splitMembers = ways >= 4 ? [me, ...others] : ways === 3 ? [me, others[0], others[1]] : ways === 2 ? [me, others[0]] : [me];
  const paidCount = splitMembers.filter(p => p.paid).length;

  // mock "next 3 occurrences" with relative labels
  const schedule = [
    { days: item.days ?? 0, state: 'next'    },
    { days: (item.days ?? 0) + 30, state: 'upcoming' },
    { days: (item.days ?? 0) + 60, state: 'upcoming' },
  ];

  // history — past 3 occurrences
  const history = [
    { when: 'mar',  amt: amt, paid: true },
    { when: 'feb',  amt: amt, paid: true },
    { when: 'jan',  amt: amt * 0.96, paid: true },
  ];

  return (
    <>
      {/* next up — the big upcoming moment */}
      <div style={{ padding: '0 16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px' }}>
          <div style={{ fontFamily: SF, fontSize: 12, fontWeight: 600, color: BF_COLORS.sub, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            schedule
          </div>
          <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub }}>{cadence}</div>
        </div>
        <div style={{
          background: BF_COLORS.card, borderRadius: 20, overflow: 'hidden',
          border: `0.5px solid ${BF_COLORS.hairline}`,
        }}>
          {/* upcoming strip — 3 dots on a horizontal line */}
          <div style={{ padding: '18px 18px 14px' }}>
            <div style={{ position: 'relative', height: 58 }}>
              {/* connecting line */}
              <div style={{
                position: 'absolute', left: 16, right: 16, top: 14,
                height: 2, background: `linear-gradient(to right, ${color}, ${color}22)`,
                borderRadius: 1,
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
                {schedule.map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    minWidth: 60,
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 15,
                      background: i === 0 ? color : 'rgba(255,255,255,0.06)',
                      border: i === 0 ? 'none' : `1.5px solid ${BF_COLORS.hairline}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: i === 0 ? `0 4px 12px ${color}66` : 'none',
                    }}>
                      {i === 0 ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3 7.5l3 3 5-6" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <div style={{ width: 5, height: 5, borderRadius: 3, background: BF_COLORS.ter }} />
                      )}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        fontFamily: SF, fontSize: 11, fontWeight: 700,
                        color: i === 0 ? color : BF_COLORS.ter,
                        textTransform: 'lowercase', letterSpacing: 0.3, whiteSpace: 'nowrap',
                      }}>
                        {timeLabel(s.days)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* auto-pay note */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px',
            borderTop: `1px solid ${BF_COLORS.hairline}`,
            background: 'rgba(255,255,255,0.02)',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="7" cy="7" r="5.5" stroke={color} strokeWidth="1.3"/>
              <path d="M7 4v3l2 1.5" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <span style={{
              flex: 1, fontFamily: SF, fontSize: 12.5, color: BF_COLORS.sub, letterSpacing: -0.1,
            }}>
              auto-pay is on · charges on due date
            </span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.4 }}>
              <path d="M3 1l4 4-4 4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      {/* split breakdown — shared SplitTracker */}
      {ways > 1 && (
        <SplitTracker members={splitMembers} perPerson={perPerson} total={amt} />
      )}

      {/* history */}
      <div style={{ padding: '0 16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px' }}>
          <div style={{ fontFamily: SF, fontSize: 12, fontWeight: 600, color: BF_COLORS.sub, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            history
          </div>
          <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub }}>last 3 months</div>
        </div>
        <div style={{
          background: BF_COLORS.card, borderRadius: 20, overflow: 'hidden',
          border: `0.5px solid ${BF_COLORS.hairline}`,
        }}>
          {history.map((h, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              borderTop: i === 0 ? 'none' : `1px solid ${BF_COLORS.hairline}`,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 11,
                background: BF_COLORS.green,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2 5.5l2.5 2.5 5-5" stroke="#000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{
                flex: 1,
                fontFamily: SF, fontSize: 14, fontWeight: 600, color: BF_COLORS.text, letterSpacing: -0.1,
              }}>
                {h.when}
              </div>
              <div style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.ter, letterSpacing: -0.1 }}>
                paid on time
              </div>
              <div style={{ fontFamily: SFR, fontSize: 14, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.2 }}>
                €{h.amt.toFixed(2).replace('.', ',')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function RequestContent({ item }) {
  const color = TYPE_META.request.color;
  const amt = item.amt || 0;
  return (
    <>
      {/* requester message */}
      {item.message && (
        <ItemSection title={`message from ${item.from}`}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Avatar initial={item.from[0].toUpperCase()} color={item.fromColor} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: SF, fontSize: 14, color: BF_COLORS.text,
                letterSpacing: -0.1, lineHeight: 1.45,
              }}>
                "{item.message}"
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
                padding: '3px 8px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                fontFamily: SF, fontSize: 11, fontWeight: 600, color: BF_COLORS.sub,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: 3, background: BF_COLORS.amber }} />
                awaiting your response
              </div>
            </div>
          </div>
        </ItemSection>
      )}

      {/* receipt + my items — only if shared receipt */}
      {item.hasReceipt && item.myItems && (
        <div style={{ padding: '0 16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px' }}>
            <div style={{ fontFamily: SF, fontSize: 12, fontWeight: 600, color: BF_COLORS.sub, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              shared receipt
            </div>
            <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub }}>
              total €{item.total.toFixed(2).replace('.', ',')}
            </div>
          </div>
          <div style={{
            background: BF_COLORS.card, borderRadius: 20, overflow: 'hidden',
            border: `0.5px solid ${BF_COLORS.hairline}`,
          }}>
            {/* receipt photo */}
            <div style={{
              height: 140, position: 'relative',
              background:
                'linear-gradient(135deg, #2a2218 0%, #1a1512 60%, #0f0d0a 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderBottom: `0.5px solid ${BF_COLORS.hairline}`,
            }}>
              {/* faux receipt paper */}
              <div style={{
                width: 92, height: 116, background: '#f5efe4', borderRadius: 3,
                transform: 'rotate(-4deg)',
                boxShadow: '0 12px 24px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)',
                padding: '10px 8px',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                <div style={{ height: 4, width: '60%', background: '#2a2218', borderRadius: 1 }} />
                <div style={{ height: 2, width: '40%', background: '#8a7f6c', borderRadius: 1, marginBottom: 4 }} />
                {[70, 85, 62, 78, 55, 80].map((w, i) => (
                  <div key={i} style={{ display: 'flex', gap: 4 }}>
                    <div style={{ height: 3, flex: 1, maxWidth: `${w}%`, background: '#8a7f6c', opacity: 0.7, borderRadius: 1 }} />
                    <div style={{ height: 3, width: 14, background: '#2a2218', borderRadius: 1 }} />
                  </div>
                ))}
              </div>
              {/* expand hint */}
              <div style={{
                position: 'absolute', top: 10, right: 10,
                width: 30, height: 30, borderRadius: 15,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 5V1h4M11 7v4H7M1 1l4 4M11 11L7 7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
              {/* item count pill */}
              <div style={{
                position: 'absolute', bottom: 10, left: 10,
                padding: '4px 9px', borderRadius: 10,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
                fontFamily: SF, fontSize: 11, fontWeight: 600, color: '#fff', letterSpacing: -0.1,
              }}>
                {item.myItems.length} items assigned to you
              </div>
            </div>

            {/* my items list */}
            <div style={{ padding: '4px 0' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px 6px',
                fontFamily: SF, fontSize: 11, fontWeight: 600, color: BF_COLORS.ter,
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke={color} strokeWidth="1.2"/>
                  <circle cx="6" cy="6" r="2" fill={color}/>
                </svg>
                your items
              </div>
              {item.myItems.map((li, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  borderTop: i === 0 ? 'none' : `1px solid ${BF_COLORS.hairline}`,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 11,
                    background: `${color}22`, border: `0.5px solid ${color}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
                  </div>
                  <div style={{
                    flex: 1, minWidth: 0,
                    fontFamily: SF, fontSize: 14, fontWeight: 500, color: BF_COLORS.text,
                    letterSpacing: -0.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {li.name}
                  </div>
                  <div style={{
                    flexShrink: 0,
                    fontFamily: SFR, fontSize: 14, fontWeight: 700, color: BF_COLORS.text,
                    letterSpacing: -0.2,
                  }}>
                    €{li.price.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              ))}
              {/* totals footer */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px 14px',
                borderTop: `1px solid ${BF_COLORS.hairline}`,
                background: 'rgba(255,255,255,0.02)',
              }}>
                <span style={{ fontFamily: SF, fontSize: 13, fontWeight: 600, color: BF_COLORS.sub, letterSpacing: -0.1 }}>
                  your share
                </span>
                <span style={{ fontFamily: SFR, fontSize: 16, fontWeight: 800, color: BF_COLORS.text, letterSpacing: -0.3 }}>
                  €{amt.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* split tracker — when this request is split across multiple housemates */}
      {item.splitMembers && item.splitMembers.length > 1 && (
        <SplitTracker
          members={item.splitMembers}
          perPerson={item.amt}
          total={item.total ?? item.amt * item.splitMembers.length}
        />
      )}

      {/* no-receipt: just a quiet note */}
      {!item.hasReceipt && (
        <div style={{ padding: '0 16px 20px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px', borderRadius: 16,
            background: 'rgba(255,255,255,0.03)',
            border: `1px dashed ${BF_COLORS.hairline}`,
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
              <rect x="3" y="2" width="12" height="14" rx="2" stroke="#fff" strokeWidth="1.4"/>
              <path d="M6 6h6M6 9h6M6 12h4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, letterSpacing: -0.1 }}>
              no receipt attached
            </span>
          </div>
        </div>
      )}

      {/* status */}
      <ItemSection title="status">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <StatusRow
            label="requested"
            detail={item.ago === 'yesterday' ? 'yesterday' : `${item.ago} ago`}
            state="done"
          />
          <StatusRow
            label="awaiting your approval"
            detail=""
            state="active"
            color={color}
          />
          <StatusRow
            label="payment"
            detail=""
            state="pending"
          />
        </div>
      </ItemSection>

      {/* chat — thread between you and the requester */}
      <ItemChat item={item} />
    </>
  );
}

// ── ItemChat — wraps the shared `Chat` for the item page ──────────
function ItemChat({ item }) {
  const peer = {
    name: item.from || 'them',
    initial: (item.from || 'T')[0].toUpperCase(),
    color: item.fromColor || BF_COLORS.blue,
  }
  const seed = item.message
    ? [{ from: 'them', text: item.message, ago: item.ago === 'yesterday' ? 'yesterday' : `${item.ago} ago` }]
    : []
  const [thread, setThread] = React.useState(seed)
  return (
    <ItemSection title={`chat with ${peer.name}`}>
      <Chat
        peer={peer}
        thread={thread}
        onSend={(text) => setThread(s => [...s, { from: 'me', text, ago: 'just now' }])}
      />
    </ItemSection>
  );
}

function StatusRow({ label, detail, state, color }) {
  const c = state === 'done' ? BF_COLORS.green
          : state === 'active' ? (color || BF_COLORS.coral)
          : BF_COLORS.ter;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 22, height: 22, borderRadius: 11,
        background: state === 'done' ? c : 'transparent',
        border: state === 'done' ? 'none' : `1.5px solid ${c}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {state === 'done' && (
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2 5.5l2.5 2.5 5-5" stroke="#000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {state === 'active' && (
          <div style={{ width: 8, height: 8, borderRadius: 4, background: c }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: SF, fontSize: 14, fontWeight: 600,
          color: state === 'pending' ? BF_COLORS.sub : BF_COLORS.text,
          letterSpacing: -0.1,
        }}>
          {label}
        </div>
      </div>
      {detail && (
        <div style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.ter, letterSpacing: -0.1 }}>
          {detail}
        </div>
      )}
    </div>
  );
}

function BillContent({ item }) {
  return (
    <>
      <ItemSection title="split breakdown">
        <Placeholder label="segmented bar + per-person share" height={120} />
      </ItemSection>
      <ItemSection title="receipt">
        <Placeholder label="receipt photo + line items" height={140} />
      </ItemSection>
    </>
  );
}

function SubscriptionContent({ item }) {
  return (
    <>
      <ItemSection title="billing cadence">
        <Placeholder label="timeline · next charge" height={80} />
      </ItemSection>
      <ItemSection title="shared with">
        <Placeholder label="housemate list + share" height={110} />
      </ItemSection>
      <ItemSection title="usage">
        <Placeholder label="months active · total paid" height={80} />
      </ItemSection>
    </>
  );
}

function CompletedContent({ item }) {
  const color = TYPE_META.completed.color;
  const amt = Math.abs(item.amt || 0);
  const yourTotal = (item.myItems || []).reduce((s, li) => s + li.price, 0);

  return (
    <>
      {/* receipt block — only when hasReceipt + itemized */}
      {item.hasReceipt && item.myItems && item.myItems.length > 0 && (
        <div style={{ padding: '0 16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px' }}>
            <div style={{ fontFamily: SF, fontSize: 12, fontWeight: 600, color: BF_COLORS.sub, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              your receipt
            </div>
            <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub }}>
              {item.myItems.length} items
            </div>
          </div>
          <div style={{
            background: BF_COLORS.card, borderRadius: 20, overflow: 'hidden',
            border: `0.5px solid ${BF_COLORS.hairline}`,
          }}>
            {/* receipt photo */}
            <div style={{
              height: 140, position: 'relative',
              background: 'linear-gradient(135deg, #2a2218 0%, #1a1512 60%, #0f0d0a 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderBottom: `0.5px solid ${BF_COLORS.hairline}`,
            }}>
              <div style={{
                width: 92, height: 116, background: '#f5efe4', borderRadius: 3,
                transform: 'rotate(-4deg)',
                boxShadow: '0 12px 24px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)',
                padding: '10px 8px',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                <div style={{ height: 4, width: '60%', background: '#2a2218', borderRadius: 1 }} />
                <div style={{ height: 2, width: '40%', background: '#8a7f6c', borderRadius: 1, marginBottom: 4 }} />
                {[70, 85, 62, 78, 55, 80].map((w, i) => (
                  <div key={i} style={{ display: 'flex', gap: 4 }}>
                    <div style={{ height: 3, flex: 1, maxWidth: `${w}%`, background: '#8a7f6c', opacity: 0.7, borderRadius: 1 }} />
                    <div style={{ height: 3, width: 14, background: '#2a2218', borderRadius: 1 }} />
                  </div>
                ))}
              </div>
              <div style={{
                position: 'absolute', top: 10, right: 10,
                width: 30, height: 30, borderRadius: 15,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 5V1h4M11 7v4H7M1 1l4 4M11 11L7 7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{
                position: 'absolute', bottom: 10, left: 10,
                padding: '4px 9px', borderRadius: 10,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
                fontFamily: SF, fontSize: 11, fontWeight: 600, color: '#fff', letterSpacing: -0.1,
              }}>
                tap to expand
              </div>
            </div>
            {/* my items list */}
            <div style={{ padding: '4px 0' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px 6px',
                fontFamily: SF, fontSize: 11, fontWeight: 600, color: BF_COLORS.ter,
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke={color} strokeWidth="1.2"/>
                  <circle cx="6" cy="6" r="2" fill={color}/>
                </svg>
                line items
              </div>
              {item.myItems.map((li, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  borderTop: i === 0 ? 'none' : `1px solid ${BF_COLORS.hairline}`,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 11,
                    background: `${color}22`, border: `0.5px solid ${color}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
                  </div>
                  <div style={{
                    flex: 1, minWidth: 0,
                    fontFamily: SF, fontSize: 14, fontWeight: 500, color: BF_COLORS.text,
                    letterSpacing: -0.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {li.name}
                  </div>
                  <div style={{
                    flexShrink: 0,
                    fontFamily: SFR, fontSize: 14, fontWeight: 700, color: BF_COLORS.text,
                    letterSpacing: -0.2,
                  }}>
                    €{li.price.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              ))}
              {/* totals footer */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px 14px',
                borderTop: `1px solid ${BF_COLORS.hairline}`,
                background: 'rgba(255,255,255,0.02)',
              }}>
                <span style={{ fontFamily: SF, fontSize: 13, fontWeight: 600, color: BF_COLORS.sub, letterSpacing: -0.1 }}>
                  total paid
                </span>
                <span style={{ fontFamily: SFR, fontSize: 16, fontWeight: 800, color: BF_COLORS.text, letterSpacing: -0.3 }}>
                  €{yourTotal.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* no-receipt quiet note */}
      {!item.hasReceipt && (
        <div style={{ padding: '0 16px 20px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px', borderRadius: 16,
            background: 'rgba(255,255,255,0.03)',
            border: `1px dashed ${BF_COLORS.hairline}`,
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
              <rect x="3" y="2" width="12" height="14" rx="2" stroke="#fff" strokeWidth="1.4"/>
              <path d="M6 6h6M6 9h6M6 12h4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span style={{ flex: 1, fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, letterSpacing: -0.1 }}>
              no receipt attached
            </span>
            <span style={{ fontFamily: SF, fontSize: 12, fontWeight: 600, color: BF_COLORS.text, letterSpacing: -0.1 }}>
              add
            </span>
          </div>
        </div>
      )}

      {/* payment details */}
      <div style={{ padding: '0 16px 20px' }}>
        <div style={{ padding: '0 4px 8px' }}>
          <div style={{ fontFamily: SF, fontSize: 12, fontWeight: 600, color: BF_COLORS.sub, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            payment
          </div>
        </div>
        <div style={{
          background: BF_COLORS.card, borderRadius: 20, overflow: 'hidden',
          border: `0.5px solid ${BF_COLORS.hairline}`,
        }}>
          {[
            { label: 'amount',     value: `€${amt.toFixed(2).replace('.', ',')}` },
            { label: 'paid with',  value: 'bunq ·     1234' },
            { label: 'when',       value: item.when },
            { label: 'status',     value: 'completed', badge: true },
          ].map((r, i, arr) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px',
              borderTop: i === 0 ? 'none' : `1px solid ${BF_COLORS.hairline}`,
            }}>
              <span style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, letterSpacing: -0.1 }}>
                {r.label}
              </span>
              {r.badge ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px 4px 8px', borderRadius: 10,
                  background: 'rgba(0,210,106,0.14)',
                }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5" fill={BF_COLORS.green}/>
                    <path d="M3.5 6l1.8 1.8L8.5 4.5" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontFamily: SFR, fontSize: 12, fontWeight: 700, color: BF_COLORS.green, letterSpacing: -0.1 }}>
                    {r.value}
                  </span>
                </span>
              ) : (
                <span style={{ fontFamily: SFR, fontSize: 14, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.2 }}>
                  {r.value}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ItemContent({ item }) {
  switch (item.type) {
    case 'planned': return <PlannedContent item={item} />;
    case 'request': return <RequestContent item={item} />;
    case 'bill': return <BillContent item={item} />;
    case 'subscription': return <SubscriptionContent item={item} />;
    case 'completed': return <CompletedContent item={item} />;
    default: return <ItemSection title="details"><Placeholder label={`${item.type} content`} /></ItemSection>;
  }
}

// primary action per type
function ItemActions({ item, onClose, onAccept, onDecline }) {
  // For type='request' we drive both buttons live: primary fires onAccept,
  // secondary fires onDecline. Other types still fall through to onClose.
  const [busy, setBusy] = React.useState(null); // 'accept' | 'decline' | null
  const [err, setErr] = React.useState(null);

  const cfg = (() => {
    switch (item.type) {
      case 'planned': {
        const splitMatch = /split\s+(\d+)\s+ways?/i.exec(item.sub || '');
        const ways = splitMatch ? parseInt(splitMatch[1], 10) : 1;
        const share = ways > 1 ? (item.amt || 0) / ways : (item.amt || 0);
        return { primary: { label: `pay · €${share.toFixed(2).replace('.', ',')}`, bg: BF_COLORS.green, color: '#000' }, secondary: 'edit' };
      }
      case 'request': return { primary: { label: `accept · €${item.amt?.toFixed(2).replace('.', ',')}`, bg: '#fff', color: '#000' }, secondary: 'decline' };
      case 'bill':    return { primary: { label: 'pay my share', bg: BF_COLORS.green, color: '#000' }, secondary: 'dispute' };
      case 'subscription': return { primary: { label: 'manage', bg: '#fff', color: '#000' }, secondary: 'leave' };
      case 'completed': return {
        primary: item.hasReceipt
          ? { label: 'view receipt', bg: '#fff', color: '#000' }
          : { label: 'add receipt', bg: '#fff', color: '#000' },
        secondary: 'dispute'
      };
      default: return { primary: { label: 'open', bg: '#fff', color: '#000' }, secondary: 'close' };
    }
  })();

  const isRequest = item.type === 'request' && (onAccept || onDecline);
  const fireAccept = async () => {
    if (busy || !onAccept) return;
    setBusy('accept'); setErr(null);
    try { await onAccept(item); } catch (e) { setErr(e?.body?.detail || e?.message || 'failed'); }
    finally { setBusy(null); }
  };
  const fireDecline = async () => {
    if (busy || !onDecline) return;
    setBusy('decline'); setErr(null);
    try { await onDecline(item); } catch (e) { setErr(e?.body?.detail || e?.message || 'failed'); }
    finally { setBusy(null); }
  };

  const primaryLabel = isRequest && busy === 'accept' ? 'accepting…' : cfg.primary.label;
  const secondaryLabel = isRequest && busy === 'decline' ? 'declining…' : cfg.secondary;
  const onPrimary = isRequest ? fireAccept : undefined;
  const onSecondary = isRequest ? fireDecline : onClose;

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5,
      padding: '14px 16px 34px',
      background: 'linear-gradient(to top, #000 55%, rgba(0,0,0,0.9) 80%, rgba(0,0,0,0))',
    }}>
      {err && (
        <div style={{
          marginBottom: 10, padding: '8px 12px', borderRadius: 12,
          background: 'rgba(255,106,78,0.16)',
          fontFamily: SF, fontSize: 12, color: BF_COLORS.coral, textAlign: 'center',
        }}>{err}</div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <div onClick={onPrimary} style={{
          flex: 1, height: 52, borderRadius: 26, background: cfg.primary.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: SF, fontSize: 15, fontWeight: 700, color: cfg.primary.color, letterSpacing: -0.1,
          cursor: onPrimary ? 'pointer' : 'default', opacity: busy && busy !== 'accept' ? 0.6 : 1,
        }}>
          {primaryLabel}
        </div>
        <div onClick={onSecondary} style={{
          width: 120, height: 52, borderRadius: 26,
          background: 'rgba(255,255,255,0.08)', border: `0.5px solid ${BF_COLORS.hairline}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: SF, fontSize: 15, fontWeight: 600, color: BF_COLORS.sub, letterSpacing: -0.1,
          cursor: 'pointer', opacity: busy && busy !== 'decline' ? 0.6 : 1,
        }}>
          {secondaryLabel}
        </div>
      </div>
    </div>
  );
}

function ItemHero({ item }) {
  const meta = TYPE_META[item.type] || { label: item.type, color: '#fff' };
  const color = item.color || meta.color;
  const isNegative = item.type === 'planned' || item.type === 'request' || item.type === 'bill' || item.type === 'subscription';
  const amt = item.amt;

  // For planned items with a split, show MY SHARE as the hero amount.
  let heroAmt = amt;
  let subAmt = null;
  if (item.type === 'planned' && amt != null) {
    const splitMatch = /split\s+(\d+)\s+ways?/i.exec(item.sub || '');
    const ways = splitMatch ? parseInt(splitMatch[1], 10) : 1;
    if (ways > 1) {
      heroAmt = amt / ways;
      subAmt = amt; // total
    }
  }

  // Derive a clean "description" (short context line, shown under chip)
  // and a "date" (when it happens / happened).
  let description = '';
  let dateLabel = '';
  if (item.type === 'request') {
    // note: 'four seasons · split 3 ways' → description = 'four seasons'
    description = (item.note || '').split('·')[0].trim();
    dateLabel = item.ago ? (item.ago === 'yesterday' ? 'yesterday' : `${item.ago} ago`) : '';
  } else if (item.type === 'completed') {
    description = item.description || item.sub || '';
    dateLabel = item.when || '';
  } else if (item.type === 'planned') {
    const parts = (item.sub || '').split('·').map(s => s.trim()).filter(Boolean);
    description = parts.filter(p => !/split\s+\d+\s+ways?/i.test(p)).join(' · ');
    dateLabel = item.days != null ? timeLabel(item.days) : '';
  } else {
    description = item.sub || item.note || '';
  }

  return (
    <div style={{ padding: '8px 16px 18px' }}>
      {/* chip */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 11, background: `${color}22`,
        fontFamily: SF, fontSize: 11, fontWeight: 700, color, letterSpacing: 0.3, textTransform: 'lowercase',
      }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
        {meta.label}
      </div>

      {/* icon + title + amount row (amount right-aligned, inline with title) */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 18,
          background: `${color}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, flexShrink: 0, border: `0.5px solid ${color}33`,
        }}>
          {item.emoji || '📄'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: SFR, fontSize: 24, fontWeight: 800, color: BF_COLORS.text,
            letterSpacing: -0.5, lineHeight: 1.1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {item.title}
          </div>
          {dateLabel && (
            <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.ter, marginTop: 4, letterSpacing: -0.1 }}>
              {dateLabel}
            </div>
          )}
        </div>
        {amt != null && (
          <div style={{
            flexShrink: 0, textAlign: 'right',
            whiteSpace: 'nowrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, justifyContent: 'flex-end' }}>
              <span style={{ fontFamily: SFR, fontSize: 28, fontWeight: 800, color: BF_COLORS.text, letterSpacing: -0.8, lineHeight: 1 }}>
                {isNegative ? '−' : ''}€{Math.floor(Math.abs(heroAmt))}
              </span>
              <span style={{ fontFamily: SFR, fontSize: 16, fontWeight: 700, color: BF_COLORS.sub, letterSpacing: -0.3 }}>
                ,{String(Math.round((Math.abs(heroAmt) % 1) * 100)).padStart(2, '0')}
              </span>
            </div>
            {subAmt != null && (
              <div style={{
                fontFamily: SF, fontSize: 11, fontWeight: 600, color: BF_COLORS.ter,
                marginTop: 3, letterSpacing: 0.1,
              }}>
                your share of €{subAmt.toFixed(2).replace('.', ',')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* description line — below the title row */}
      {description && (
        <div style={{
          fontFamily: SF, fontSize: 13, color: BF_COLORS.sub,
          marginTop: 14, letterSpacing: -0.1,
        }}>
          {description}
        </div>
      )}
    </div>
  );
}

function __ItemHeroOldTail() { // dead block kept out of render
  return null;
}

function ItemPageHeader({ onClose, accent }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      padding: '54px 16px 10px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'linear-gradient(to bottom, #000 70%, rgba(0,0,0,0))',
    }}>
      <div onClick={onClose} style={{
        width: 36, height: 36, borderRadius: 18, background: BF_COLORS.cardHi,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M10 3L4 7l6 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div style={{
        width: 36, height: 36, borderRadius: 18, background: BF_COLORS.cardHi,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="18" height="4" viewBox="0 0 18 4">
          <circle cx="2" cy="2" r="2" fill="rgba(255,255,255,0.7)"/>
          <circle cx="9" cy="2" r="2" fill="rgba(255,255,255,0.7)"/>
          <circle cx="16" cy="2" r="2" fill="rgba(255,255,255,0.7)"/>
        </svg>
      </div>
    </div>
  );
}

function ItemPage({ item, onClose, open, onAccept, onDecline }) {
  React.useEffect(() => {
    if (!open || !item) return
    registry.register('item_detail', () => ({
      split: {
        id: item.id, title: item.title,
        payer: item.raw?.payer_id ? { id: item.raw.payer_id, name: item.raw.payer_name } : null,
        total: item.total, currency: item.raw?.currency || 'EUR',
        requests: (item.raw?.requests || []).map(r => ({
          id: r.id,
          debtor: { id: r.debtor_id, name: r.debtor_name },
          amount: r.amount, status: r.status,
        })),
        settled: item.raw?.settled,
      },
    }))
    return () => registry.unregister('item_detail')
  }, [open, item?.id])

  if (!item) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 300,
      background: BF_COLORS.bg,
      transform: open ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)',
      borderRadius: open ? 0 : '24px 24px 0 0',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* scrollable content — overscroll-behavior:contain stops chaining to the page behind */}
      <div style={{
        flex: 1, overflowY: 'auto', paddingBottom: 110,
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}>
        <ItemPageHeader onClose={onClose} />
        <ItemHero item={item} />
        <ItemContent item={item} />
      </div>
      <ItemActions
        item={item}
        onClose={onClose}
        onAccept={onAccept}
        onDecline={onDecline}
      />
    </div>
  );
}

export { ItemPage }
