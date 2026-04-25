/**
 * Landing screen — rendered when /me returns 401.
 *
 * Full-page (inside the iOS device frame), dark bg with a soft bunq-green
 * radial glow on top. Product name, single-line tagline, one big "Connect
 * bunq" CTA. Tapping opens the OAuthConsent overlay (owned by App.jsx).
 */
import React from 'react'

import { BF_COLORS, SF, SFR } from '../tokens.js'

export default function Landing({ onConnect }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: BF_COLORS.bg,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* lime glow at the top */}
      <div style={{
        position: 'absolute', top: -220, left: '50%', transform: 'translateX(-50%)',
        width: 540, height: 540, borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgba(184,240,74,0.28), rgba(184,240,74,0) 70%)',
        pointerEvents: 'none',
      }} />
      {/* secondary green glow lower */}
      <div style={{
        position: 'absolute', bottom: -160, left: '50%', transform: 'translateX(-50%)',
        width: 420, height: 420, borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgba(0,210,106,0.18), rgba(0,210,106,0) 70%)',
        pointerEvents: 'none',
      }} />

      {/* content */}
      <div style={{
        position: 'relative', zIndex: 1, flex: 1,
        display: 'flex', flexDirection: 'column',
        padding: '96px 28px 44px',
      }}>
        {/* brand mark */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 38,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'linear-gradient(135deg, #B8F04A, #00D26A)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 22px rgba(0,210,106,0.35)',
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M4 11l3 3 11-11" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{
            fontFamily: SFR, fontWeight: 700, fontSize: 22, color: '#fff',
            letterSpacing: -0.4,
          }}>flatmate</div>
        </div>

        {/* hero copy */}
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: SFR, fontWeight: 700, fontSize: 38, lineHeight: 1.05,
            letterSpacing: -1.2, color: '#fff', marginBottom: 14,
          }}>
            manage shared<br />expenses<br />in a tap.
          </div>
          <div style={{
            fontFamily: SF, fontSize: 16, lineHeight: 1.45,
            color: BF_COLORS.sub, letterSpacing: -0.1,
          }}>
            scan a receipt, we find who owes what, bunq sends the requests for you.
          </div>
        </div>

        {/* primary CTA — bunq-branded */}
        <button
          type="button"
          onClick={onConnect}
          style={{
            marginTop: 32,
            height: 56, borderRadius: 28, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #B8F04A, #00D26A)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontFamily: SFR, fontWeight: 700, fontSize: 16, color: '#000',
            letterSpacing: -0.2,
            boxShadow: '0 12px 28px rgba(0,210,106,0.38)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#000" strokeWidth="2"/>
            <path d="M8 12l3 3 5-6" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          connect bunq
        </button>

        {/* legal line */}
        <div style={{
          marginTop: 14, textAlign: 'center',
          fontFamily: SF, fontSize: 11, color: BF_COLORS.ter, letterSpacing: 0.2,
        }}>
          simulate the auth flow with predefined bunq sandbox accounts
        </div>
      </div>
    </div>
  );
}
