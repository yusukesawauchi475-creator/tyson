/**
 * Upload error modal — shown on voice/photo upload failure.
 * Props:
 *   visible: boolean
 *   message: string (error detail)
 *   onRetry: () => void
 *   onClose: () => void
 *   lang: 'ja' | 'en'
 */
export default function UploadErrorModal({ visible, message, onRetry, onClose, lang = 'ja' }) {
  if (!visible) return null

  const isJa = lang !== 'en'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface, #fff)',
          borderRadius: 'var(--radius-md, 14px)',
          padding: '28px 24px 20px',
          maxWidth: 340,
          width: '100%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <p style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--color-text, #2c2416)',
          margin: '0 0 8px',
          lineHeight: 1.5,
        }}>
          {isJa ? '送信に失敗しました' : 'Upload failed'}
        </p>
        <p style={{
          fontSize: 13,
          color: 'var(--color-text-sub, #7a6a55)',
          margin: '0 0 20px',
          lineHeight: 1.5,
        }}>
          {isJa ? 'もう一度試してください。' : 'Please try again.'}
          {message && (
            <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted, #b0a090)', marginTop: 4 }}>
              {message}
            </span>
          )}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px 0',
              fontSize: 14,
              fontWeight: 600,
              background: 'transparent',
              color: 'var(--color-text-sub, #7a6a55)',
              border: '1px solid var(--color-border, #e8e0d4)',
              borderRadius: 'var(--radius-sm, 8px)',
              cursor: 'pointer',
            }}
          >
            {isJa ? '閉じる' : 'Close'}
          </button>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                flex: 1,
                padding: '12px 0',
                fontSize: 14,
                fontWeight: 600,
                background: 'var(--color-primary, #c17f3e)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm, 8px)',
                cursor: 'pointer',
              }}
            >
              {isJa ? 'もう一度' : 'Retry'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
