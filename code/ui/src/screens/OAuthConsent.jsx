/**
 * OAuthConsent — fake bunq OAuth consent overlay.
 *
 * Mimics the real bunq/Google OAuth account picker: bunq-branded header,
 * "House Brain wants to:" scope list, row per sandbox user (avatar + email),
 * Allow / Cancel. Tapping a user highlights it; Allow uses the highlighted
 * label. Fetches `/users` on open.
 */
import React from 'react'

import { connectBunq, listUsers } from '../api.js'
import { BF_COLORS, SF, SFR } from '../tokens.js'

export default function OAuthConsent({ open, onAllow, onCancel }) {
  const [users, setUsers] = React.useState([])
  const [selectedLabel, setSelectedLabel] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [err, setErr] = React.useState(null)

  // Load the roster when the sheet opens.
  React.useEffect(() => {
    if (!open) return
    setLoading(true); setErr(null)
    listUsers()
      .then(list => {
        setUsers(list)
        // default highlight = first row so Allow is never disabled on mount
        if (list.length && !selectedLabel) setSelectedLabel(list[0].bunq_label)
      })
      .catch(e => setErr(e.message || 'failed to load users'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const allow = async () => {
    if (!selectedLabel || submitting) return
    setSubmitting(true); setErr(null)
    try {
      const { user } = await connectBunq(selectedLabel)
      onAllow?.(user)
    } catch (e) {
      setErr(e.message || 'allow failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 310,
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* scrim */}
      <div style={{
        position: 'absolute', inset: 0,
        background: open ? 'rgba(0,0,0,0.55)' : 'transparent',
        transition: 'background 240ms ease',
      }} onClick={onCancel} />

      {/* sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        maxHeight: '92%',
        background: '#FFFFFF',
        borderRadius: '24px 24px 0 0',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.35)',
      }}>
        {/* grab handle */}
        <div style={{
          padding: '10px 0 6px', display: 'flex', justifyContent: 'center',
        }}>
          <div style={{ width: 44, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.12)' }} />
        </div>

        {/* bunq-brand header */}
        <div style={{
          background: 'linear-gradient(135deg, #0E0F11, #1C1D20)',
          margin: '6px 14px 0', borderRadius: 16,
          padding: '16px 16px 14px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'linear-gradient(135deg, #B8F04A, #00D26A)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: SFR, fontWeight: 800, fontSize: 20, color: '#000',
          }}>b</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: SFR, fontSize: 15, fontWeight: 700, color: '#fff',
              letterSpacing: -0.2,
            }}>sign in with bunq</div>
            <div style={{
              fontFamily: SF, fontSize: 12, color: 'rgba(255,255,255,0.6)',
              marginTop: 2,
            }}>secure · sandbox · oauth 2.0</div>
          </div>
        </div>

        {/* scroll content */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '18px 22px 14px',
          WebkitOverflowScrolling: 'touch',
        }}>
          <div style={{
            marginBottom: 8,
            fontFamily: SF, fontSize: 11, color: 'rgba(0,0,0,0.5)',
            textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700,
          }}>choose your bunq account</div>

          {loading ? (
            <div style={{
              padding: 20, textAlign: 'center',
              fontFamily: SF, fontSize: 13, color: 'rgba(0,0,0,0.5)',
            }}>loading accounts…</div>
          ) : users.length === 0 ? (
            <div style={{
              padding: 16, borderRadius: 10, background: '#FFF3E0',
              fontFamily: SF, fontSize: 12, color: '#7A4A00',
            }}>no sandbox users on disk. run the bunq bootstrap first.</div>
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12,
              overflow: 'hidden',
            }}>
              {users.map((u, i) => {
                const selected = selectedLabel === u.bunq_label
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedLabel(u.bunq_label)}
                    style={{
                      width: '100%', border: 'none', cursor: 'pointer',
                      background: selected ? '#EAF7EE' : '#fff',
                      padding: '12px 14px',
                      display: 'flex', alignItems: 'center', gap: 12,
                      borderBottom: i < users.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 18,
                      background: u.color || BF_COLORS.green,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: SFR, fontWeight: 700, fontSize: 14, color: '#000',
                    }}>{(u.name || '?').slice(0,1).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: SFR, fontSize: 14, fontWeight: 700, color: '#0B0B0E',
                        letterSpacing: -0.1,
                      }}>{u.name}</div>
                      <div style={{
                        fontFamily: SF, fontSize: 11, color: 'rgba(0,0,0,0.5)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{u.email || u.bunq_label}</div>
                    </div>
                    <div style={{
                      width: 18, height: 18, borderRadius: 9,
                      border: selected ? '5px solid #00A656' : '1.5px solid rgba(0,0,0,0.2)',
                      background: '#fff',
                      transition: 'border 140ms ease',
                    }} />
                  </button>
                )
              })}
            </div>
          )}

          {err && (
            <div style={{
              marginTop: 14, padding: 10, borderRadius: 10,
              background: '#FFE9E9', color: '#8A1D1D',
              fontFamily: SF, fontSize: 12,
            }}>{err}</div>
          )}
        </div>

        {/* sticky footer */}
        <div style={{
          padding: '12px 14px 22px',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          display: 'flex', gap: 10,
          background: '#fff',
        }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, height: 48, borderRadius: 24, border: 'none', cursor: 'pointer',
              background: '#F0F1F3', color: '#0B0B0E',
              fontFamily: SFR, fontWeight: 700, fontSize: 15,
            }}
          >cancel</button>
          <button
            type="button"
            onClick={allow}
            disabled={!selectedLabel || submitting}
            style={{
              flex: 1.35, height: 48, borderRadius: 24, border: 'none',
              cursor: selectedLabel && !submitting ? 'pointer' : 'default',
              opacity: selectedLabel && !submitting ? 1 : 0.55,
              background: 'linear-gradient(135deg, #B8F04A, #00D26A)',
              color: '#000',
              fontFamily: SFR, fontWeight: 700, fontSize: 15,
            }}
          >{submitting ? 'connecting…' : 'allow'}</button>
        </div>
      </div>
    </div>
  );
}
