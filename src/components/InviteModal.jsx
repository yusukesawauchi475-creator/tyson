import { useState } from 'react'
import { SHARE_TARGETS } from '../lib/shareTargets'
import { copyInviteLink } from '../lib/invite'

/**
 * InviteModal - 招待 link share の統一 UI
 *
 * Phase II-share: HomePage / PairDailyPage 両方で reuse、iOS share sheet 廃止
 *
 * Props:
 * - isOpen: モーダル表示 flag
 * - onClose: close handler
 * - inviteUrl: 招待 URL (例: https://www.humfamily.com/pair/<slug>?openExternalBrowser=1)
 * - inviteText: share 時に prefilled される本文 (URL 含む)
 *
 * 軸 1 (upstream format 統一): SHARE_TARGETS array で全 platform 統一
 * 軸 5 (variation table): 8 variation 網羅 (iOS/Android/desktop x LINE app あり/なし + コピー + キャンセル)
 */
export default function InviteModal({ isOpen, onClose, inviteUrl, inviteText }) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handleShareClick = (target) => {
    const url = target.url(inviteText)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleCopy = async () => {
    if (!inviteUrl) return
    try {
      const result = await copyInviteLink(inviteUrl)
      if (result?.success) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch (e) {
      console.error('[InviteModal] copy failed:', e)
    }
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
        background: 'rgba(0, 0, 0, 0.5)',
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
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          maxWidth: 400,
          width: '100%',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
        }}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#333', textAlign: 'center' }}>
          家族にリンクを送る
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {SHARE_TARGETS.map((target) => (
            <button
              key={target.id}
              type="button"
              onClick={() => handleShareClick(target)}
              style={{
                padding: '14px 24px',
                borderRadius: 8,
                border: 'none',
                background: target.color,
                color: target.textColor,
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 600,
                width: '100%',
                fontFamily: 'inherit',
              }}
            >
              {target.label}
            </button>
          ))}

          <button
            type="button"
            onClick={handleCopy}
            style={{
              padding: '14px 24px',
              borderRadius: 8,
              border: '1px solid #ccc',
              background: copied ? '#4caf50' : '#fff',
              color: copied ? '#fff' : '#666',
              cursor: 'pointer',
              fontSize: 16,
              width: '100%',
              fontFamily: 'inherit',
            }}
          >
            {copied ? '✓ コピーしました' : '📋 リンクをコピー'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: 14,
              cursor: 'pointer',
              padding: '8px 16px',
              fontFamily: 'inherit',
            }}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
