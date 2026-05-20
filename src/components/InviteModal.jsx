import { useState } from 'react'
import { getMessengerTargets } from '../lib/inviteShare'
import { t } from '../lib/i18n'

/**
 * InviteModal - 招待 link share の統一 UI
 *
 * Phase II-share: HomePage / PairDailyPage 両方で reuse、iOS share sheet 廃止
 *
 * Props:
 * - isOpen: モーダル表示 flag
 * - onClose: close handler
 * - inviteText: share 時に prefilled される本文 (URL 含む)
 * - lang: UI / messenger order language
 *
 * 軸 1 (upstream format 統一): inviteShare の言語別 config で全 platform 統一
 */
export default function InviteModal({ isOpen, onClose, inviteText, lang = 'ja' }) {
  const [copyState, setCopyState] = useState('idle')

  if (!isOpen) return null

  const handleShareClick = (target) => {
    if (!target.url || !inviteText) return
    window.location.assign(target.url(inviteText, lang))
  }

  const handleCopy = async () => {
    if (!inviteText) return
    try {
      await navigator.clipboard.writeText(inviteText)
      setCopyState('copied')
    } catch (e) {
      console.error('[InviteModal] copy failed:', e)
      setCopyState('failed')
    }
    setTimeout(() => setCopyState('idle'), 2200)
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose?.()
    }
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 60, 78, 0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
        fontFamily: 'Nunito, sans-serif',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(0,180,216,.96), rgba(72,202,228,.94))',
          borderRadius: 16,
          padding: 24,
          maxWidth: 400,
          width: '100%',
          boxShadow: '0 18px 0 #0084a8, 0 26px 42px rgba(0, 91, 120, 0.28), inset 0 1px 0 rgba(255,255,255,.55)',
          border: '1px solid rgba(255,255,255,.48)',
        }}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: '#fff', textAlign: 'center', textShadow: '0 2px 0 rgba(0,0,0,.12)' }}>
          {t(lang, 'inviteMessengerTitle')}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {getMessengerTargets(lang).map((target) => (
            <button
              key={target.id}
              type="button"
              onClick={target.id === 'copy' ? handleCopy : () => handleShareClick(target)}
              style={{
                padding: '14px 24px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,.52)',
                background: target.id === 'copy' && copyState === 'copied' ? '#2FBF71' : target.color,
                color: target.textColor,
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 800,
                width: '100%',
                fontFamily: 'inherit',
                boxShadow: '0 5px 0 rgba(0,86,112,.22), inset 0 1px 0 rgba(255,255,255,.34)',
                transform: 'translateY(0)',
                textAlign: 'center',
              }}
            >
              {target.id === 'copy' && copyState === 'copied'
                ? t(lang, 'inviteCopySuccess')
                : target.id === 'copy' && copyState === 'failed'
                  ? t(lang, 'inviteCopyFailed')
                  : t(lang, target.labelKey)}
            </button>
          ))}
        </div>

        {copyState !== 'idle' && (
          <div
            aria-live="polite"
            style={{
              marginTop: 14,
              padding: '9px 14px',
              borderRadius: 999,
              background: 'rgba(255,255,255,.92)',
              color: copyState === 'failed' ? '#A42E2E' : '#087F5B',
              fontSize: 13,
              fontWeight: 800,
              textAlign: 'center',
            }}
          >
            {copyState === 'failed' ? t(lang, 'inviteCopyFailed') : t(lang, 'inviteCopySuccess')}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              padding: '8px 16px',
              fontFamily: 'inherit',
              textShadow: '0 1px 0 rgba(0,0,0,.12)',
            }}
          >
            {t(lang, 'inviteClose')}
          </button>
        </div>
      </div>
    </div>
  )
}
