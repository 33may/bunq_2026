import React from 'react'
import { BF_COLORS, SF, SFR } from './tokens'
import { Avatar, Euro, Chip, Card, List, ListRow, AIBadge, AIPlan, ChatBar, AIPreview, Post, SplitTracker, ExpenseCard } from './components'
import { ItemPage } from './ItemPage'
import { AIWindow } from './AIWindow'
import { RequestSplitForm } from './RequestSplitForm'
import { MatesScreen, MatePage } from './MatesScreen'
import { useMe } from './hooks/useMe.js'
import { useHouse } from './hooks/useHouse.js'
import { useMyBunq } from './hooks/useMyBunq.js'
import * as aiClient from './ai/aiClient'
import * as registry from './ai/pageContextRegistry'
import * as bus from './ai/pagePatchBus'
import { log } from './ai/log'
import { useSplits } from './hooks/useSplits.js'
import { usePayments } from './hooks/usePayments.js'
import Landing from './screens/Landing.jsx'
import OAuthConsent from './screens/OAuthConsent.jsx'
import { logoutSession, acceptSplitRequest, declineSplitRequest } from './api.js'


// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports: IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({ dark = false, time = '9:41' }) {
  const c = dark ? '#fff' : '#000';
  return (
    <div style={{
      display: 'flex', gap: 154, alignItems: 'center', justifyContent: 'center',
      padding: '21px 24px 19px', boxSizing: 'border-box',
      position: 'relative', zIndex: 20, width: '100%',
    }}>
      <div style={{ flex: 1, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 1.5 }}>
        <span style={{
          fontFamily: '-apple-system, "SF Pro", system-ui', fontWeight: 590,
          fontSize: 17, lineHeight: '22px', color: c,
        }}>{time}</span>
      </div>
      <div style={{ flex: 1, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: 1, paddingRight: 1 }}>
        <svg width="19" height="12" viewBox="0 0 19 12">
          <rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill={c}/>
          <rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill={c}/>
          <rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill={c}/>
          <rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill={c}/>
        </svg>
        <svg width="17" height="12" viewBox="0 0 17 12">
          <path d="M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z" fill={c}/>
          <path d="M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z" fill={c}/>
          <circle cx="8.5" cy="10.5" r="1.5" fill={c}/>
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke={c} strokeOpacity="0.35" fill="none"/>
          <rect x="2" y="2" width="20" height="9" rx="2" fill={c}/>
          <path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill={c} fillOpacity="0.4"/>
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({ children, dark = false, style = {} }) {
  return (
    <div style={{
      height: 44, minWidth: 44, borderRadius: 9999,
      position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: dark
        ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)'
        : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style,
    }}>
      {/* blur + tint */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 9999,
        backdropFilter: 'blur(12px) saturate(180%)',
        WebkitBackdropFilter: 'blur(12px) saturate(180%)',
        background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)',
      }} />
      {/* shine */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 9999,
        boxShadow: dark
          ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)'
          : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
        border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', padding: '0 4px' }}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({ title = 'Title', dark = false, trailingIcon = true }) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = (content) => (
    <IOSGlassPill dark={dark}>
      <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {content}
      </div>
    </IOSGlassPill>
  );
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      paddingTop: 62, paddingBottom: 10, position: 'relative', zIndex: 5,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
      }}>
        {/* back chevron */}
        {pillIcon(
          <svg width="12" height="20" viewBox="0 0 12 20" fill="none" style={{ marginLeft: -1 }}>
            <path d="M10 2L2 10l8 8" stroke={muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {/* trailing ellipsis */}
        {trailingIcon && pillIcon(
          <svg width="22" height="6" viewBox="0 0 22 6">
            <circle cx="3" cy="3" r="2.5" fill={muted}/>
            <circle cx="11" cy="3" r="2.5" fill={muted}/>
            <circle cx="19" cy="3" r="2.5" fill={muted}/>
          </svg>
        )}
      </div>
      {/* large title */}
      <div style={{
        padding: '0 16px',
        fontFamily: '-apple-system, system-ui',
        fontSize: 34, fontWeight: 700, lineHeight: '41px',
        color: text, letterSpacing: 0.4,
      }}>{title}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({ title, detail, icon, chevron = true, isLast = false, dark = false }) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', minHeight: 52,
      padding: '0 16px', position: 'relative',
      fontFamily: '-apple-system, system-ui', fontSize: 17,
      letterSpacing: -0.43,
    }}>
      {icon && (
        <div style={{
          width: 30, height: 30, borderRadius: 7, background: icon,
          marginRight: 12, flexShrink: 0,
        }} />
      )}
      <div style={{ flex: 1, color: text }}>{title}</div>
      {detail && <span style={{ color: sec, marginRight: 6 }}>{detail}</span>}
      {chevron && (
        <svg width="8" height="14" viewBox="0 0 8 14" style={{ flexShrink: 0 }}>
          <path d="M1 1l6 6-6 6" stroke={ter} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {!isLast && (
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          left: icon ? 58 : 16, height: 0.5, background: sep,
        }} />
      )}
    </div>
  );
}

function IOSList({ header, children, dark = false }) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return (
    <div>
      {header && (
        <div style={{
          fontFamily: '-apple-system, system-ui', fontSize: 13,
          color: hc, textTransform: 'uppercase',
          padding: '8px 36px 6px', letterSpacing: -0.08,
        }}>{header}</div>
      )}
      <div style={{
        background: bg, borderRadius: 26,
        margin: '0 16px', overflow: 'hidden',
      }}>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children, width = 402, height = 874, dark = false,
  title, keyboard = false,
}) {
  return (
    <div style={{
      width, height, borderRadius: 48, overflow: 'hidden',
      position: 'relative', background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased',
    }}>
      {/* dynamic island */}
      <div style={{
        position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
        width: 126, height: 37, borderRadius: 24, background: '#000', zIndex: 50,
      }} />
      {/* status bar (absolute) */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <IOSStatusBar dark={dark} />
      </div>
      {/* nav + content */}
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {title !== undefined && <IOSNavBar title={title} dark={dark} />}
        <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
        {keyboard && <IOSKeyboard dark={dark} />}
      </div>
      {/* home indicator — always on top */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60,
        height: 34, display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        paddingBottom: 8, pointerEvents: 'none',
      }}>
        <div style={{
          width: 139, height: 5, borderRadius: 100,
          background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)',
        }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({ dark = false }) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: <svg width="19" height="17" viewBox="0 0 19 17"><path d="M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z" fill={glyph}/></svg>,
    del: <svg width="23" height="17" viewBox="0 0 23 17"><path d="M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z" fill="none" stroke={glyph} strokeWidth="1.6" strokeLinejoin="round"/><path d="M10 5l7 7M17 5l-7 7" stroke={glyph} strokeWidth="1.6" strokeLinecap="round"/></svg>,
    ret: <svg width="20" height="14" viewBox="0 0 20 14"><path d="M18 1v6H4m0 0l4-4M4 7l4 4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  };

  const key = (content, { w, flex, ret, fs = 25, k } = {}) => (
    <div key={k} style={{
      height: 42, borderRadius: 8.5,
      flex: flex ? 1 : undefined, width: w, minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs, fontWeight: 458, color: ret ? '#fff' : glyph,
    }}>{content}</div>
  );

  const row = (keys, pad = 0) => (
    <div style={{ display: 'flex', gap: 6.5, justifyContent: 'center', padding: `0 ${pad}px` }}>
      {keys.map(l => key(l, { flex: true, k: l }))}
    </div>
  );

  return (
    <div style={{
      position: 'relative', zIndex: 15, borderRadius: 27, overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      boxShadow: dark
        ? '0 -2px 20px rgba(0,0,0,0.09)'
        : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)',
    }}>
      {/* liquid glass bg — same recipe as nav pills */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 27,
        backdropFilter: 'blur(12px) saturate(180%)',
        WebkitBackdropFilter: 'blur(12px) saturate(180%)',
        background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 27,
        boxShadow: dark
          ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)'
          : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
        border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
        pointerEvents: 'none',
      }} />

      {/* autocorrect bar */}
      <div style={{
        display: 'flex', gap: 20, alignItems: 'center',
        padding: '8px 22px 13px', width: '100%', boxSizing: 'border-box',
        position: 'relative',
      }}>
        {['"The"', 'the', 'to'].map((w, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ width: 1, height: 25, background: '#ccc', opacity: 0.3 }} />}
            <div style={{
              flex: 1, textAlign: 'center',
              fontFamily: '-apple-system, system-ui', fontSize: 17,
              color: sugg, letterSpacing: -0.43, lineHeight: '22px',
            }}>{w}</div>
          </React.Fragment>
        ))}
      </div>

      {/* key layout */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 13,
        padding: '0 6.5px', width: '100%', boxSizing: 'border-box',
        position: 'relative',
      }}>
        {row(['q','w','e','r','t','y','u','i','o','p'])}
        {row(['a','s','d','f','g','h','j','k','l'], 20)}
        <div style={{ display: 'flex', gap: 14.25, alignItems: 'center' }}>
          {key(icons.shift, { w: 45, k: 'shift' })}
          <div style={{ display: 'flex', gap: 6.5, flex: 1 }}>
            {['z','x','c','v','b','n','m'].map(l => key(l, { flex: true, k: l }))}
          </div>
          {key(icons.del, { w: 45, k: 'del' })}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {key('ABC', { w: 92.25, fs: 18, k: 'abc' })}
          {key('', { flex: true, k: 'space' })}
          {key(icons.ret, { w: 92.25, ret: true, k: 'ret' })}
        </div>
      </div>

      {/* bottom spacer (emoji+mic area, icons omitted) */}
      <div style={{ height: 56, width: '100%', position: 'relative' }} />
    </div>
  );
}

Object.assign(window, {
  IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard,
});

// bunq flatmate — Feed (home) screen
// Members strip + feed of typed post cards + floating AI chat bar + 4-tab shell.

// (tokens + Avatar/Euro/Chip now imported from ./tokens + ./components)

// ──────── members strip ────────
const MEMBERS = [
  { i: 'M', c: BF_COLORS.green,  bal:  24.80, name: 'me' },
  { i: 'L', c: BF_COLORS.amber,  bal:  80.20, name: 'lena' },
  { i: 'S', c: BF_COLORS.pink,   bal: -42.60, name: 'sam' },
  { i: 'A', c: BF_COLORS.blue,   bal: -12.40, name: 'alex' },
];

function MembersStrip() {
  return (
    <div style={{
      display: 'flex', gap: 14, padding: '4px 20px 14px', overflowX: 'auto',
    }}>
      {MEMBERS.map((m, i) => {
        const pos = m.bal >= 0;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 54 }}>
            <div style={{ position: 'relative' }}>
              <Avatar initial={m.i} color={m.c} size={50} ring={i === 0 ? BF_COLORS.green : undefined} />
              {pos ? (
                <div style={{
                  position: 'absolute', bottom: -2, right: -2,
                  width: 18, height: 18, borderRadius: 9, background: BF_COLORS.green,
                  border: `2px solid ${BF_COLORS.bg}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="8" height="8" viewBox="0 0 8 8"><path d="M4 1v6M1 4l3-3 3 3" stroke="#000" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              ) : (
                <div style={{
                  position: 'absolute', bottom: -2, right: -2,
                  width: 18, height: 18, borderRadius: 9, background: BF_COLORS.red,
                  border: `2px solid ${BF_COLORS.bg}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="8" height="8" viewBox="0 0 8 8"><path d="M4 7V1M1 4l3 3 3-3" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              )}
            </div>
            <div style={{ fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 500 }}>{m.name}</div>
            <div style={{
              fontFamily: SFR, fontSize: 12, fontWeight: 700, letterSpacing: -0.2,
              color: pos ? BF_COLORS.green : BF_COLORS.red,
            }}>
              {pos ? '+' : '−'}€{Math.abs(m.bal).toFixed(0)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ──────── post chrome ────────
function PostCard({ children, type, time, author, accent, unread }) {
  return (
    <Card accent={accent}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {author && <Avatar initial={author.i} color={author.c} size={26} />}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          {type}
          <span style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.ter }}>{time}</span>
        </div>
        {unread && <div style={{ width: 8, height: 8, borderRadius: 4, background: BF_COLORS.green }} />}
      </div>
      {children}
    </Card>
  );
}

// ──────── post: INSIGHT (AI) ────────
function InsightPost() {
  return (
    <PostCard
      type={<Chip label="insight" color={BF_COLORS.lime} bg="rgba(184,240,74,0.12)" />}
      time="just now"
      accent={BF_COLORS.lime}
      unread
    >
      <AIPlan
        bare
        headline={<>lena has covered the house for <span style={{ color: BF_COLORS.green }}>3 weeks straight</span></>}
        sub={"she's net +€80,20 since april 3. want me to draft a settle-up?"}
        primary={{ label: 'draft settle-up' }}
        secondary={{}}
      />
    </PostCard>
  );
}

// ──────── post: BILL (receipt split) ────────
function BillPost() {
  // paid by sam, split 4 ways. Colored segments = each person's share.
  const total = 84.40;
  return (
    <PostCard
      type={<Chip label="bill" color={BF_COLORS.amber} bg="rgba(255,176,32,0.14)" />}
      time="2h"
      author={{ i: 'S', c: BF_COLORS.pink }}
      accent={BF_COLORS.amber}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: SFR, fontSize: 17, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            albert heijn — weekly
          </div>
          <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            sam paid · split 4 ways
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <Euro amount={total} big={24} small={14} />
        </div>
      </div>
      {/* storage-style bar */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
          {MEMBERS.map((m, i) => (
            <div key={i} style={{ flex: 1, background: m.c }} />
          ))}
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 10,
        }}>
          {MEMBERS.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: m.c, flexShrink: 0 }} />
                <span style={{ fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              </div>
              <span style={{ fontFamily: SFR, fontSize: 12, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.2 }}>
                €{(total/4).toFixed(2).replace('.', ',')}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{
        marginTop: 12, height: 40, borderRadius: 20, background: 'rgba(0,210,106,0.14)',
        border: `1px solid rgba(0,210,106,0.25)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: SF, fontSize: 14, fontWeight: 700, color: BF_COLORS.green,
      }}>
        pay my share · €21,10
      </div>
    </PostCard>
  );
}

// ──────── post: SUBSCRIPTION ────────
function SubPost() {
  return (
    <PostCard
      type={<Chip label="subscription" color={BF_COLORS.purple} bg="rgba(155,108,255,0.16)" />}
      time="yesterday"
      author={{ i: 'L', c: BF_COLORS.amber }}
      accent={BF_COLORS.purple}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: '#E50914', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: SFR, fontWeight: 900, fontSize: 22, letterSpacing: -1,
        }}>N</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SFR, fontSize: 17, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.3 }}>
            Netflix standard
          </div>
          <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, marginTop: 2 }}>
            €13,99 · next may 3 · split 3 ways
          </div>
        </div>
        <div style={{
          padding: '6px 10px', borderRadius: 12, background: 'rgba(155,108,255,0.16)',
          fontFamily: SFR, fontSize: 12, fontWeight: 700, color: BF_COLORS.purple, letterSpacing: -0.2,
        }}>€4,66 / mo</div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BF_COLORS.hairline}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {[MEMBERS[0], MEMBERS[1], MEMBERS[3]].map((m, i) => (
            <div key={i} style={{ marginLeft: i === 0 ? 0 : -6 }}>
              <Avatar initial={m.i} color={m.c} size={24} border />
            </div>
          ))}
          <span style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, marginLeft: 10 }}>
            me · lena · alex
          </span>
        </div>
        <div style={{
          height: 28, padding: '0 12px', borderRadius: 14, background: BF_COLORS.cardHi,
          display: 'flex', alignItems: 'center',
          fontFamily: SF, fontSize: 12, fontWeight: 600, color: BF_COLORS.text,
        }}>manage</div>
      </div>
    </PostCard>
  );
}

// ──────── post: REQUEST ────────
function RequestPost() {
  return (
    <PostCard
      type={<Chip label="request" color={BF_COLORS.coral} bg="rgba(255,106,78,0.16)" />}
      time="5h"
      author={{ i: 'A', c: BF_COLORS.blue }}
      accent={BF_COLORS.coral}
    >
      <div style={{ fontFamily: SFR, fontSize: 17, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.3, lineHeight: 1.3 }}>
        alex asks <span style={{ color: BF_COLORS.coral }}>€18,00</span>
      </div>
      <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, marginTop: 3 }}>
        "for the uber back from centraal last night 🌙"
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <div style={{
          flex: 1, height: 40, borderRadius: 20, background: BF_COLORS.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: SF, fontSize: 14, fontWeight: 700, color: '#000',
        }}>approve · €18,00</div>
        <div style={{
          width: 80, height: 40, borderRadius: 20, background: BF_COLORS.cardHi,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: SF, fontSize: 14, fontWeight: 600, color: BF_COLORS.sub,
        }}>decline</div>
      </div>
    </PostCard>
  );
}

// ──────── feed ────────
function Feed() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px 40px' }}>
      <InsightPost />
      <BillPost />
      <RequestPost />
      <SubPost />
    </div>
  );
}

// ──────── header ────────
function TopBar() {
  return (
    <div style={{
      padding: '10px 20px 8px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'baseline', gap: 8,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        <span style={{ fontFamily: SFR, fontSize: 26, fontWeight: 800, color: BF_COLORS.text, letterSpacing: -0.6 }}>
          flatmate
        </span>
        <span style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, fontWeight: 500 }}>
          de pijp 42
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 18, background: BF_COLORS.card,
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
        }}>
          <svg width="17" height="19" viewBox="0 0 17 19" fill="none">
            <path d="M8.5 1.5C5.7 1.5 3.5 3.7 3.5 6.5v3l-1.5 2.5h13l-1.5-2.5v-3c0-2.8-2.2-5-5-5zM6.5 15a2 2 0 004 0" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div style={{ position: 'absolute', top: 8, right: 10, width: 7, height: 7, borderRadius: 4, background: BF_COLORS.coral, border: '1.5px solid #000' }} />
        </div>
        <Avatar initial="M" color={BF_COLORS.green} size={36} />
      </div>
    </div>
  );
}

// (ChatBar moved to ./components)

function TabBar({ active = 'home', onTab }) {
  const tabs = [
    { k: 'home', label: 'home', icon: (c, a) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M3 10L11 3l8 7v9a1 1 0 01-1 1h-4v-6H8v6H4a1 1 0 01-1-1v-9z" fill={a ? c : 'none'} stroke={c} strokeWidth="1.6" strokeLinejoin="round"/>
      </svg>
    )},
    { k: 'feed', label: 'feed', icon: (c, a) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="3" y="3" width="7" height="9" rx="2" fill={a ? c : 'none'} stroke={c} strokeWidth="1.6"/>
        <rect x="12" y="3" width="7" height="5" rx="2" stroke={c} strokeWidth="1.6"/>
        <rect x="12" y="10" width="7" height="9" rx="2" stroke={c} strokeWidth="1.6"/>
        <rect x="3" y="14" width="7" height="5" rx="2" stroke={c} strokeWidth="1.6"/>
      </svg>
    )},
    { k: 'subs', label: 'subs', icon: (c) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M4 7h14M4 11h14M4 15h10" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="18" cy="15" r="2" stroke={c} strokeWidth="1.8"/>
      </svg>
    )},
    { k: 'mates', label: 'mates', icon: (c, a) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="8" cy="8" r="3.4" fill={a ? c : 'none'} stroke={c} strokeWidth="1.6"/>
        <circle cx="15.5" cy="8.5" r="2.6" stroke={c} strokeWidth="1.6"/>
        <path d="M2.5 18c0.5-2.7 2.7-4.5 5.5-4.5s5 1.8 5.5 4.5" stroke={c} strokeWidth="1.6" strokeLinecap="round" fill="none"/>
        <path d="M14 14c2.4 0.2 4.3 1.6 5 4" stroke={c} strokeWidth="1.6" strokeLinecap="round" fill="none"/>
      </svg>
    )},
  ];
  return (
    <div style={{
      height: 58, borderRadius: 29, position: 'relative', overflow: 'hidden', marginTop: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3)',
    }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 29,
        background: 'rgba(20,20,24,0.48)',
        backdropFilter: 'blur(30px) saturate(160%)',
        WebkitBackdropFilter: 'blur(30px) saturate(160%)',
        border: '0.5px solid rgba(255,255,255,0.08)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 29,
        boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.09)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'relative', zIndex: 1, height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '0 4px',
      }}>
        {tabs.map(t => {
          const a = t.k === active;
          return (
            <div key={t.k} onClick={() => onTab?.(t.k)} style={{
              flex: 1, height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              cursor: onTab ? 'pointer' : 'default',
            }}>
              {t.icon(a ? BF_COLORS.text : BF_COLORS.ter, a)}
              <span style={{
                fontFamily: SF, fontSize: 10, fontWeight: 600, letterSpacing: 0.1,
                color: a ? BF_COLORS.text : BF_COLORS.ter,
              }}>{t.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Dock is rendered at app root (above any sheet) so it never moves.
// `aiOpen` flips the ChatBar icon to chevron-down so the same control closes AI.
function Dock({ active = 'home', aiOpen = false, preview, onTab }) {
  return (
    <div style={{
      // z 700 = above AIWindow (z 600) so the ChatBar input stays visible
      // and tappable when the AI sheet is extended.
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 700,
      padding: '12px 12px 30px',
      background: 'linear-gradient(to top, #000 25%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 72%)',
      pointerEvents: 'none',
    }}>
      <div style={{ pointerEvents: 'auto' }}>
        {preview}
        <ChatBar aiOpen={aiOpen} />
        <TabBar active={active} onTab={onTab} />
      </div>
    </div>
  );
}

// AIPreviewSlot — wraps the preview pill and the toggle chevron.
// Chevron is in a fixed slot above the ChatBar (right-aligned, same X both
// states). Preview animates max-height + opacity below it.
function AIPreviewSlot({ tail, hidden, onToggle }) {
  return (
    <>
      <div style={{
        maxHeight: hidden ? 0 : 280,
        opacity: hidden ? 0 : 1,
        overflow: 'hidden',
        transition:
          'max-height 320ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease',
      }}>
        <AIPreview tail={tail} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'flex-end',
        paddingRight: 36, height: 22, marginBottom: 4,
      }}>
        <button
          onClick={onToggle}
          aria-label={hidden ? 'show preview' : 'hide preview'}
          style={{
            width: 40, height: 22, borderRadius: 11,
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          <svg
            width="22" height="9" viewBox="0 0 22 9" fill="none"
            style={{
              transform: hidden ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            <path d="M2 2l9 5 9-5" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </>
  );
}
const DOCK_HEIGHT = 164; // for sheets that need to leave room for the dock

// ──────── screen ────────
function FeedScreen() {
  return (
    <div style={{ background: BF_COLORS.bg, minHeight: '100%', paddingTop: 54 }}>
      <TopBar />
      <MembersStrip />
      <Feed />
      <Dock />
    </div>
  );
}

// ═══ FeedScreenV2 — minimal feed using Post primitive ════════════════
const SAMPLE_POSTS = [
  {
    id: 'p-store-run',
    author: { id: 'lena', name: 'lena', initial: 'L', color: BF_COLORS.lime },
    time: '20m',
    text: 'going to AH in 20min — anyone want anything? putting on the list now 🛒',
    replyCount: 4,
    replyAvatars: [
      { initial: 'S', color: BF_COLORS.coral },
      { initial: 'A', color: BF_COLORS.amber },
      { initial: 'M', color: BF_COLORS.lime },
    ],
    lastActivity: '2m',
    replies: [
      { author: { name: 'sam', initial: 'S', color: BF_COLORS.coral }, time: '18m', text: 'oat milk + sourdough please 🙏' },
      { author: { name: 'alex', initial: 'A', color: BF_COLORS.amber }, time: '14m', text: 'nothing for me thx, just stocked up' },
      { author: { name: 'marleen', initial: 'M', color: BF_COLORS.lime }, time: '8m', text: 'matcha tin if they have it (not the cheap one)' },
      { author: { name: 'sam', initial: 'S', color: BF_COLORS.coral }, time: '2m', text: 'oh and tomatoes for tonight!' },
    ],
    // Split spawned from this thread → parent_id = post id.
    // Standalone splits (created from the home request/split form) have parent_id: null.
    split: {
      id: 'sp-store-run',
      parent_id: 'p-store-run',
      type: 'split',
      label: 'AH groceries',
      paidBy: 'lena',
      paidByColor: BF_COLORS.lime,
      emoji: '🛒',
      ago: '5m',
      note: 'oat milk, sourdough, tomatoes, matcha · split 3 ways',
      total: 23.40,
      perPerson: 7.80,
      members: [
        { id: 'lena',    name: 'lena',    initial: 'L', color: BF_COLORS.lime,  paid: true,  isPayer: true },
        { id: 'sam',     name: 'sam',     initial: 'S', color: BF_COLORS.coral, paid: false, isMe: true },
        { id: 'marleen', name: 'marleen', initial: 'M', color: BF_COLORS.lime,  paid: false },
      ],
    },
  },
  {
    id: 'p-vacuum',
    author: { id: 'sam', name: 'sam', initial: 'S', color: BF_COLORS.coral },
    time: '3h',
    text: "the vacuum is making a weird noise. i think it's dying 🪦\n\nshould we get a new one? saw a decent dyson refurb for €180",
    replyCount: 6,
    replyAvatars: [
      { initial: 'L', color: BF_COLORS.lime },
      { initial: 'M', color: BF_COLORS.amber },
    ],
    lastActivity: '1h',
    replies: [
      { author: { name: 'lena', initial: 'L', color: BF_COLORS.lime }, time: '2h', text: "yeah it's been weird for weeks tbh" },
      { author: { name: 'alex', initial: 'A', color: BF_COLORS.amber }, time: '2h', text: '+1 dyson refurb, that\'s a great price' },
      { author: { name: 'marleen', initial: 'M', color: BF_COLORS.lime }, time: '1h', text: 'split it 4 ways = €45 each? happy with that' },
      { author: { name: 'lena', initial: 'L', color: BF_COLORS.lime }, time: '1h', text: 'sounds good. sam wanna order it?' },
    ],
  },
  {
    id: 'p-dinner',
    author: { id: 'alex', name: 'alex', initial: 'A', color: BF_COLORS.amber },
    time: 'yesterday',
    text: 'cooking pasta tonight, enough for 4. who\'s in?',
    replyCount: 2,
    replyAvatars: [
      { initial: 'L', color: BF_COLORS.lime },
      { initial: 'S', color: BF_COLORS.coral },
    ],
    lastActivity: '14h',
    replies: [
      { author: { name: 'lena', initial: 'L', color: BF_COLORS.lime }, time: '14h', text: 'in! 🍝' },
      { author: { name: 'sam', initial: 'S', color: BF_COLORS.coral }, time: '13h', text: 'yes pls. i\'ll do dishes' },
    ],
  },
];

// ═══ ThreadPage — slide-up overlay for a single post + replies ═══════
// Mirrors ItemPage / MatePage pattern: position absolute, translateY when
// closed, sticky header with close, scrollable inner with overscroll-contain,
// composer pinned to bottom. Z 280 so ItemPage (300) can open over it.

// splitToItem — reshape a split (attached to a post) into the request-item
// shape ItemPage understands. ItemPage's RequestContent renders SplitTracker
// when splitMembers is present, which is what we want.
function splitToItem(split, post) {
  return {
    id: split.id,
    parent_id: split.parent_id,
    type: 'request',
    from: split.paidBy,
    fromColor: split.paidByColor,
    ago: split.ago || 'today',
    title: split.label,
    note: split.note || `split ${split.members.length} ways`,
    amt: split.perPerson,
    total: split.total,
    emoji: split.emoji || '🛒',
    hasReceipt: false,
    splitMembers: split.members,
    message: post?.text ? `spawned from "${post.text.slice(0, 60)}${post.text.length > 60 ? '…' : ''}"` : undefined,
  };
}

function ThreadPage({ post, open, onClose, onOpenItem, housemates, onScanForPost }) {
  // Live-mode (post fetched from backend) keeps its own detail in state so we
  // can re-fetch after a comment / split is added.
  const [detail, setDetail] = React.useState(null);
  const [splitFormOpen, setSplitFormOpen] = React.useState(false);
  const isLive = !!post?._live;

  const refresh = React.useCallback(async () => {
    if (!isLive || !post?.id) return;
    try {
      const { getPost } = await import('./api');
      setDetail(await getPost(post.id));
    } catch (e) {
      console.error('post detail fetch failed', e);
    }
  }, [isLive, post?.id]);

  // Re-fetch whenever the sheet opens so we always show fresh comments.
  React.useEffect(() => {
    if (open && isLive) { setDetail(null); refresh(); }
  }, [open, isLive, refresh]);

  React.useEffect(() => {
    if (!open || !post) return
    registry.register('feed_post_detail', () => ({
      post_id: post.id,
      post_text: post.text,
      author: { id: post.author?.id, name: post.author?.name },
      comments: (post.comments || []).map(c => ({
        author: { id: c.author?.id, name: c.author?.name },
        text: c.text,
      })),
    }))
    return () => registry.unregister('feed_post_detail')
  }, [open, post?.id])

  if (!post) return null;

  // Pick the source of truth for replies + split: backend payload when live,
  // otherwise the mock fields baked into SAMPLE_POSTS.
  const replies = isLive
    ? (detail?.comments || []).map(c => ({
        author: { name: c.author.name, initial: (c.author.name[0] || '?').toUpperCase(), color: c.author.color },
        time: shortAgo(c.created_at),
        text: c.text,
      }))
    : (post.replies || []);

  // Live post split → reshape API ItemOut into the existing splitToItem shape.
  let splitForCard = null;
  if (isLive && detail?.split) {
    const s = detail.split;
    const findMate = (uid) => housemates?.find(h => h.id === uid);
    const payer = findMate(s.payer_id);
    const perPerson = Number(s.total) / (s.members.length || 1);
    splitForCard = {
      id: s.id, parent_id: s.parent_id,
      label: s.title, paidBy: payer?.name || '?', paidByColor: payer?.color || BF_COLORS.lime,
      ago: shortAgo(s.created_at),
      total: Number(s.total), perPerson, emoji: '🛒',
      note: s.note || `split ${s.members.length} ways`,
      members: s.members.map(m => {
        const u = findMate(m.user_id);
        return {
          id: m.user_id,
          name: u?.name || '?',
          initial: (u?.name || '?')[0].toUpperCase(),
          color: u?.color || BF_COLORS.lime,
          paid: m.paid, isPayer: m.is_payer, isMe: u?.is_me,
        };
      }),
    };
  } else if (post.split) {
    splitForCard = post.split;
  }

  const sendComment = async (text) => {
    if (!isLive) return;
    try {
      const { addComment } = await import('./api');
      await addComment(post.id, text);
      await refresh();
    } catch (e) {
      console.error('comment failed', e);
    }
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 280,
      background: BF_COLORS.bg,
      transform: open ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)',
      borderRadius: open ? 0 : '24px 24px 0 0',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* Sticky header — back arrow + "thread" label */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        padding: '54px 16px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(to bottom, #000 60%, rgba(0,0,0,0))',
        pointerEvents: 'none',
      }}>
        <div onClick={onClose} style={{
          width: 36, height: 36, borderRadius: 18, background: BF_COLORS.cardHi,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          pointerEvents: 'auto',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M10 3L4 7l6 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{
          fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 700,
          letterSpacing: 0.4, textTransform: 'uppercase',
        }}>thread</div>
        <div style={{ width: 36 }} />
      </div>

      {/* Scrollable content — pinned post + replies */}
      <div style={{
        flex: 1, overflowY: 'auto',
        paddingTop: 96, paddingBottom: 110,
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ padding: '0 16px' }}>
          <Post
            author={post.author}
            time={post.time}
            text={post.text}
            attachment={post.attachment}
          />
          {onScanForPost && (
            <button
              onClick={() => onScanForPost(post)}
              style={{
                padding: '10px 16px', borderRadius: 18,
                background: BF_COLORS.lime, color: '#000', border: 'none',
                fontFamily: SF, fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
                cursor: 'pointer', marginTop: 12, alignSelf: 'flex-start',
              }}
            >
              scan a receipt for this
            </button>
          )}
        </div>

        {replies.length > 0 && (
          <div style={{ padding: '4px 20px 12px' }}>
            <div style={{
              fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 700,
              letterSpacing: 0.4, textTransform: 'uppercase',
              padding: '14px 0 10px',
            }}>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {replies.map((r, i) => (
                <ReplyRow key={i} reply={r} />
              ))}
            </div>
          </div>
        )}

        {splitForCard && (
          <div style={{ padding: '10px 0 4px' }}>
            <div style={{
              fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 700,
              letterSpacing: 0.4, textTransform: 'uppercase',
              padding: '14px 20px 10px',
            }}>spawned split</div>
            <div style={{ padding: '0 16px' }}>
              <ExpenseCard
                from={{ name: splitForCard.paidBy, color: splitForCard.paidByColor }}
                verb={`split · ${splitForCard.members.length} ways`}
                ago={splitForCard.ago}
                amount={splitForCard.perPerson}
                emoji={splitForCard.emoji}
                title={splitForCard.label}
                note={splitForCard.note}
                onClick={() => onOpenItem?.(splitToItem(splitForCard, post))}
              />
            </div>
          </div>
        )}

        {/* "+ split" affordance — only when live AND no split exists yet */}
        {isLive && !splitForCard && (
          <div style={{ padding: '10px 16px 4px' }}>
            <div onClick={() => setSplitFormOpen(true)} style={{
              padding: '12px 14px', borderRadius: 16,
              background: 'rgba(184,240,74,0.08)',
              border: `0.5px dashed rgba(184,240,74,0.5)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: 'pointer',
              fontFamily: SF, fontSize: 13, fontWeight: 700, color: BF_COLORS.lime,
              letterSpacing: -0.1,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v10M2 7h10" stroke={BF_COLORS.lime} strokeWidth="2" strokeLinecap="round"/></svg>
              spawn split from this post
            </div>
          </div>
        )}
      </div>

      {/* Composer — pinned bottom */}
      <ThreadComposer onSend={isLive ? sendComment : undefined} />

      {splitFormOpen && (
        <ThreadSplitForm
          post={post}
          housemates={housemates || []}
          onClose={() => setSplitFormOpen(false)}
          onCreated={async () => { setSplitFormOpen(false); await refresh(); }}
        />
      )}
    </div>
  );
}

function ReplyRow({ reply }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <Avatar initial={reply.author.initial} color={reply.author.color} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
          <span style={{
            fontFamily: SFR, fontSize: 13.5, fontWeight: 700,
            color: BF_COLORS.text, letterSpacing: -0.1,
          }}>{reply.author.name}</span>
          <span style={{ fontFamily: SF, fontSize: 11.5, color: BF_COLORS.sub }}>· {reply.time}</span>
        </div>
        <div style={{
          fontFamily: SF, fontSize: 14, color: BF_COLORS.text,
          letterSpacing: -0.1, lineHeight: 1.4,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>{reply.text}</div>
      </div>
    </div>
  );
}

function ThreadComposer({ onSend }) {
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    if (!onSend) { setText(''); return; }
    setBusy(true);
    try { await onSend(t); setText(''); }
    catch (e) { console.error('reply failed', e); }
    finally { setBusy(false); }
  };
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '14px 16px 28px',
      background: 'linear-gradient(to top, #000 50%, rgba(0,0,0,0))',
    }}>
      <div style={{
        height: 50, borderRadius: 25,
        background: 'rgba(255,255,255,0.08)',
        border: `0.5px solid ${BF_COLORS.hairline}`,
        display: 'flex', alignItems: 'center', padding: '0 6px 0 16px', gap: 8,
      }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="reply…"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: SF, fontSize: 14.5, color: BF_COLORS.text,
            letterSpacing: -0.1, padding: 0,
          }}
        />
        <div
          onClick={send}
          style={{
            width: 38, height: 38, borderRadius: 19,
            background: text.trim() ? BF_COLORS.lime : 'rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: text.trim() ? 'pointer' : 'default',
            transition: 'background 160ms ease',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 11V3M3 7l4-4 4 4" stroke={text.trim() ? '#000' : BF_COLORS.sub} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

// ═══ ThreadSplitForm — inline modal to spawn a split off a feed post ═══
// Slide-up over ThreadPage (z 290). Title + total + member-select chips.
// Submits POST /posts/:id/split with equal-split semantics; payer = me.
function ThreadSplitForm({ post, housemates, onClose, onCreated }) {
  const me = housemates.find(h => h.is_me);
  const initialMembers = React.useMemo(() => new Set(housemates.map(h => h.id)), [housemates]);
  const [title, setTitle] = React.useState(() => {
    const t = (post?.text || '').trim();
    return t ? t.slice(0, 60) : '';
  });
  const [totalStr, setTotalStr] = React.useState('');
  const [memberIds, setMemberIds] = React.useState(initialMembers);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  const total = parseFloat(totalStr.replace(',', '.'));
  const validTotal = !Number.isNaN(total) && total > 0;
  const hasPayer = me && memberIds.has(me.id);
  const canSubmit = title.trim().length > 0 && validTotal && memberIds.size > 0 && hasPayer && !busy;

  const toggleMember = (id) => {
    setMemberIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setErr(null);
    try {
      const { createSplitOnPost } = await import('./api');
      await createSplitOnPost(post.id, {
        title: title.trim(),
        total,
        currency: 'EUR',
        payer_id: me.id,
        members: Array.from(memberIds).map((user_id) => ({ user_id })),
      });
      onCreated?.();
    } catch (e) {
      setErr(e?.body?.detail || e.message || 'failed to create split');
    } finally {
      setBusy(false);
    }
  };

  const perPerson = validTotal && memberIds.size > 0 ? total / memberIds.size : 0;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 290,
      background: BF_COLORS.bg,
      display: 'flex', flexDirection: 'column',
      borderRadius: 0, overflow: 'hidden',
    }}>
      <div style={{
        padding: '54px 16px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div onClick={onClose} style={{
          width: 36, height: 36, borderRadius: 18, background: BF_COLORS.cardHi,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </div>
        <div style={{
          fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 700,
          letterSpacing: 0.4, textTransform: 'uppercase',
        }}>spawn split</div>
        <div
          onClick={submit}
          style={{
            padding: '8px 14px', borderRadius: 18,
            background: canSubmit ? BF_COLORS.lime : 'rgba(255,255,255,0.06)',
            color: canSubmit ? '#000' : BF_COLORS.sub,
            fontFamily: SF, fontSize: 13, fontWeight: 700,
            cursor: canSubmit ? 'pointer' : 'default',
            transition: 'background 160ms ease',
          }}
        >{busy ? '…' : 'create'}</div>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', padding: '8px 16px 24px',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div>
          <div style={{ fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. groceries"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '14px 14px', borderRadius: 14,
              background: BF_COLORS.cardHi, border: 'none', outline: 'none',
              fontFamily: SF, fontSize: 15, color: BF_COLORS.text, letterSpacing: -0.1,
            }}
          />
        </div>

        <div>
          <div style={{ fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>total (€)</div>
          <input
            value={totalStr}
            onChange={(e) => setTotalStr(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '14px 14px', borderRadius: 14,
              background: BF_COLORS.cardHi, border: 'none', outline: 'none',
              fontFamily: SF, fontSize: 22, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.3,
            }}
          />
          {validTotal && memberIds.size > 0 && (
            <div style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, marginTop: 6, letterSpacing: -0.05 }}>
              €{perPerson.toFixed(2)} each · split {memberIds.size} ways
            </div>
          )}
        </div>

        <div>
          <div style={{ fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10 }}>split with</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {housemates.map((h) => {
              const on = memberIds.has(h.id);
              return (
                <div
                  key={h.id}
                  onClick={() => toggleMember(h.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px 8px 8px', borderRadius: 22,
                    background: on ? 'rgba(184,240,74,0.14)' : BF_COLORS.cardHi,
                    border: on ? `0.5px solid ${BF_COLORS.lime}` : `0.5px solid ${BF_COLORS.hairline}`,
                    cursor: 'pointer',
                  }}
                >
                  <Avatar initial={(h.name[0] || '?').toUpperCase()} color={h.color} size={24} />
                  <div style={{ fontFamily: SF, fontSize: 13.5, fontWeight: 600, color: BF_COLORS.text, letterSpacing: -0.1 }}>
                    {h.is_me ? 'me' : h.name}
                  </div>
                </div>
              );
            })}
          </div>
          {!hasPayer && (
            <div style={{ fontFamily: SF, fontSize: 12, color: '#FF7A8A', marginTop: 8 }}>
              you must be in the split (you're the payer)
            </div>
          )}
        </div>

        {err && (
          <div style={{
            padding: '12px 14px', borderRadius: 12,
            background: 'rgba(255,122,138,0.08)', border: '0.5px solid rgba(255,122,138,0.4)',
            fontFamily: SF, fontSize: 13, color: '#FF7A8A', letterSpacing: -0.1,
          }}>{err}</div>
        )}
      </div>
    </div>
  );
}

// ═══ ProfilePage — slide-up overlay with bunq account balance ═════════
// Same overlay pattern (z 290, translateY when closed). Consumes `me` from
// /me and calls `onLogout` to clear the cookie + bounce back to Landing.
// Balance/IBAN placeholders remain until we wire the bunq read-endpoints.
function ProfilePage({ open, onClose, me, onLogout, bunqAccount, bunqLoading, onRefreshBunq }) {
  // Render IBAN as `NL••   •••• •••• ••91` — keeps the country prefix + last
  // 4 visible but hides the rest. Full IBAN → groups of 4 for legibility.
  const formatIban = (iban) => {
    if (!iban) return null;
    const clean = iban.replace(/\s+/g, '');
    const tail = clean.slice(-4);
    const head = clean.slice(0, 2);
    return `${head}•• •••• •••• ${tail}`;
  };
  const balanceValue = bunqAccount?.balance != null
    ? Number(bunqAccount.balance)
    : null;
  const display = {
    name: me?.name || '—',
    initial: (me?.name || '?').slice(0, 1).toUpperCase(),
    color: me?.color || BF_COLORS.green,
    handle: me?.email ? `@${me.email.split('@')[0]}` : (me?.bunq_label ? `@${me.bunq_label}` : ''),
    bunq: {
      label: bunqAccount?.description || (me?.bunq_label ? `bunq · ${me.bunq_label}` : 'bunq'),
      iban: formatIban(bunqAccount?.iban) || 'NL•• •••• •••• ••••',
      balance: balanceValue,
      currency: bunqAccount?.currency || 'EUR',
    },
  };
  const balanceStr = balanceValue == null ? null : balanceValue.toFixed(2).split('.');
  const [intStr, decStr] = balanceStr || ['—', '—'];
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 290,
      background: BF_COLORS.bg,
      transform: open ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)',
      borderRadius: open ? 0 : '24px 24px 0 0',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* Sticky header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        padding: '54px 16px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(to bottom, #000 60%, rgba(0,0,0,0))',
        pointerEvents: 'none',
      }}>
        <div onClick={onClose} style={{
          width: 36, height: 36, borderRadius: 18, background: BF_COLORS.cardHi,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          pointerEvents: 'auto',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M10 3L4 7l6 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{
          fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 700,
          letterSpacing: 0.4, textTransform: 'uppercase',
        }}>profile</div>
        <div style={{ width: 36 }} />
      </div>

      <div style={{
        flex: 1, overflowY: 'auto',
        paddingTop: 96, paddingBottom: 60,
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* Identity hero */}
        <div style={{
          padding: '0 20px 24px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}>
          <Avatar initial={display.initial} color={display.color} size={88} />
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: SFR, fontSize: 24, fontWeight: 800,
              color: BF_COLORS.text, letterSpacing: -0.5,
            }}>{display.name}</div>
            <div style={{
              fontFamily: SF, fontSize: 13, color: BF_COLORS.sub,
              marginTop: 2, letterSpacing: -0.1,
            }}>{display.handle}</div>
          </div>
        </div>

        {/* Bunq account section */}
        <div style={{ padding: '0 20px' }}>
          <div style={{
            fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 700,
            letterSpacing: 0.4, textTransform: 'uppercase',
            padding: '0 4px 10px',
          }}>connected account</div>

          <Card padding="20px 20px 22px" radius={22}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'linear-gradient(135deg, #2ecc71, #00d26a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: SFR, fontSize: 12, fontWeight: 800, color: '#000',
              }}>b</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: SF, fontSize: 14, fontWeight: 700, color: BF_COLORS.text,
                  letterSpacing: -0.1,
                }}>{display.bunq.label}</div>
                <div style={{
                  fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, marginTop: 1,
                  letterSpacing: 0.2,
                }}>{display.bunq.iban}</div>
              </div>
            </div>

            <div style={{
              fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 600,
              letterSpacing: 0.6, textTransform: 'uppercase',
            }}>balance</div>
            <div style={{
              marginTop: 4, display: 'flex', alignItems: 'baseline',
              whiteSpace: 'nowrap',
            }}>
              {balanceStr ? (
                <>
                  <span style={{
                    fontFamily: SFR, fontSize: 44, fontWeight: 800,
                    color: BF_COLORS.text, letterSpacing: -1.4, lineHeight: 1,
                  }}>€{Number(intStr).toLocaleString('de-DE')}</span>
                  <span style={{
                    fontFamily: SFR, fontSize: 22, fontWeight: 700,
                    color: BF_COLORS.sub, letterSpacing: -0.5, marginLeft: 1,
                  }}>,{decStr}</span>
                </>
              ) : (
                <span style={{
                  fontFamily: SFR, fontSize: 22, fontWeight: 600,
                  color: BF_COLORS.sub, letterSpacing: -0.4,
                }}>syncing with bunq…</span>
              )}
            </div>
          </Card>

          {/* Sign out */}
          <div style={{ padding: '22px 0 0' }}>
            <div
              onClick={onLogout}
              style={{
                padding: '14px 18px', borderRadius: 16,
                background: 'rgba(255,77,94,0.08)',
                border: `0.5px solid rgba(255,77,94,0.25)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                cursor: 'pointer',
                fontFamily: SFR, fontSize: 14, fontWeight: 700, color: BF_COLORS.red,
                letterSpacing: -0.1,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3H3v10h3M10 5l3 3-3 3M6 8h7" stroke={BF_COLORS.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              sign out of bunq
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ NotificationsPage — slide-up overlay listing recent notifications ═
// Same overlay pattern (z 290). Reuses List + ListRow primitives. Each
// notification row is identified by `kind` for an icon glyph and routes
// later to the matching detail page (item / mate / thread).
const SAMPLE_NOTIFICATIONS = [
  // today
  { id: 'n1', section: 'today',     kind: 'request',   actor: { name: 'alex',    initial: 'A', color: BF_COLORS.blue },  title: 'requested €6,20',      sub: 'cleaning supplies · split 4 ways', time: '12m', unread: true },
  { id: 'n2', section: 'today',     kind: 'reply',     actor: { name: 'sam',     initial: 'S', color: BF_COLORS.coral }, title: 'replied to "going to AH"', sub: 'oh and tomatoes for tonight!',  time: '1h',  unread: true },
  { id: 'n3', section: 'today',     kind: 'paid',      actor: { name: 'lena',    initial: 'L', color: BF_COLORS.lime },  title: 'paid you €4,20',        sub: 'thanks for the vase 🌸',           time: '3h',  unread: true },
  { id: 'n4', section: 'today',     kind: 'ai',        actor: { name: 'bunq ai', initial: '✨', color: BF_COLORS.lime }, title: 'your weekly summary is ready', sub: '4 new requests · €18 settled', time: '6h' },
  // yesterday
  { id: 'n5', section: 'yesterday', kind: 'post',      actor: { name: 'marleen', initial: 'M', color: BF_COLORS.amber }, title: 'started a new post',     sub: 'who wants to chip in for a vacuum?', time: 'yesterday' },
  { id: 'n6', section: 'yesterday', kind: 'remind',    actor: { name: 'sam',     initial: 'S', color: BF_COLORS.coral }, title: 'still owes €18,40',      sub: 'pizza night · last nudged 3d ago', time: 'yesterday' },
  // earlier
  { id: 'n7', section: 'earlier',   kind: 'paid',      actor: { name: 'alex',    initial: 'A', color: BF_COLORS.blue },  title: 'paid you €11,90',        sub: 'house dinner · settled',           time: '3d' },
  { id: 'n8', section: 'earlier',   kind: 'subscription', actor: { name: 'spotify', initial: '♫', color: BF_COLORS.green }, title: 'spotify family renewed', sub: 'split 4 ways · €4,25 each',     time: '5d' },
];

function NotifGlyph({ kind }) {
  const map = {
    request:      { bg: BF_COLORS.coral, glyph: '↓' },
    reply:        { bg: 'rgba(255,255,255,0.12)', glyph: '💬' },
    paid:         { bg: BF_COLORS.green, glyph: '✓' },
    ai:           { bg: BF_COLORS.lime,  glyph: '✨' },
    post:         { bg: BF_COLORS.amber, glyph: '＋' },
    remind:       { bg: BF_COLORS.coral, glyph: '!' },
    subscription: { bg: BF_COLORS.lime,  glyph: '↻' },
  };
  const m = map[kind] || map.reply;
  return (
    <div style={{
      width: 20, height: 20, borderRadius: 10, background: m.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 800, color: '#000',
      border: '2px solid #000', flexShrink: 0,
    }}>{m.glyph}</div>
  );
}

function NotificationsPage({ open, onClose }) {
  const sections = ['today', 'yesterday', 'earlier'];
  const grouped = sections.map(s => ({ section: s, items: SAMPLE_NOTIFICATIONS.filter(n => n.section === s) }))
    .filter(g => g.items.length > 0);
  const unreadCount = SAMPLE_NOTIFICATIONS.filter(n => n.unread).length;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 290,
      background: BF_COLORS.bg,
      transform: open ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)',
      borderRadius: open ? 0 : '24px 24px 0 0',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* Sticky header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        padding: '54px 16px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(to bottom, #000 60%, rgba(0,0,0,0))',
        pointerEvents: 'none',
      }}>
        <div onClick={onClose} style={{
          width: 36, height: 36, borderRadius: 18, background: BF_COLORS.cardHi,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          pointerEvents: 'auto',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M10 3L4 7l6 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{
          fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 700,
          letterSpacing: 0.4, textTransform: 'uppercase',
        }}>notifications</div>
        <div style={{
          minWidth: 36, height: 22, padding: '0 8px', borderRadius: 11,
          background: unreadCount > 0 ? 'rgba(255,90,90,0.16)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: SFR, fontSize: 11, fontWeight: 800,
          color: unreadCount > 0 ? BF_COLORS.coral : 'transparent',
          letterSpacing: 0.2, pointerEvents: 'auto',
        }}>{unreadCount > 0 ? `${unreadCount} new` : ''}</div>
      </div>

      {/* Scrollable list */}
      <div style={{
        flex: 1, overflowY: 'auto',
        paddingTop: 96, paddingBottom: 60,
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {grouped.map(g => (
            <div key={g.section}>
              <div style={{
                fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 700,
                letterSpacing: 0.4, textTransform: 'uppercase',
                padding: '0 8px 10px',
              }}>{g.section}</div>
              <List>
                {g.items.map(n => (
                  <ListRow
                    key={n.id}
                    leading={
                      <div style={{ position: 'relative' }}>
                        <Avatar initial={n.actor.initial} color={n.actor.color} size={36} />
                        <div style={{ position: 'absolute', bottom: -2, right: -2 }}>
                          <NotifGlyph kind={n.kind} />
                        </div>
                      </div>
                    }
                    title={
                      <span>
                        <span style={{ fontWeight: 700 }}>{n.actor.name}</span>{' '}
                        <span style={{ color: BF_COLORS.sub, fontWeight: 500 }}>{n.title}</span>
                      </span>
                    }
                    titleAfter={n.unread ? (
                      <div style={{
                        width: 7, height: 7, borderRadius: 4,
                        background: BF_COLORS.coral, marginLeft: 6,
                      }} />
                    ) : null}
                    sub={n.sub}
                    trailing={
                      <span style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.sub }}>
                        {n.time}
                      </span>
                    }
                  />
                ))}
              </List>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Quick relative-time formatter used by the live feed (matches the mock
// strings: "20m" / "3h" / "yesterday").
function shortAgo(iso) {
  if (!iso) return '';
  const t = typeof iso === 'string' ? new Date(iso).getTime() : new Date(iso).getTime();
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 2) return 'yesterday';
  return `${Math.floor(s / 86400)}d`;
}

// Map a backend post into the props the Post component expects.
function postFromApi(p) {
  const author = {
    id: p.author?.id, name: p.author?.name || '?',
    initial: (p.author?.name || '?')[0].toUpperCase(),
    color: p.author?.color || BF_COLORS.lime,
  };
  return {
    id: p.id,
    _live: true,
    author,
    time: shortAgo(p.created_at),
    text: p.text,
    replyCount: p.comment_count || 0,
    replyAvatars: [],
    lastActivity: undefined,
    split: p.split || null,
  };
}

function FeedScreenV2({ onOpenPost }) {
  const [posts, setPosts] = React.useState(null); // null = loading; [] = empty live; SAMPLE_POSTS = fallback
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [posting, setPosting] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const { listPosts } = await import('./api');
      const rows = await listPosts();
      setPosts(rows.map(postFromApi));
    } catch (e) {
      // Backend unreachable → keep working with the mock list so the UI demo runs.
      setPosts(SAMPLE_POSTS);
    }
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  const submitPost = async () => {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const { createPost } = await import('./api');
      const created = await createPost(text);
      setPosts(prev => [postFromApi(created), ...(prev || [])]);
      setDraft('');
      setComposeOpen(false);
    } catch (e) {
      console.error('post failed', e);
    } finally {
      setPosting(false);
    }
  };

  const list = posts ?? [];
  return (
    <div style={{
      background: BF_COLORS.bg, minHeight: '100%',
      paddingTop: 58, paddingBottom: 160,
    }}>
      <div style={{
        padding: '0 20px 18px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: SFR, fontSize: 28, fontWeight: 800,
            color: BF_COLORS.text, letterSpacing: -0.6,
          }}>feed</div>
          <div style={{
            fontFamily: SF, fontSize: 13, color: BF_COLORS.sub,
            marginTop: 2, letterSpacing: -0.1,
          }}>what's happening in the house</div>
        </div>
        <div onClick={() => setComposeOpen(o => !o)} style={{
          width: 36, height: 36, borderRadius: 18, background: BF_COLORS.lime,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(184,240,74,0.25)',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v10M2 7h10" stroke="#000" strokeWidth="2" strokeLinecap="round"/></svg>
        </div>
      </div>

      {composeOpen && (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{
            background: BF_COLORS.card, borderRadius: 18,
            border: `0.5px solid ${BF_COLORS.hairline}`,
            padding: 12,
          }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="what's on your mind?"
              rows={3}
              style={{
                width: '100%', resize: 'vertical', minHeight: 64,
                background: 'transparent', border: 'none', outline: 'none',
                fontFamily: SF, fontSize: 14, color: BF_COLORS.text,
                letterSpacing: -0.1, lineHeight: 1.4,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <div onClick={() => { setComposeOpen(false); setDraft(''); }} style={{
                padding: '6px 12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', cursor: 'pointer',
                fontFamily: SF, fontSize: 13, fontWeight: 600, color: BF_COLORS.sub,
              }}>cancel</div>
              <div onClick={submitPost} style={{
                padding: '6px 14px', borderRadius: 12,
                background: draft.trim() ? BF_COLORS.lime : 'rgba(255,255,255,0.08)',
                color: draft.trim() ? '#000' : BF_COLORS.sub,
                cursor: draft.trim() ? 'pointer' : 'default', opacity: posting ? 0.5 : 1,
                fontFamily: SF, fontSize: 13, fontWeight: 700,
              }}>{posting ? 'posting…' : 'post'}</div>
            </div>
          </div>
        </div>
      )}

      <div style={{
        padding: '0 16px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {posts === null && (
          <div style={{ padding: 30, textAlign: 'center', color: BF_COLORS.sub, fontFamily: SF, fontSize: 13 }}>
            loading…
          </div>
        )}
        {list.map(p => (
          <Post
            key={p.id}
            author={p.author}
            time={p.time}
            text={p.text}
            replyCount={p.replyCount}
            replyAvatars={p.replyAvatars}
            lastActivity={p.lastActivity}
            onClick={() => onOpenPost?.(p)}
          />
        ))}
      </div>
    </div>
  );
}


// bunq flatmate — Home (personal) — default tab
// Extended balance section with curved bars + people, 3 quick actions,
// Up Next with smart time labels, April summary, Completed transactions.

// ── smart time label helper ──
// offsetDays: 0=today, 1=tomorrow, 2-5 = "in N days", else date
function timeLabel(offsetDays) {
  if (offsetDays === 0) return 'today';
  if (offsetDays === 1) return 'tomorrow';
  if (offsetDays >= 2 && offsetDays <= 5) return `in ${offsetDays} days`;
  // fallback: compute a date (mock today = apr 22)
  const base = new Date(2025, 3, 22);
  base.setDate(base.getDate() + offsetDays);
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  return `${base.getDate()} ${months[base.getMonth()]}`;
}

function HomeGreeting({ onProfile, onNotifications, me, house }) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const firstName = me?.name || 'there';
  const houseName = house?.name || '—';
  const memberCount = house?.member_count ?? (house?.members?.length ?? 0);
  const initial = (me?.name || '?').slice(0, 1).toUpperCase();
  const avatarColor = me?.color || BF_COLORS.green;
  return (
    <div style={{ padding: '10px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, fontWeight: 500 }}>
          good {greet}, {firstName}
        </div>
        <div style={{ fontFamily: SFR, fontSize: 22, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.5, marginTop: 2 }}>
          {houseName} · {memberCount} housemate{memberCount === 1 ? '' : 's'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <div onClick={onNotifications} style={{
          width: 36, height: 36, borderRadius: 18, background: BF_COLORS.card,
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
          cursor: onNotifications ? 'pointer' : 'default',
        }}>
          <svg width="17" height="19" viewBox="0 0 17 19" fill="none">
            <path d="M8.5 1.5C5.7 1.5 3.5 3.7 3.5 6.5v3l-1.5 2.5h13l-1.5-2.5v-3c0-2.8-2.2-5-5-5zM6.5 15a2 2 0 004 0" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div style={{ position: 'absolute', top: 8, right: 10, width: 7, height: 7, borderRadius: 4, background: BF_COLORS.coral, border: '1.5px solid #000' }} />
        </div>
        <div onClick={onProfile} style={{ cursor: onProfile ? 'pointer' : 'default' }}>
          <Avatar initial={initial} color={avatarColor} size={36} />
        </div>
      </div>
    </div>
  );
}

// ── hero balance + curved bar chart of all housemates ──
function BalanceHero() {
  // Each person, signed balance from my POV (+owes me, −I owe)
  const people = [
    { name: 'sam',  amt:  18.40, color: BF_COLORS.pink },
    { name: 'alex', amt:   6.40, color: BF_COLORS.blue },
    { name: 'lena', amt:  -4.20, color: BF_COLORS.amber },
  ];
  const maxAbs = Math.max(...people.map(p => Math.abs(p.amt)), 20); // floor for visual
  const net = people.reduce((s, p) => s + p.amt, 0);

  return (
    <div style={{ padding: '0 20px 18px' }}>
      <div style={{
        background: BF_COLORS.card, borderRadius: 26, padding: '20px 20px 16px',
        border: `0.5px solid ${BF_COLORS.hairline}`,
      }}>
        {/* caption */}
        <div style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.7 }}>
          you're owed
        </div>
        {/* hero amount */}
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: SFR, fontSize: 54, fontWeight: 800, color: BF_COLORS.green, letterSpacing: -2, lineHeight: 1 }}>
            +€{Math.floor(net)}
          </span>
          <span style={{ fontFamily: SFR, fontSize: 26, fontWeight: 700, color: 'rgba(0,210,106,0.55)', letterSpacing: -0.6 }}>
            ,{String(Math.round((net % 1) * 100)).padStart(2, '0')}
          </span>
        </div>
        <div style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, marginTop: 4 }}>
          across oak st · last settled 12 days ago
        </div>

        {/* curved soft bars — one per person */}
        <div style={{
          marginTop: 28,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 14, height: 233, padding: '0 6px',
        }}>
          {people.map((p, i) => {
            const h = Math.max(28, (Math.abs(p.amt) / maxAbs) * 207);
            const positive = p.amt >= 0;
            return (
              <div key={i} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
                height: '100%',
              }}>
                {/* label above */}
                <div style={{
                  fontFamily: SFR, fontSize: 13, fontWeight: 700,
                  color: p.isMe ? BF_COLORS.ter : (positive ? BF_COLORS.green : BF_COLORS.coral),
                  whiteSpace: 'nowrap', letterSpacing: -0.2,
                }}>
                  {p.isMe ? '—' : `${positive ? '+' : '−'}€${Math.abs(p.amt).toFixed(2).replace('.', ',')}`}
                </div>
                {/* bar — soft full pill */}
                <div style={{
                  width: '100%', maxWidth: 64, height: h,
                  borderRadius: 999,
                  background: p.isMe
                    ? `linear-gradient(180deg, ${BF_COLORS.card}, rgba(255,255,255,0.05))`
                    : positive
                      ? `linear-gradient(180deg, ${p.color}, ${p.color}88)`
                      : `linear-gradient(180deg, ${p.color}66, ${p.color}aa)`,
                  border: p.isMe ? `1.5px dashed ${BF_COLORS.hairline}` : 'none',
                  boxShadow: p.isMe ? 'none' : `inset 0 1px 0 rgba(255,255,255,0.15)`,
                }} />
              </div>
            );
          })}
        </div>
        {/* name row below bars */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, padding: '0 6px', gap: 14 }}>
          {people.map((p, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar initial={p.name[0].toUpperCase()} color={p.color} size={26} />
              <span style={{
                fontFamily: SF, fontSize: 11, fontWeight: 600,
                color: p.isMe ? BF_COLORS.text : BF_COLORS.sub,
                textTransform: 'lowercase', letterSpacing: 0.1,
              }}>{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 3 quick actions — below the balance card, visible on first fold ──
function QuickActions() {
  const actions = [
    { k: 'scan', label: 'scan', c: BF_COLORS.lime, icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="5" width="16" height="13" rx="2.5" stroke="#000" strokeWidth="1.8"/><path d="M7 5V4a2 2 0 012-2h4a2 2 0 012 2v1" stroke="#000" strokeWidth="1.8"/><circle cx="11" cy="11.5" r="3" stroke="#000" strokeWidth="1.8"/></svg>
    )},
    { k: 'request', label: 'request', c: BF_COLORS.amber, icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 11h9M9 6l-5 5 5 5M14 4v14" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
    )},
    { k: 'split', label: 'split', c: BF_COLORS.blue, icon: (
      <svg width="22" height="22" viewBox=" 0 0 22 22" fill="none"><circle cx="7" cy="8" r="2.6" stroke="#000" strokeWidth="1.8"/><circle cx="15" cy="14" r="2.6" stroke="#000" strokeWidth="1.8"/><path d="M10 8h5M7 11v3" stroke="#000" strokeWidth="1.8" strokeLinecap="round"/></svg>
    )},
  ];
  return (
    <div style={{ padding: '0 20px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
      {actions.map(a => (
        <div key={a.k} style={{
          background: a.c, borderRadius: 20, padding: '16px 14px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {a.icon}
          </div>
          <div style={{ fontFamily: SF, fontSize: 14, fontWeight: 700, color: '#000', letterSpacing: -0.1 }}>
            {a.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── up next — smart time labels ──
function Planned({ onOpen }) {
  const rows = [
    { id: 'p-rent',      type: 'planned', emoji: '🏠', days: 0, color: BF_COLORS.coral,  title: 'rent',          sub: 'monthly · auto-pay 18:00', amt: 612.50 },
    { id: 'p-netflix',   type: 'planned', emoji: '🎬', days: 1, color: BF_COLORS.purple, title: 'netflix',       sub: 'monthly · split 3 ways',   amt: 4.66 },
    { id: 'p-groceries', type: 'planned', emoji: '🛒', days: 3, color: BF_COLORS.amber,  title: 'groceries run', sub: "weekly · lena's turn",     amt: null },
    { id: 'p-energy',    type: 'planned', emoji: '💡', days: 5, color: BF_COLORS.teal,   title: 'energy bill',   sub: 'monthly · auto from pot',  amt: 28.00 },
    { id: 'p-internet',  type: 'planned', emoji: '📡', days: 9, color: BF_COLORS.blue,   title: 'internet',      sub: 'monthly · split 3 ways',   amt: 13.33 },
  ];
  return (
    <div style={{ padding: '0 20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: SFR, fontSize: 17, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.3, whiteSpace: 'nowrap' }}>
            planned
          </div>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.5, flexShrink: 0 }}>
            <path d="M3 7a4 4 0 118 0 4 4 0 01-8 0zM7 5v2l1.3 1.3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <span style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, fontWeight: 500, whiteSpace: 'nowrap' }}>see all</span>
      </div>
      <List>
        {rows.map((r, i) => (
          <ListRow
            key={i}
            onClick={() => onOpen?.(r)}
            leading={
              <div style={{
                minWidth: 64, height: 40, borderRadius: 12, padding: '0 10px',
                background: `${r.color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{
                  fontFamily: SFR, fontSize: 11, fontWeight: 700, color: r.color,
                  textTransform: 'lowercase', letterSpacing: 0.2, whiteSpace: 'nowrap',
                }}>{timeLabel(r.days)}</span>
              </div>
            }
            title={r.title}
            sub={r.sub}
            trailing={r.amt != null && (
              <span style={{ fontFamily: SFR, fontSize: 14, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.2, whiteSpace: 'nowrap' }}>
                €{r.amt.toFixed(2).replace('.', ',')}
              </span>
            )}
          />
        ))}
      </List>
    </div>
  );
}

// ── your april summary — mini chart ──
function SpendSummary() {
  const days = [3, 5, 2, 8, 4, 12, 6, 3, 9, 4, 7, 11, 5, 3];
  const max = Math.max(...days);
  return (
    <div style={{ padding: '0 20px 22px' }}>
      <div style={{ background: BF_COLORS.card, borderRadius: 22, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              your april
            </div>
            <div style={{ marginTop: 4 }}>
              <Euro amount={247.80} big={28} small={16} />
            </div>
            <div style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.green, fontWeight: 600, marginTop: 2 }}>
              €38 under your usual
            </div>
          </div>
          <div style={{
            padding: '5px 10px', borderRadius: 10, background: 'rgba(0,210,106,0.14)',
            fontFamily: SFR, fontSize: 12, fontWeight: 700, color: BF_COLORS.green, letterSpacing: -0.2,
          }}>−13%</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 4,
          height: 54, marginTop: 14,
        }}>
          {days.map((d, i) => (
            <div key={i} style={{
              flex: 1,
              height: `${(d / max) * 100}%`,
              background: i === days.length - 1 ? BF_COLORS.green : 'rgba(255,255,255,0.14)',
              borderRadius: 3,
              minHeight: 4,
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: SF, fontSize: 10, color: BF_COLORS.ter }}>
          <span>apr 1</span><span>today</span>
        </div>
      </div>
    </div>
  );
}

// ── completed transactions — real settled bunq Payments for the user ──
function Completed({ onOpen, payments, me }) {
  const items = React.useMemo(() => {
    if (!payments?.length) return [];
    return payments.slice(0, 12).map((p) => {
      const amt = Number(p.amount);  // signed: + incoming, − outgoing
      const counter = p.counterparty_name || p.counterparty_email || p.counterparty_iban || '';
      const desc = (p.description || '').trim();
      // For the title, prefer the description (user-provided), fall back to counterparty.
      const title = desc || counter || 'payment';
      const sub = desc && counter ? counter : (counter ? '' : '');
      return {
        id: `bunq-${p.id}`,
        type: 'completed',
        emoji: amt >= 0 ? '↘' : '↗',
        title: title.toLowerCase(),
        sub: sub.toLowerCase(),
        description: desc,
        hasReceipt: false,
        amt,                      // signed
        when: relativeAgo(p.created),
        settled: true,
      };
    });
  }, [payments, me]);

  return (
    <div style={{ padding: '0 20px 200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
        <div style={{ fontFamily: SFR, fontSize: 17, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.3, whiteSpace: 'nowrap' }}>
          completed
        </div>
        <span style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.sub, fontWeight: 500, whiteSpace: 'nowrap' }}>recent</span>
      </div>
      {items.length === 0 ? (
        <div style={{
          padding: '20px 16px', borderRadius: 16,
          background: 'rgba(255,255,255,0.03)',
          fontFamily: SF, fontSize: 13, color: BF_COLORS.sub,
          textAlign: 'center', letterSpacing: -0.1,
        }}>
          no payments yet — once money moves through bunq it'll show up here.
        </div>
      ) : (
        <List>
          {items.map((it, i) => (
            <ListRow
              key={i}
              onClick={() => onOpen?.(it)}
              leading={
                <div style={{
                  width: 40, height: 40, borderRadius: 20,
                  background: it.amt >= 0 ? 'rgba(0,210,106,0.14)' : 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, color: it.amt >= 0 ? BF_COLORS.green : '#fff',
                }}>{it.emoji}</div>
              }
              title={it.title || '—'}
              titleAfter={
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="6" cy="6" r="5" fill={BF_COLORS.green}/>
                  <path d="M3.5 6l1.8 1.8L8.5 4.5" stroke="#000" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              }
              sub={`${it.sub ? it.sub + ' · ' : ''}${it.when}`}
              trailing={
                <span style={{
                  fontFamily: SFR, fontSize: 14, fontWeight: 700,
                  color: it.amt >= 0 ? BF_COLORS.green : BF_COLORS.text,
                  letterSpacing: -0.2, whiteSpace: 'nowrap',
                }}>
                  {it.amt >= 0 ? '+' : '−'}€{Math.abs(it.amt).toFixed(2).replace('.', ',')}
                </span>
              }
            />
          ))}
        </List>
      )}
    </div>
  );
}


// "2h", "yesterday", "3d", "12 mar" — short relative date for feed rows.
function relativeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - t.getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  const m = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  return `${t.getDate()} ${m[t.getMonth()]}`;
}

// ── requests — incoming SplitRequests (someone is asking ME to pay) ──
// Each row maps to a `SplitRequest` whose `debtor_id === me.id` and is
// still pending. Tap → detail page (we hand the underlying split shape down).
function Requests({ onOpen, onAccept, onDecline, me, splits }) {
  // Build a flat list of {split, request} pairs where I owe money.
  const reqs = React.useMemo(() => {
    if (!me?.id || !splits?.length) return [];
    const rows = [];
    for (const s of splits) {
      for (const r of (s.requests || [])) {
        if (r.debtor_id !== me.id) continue;
        if (r.status !== 'pending') continue;
        rows.push({
          id: r.id,
          type: 'request',
          from: s.payer_name || 'someone',
          fromColor: BF_COLORS.amber,  // we could derive per-payer but keep one tone
          ago: relativeAgo(s.created_at),
          title: s.title || 'request',
          note: s.note || '',
          amt: Number(r.amount),
          total: Number(s.total),
          split: s,    // forward to detail page
          request: r,
        });
      }
    }
    return rows;
  }, [me, splits]);

  // No requests for the current user → still render the section so the
  // home rhythm stays consistent; just swap the body for an empty pill.
  return (
    <div style={{ padding: '0 20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: SFR, fontSize: 17, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.3, whiteSpace: 'nowrap' }}>
            requests
          </div>
          {reqs.length > 0 && (
            <div style={{
              minWidth: 20, height: 20, borderRadius: 10, padding: '0 6px',
              background: BF_COLORS.coral,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: SFR, fontSize: 11, fontWeight: 800, color: '#000',
            }}>{reqs.length}</div>
          )}
        </div>
        {reqs.length > 0 && (
          <span style={{ fontFamily: SF, fontSize: 13, color: BF_COLORS.green, fontWeight: 600, whiteSpace: 'nowrap' }}>accept all</span>
        )}
      </div>
      {reqs.length === 0 ? (
        <div style={{
          padding: '20px 16px', borderRadius: 16,
          background: 'rgba(255,255,255,0.03)',
          fontFamily: SF, fontSize: 13, color: BF_COLORS.sub,
          textAlign: 'center', letterSpacing: -0.1,
        }}>
          you're all clear — no requests waiting on you.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reqs.map((r, i) => (
            <ExpenseCard
              key={i}
              from={{ name: r.from, color: r.fromColor }}
              verb="requested"
              ago={r.ago}
              amount={r.amt}
              emoji={r.emoji}
              title={r.title}
              note={r.note}
              onClick={() => onOpen?.(r)}
              onAccept={() => onAccept?.(r)}
              onDecline={() => onDecline?.(r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCAN FLOW — camera → processing → review → sending → sent
// ═══════════════════════════════════════════════════════════════

const MOCK_RECEIPT_ITEMS = [
  { id: 1, name: 'Volkoren brood',       price: 2.49 },
  { id: 2, name: 'Melk 1L',              price: 1.35 },
  { id: 3, name: 'Eieren biologisch 6x', price: 3.29 },
  { id: 4, name: 'Gouda jong 48+',       price: 4.79 },
  { id: 5, name: 'Oatly barista',        price: 2.89 },
  { id: 6, name: 'Pasta penne 500g',     price: 1.19 },
  { id: 7, name: 'Tomaten cherry',       price: 2.49 },
  { id: 8, name: 'IPA 6-pack',           price: 8.99 },
  { id: 9, name: 'Ben & Jerry\u2019s',   price: 5.49 },
  { id: 10, name: 'Statiegeld',          price: 1.50 },
];
const MOCK_RECEIPT_TOTAL = 34.47;
const MOCK_RECEIPT_META = {
  merchantSuggested: 'Albert Heijn',
  descriptionSuggested: 'groceries · tue eve',
  location: 'AH to go · Amstel',
  date: 'tue 22 apr · 18:42',
};

// Me is always present. Housemates live elsewhere; user adds them.
const ME_PERSON = { id: 'me', name: 'me', color: BF_COLORS.green, initial: 'M', isMe: true };
const HOUSEMATES_POOL = [
  { id: 'sam',  name: 'sam',  color: BF_COLORS.pink,  initial: 'S' },
  { id: 'lena', name: 'lena', color: BF_COLORS.amber, initial: 'L' },
  { id: 'alex', name: 'alex', color: BF_COLORS.blue,  initial: 'A' },
];
const EXT_COLORS = [BF_COLORS.coral, BF_COLORS.teal, BF_COLORS.purple, '#E879A6', '#7BDFF2'];

const RECEIPT_LINES = MOCK_RECEIPT_ITEMS.map(it => [it.name, it.price]);

// ── full-screen phase wrapper: fixed inside device, covers dock + chat bar
function ScanPhase({ children, bg = '#000' }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg, overflow: 'hidden', zIndex: 300 }}>
      {children}
    </div>
  );
}

// ═══ CAMERA ══════════════════════════════════════════════════════
function CameraScreen({ onCapture, onClose, style = 'pro' }) {
  const [flash, setFlash] = React.useState(false);
  const [facing, setFacing] = React.useState('environment');
  const [camReady, setCamReady] = React.useState(false);
  const [camError, setCamError] = React.useState(null);
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const fileInput = React.useRef(null);

  // Acquire the camera on mount (and whenever the user flips facing).
  // Stream is attached to the <video> element; tracks are stopped on unmount
  // or when the facing changes so we never leak the camera.
  React.useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError('camera unavailable in this browser');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCamReady(true);
        setCamError(null);
      } catch (e) {
        setCamError(e.message || 'camera denied');
        setCamReady(false);
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  // Capture the current frame into a jpeg blob and hand it up as a File.
  // If the stream isn't ready, fall back to opening the file picker so the
  // shutter is never dead.
  const shoot = async () => {
    const video = videoRef.current;
    if (!camReady || !video || !video.videoWidth) {
      fileInput.current?.click();
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    setFlash(true);
    canvas.toBlob((blob) => {
      if (!blob) { setFlash(false); return; }
      setTimeout(() => {
        setFlash(false);
        onCapture(new File([blob], 'receipt.jpg', { type: 'image/jpeg' }));
      }, 180);
    }, 'image/jpeg', 0.92);
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFlash(true);
    setTimeout(() => { setFlash(false); onCapture(f); }, 180);
    e.target.value = '';
  };

  const flipCamera = () => setFacing(f => (f === 'environment' ? 'user' : 'environment'));

  const isMin = style === 'minimal';
  return (
    <ScanPhase bg="#000">
      {/* Live camera preview — fills the screen. Hidden when not ready so
          the fallback illustration shines through. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%', objectFit: 'cover',
          // Mirror the selfie camera so text isn't flipped when previewing;
          // captured frame matches what the user sees in the preview.
          transform: facing === 'user' ? 'scaleX(-1)' : 'none',
          background: '#000',
          opacity: camReady ? 1 : 0,
          transition: 'opacity 200ms',
        }}
      />
      {/* Fallback: the same stylised receipt mock is shown while the camera
          is loading or if permission is denied. */}
      {!camReady && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 55%, #2a2827 0%, #0f0e0d 60%, #000 100%)' }}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-3deg)',
            width: 240, height: 360,
            background: 'linear-gradient(180deg, #f5f1e8 0%, #ebe4d4 100%)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            padding: 20, fontFamily: 'Courier, monospace', fontSize: 11, color: '#2a2622', opacity: 0.92,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, textAlign: 'center', marginBottom: 6 }}>ALBERT HEIJN</div>
            <div style={{ textAlign: 'center', fontSize: 9, opacity: 0.7, marginBottom: 14 }}>AH to go · Amstel · 22/04</div>
            {RECEIPT_LINES.map(([n, p], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span>{n}</span><span>{p.toFixed(2)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px dashed #8a8377', marginTop: 10, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>TOTAAL</span><span>34,47</span>
            </div>
          </div>
          {camError && (
            <div style={{
              position: 'absolute', bottom: 180, left: 20, right: 20,
              padding: '10px 14px', borderRadius: 14,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(14px)',
              border: `0.5px solid ${BF_COLORS.hairline}`,
              textAlign: 'center',
              fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, letterSpacing: -0.1,
            }}>
              camera blocked · use the gallery icon to upload from files
            </div>
          )}
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 82%, rgba(0,0,0,0.85) 100%)' }} />
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 272, height: 408, borderRadius: 12,
        border: `2px ${isMin ? 'solid' : 'dashed'} rgba(255,255,255,0.9)`, pointerEvents: 'none',
      }}>
        {!isMin && ['tl','tr','bl','br'].map((c,i) => {
          const pos = {
            tl:{top:-2,left:-2,borderTop:'3px solid #fff',borderLeft:'3px solid #fff'},
            tr:{top:-2,right:-2,borderTop:'3px solid #fff',borderRight:'3px solid #fff'},
            bl:{bottom:-2,left:-2,borderBottom:'3px solid #fff',borderLeft:'3px solid #fff'},
            br:{bottom:-2,right:-2,borderBottom:'3px solid #fff',borderRight:'3px solid #fff'},
          }[c];
          return <div key={i} style={{ position: 'absolute', width: 20, height: 20, ...pos }} />;
        })}
      </div>
      <div style={{ position: 'relative', zIndex: 2, padding: '60px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div onClick={onClose} style={{ width: 38, height: 38, borderRadius: 19, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 3l8 8M11 3l-8 8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </div>
        <div style={{ padding: '7px 14px', borderRadius: 15, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(20px)', fontFamily: SF, fontSize: 13, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: BF_COLORS.lime }} />receipt mode
        </div>
        <div style={{ width: 38, height: 38, borderRadius: 19, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M7 2L3 8h3v6l4-6H7V2z" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinejoin="round"/></svg>
        </div>
      </div>
      {!isMin && (
        <div style={{ position: 'absolute', top: 140, left: 0, right: 0, zIndex: 2, display: 'flex', justifyContent: 'center' }}>
          <div style={{ padding: '6px 12px', borderRadius: 12, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(16px)', fontFamily: SF, fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)', letterSpacing: -0.1 }}>
            hold steady · fit inside the frame
          </div>
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2, padding: '0 28px 42px' }}>
        {!isMin && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 22 }}>
            {['receipt','menu','photo'].map((m,i) => (
              <div key={m} style={{ padding: '6px 14px', borderRadius: 13, background: i === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)', fontFamily: SF, fontSize: 12, fontWeight: 700, color: i === 0 ? '#000' : 'rgba(255,255,255,0.85)', letterSpacing: -0.1 }}>{m}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          {/* Gallery / upload — opens the native file picker */}
          <div onClick={() => fileInput.current?.click()} style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#1a1a1a,#2a2a2a)', border: '1.5px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="3" width="14" height="12" rx="2" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" fill="none"/><circle cx="6" cy="7" r="1.2" fill="rgba(255,255,255,0.9)"/><path d="M3 13l3-3 3 3 2-2 4 4" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" fill="none"/></svg>
          </div>
          {/* Shutter — captures current camera frame (or opens picker fallback) */}
          <div onClick={shoot} style={{ width: 76, height: 76, borderRadius: 38, border: '4px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <div style={{ width: 62, height: 62, borderRadius: 31, background: isMin ? '#fff' : 'linear-gradient(135deg,#fff,#e2e2e2)' }} />
          </div>
          {/* Flip camera — environment ↔ user */}
          <div onClick={flipCamera} style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 7h10a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M7 7l1.5-2h3L13 7" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M10 15a3 3 0 100-6M10 15v-2m0-4v-2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
      </div>
      {flash && <div style={{ position: 'absolute', inset: 0, background: '#fff', zIndex: 10 }} />}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        onChange={onFile}
        style={{ display: 'none' }}
      />
    </ScanPhase>
  );
}

// ═══ PROCESSING ═══════════════════════════════════════════════════
// Visual cue only — the parent owns the real poll. Loops through decorative
// steps until the parent transitions phase. If `error` is set, shows an
// error card over the animation with a retry button.
function ProcessingScreen({ chatty = false, error, onRetry, preview }) {
  const [step, setStep] = React.useState(0);
  const steps = chatty
    ? ['reading receipt…', 'found items', 'totalling…', 'almost there']
    : ['reading…', 'found items', 'almost there', 'tidying up'];
  React.useEffect(() => {
    if (error) return;
    const t = setTimeout(() => setStep(s => (s + 1) % steps.length), 650);
    return () => clearTimeout(t);
  }, [step, error]);
  return (
    <ScanPhase bg="#000">
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 240, height: 360, borderRadius: 8, position: 'relative',
          background: preview ? '#0a0a0a' : 'linear-gradient(180deg,#f5f1e8,#ebe4d4)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.7)', overflow: 'hidden',
        }}>
          {preview ? (
            // Real captured / uploaded image — covers the placeholder slot.
            <img
              src={preview}
              alt="captured receipt"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ padding: 20, fontFamily: 'Courier, monospace', fontSize: 11, color: '#2a2622' }}>
              <div style={{ fontWeight: 700, fontSize: 15, textAlign: 'center', marginBottom: 6 }}>ALBERT HEIJN</div>
              <div style={{ textAlign: 'center', fontSize: 9, opacity: 0.7, marginBottom: 14 }}>AH to go · Amstel · 22/04</div>
              {RECEIPT_LINES.map(([n,p],i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span>{n}</span><span>{p.toFixed(2)}</span></div>
              ))}
            </div>
          )}
          <div style={{ position: 'absolute', left: 0, right: 0, height: 80, top: 0, background: 'linear-gradient(180deg, rgba(184,240,74,0) 0%, rgba(184,240,74,0.55) 50%, rgba(184,240,74,0) 100%)', animation: 'scanBeam 1.4s ease-in-out infinite' }} />
          {!preview && step >= 1 && Array.from({length: 10}).map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: 6, top: 62 + i * 14, width: 8, height: 8, borderRadius: 4, background: BF_COLORS.lime, boxShadow: '0 0 8px rgba(184,240,74,0.8)', animation: `fadeInScan 0.3s ease-out ${i * 0.04}s both` }} />
          ))}
        </div>
        <div style={{ marginTop: 36, fontFamily: SFR, fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: -0.3, height: 20 }}>{steps[step]}</div>
        <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ width: i === step ? 20 : 6, height: 6, borderRadius: 3, background: i <= step ? BF_COLORS.lime : 'rgba(255,255,255,0.2)', transition: 'all 0.3s ease' }} />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes scanBeam { 0% { top: -80px; } 100% { top: 360px; } }
        @keyframes fadeInScan { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
      `}</style>
      {error && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            maxWidth: 320, background: BF_COLORS.card, borderRadius: 18,
            padding: '20px 18px 18px', border: `0.5px solid ${BF_COLORS.hairline}`,
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: SFR, fontSize: 16, fontWeight: 800, color: BF_COLORS.coral,
              letterSpacing: -0.3, marginBottom: 6,
            }}>scan failed</div>
            <div style={{
              fontFamily: SF, fontSize: 13, color: BF_COLORS.sub,
              lineHeight: 1.4, letterSpacing: -0.1, marginBottom: 16,
            }}>{String(error)}</div>
            <div onClick={onRetry} style={{
              height: 42, borderRadius: 21, background: BF_COLORS.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: SF, fontSize: 14, fontWeight: 700, color: '#000',
              cursor: 'pointer',
            }}>try again</div>
          </div>
        </div>
      )}
    </ScanPhase>
  );
}

// ═══ ASSIGN PILL ══════════════════════════════════════════════════
function AssignPill({ person, onClick, compact = false }) {
  if (!person) {
    return (
      <div onClick={onClick} style={{ height: compact ? 22 : 26, padding: compact ? '0 8px' : '0 10px', borderRadius: compact ? 11 : 13, background: 'rgba(255,255,255,0.06)', border: `1px dashed ${BF_COLORS.hairline}`, display: 'flex', alignItems: 'center', fontFamily: SF, fontSize: compact ? 10 : 11, fontWeight: 600, color: BF_COLORS.ter, cursor: 'pointer' }}>
        assign
      </div>
    );
  }
  return (
    <div onClick={onClick} style={{ height: compact ? 22 : 26, padding: compact ? '0 3px 0 8px' : '0 4px 0 10px', borderRadius: compact ? 11 : 13, background: `${person.color}22`, border: `0.5px solid ${person.color}55`, display: 'flex', alignItems: 'center', gap: 6, fontFamily: SF, fontSize: compact ? 10 : 11, fontWeight: 700, color: person.color, cursor: 'pointer' }}>
      {person.name}
      <div style={{ width: compact ? 16 : 18, height: compact ? 16 : 18, borderRadius: 9, background: person.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SFR, fontSize: compact ? 9 : 10, fontWeight: 800, color: '#000' }}>{person.initial}</div>
    </div>
  );
}

// ═══ PEOPLE STRIP ═════════════════════════════════════════════════
function PeopleStrip({ people, onAdd, onRemove }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px', marginBottom: 18 }}>
      <div style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', marginRight: 4 }}>split</div>
      <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        {people.map(p => (
          <div
            key={p.id}
            onClick={() => !p.isMe && onRemove(p.id)}
            style={{
              height: 28, padding: '0 4px 0 10px', borderRadius: 14,
              background: `${p.color}22`, border: `0.5px solid ${p.color}55`,
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: SF, fontSize: 12, fontWeight: 700, color: p.color,
              cursor: p.isMe ? 'default' : 'pointer',
            }}
            title={p.isMe ? 'you' : 'tap to remove'}
          >
            {p.name}
            <div style={{ width: 20, height: 20, borderRadius: 10, background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SFR, fontSize: 11, fontWeight: 800, color: '#000' }}>{p.initial}</div>
          </div>
        ))}
        <div
          onClick={onAdd}
          style={{
            height: 28, padding: '0 10px', borderRadius: 14,
            background: 'rgba(255,255,255,0.04)',
            border: `1px dashed ${BF_COLORS.hairline}`,
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: SF, fontSize: 12, fontWeight: 600, color: BF_COLORS.sub,
            cursor: 'pointer',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1v8M1 5h8" stroke={BF_COLORS.sub} strokeWidth="1.6" strokeLinecap="round"/></svg>
          add
        </div>
      </div>
    </div>
  );
}

// ═══ ADD PERSON SHEET ═════════════════════════════════════════════
function AddPersonSheet({ open, onClose, onAddHousemate, onAddExternal, availableHousemates }) {
  const [mode, setMode] = React.useState('pick');
  const [extName, setExtName] = React.useState('');
  React.useEffect(() => { if (open) { setMode('pick'); setExtName(''); } }, [open]);
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: BF_COLORS.cardElev, borderRadius: '26px 26px 0 0', padding: '16px 18px 32px', animation: 'slideUp 0.22s ease-out' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: SFR, fontSize: 17, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.3 }}>
            {mode === 'pick' ? 'add to split' : 'new person'}
          </div>
          {mode === 'external' && (
            <div onClick={() => setMode('pick')} style={{ fontFamily: SF, fontSize: 13, fontWeight: 600, color: BF_COLORS.sub, cursor: 'pointer' }}>back</div>
          )}
        </div>
        {mode === 'pick' ? (
          <>
            <div style={{ fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 8 }}>from your house</div>
            {availableHousemates.length === 0 ? (
              <div style={{ padding: '14px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', fontFamily: SF, fontSize: 13, color: BF_COLORS.sub }}>all housemates already added</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {availableHousemates.map(p => (
                  <div key={p.id} onClick={() => { onAddHousemate(p); onClose(); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderRadius: 14, cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SFR, fontSize: 14, fontWeight: 800, color: '#000' }}>{p.initial}</div>
                    <div style={{ flex: 1, fontFamily: SF, fontSize: 15, fontWeight: 600, color: BF_COLORS.text, letterSpacing: -0.1 }}>{p.name}</div>
                    <svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 2l5 5-5 5" stroke={BF_COLORS.sub} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                  </div>
                ))}
              </div>
            )}
            <div onClick={() => setMode('external')} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px', borderRadius: 14, cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: `0.5px dashed ${BF_COLORS.hairline}` }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke={BF_COLORS.text} strokeWidth="1.8" strokeLinecap="round"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SF, fontSize: 14, fontWeight: 600, color: BF_COLORS.text, letterSpacing: -0.1 }}>add someone else</div>
                <div style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, marginTop: 1 }}>send a bunq link — no account needed</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 2l5 5-5 5" stroke={BF_COLORS.sub} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 8 }}>their name</div>
            <input
              autoFocus
              value={extName}
              onChange={e => setExtName(e.target.value)}
              placeholder="e.g. jordan"
              style={{
                width: '100%', height: 48, padding: '0 14px', borderRadius: 14,
                background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${BF_COLORS.hairline}`,
                color: BF_COLORS.text, fontFamily: SF, fontSize: 15, fontWeight: 500, letterSpacing: -0.1,
                outline: 'none',
              }}
            />
            <div style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, marginTop: 10, lineHeight: 1.4 }}>
              they'll get a bunq.me link to pay. no sign-up needed.
            </div>
            <div
              onClick={() => { if (extName.trim()) { onAddExternal(extName.trim()); onClose(); } }}
              style={{
                marginTop: 16, height: 48, borderRadius: 24,
                background: extName.trim() ? BF_COLORS.text : 'rgba(255,255,255,0.08)',
                color: extName.trim() ? '#000' : BF_COLORS.ter,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: SF, fontSize: 14, fontWeight: 700, letterSpacing: -0.2,
                cursor: extName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              add to split
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}

// ═══ ASSIGN PICKER (only added people) ════════════════════════════
function AssignPicker({ open, onClose, onPick, people }) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: BF_COLORS.cardElev, borderRadius: '26px 26px 0 0', padding: '16px 18px 32px', animation: 'slideUp 0.22s ease-out' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '0 auto 16px' }} />
        <div style={{ fontFamily: SFR, fontSize: 17, fontWeight: 700, color: BF_COLORS.text, marginBottom: 12, letterSpacing: -0.3 }}>assign item to</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div onClick={() => { onPick('everyone'); onClose(); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderRadius: 14, cursor: 'pointer', background: 'rgba(184,240,74,0.08)', border: '0.5px solid rgba(184,240,74,0.25)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: BF_COLORS.lime, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="5" cy="6" r="2.2" stroke="#000" strokeWidth="1.5" fill="none"/><circle cx="11" cy="6" r="2.2" stroke="#000" strokeWidth="1.5" fill="none"/><path d="M2 13c0-2 1.5-3 3-3s3 1 3 3M8 13c0-2 1.5-3 3-3s3 1 3 3" stroke="#000" strokeWidth="1.5" fill="none"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: SF, fontSize: 15, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.1 }}>everyone</div>
              <div style={{ fontFamily: SF, fontSize: 12, color: BF_COLORS.sub, marginTop: 1 }}>split equally across the {people.length}</div>
            </div>
          </div>
          {people.map(p => (
            <div key={p.id} onClick={() => { onPick(p.id); onClose(); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderRadius: 14, cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SFR, fontSize: 14, fontWeight: 800, color: '#000' }}>{p.initial}</div>
              <div style={{ flex: 1, fontFamily: SF, fontSize: 15, fontWeight: 600, color: BF_COLORS.text, letterSpacing: -0.1 }}>{p.name}{p.external && <span style={{ color: BF_COLORS.sub, fontWeight: 500 }}> · external</span>}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══ EDITABLE TEXT ════════════════════════════════════════════════
function EditableText({ value, onChange, size = 22, weight = 700, color, placeholder, letterSpacing = -0.4 }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef(null);
  React.useEffect(() => { setDraft(value); }, [value]);
  React.useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
  const commit = () => { setEditing(false); onChange(draft.trim() || value); };
  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        style={{
          background: 'rgba(255,255,255,0.06)', border: 'none', outline: 'none',
          borderRadius: 6, padding: '2px 6px', margin: '-2px -6px',
          fontFamily: weight >= 700 ? SFR : SF, fontSize: size, fontWeight: weight,
          color: color || BF_COLORS.text, letterSpacing, width: '100%',
        }}
      />
    );
  }
  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        fontFamily: weight >= 700 ? SFR : SF, fontSize: size, fontWeight: weight,
        color: color || BF_COLORS.text, letterSpacing, cursor: 'text',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >
      <span>{value || placeholder}</span>
    </div>
  );
}

// ═══ REVIEW ═══════════════════════════════════════════════════════
// Accepts live `scan` + `housemates` from the backend. Falls back to the
// mock receipt for offline previews so the UI still runs without the api.
function ReviewScreen({
  onSend, onBack, layout = 'list', chatty = false, aiOpen = false,
  scan, housemates,
}) {
  // Map backend housemates → the {id, name, initial, color, isMe} shape the
  // existing UI expects. `me` = the current user, always the first chip.
  const pool = React.useMemo(() => {
    if (!housemates?.length) return HOUSEMATES_POOL;
    return housemates.filter(h => !h.is_me).map(h => ({
      id: h.id, name: h.name, initial: h.name[0].toUpperCase(), color: h.color,
    }));
  }, [housemates]);
  const me = React.useMemo(() => {
    const real = housemates?.find(h => h.is_me);
    if (!real) return ME_PERSON;
    return { id: real.id, name: real.name, initial: real.name[0].toUpperCase(), color: real.color, isMe: true };
  }, [housemates]);

  const initialItems = React.useMemo(() => {
    if (scan?.line_items?.length) {
      return scan.line_items.map((li, i) => ({
        id: li.id, name: li.name, price: Number(li.price), quantity: li.quantity,
        assigned: li.assigned_to ?? null, position: li.position ?? i,
      }));
    }
    return MOCK_RECEIPT_ITEMS.map(it => ({ ...it, assigned: null }));
  }, [scan?.id]);

  const [people, setPeople] = React.useState([me]);
  const [items, setItems] = React.useState(initialItems);
  const [merchant, setMerchant] = React.useState(scan?.merchant || scan?.merchant_suggested || MOCK_RECEIPT_META.merchantSuggested);
  const [description, setDescription] = React.useState(scan?.description || scan?.description_suggested || MOCK_RECEIPT_META.descriptionSuggested);
  const [pickerFor, setPickerFor] = React.useState(null);
  const [addOpen, setAddOpen] = React.useState(false);

  // Reset when the scan changes (new upload).
  React.useEffect(() => {
    setPeople([me]);
    setItems(initialItems);
    setMerchant(scan?.merchant || scan?.merchant_suggested || MOCK_RECEIPT_META.merchantSuggested);
    setDescription(scan?.description || scan?.description_suggested || MOCK_RECEIPT_META.descriptionSuggested);
  }, [scan?.id]);

  const getPerson = id => people.find(p => p.id === id);
  const availableHousemates = pool.filter(h => !people.some(p => p.id === h.id));
  // Derived total — sum of current line items (respects edits), with the
  // backend-reported total as a fallback when there are no items yet.
  const receiptTotal = items.length
    ? items.reduce((s, it) => s + Number(it.price || 0) * (it.quantity || 1), 0)
    : Number(scan?.total || MOCK_RECEIPT_TOTAL);

  const addHousemate = p => setPeople([...people, p]);
  const addExternal = (name) => {
    const n = people.filter(p => p.external).length + 1;
    const color = EXT_COLORS[(n - 1) % EXT_COLORS.length];
    const initial = name[0].toUpperCase();
    setPeople([...people, { id: `ext${Date.now()}`, name: name.toLowerCase(), initial, color, external: true }]);
  };
  const removePerson = id => {
    setPeople(people.filter(p => p.id !== id));
    setItems(items.map(it => it.assigned === id ? { ...it, assigned: null } : it));
  };

  const assign = (itemId, assigneeId) => setItems(items.map(it => it.id === itemId ? { ...it, assigned: assigneeId } : it));

  const totals = React.useMemo(() => {
    const t = {};
    items.forEach(it => {
      if (!it.assigned) return;
      if (it.assigned === 'everyone') {
        const share = it.price / people.length;
        people.forEach(p => { t[p.id] = (t[p.id] || 0) + share; });
      } else {
        t[it.assigned] = (t[it.assigned] || 0) + it.price;
      }
    });
    return t;
  }, [items, people]);

  const allAssigned = items.every(it => it.assigned);
  const othersTotal = people.filter(p => !p.isMe).reduce((s, p) => s + (totals[p.id] || 0), 0);

  React.useEffect(() => {
    if (!scan) return
    registry.register('receipt_review', () => ({
      scan_id: scan.id,
      total: scan.total,
      currency: scan.currency,
      line_items: items.map(li => ({
        id: li.id, name: li.name, price: li.price,
        assignee_id: li.assigned ?? null,
      })),
      roster: housemates || [],
      uploader_id: scan.user_id,
      post_context: scan.post_context || null,
    }))
    return () => registry.unregister('receipt_review')
  }, [scan?.id, items, housemates])

  React.useEffect(() => {
    return bus.on('receipt_assignments', (payload) => {
      // payload.assignments: { [lineItemId]: assigneeId }
      setItems(prev => prev.map(it =>
        payload.assignments?.[it.id] !== undefined
          ? { ...it, assigned: payload.assignments[it.id] }
          : it
      ))
      log.patchApply('receipt_assignments', 'receipt_review', true)
    })
  }, [])

  const assigneeLabel = (assigned) => {
    if (!assigned) return null;
    if (assigned === 'everyone') return { name: 'everyone', color: BF_COLORS.lime, initial: '·' };
    return getPerson(assigned);
  };

  return (
    <ScanPhase bg={BF_COLORS.bg}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '58px 20px 6px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div onClick={onBack} style={{ width: 36, height: 36, borderRadius: 18, background: BF_COLORS.card, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M8 2L3 7l5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 2 }}>review · tap to edit</div>
            <EditableText value={merchant} onChange={setMerchant} size={22} weight={700} letterSpacing={-0.5} />
            <div style={{ marginTop: 2 }}>
              <EditableText value={description} onChange={setDescription} size={13} weight={500} color={BF_COLORS.sub} letterSpacing={-0.1} placeholder="add a note" />
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginTop: 2 }}>
            <div style={{ fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>total</div>
            <div style={{ fontFamily: SFR, fontSize: 20, fontWeight: 800, color: BF_COLORS.text, letterSpacing: -0.5 }}>€{receiptTotal.toFixed(2).replace('.', ',')}</div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 16, paddingBottom: 190 }}>
          <PeopleStrip people={people} onAdd={() => setAddOpen(true)} onRemove={removePerson} />

          {chatty && people.length === 1 && (
            <div style={{ margin: '0 20px 14px', padding: '10px 12px', borderRadius: 14, background: 'rgba(184,240,74,0.06)', border: '0.5px solid rgba(184,240,74,0.18)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 7, background: 'linear-gradient(135deg,#B8F04A,#00D26A)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1l1.2 3.1L10.5 5.3l-3.3.9L6 9.5l-1.2-3.3L1.5 5.3l3.3-1.2L6 1z" fill="#000"/></svg>
              </div>
              <div style={{ fontFamily: SF, fontSize: 12.5, color: BF_COLORS.text, lineHeight: 1.4, letterSpacing: -0.1 }}>
                who are you splitting with? tap <span style={{ color: BF_COLORS.lime, fontWeight: 700 }}>+ add</span> to start.
              </div>
            </div>
          )}

          {layout === 'list' && (
            <div style={{ padding: '0 20px' }}>
              {items.map((it, i) => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: i < items.length - 1 ? `1px solid ${BF_COLORS.hairline}` : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SF, fontSize: 14, color: BF_COLORS.text, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: -0.1 }}>{it.name}</div>
                  </div>
                  <div style={{ fontFamily: SFR, fontSize: 13, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.2, minWidth: 52, textAlign: 'right' }}>€{it.price.toFixed(2).replace('.', ',')}</div>
                  <AssignPill person={assigneeLabel(it.assigned)} onClick={() => setPickerFor(it.id)} compact />
                </div>
              ))}
            </div>
          )}

          {layout === 'card' && (
            <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(it => (
                <div key={it.id} style={{ background: BF_COLORS.card, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SF, fontSize: 14, color: BF_COLORS.text, fontWeight: 600, letterSpacing: -0.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                    <div style={{ fontFamily: SFR, fontSize: 13, fontWeight: 700, color: BF_COLORS.sub, letterSpacing: -0.1, marginTop: 1 }}>€{it.price.toFixed(2).replace('.', ',')}</div>
                  </div>
                  <AssignPill person={assigneeLabel(it.assigned)} onClick={() => setPickerFor(it.id)} />
                </div>
              ))}
            </div>
          )}

          {layout === 'bill' && (
            <div style={{ padding: '0 20px' }}>
              <div style={{ background: 'linear-gradient(180deg,#f5f1e8,#ebe4d4)', borderRadius: 12, padding: '18px 20px', fontFamily: 'Courier, monospace', color: '#2a2622', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, letterSpacing: 2 }}>{merchant.toUpperCase()}</div>
                <div style={{ textAlign: 'center', fontSize: 10, opacity: 0.6, marginTop: 2 }}>{MOCK_RECEIPT_META.location}</div>
                <div style={{ textAlign: 'center', fontSize: 10, opacity: 0.6, marginBottom: 14 }}>{MOCK_RECEIPT_META.date}</div>
                <div style={{ borderTop: '1px dashed #8a8377', paddingTop: 10 }}>
                  {items.map(it => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                      <div style={{ flex: 1, fontSize: 11.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{it.price.toFixed(2)}</div>
                      <AssignPill person={assigneeLabel(it.assigned)} onClick={() => setPickerFor(it.id)} compact />
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px dashed #8a8377', marginTop: 10, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13 }}>
                  <span>TOTAAL</span><span>€{receiptTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {people.length > 1 && (
            <div style={{ padding: '22px 20px 0' }}>
              <div style={{ fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 10 }}>breakdown</div>
              <div style={{ background: BF_COLORS.card, borderRadius: 16, overflow: 'hidden' }}>
                {people.map((p, i, arr) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${BF_COLORS.hairline}` : 'none' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 14, background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SFR, fontSize: 12, fontWeight: 800, color: '#000' }}>{p.initial}</div>
                    <div style={{ flex: 1, fontFamily: SF, fontSize: 14, fontWeight: 600, color: BF_COLORS.text, letterSpacing: -0.1 }}>
                      {p.name}{p.isMe && <span style={{ color: BF_COLORS.sub, fontWeight: 500 }}> · you</span>}{p.external && <span style={{ color: BF_COLORS.sub, fontWeight: 500 }}> · external</span>}
                    </div>
                    <div style={{ fontFamily: SFR, fontSize: 15, fontWeight: 800, color: p.isMe ? BF_COLORS.sub : BF_COLORS.text, letterSpacing: -0.3 }}>€{(totals[p.id] || 0).toFixed(2).replace('.', ',')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sticky send + AI chat */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '18px 20px 36px', background: 'linear-gradient(to top, #000 40%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0))', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ChatBar
            aiOpen={aiOpen}
            placeholder={
              people.length <= 1
                ? 'ask me to add housemates…'
                : (allAssigned ? 'tweak the split with ai…' : 'tell ai who gets what…')
            }
          />
          <div
            onClick={(allAssigned && people.length > 1) ? () => onSend?.({
              assignments: Object.fromEntries(items.map(it => [it.id, it.assigned])),
              merchant, description,
            }) : undefined}
            style={{ height: 54, borderRadius: 27, background: (allAssigned && people.length > 1) ? BF_COLORS.text : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: SF, fontSize: 15, fontWeight: 700, color: (allAssigned && people.length > 1) ? '#000' : BF_COLORS.ter, cursor: (allAssigned && people.length > 1) ? 'pointer' : 'not-allowed', letterSpacing: -0.2 }}
          >
            {people.length <= 1 ? 'add someone to split' : (allAssigned ? 'send requests' : `assign ${items.filter(it=>!it.assigned).length} items`)}
            {(allAssigned && people.length > 1) && (
              <div style={{ padding: '2px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.1)', fontFamily: SFR, fontSize: 12, fontWeight: 800 }}>€{othersTotal.toFixed(2).replace('.', ',')}</div>
            )}
          </div>
        </div>
      </div>

      <AssignPicker open={pickerFor !== null} onClose={() => setPickerFor(null)} onPick={id => assign(pickerFor, id)} people={people} />
      <AddPersonSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAddHousemate={addHousemate}
        onAddExternal={addExternal}
        availableHousemates={availableHousemates}
      />
    </ScanPhase>
  );
}

// ═══ SENDING ══════════════════════════════════════════════════════
function SendingScreen({ onDone }) {
  const [phase, setPhase] = React.useState(0);
  React.useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1200);
    const t2 = setTimeout(onDone, 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <ScanPhase bg={BF_COLORS.bg}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: 48, background: phase === 1 ? BF_COLORS.green : 'rgba(184,240,74,0.14)', border: phase === 1 ? 'none' : '2px solid rgba(184,240,74,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)', transform: phase === 1 ? 'scale(1.08)' : 'scale(1)' }}>
          {phase === 0 ? (
            <svg width="36" height="36" viewBox="0 0 36 36" style={{ animation: 'spinSc 1s linear infinite' }}>
              <circle cx="18" cy="18" r="14" stroke="rgba(184,240,74,0.25)" strokeWidth="3" fill="none"/>
              <path d="M18 4a14 14 0 0114 14" stroke={BF_COLORS.lime} strokeWidth="3" strokeLinecap="round" fill="none"/>
            </svg>
          ) : (
            <svg width="44" height="44" viewBox="0 0 44 44"><path d="M12 22l7 7 13-14" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" style={{ strokeDasharray: 50, animation: 'drawCheckSc 0.4s ease-out' }}/></svg>
          )}
        </div>
        <div style={{ marginTop: 28, fontFamily: SFR, fontSize: 22, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.5 }}>{phase === 0 ? 'sending…' : 'sent'}</div>
        <div style={{ marginTop: 4, fontFamily: SF, fontSize: 14, color: BF_COLORS.sub, letterSpacing: -0.1 }}>{phase === 0 ? 'creating requests' : 'requests on their way'}</div>
      </div>
      <style>{`
        @keyframes spinSc { to { transform: rotate(360deg); } }
        @keyframes drawCheckSc { from { stroke-dashoffset: 50; } to { stroke-dashoffset: 0; } }
      `}</style>
    </ScanPhase>
  );
}

function ScanFlow({
  phase, setPhase, onClose, cameraStyle, reviewLayout, aiChatty, aiOpen,
  scan, scanPreview, housemates, scanError, onCapture, onFinalize, postContext,
}) {
  React.useEffect(() => {
    if (scan && postContext && !scan.post_context) {
      scan.post_context = postContext;
    }
  }, [scan, postContext]);

  if (phase === 'camera') {
    return <CameraScreen onCapture={onCapture} onClose={onClose} style={cameraStyle} />;
  }
  if (phase === 'processing') {
    return <ProcessingScreen chatty={aiChatty} error={scanError} preview={scanPreview} onRetry={() => setPhase('camera')} />;
  }
  if (phase === 'review') {
    return (
      <ReviewScreen
        layout={reviewLayout} chatty={aiChatty} aiOpen={aiOpen}
        scan={scan} housemates={housemates}
        onBack={() => setPhase('camera')}
        onSend={onFinalize}
      />
    );
  }
  if (phase === 'sending') return <SendingScreen onDone={onClose} />;
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Tweaks panel
// ═══════════════════════════════════════════════════════════════
function TweaksPanel({ tweaks, setTweaks, onClose }) {
  const Group = ({ label, options, value, onPick }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3 }}>
        {options.map(o => (
          <div key={o} onClick={() => onPick(o)} style={{
            flex: 1, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: value === o ? BF_COLORS.text : 'transparent',
            color: value === o ? '#000' : BF_COLORS.sub,
            fontFamily: SF, fontSize: 12, fontWeight: 700, letterSpacing: -0.1, cursor: 'pointer',
          }}>{o}</div>
        ))}
      </div>
    </div>
  );
  return (
    <div style={{
      position: 'absolute', right: 12, bottom: 120, width: 240, zIndex: 200,
      background: 'rgba(28,28,31,0.95)', backdropFilter: 'blur(30px)',
      borderRadius: 18, border: `0.5px solid ${BF_COLORS.hairline}`,
      padding: '14px 14px 12px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: SFR, fontSize: 14, fontWeight: 700, color: BF_COLORS.text, letterSpacing: -0.2 }}>Tweaks</div>
        <div onClick={onClose} style={{ width: 20, height: 20, borderRadius: 10, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 1l6 6M7 1l-6 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
      </div>
      <Group label="camera style"  options={['pro','minimal']}     value={tweaks.cameraStyle}  onPick={v => setTweaks({...tweaks, cameraStyle: v})} />
      <Group label="review layout" options={['list','card','bill']} value={tweaks.reviewLayout} onPick={v => setTweaks({...tweaks, reviewLayout: v})} />
      <Group label="AI presence"   options={['invisible','chatty']} value={tweaks.aiChatty ? 'chatty' : 'invisible'} onPick={v => setTweaks({...tweaks, aiChatty: v === 'chatty'})} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Home wrapper with scan trigger
// ═══════════════════════════════════════════════════════════════
function QuickActionsWired({ onScan, onRequest, onSplit }) {
  const actions = [
    { k: 'scan', label: 'scan', c: BF_COLORS.lime, onClick: onScan, icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="5" width="16" height="13" rx="2.5" stroke="#000" strokeWidth="1.8"/><path d="M7 5V4a2 2 0 012-2h4a2 2 0 012 2v1" stroke="#000" strokeWidth="1.8"/><circle cx="11" cy="11.5" r="3" stroke="#000" strokeWidth="1.8"/></svg>
    )},
    { k: 'request', label: 'request', c: BF_COLORS.amber, onClick: onRequest, icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 11h9M9 6l-5 5 5 5M14 4v14" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
    )},
    { k: 'split', label: 'split', c: BF_COLORS.blue, onClick: onSplit, icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="7" cy="8" r="2.6" stroke="#000" strokeWidth="1.8"/><circle cx="15" cy="14" r="2.6" stroke="#000" strokeWidth="1.8"/><path d="M10 8h5M7 11v3" stroke="#000" strokeWidth="1.8" strokeLinecap="round"/></svg>
    )},
  ];
  return (
    <div style={{ padding: '0 20px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
      {actions.map(a => (
        <div key={a.k} onClick={a.onClick} style={{
          background: a.c, borderRadius: 20, padding: '16px 14px',
          display: 'flex', flexDirection: 'column', gap: 12,
          cursor: a.onClick ? 'pointer' : 'default',
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {a.icon}
          </div>
          <div style={{ fontFamily: SF, fontSize: 14, fontWeight: 700, color: '#000', letterSpacing: -0.1 }}>
            {a.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function HomeScreen({ onScan, onOpen, onAccept, onDecline, onRequest, onSplit, onProfile, onNotifications, me, house, splits, payments }) {
  React.useEffect(() => {
    registry.register('home', () => ({
      balance: me?.balance ?? null,
      pending_in_count: (splits || []).filter(s => s.payer_id === me?.id && !s.settled).length,
      pending_out_count: (splits || []).reduce((n, s) =>
        n + (s.requests || []).filter(r => r.debtor_id === me?.id && r.status === 'pending').length, 0),
      unsettled_total: (splits || []).reduce((n, s) =>
        n + (s.settled ? 0 : Number(s.total || 0)), 0),
    }))
    return () => registry.unregister('home')
  }, [me?.id, splits])

  return (
    <div style={{ background: BF_COLORS.bg, minHeight: '100%', paddingTop: 62 }}>
      <HomeGreeting onProfile={onProfile} onNotifications={onNotifications} me={me} house={house} />
      <BalanceHero />
      <QuickActionsWired onScan={onScan} onRequest={onRequest} onSplit={onSplit} />
      <div style={{ height: 40 }} />
      <Requests onOpen={onOpen} onAccept={onAccept} onDecline={onDecline} me={me} splits={splits} />
      <Planned onOpen={onOpen} />
      <SpendSummary />
      <Completed onOpen={onOpen} payments={payments} me={me} />
      {/* spacer for the absolutely-positioned root Dock */}
      <div style={{ height: 140 }} />
    </div>
  );
}




function friendlyStatus(tool) {
  switch (tool) {
    case 'list_splits':         return 'checking splits…'
    case 'get_split':           return 'reading split…'
    case 'list_housemates':     return 'looking up housemates…'
    case 'get_housemate':       return 'finding housemate…'
    case 'get_balance_with':    return 'computing balance…'
    case 'list_requests_with':  return 'reading requests…'
    case 'list_recent_payments':return 'checking payments…'
    case 'emit_action':         return 'preparing…'
    case 'apply_page_patch':    return 'updating page…'
    default:                    return `${tool}…`
  }
}

function actionLabel(ev) {
  switch (ev.kind) {
    case 'request':     return 'review'
    case 'split':       return 'review split'
    case 'pay_request': return 'open'
    case 'scan':        return 'open camera'
    default:            return 'open'
  }
}

function actionPreview(ev) {
  return { kind: ev.kind, ...ev.payload, summary: ev.summary }
}

function wireAction(ev, onClick) {
  return {
    kind: ev.kind,
    label: actionLabel(ev),
    summary: ev.summary,
    payload: ev.payload,
    preview: actionPreview(ev),
    onClick: () => onClick({ kind: ev.kind, payload: ev.payload, summary: ev.summary }),
  }
}

function BunqFlatmateApp() {
  // ── auth gate ────────────────────────────────────────────────────────
  // useMe polls GET /me; status='anon' renders the Landing + OAuth consent,
  // status='signed-in' renders the normal app. Every child below assumes me.
  const { user: me, status: authStatus, refresh: refreshMe } = useMe();
  // House is only fetched once we're signed in. `useHouse` internally 401s to
  // null before the cookie is set.
  const { house, refresh: refreshHouse } = useHouse();
  // Live bunq account (balance + IBAN). Gated on signed-in so we don't hit
  // the bunq API before there's a user to scope it to.
  const enabled = authStatus === 'signed-in';
  const { data: myBunq, loading: myBunqLoading, refresh: refreshMyBunq } =
    useMyBunq({ enabled });
  // Splits in the house + my settled payments (the Home sections feed off these).
  const { splits, refresh: refreshSplits } = useSplits({ enabled });
  const { payments, refresh: refreshPayments } = usePayments({ enabled });
  React.useEffect(() => {
    if (enabled) {
      refreshHouse(); refreshMyBunq(); refreshSplits(); refreshPayments();
    }
  }, [enabled, refreshHouse, refreshMyBunq, refreshSplits, refreshPayments]);
  const [consentOpen, setConsentOpen] = React.useState(false);
  const openConsent = () => setConsentOpen(true);
  const closeConsent = () => setConsentOpen(false);
  const handleAllow = async () => { setConsentOpen(false); await refreshMe(); };
  const handleLogout = async () => {
    try { await logoutSession(); } catch { /* best-effort */ }
    await refreshMe();
  };

  const [scanPhase, setScanPhase] = React.useState(null); // null | 'camera' | 'processing' | 'review' | 'sending'
  const [scanData, setScanData] = React.useState(null);    // live scan payload from backend
  const [scanError, setScanError] = React.useState(null);
  const [scanPreview, setScanPreview] = React.useState(null); // blob: URL of the captured/uploaded file
  const [scanPostContext, setScanPostContext] = React.useState(null);
  const [housemates, setHousemates] = React.useState(null);

  // Fetch housemates once we're signed in — reused by the review screen's roster chips.
  React.useEffect(() => {
    if (authStatus !== 'signed-in') { setHousemates(null); return; }
    import('./api').then(({ listHousemates }) => {
      listHousemates().then(setHousemates).catch(() => setHousemates(null));
    });
  }, [authStatus]);

  const uploadAndPoll = React.useCallback(async (file) => {
    setScanError(null);
    setScanData(null);
    // Hand the same File to the processing screen as a blob URL so the user
    // sees what they just captured, not the placeholder receipt.
    setScanPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setScanPhase('processing');
    try {
      const { uploadScan, waitForParse } = await import('./api');
      const created = await uploadScan(file);
      const parsed = await waitForParse(created.id);
      setScanData(parsed);
      setScanPhase('review');
    } catch (e) {
      setScanError(e.body?.detail || e.message || 'upload failed');
      // Stay on processing phase — screen renders the error overlay.
    }
  }, []);

  const finalizeCurrentScan = React.useCallback(async ({ assignments, merchant, description } = {}) => {
    if (!scanData?.id) return;
    try {
      const { setAssignments, patchScan, finalizeScan } = await import('./api');
      // Persist any edits to merchant/description + the assignment map, then finalize.
      if (merchant || description) {
        await patchScan(scanData.id, { merchant, description });
      }
      if (assignments) {
        await setAssignments(scanData.id, assignments);
      }
      await finalizeScan(scanData.id, scanPostContext ? { parent_post_id: scanPostContext.post_id } : undefined);
      setScanPhase('sending');
    } catch (e) {
      setScanError(e.body?.detail || e.message || 'finalize failed');
      setScanPhase('processing');
    }
  }, [scanData, scanPostContext]);
  const [tab, setTab] = React.useState('home'); // 'home' | 'feed' | 'subs' | 'mates'
  const [selectedItem, setSelectedItem] = React.useState(null);
  const [itemOpen, setItemOpen] = React.useState(false);
  const openItem = (it) => { setSelectedItem(it); requestAnimationFrame(() => setItemOpen(true)); };
  const closeItem = () => { setItemOpen(false); setTimeout(() => setSelectedItem(null), 400); };
  const openItemForRequest = (requestId) => {
    const split = (splits || []).find(s => (s.requests || []).some(r => r.id === requestId))
    if (!split) {
      setAiOpen(true)
      return
    }
    openItem({
      id: split.id,
      type: split.requests.length === 1 ? 'request' : 'bill',
      focusRequestId: requestId,
      title: split.title,
      total: split.total,
      raw: split,
    })
  };

  // Accept/decline a request from the home Requests section. The row passed
  // to openItem carries `split` + `request` from the backend payload, so the
  // ids are right there. After the call we refresh splits (status moves
  // pending → accepted/rejected) and payments (real bunq path triggers a
  // money movement on the debtor side), then drop the sheet.
  const acceptItem = React.useCallback(async (it) => {
    if (it?.type !== 'request' || !it?.split?.id || !it?.request?.id) return;
    await acceptSplitRequest(it.split.id, it.request.id);
    refreshSplits(); refreshPayments(); refreshMyBunq();
    closeItem();
  }, [refreshSplits, refreshPayments, refreshMyBunq]);
  const declineItem = React.useCallback(async (it) => {
    if (it?.type !== 'request' || !it?.split?.id || !it?.request?.id) return;
    await declineSplitRequest(it.split.id, it.request.id);
    refreshSplits();
    closeItem();
  }, [refreshSplits]);
  const [selectedMate, setSelectedMate] = React.useState(null);
  const [mateOpen, setMateOpen] = React.useState(false);
  const openMate = (m) => { setSelectedMate(m); requestAnimationFrame(() => setMateOpen(true)); };
  const closeMate = () => { setMateOpen(false); setTimeout(() => setSelectedMate(null), 400); };
  const [selectedPost, setSelectedPost] = React.useState(null);
  const [postOpen, setPostOpen] = React.useState(false);
  const openPost = (p) => { setSelectedPost(p); requestAnimationFrame(() => setPostOpen(true)); };
  const closePost = () => { setPostOpen(false); setTimeout(() => setSelectedPost(null), 400); };
  const onScanForPost = (post) => {
    setScanPostContext({
      post_id: post.id,
      post_text: post.text,
      author: { id: post.author?.id, name: post.author?.name },
      comments: (post.comments || []).map(c => ({
        author: { id: c.author?.id, name: c.author?.name },
        text: c.text,
      })),
    });
    closePost();
    setScanPhase('camera');
  };
  const [profileOpen, setProfileOpen] = React.useState(false);
  const openProfile = () => setProfileOpen(true);
  const closeProfile = () => setProfileOpen(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const openNotif = () => setNotifOpen(true);
  const closeNotif = () => setNotifOpen(false);
  // request / split sheet — same component, two modes
  const [formMode, setFormMode] = React.useState(null); // null | 'request' | 'split'
  const [formOpen, setFormOpen] = React.useState(false);
  const [formPrefill, setFormPrefill] = React.useState(null);
  const openForm = (m, opts = {}) => {
    setFormMode(m)
    setFormPrefill(opts.prefill || null)
    requestAnimationFrame(() => setFormOpen(true))
  };
  const closeForm = () => {
    setFormOpen(false)
    setTimeout(() => { setFormMode(null); setFormPrefill(null) }, 400)
  };
  const [aiOpen, setAiOpen] = React.useState(false);
  const [aiMessages, setAiMessages] = React.useState([
    { role: 'ai', text: "hey — what should we sort?" },
  ]);
  // `aiTail` is the live preview shown above the ChatBar in passive mode.
  // null = no preview. { kind: 'thinking' } | { kind: 'streaming', text } | { kind: 'done', text, action }
  const [aiTail, setAiTail] = React.useState(null);
  const [aiPreviewHidden, setAiPreviewHidden] = React.useState(false);
  const lastCtxHashRef = React.useRef(null)
  const abortRef = React.useRef(null)

  React.useEffect(() => {
    const toggle = () => setAiOpen(o => !o)

    const onSend = async (e) => {
      const text = e?.detail?.text?.trim()
      if (!text) return

      setAiMessages(m => [...m, { role: 'me', text }])
      setAiPreviewHidden(false)
      setAiTail({ kind: 'thinking' })

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const turnId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())
      const snap = registry.snapshot()
      const hash = snap ? registry.stableHash(snap) : null
      const sendCtx = hash !== lastCtxHashRef.current
      lastCtxHashRef.current = hash

      log.send(turnId, text, snap?.page_id, sendCtx)

      let textBuf = ''
      let pendingAction = null

      try {
        for await (const ev of aiClient.chat({
          message: text,
          history: aiMessages.slice(-20),
          page_context: sendCtx ? snap : null,
          client_turn_id: turnId,
          signal: controller.signal,
        })) {
          log.event(turnId, ev)
          switch (ev.type) {
            case 'text_delta':
              textBuf += ev.text
              setAiTail({ kind: 'streaming', text: textBuf })
              break
            case 'tool_use':
              setAiTail(t => ({ ...(t || {}), status: friendlyStatus(ev.tool) }))
              break
            case 'tool_result':
              setAiTail(t => ({ ...(t || {}), status: null }))
              break
            case 'action':
              pendingAction = ev
              break
            case 'page_patch':
              bus.emit(ev.kind, ev.payload)
              log.patchApply(ev.kind, snap?.page_id, true)
              break
            case 'error':
              setAiTail({ kind: 'error', text: ev.message || 'agent error' })
              break
            case 'done': {
              const wired = pendingAction
                ? wireAction(pendingAction, (a) => handleAiAction(a))
                : null
              setAiMessages(m => [...m, { role: 'ai', text: textBuf, action: wired }])
              setAiTail({ kind: 'done', text: textBuf, action: wired })
              break
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        log.error(turnId, err)
        setAiTail({ kind: 'error', text: 'agent failed — try again' })
      }
    }

    window.addEventListener('bunq:ai-toggle', toggle)
    window.addEventListener('bunq:ai-send', onSend)
    return () => {
      window.removeEventListener('bunq:ai-toggle', toggle)
      window.removeEventListener('bunq:ai-send', onSend)
      abortRef.current?.abort()
    }
  }, [aiMessages])

  const handleAiAction = (a) => {
    log.actionTap(a)
    switch (a.kind) {
      case 'request':     openForm('request', { prefill: a.payload }); break
      case 'split':       openForm('split',   { prefill: a.payload }); break
      case 'pay_request': openItemForRequest(a.payload.request_id); break
      case 'scan':        setScanPhase('camera'); break
      default:            setAiOpen(true)
    }
  };
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [tweaks, setTweaks] = React.useState({
    cameraStyle: 'minimal',
    reviewLayout: 'card',
    aiChatty: false,
  });

  // Tweaks protocol
  React.useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const closeTweaks = () => {
    setTweaksOpen(false);
    window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
  };

  // Pre-auth render: show Landing (and optionally the consent overlay) inside
  // the iOS frame. `loading` stays in the anon branch but shows a soft splash
  // so the very first frame isn't a login screen flash-in.
  if (authStatus !== 'signed-in') {
    return (
      <div data-screen-label="00 Connect bunq">
        <IOSDevice dark={true} width={402} height={874}>
          <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
            {authStatus === 'loading' ? (
              <div style={{
                position: 'absolute', inset: 0, background: BF_COLORS.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: SF, fontSize: 13, color: BF_COLORS.ter,
              }}>…</div>
            ) : (
              <Landing onConnect={openConsent} />
            )}
            <OAuthConsent
              open={consentOpen}
              onAllow={handleAllow}
              onCancel={closeConsent}
            />
          </div>
        </IOSDevice>
      </div>
    );
  }

  return (
    <div data-screen-label="01 Home">
      <IOSDevice dark={true} width={402} height={874}>
        {/* `overflow: hidden` clips every overlay inside (ItemPage, AIWindow,
            RequestSplitForm, ScanFlow). When any of them is in its closed
            (translateY-100%) state, the off-screen body can't be revealed by
            scrolling the device frame. */}
        <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
          {!scanPhase && (
            <div style={{
              // freeze the underlying page when a sheet is open so it can't scroll behind.
              // `scrollbarGutter: stable` keeps the scrollbar slot reserved both ways
              // so the device width doesn't jump when toggling overflow.
              position: 'absolute', inset: 0,
              overflow: (aiOpen || itemOpen) ? 'hidden' : 'auto',
              scrollbarGutter: 'stable',
            }}>
              {tab === 'home' && (
                <HomeScreen
                  onProfile={openProfile}
                  onNotifications={openNotif}
                  onScan={() => setScanPhase('camera')}
                  onOpen={openItem}
                  onAccept={acceptItem}
                  onDecline={declineItem}
                  onRequest={() => openForm('request')}
                  onSplit={() => openForm('split')}
                  me={me}
                  house={house}
                  splits={splits}
                  payments={payments}
                />
              )}
              {tab === 'mates' && <MatesScreen onOpenMate={openMate} />}
              {tab === 'feed' && <FeedScreenV2 onOpenPost={openPost} />}
              {tab === 'subs' && (
                <div style={{
                  background: BF_COLORS.bg, minHeight: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: BF_COLORS.sub, fontFamily: SF, fontSize: 14, padding: 40,
                  textAlign: 'center',
                }}>
                  subs — coming soon
                </div>
              )}
            </div>
          )}
          <ThreadPage post={selectedPost} open={postOpen} onClose={closePost} onOpenItem={openItem} housemates={housemates} onScanForPost={onScanForPost} />
          <ProfilePage
            open={profileOpen}
            onClose={closeProfile}
            me={me}
            onLogout={handleLogout}
            bunqAccount={myBunq?.primary}
            bunqLoading={myBunqLoading}
            onRefreshBunq={refreshMyBunq}
          />
          <NotificationsPage open={notifOpen} onClose={closeNotif} />
          <ItemPage
            item={selectedItem}
            open={itemOpen}
            onClose={closeItem}
            onAccept={acceptItem}
            onDecline={declineItem}
          />
          <MatePage
            mate={selectedMate}
            open={mateOpen}
            onClose={closeMate}
            onOpenItem={openItem}
          />
          <RequestSplitForm
            mode={formMode}
            open={formOpen}
            onClose={closeForm}
            housemates={housemates}
            prefill={formPrefill}
            onSubmit={(data) => {
              console.log('bill submitted', data);
              refreshMyBunq();
              refreshSplits();
              refreshPayments();
              closeForm();
            }}
          />
          {!scanPhase && !itemOpen && !mateOpen && !formOpen && !postOpen && !profileOpen && !notifOpen && (
            <Dock
              active={tab}
              onTab={setTab}
              aiOpen={aiOpen}
              preview={!aiOpen && aiTail ? (
                <AIPreviewSlot
                  tail={aiTail}
                  hidden={aiPreviewHidden}
                  onToggle={() => setAiPreviewHidden(h => !h)}
                />
              ) : null}
            />
          )}
          {scanPhase && (
            <ScanFlow
              phase={scanPhase}
              setPhase={setScanPhase}
              postContext={scanPostContext}
              onClose={() => {
                setScanPhase(null); setScanData(null); setScanError(null);
                if (scanPreview) URL.revokeObjectURL(scanPreview);
                setScanPreview(null);
                setScanPostContext(null);
              }}
              cameraStyle={tweaks.cameraStyle}
              reviewLayout={tweaks.reviewLayout}
              aiChatty={tweaks.aiChatty}
              aiOpen={aiOpen}
              scan={scanData}
              scanPreview={scanPreview}
              housemates={housemates}
              scanError={scanError}
              onCapture={uploadAndPoll}
              onFinalize={finalizeCurrentScan}
            />
          )}
          {/* AIWindow rendered last so it always wins the stacking order */}
          <AIWindow open={aiOpen} onClose={() => setAiOpen(false)} messages={aiMessages} />
          {tweaksOpen && <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} onClose={closeTweaks} />}
        </div>
      </IOSDevice>
    </div>
  );
}

Object.assign(window, { HomeScreen, BunqFlatmateApp });

export default BunqFlatmateApp
