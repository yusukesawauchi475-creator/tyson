import { useState } from 'react'
import { setUserRole } from '../lib/pairDaily'
import { t } from '../lib/i18n'

const POPUP_SHOWN_KEY = 'hum_role_select_popup_shown'

export default function RoleSelectPage({ onSelect, lang = 'ja', pairId = null }) {
  const [popupRole, setPopupRole] = useState(null)

  const proceed = (role) => {
    // 段階10-a-ext: role_history に 'initial' reason で immutable 記録
    setUserRole(role, 'initial', pairId)
    onSelect(role)
  }

  const handle = (role) => {
    let shown = null
    try { shown = localStorage.getItem(POPUP_SHOWN_KEY) } catch (_) {}
    if (shown) {
      proceed(role)
    } else {
      setPopupRole(role)
    }
  }

  const handlePopupOk = () => {
    try { localStorage.setItem(POPUP_SHOWN_KEY, '1') } catch (_) {}
    const role = popupRole
    setPopupRole(null)
    if (role) proceed(role)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ maxWidth: 320, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎙</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: '#005f80' }}>
          {t(lang, 'roleSelectTitle')}
        </h1>
        <p style={{ fontSize: 13, color: '#555', margin: '0 0 12px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
          {t(lang, 'roleSelectHint')}
        </p>
        <p style={{ fontSize: 12, color: '#AAA', margin: '0 0 40px', whiteSpace: 'nowrap' }}>
          {t(lang, 'roleSelectChangeable')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Parent card — pink 3D (UI Caribbean 5984a56 録音 card 整合) */}
          <button
            type="button"
            onClick={() => handle('parent')}
            style={{
              width: '100%',
              padding: '24px 16px',
              fontSize: 18,
              fontWeight: 700,
              color: '#6b2a3a',
              background: 'linear-gradient(145deg, #fff0f5, #fff5ee)',
              border: 'none',
              borderRadius: 18,
              cursor: 'pointer',
              boxShadow: '0 6px 0 #f0b8cc, 0 8px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
              fontFamily: 'Nunito, sans-serif',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 6 }}>👴🏻👵🏻</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{t(lang, 'roleParentTitle')}</div>
            <div style={{ fontSize: 12, color: '#a04060', fontWeight: 600, marginTop: 4 }}>
              {t(lang, 'roleParentSub')}
            </div>
          </button>

          {/* Child card — lavender 3D (UI Caribbean 5984a56 聴く card 整合) */}
          <button
            type="button"
            onClick={() => handle('child')}
            style={{
              width: '100%',
              padding: '24px 16px',
              fontSize: 18,
              fontWeight: 700,
              color: '#3a2a6b',
              background: 'linear-gradient(145deg, #f0eeff, #e8f0ff)',
              border: 'none',
              borderRadius: 18,
              cursor: 'pointer',
              boxShadow: '0 6px 0 #c8b8f0, 0 8px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
              fontFamily: 'Nunito, sans-serif',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 6 }}>👦👧</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{t(lang, 'roleChildTitle')}</div>
            <div style={{ fontSize: 12, color: '#6040c0', fontWeight: 600, marginTop: 4 }}>
              {t(lang, 'roleChildSub')}
            </div>
          </button>
        </div>
      </div>

      {/* One-time popup — 親 → 「お子さんと話そう!」 / 子 → 「ご両親と話そう!」 */}
      {popupRole && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={handlePopupOk}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 12000, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(145deg, #ffffff, #f8f4ff)',
              borderRadius: 20,
              padding: 32,
              maxWidth: 320,
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 12px 32px rgba(168,85,247,0.2)',
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 16 }}>
              {popupRole === 'parent' ? '👦👧' : '👴🏻👵🏻'}
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#005f80', margin: '0 0 8px' }}>
              {popupRole === 'parent' ? t(lang, 'roleParentPopupTitle') : t(lang, 'roleChildPopupTitle')}
            </h3>
            <p style={{ fontSize: 13, color: '#6B5B95', margin: '0 0 20px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
              {popupRole === 'parent' ? t(lang, 'roleParentPopupBody') : t(lang, 'roleChildPopupBody')}
            </p>
            <button
              type="button"
              onClick={handlePopupOk}
              style={{
                background: 'linear-gradient(90deg, #0096c7, #00b4d8)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                padding: '12px 28px',
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,150,199,0.3)',
              }}
            >
              {t(lang, 'roleStartButton')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
