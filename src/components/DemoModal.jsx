import { useNavigate } from 'react-router-dom'

/**
 * DemoModal — DEMO link で write 系操作 (録音送信 / 写真送信) 時に表示する CTA モーダル
 *
 * Phase X-2.5: 初版（close + CTA URL 遷移）
 * Phase X-2.5-fix: 「閉じる」削除、navigate('/welcome') で acquisition flow 完成
 *   acquisition flow: 広告 → DEMO link → 録音 / 写真 体験 → 送信 button → 本モーダル
 *                  → /welcome → 自動 pair 発行 → 家族 LINE 送信
 *
 * backdrop click は close 動作維持（誤操作対策）。
 */
export default function DemoModal({ isOpen, onClose, message, ctaText = 'リクエストする' }) {
  const navigate = useNavigate()

  if (!isOpen) return null

  const handleCtaClick = () => {
    onClose?.()
    navigate('/welcome')
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
        <p style={{ fontSize: 16, lineHeight: 1.6, marginTop: 0, marginBottom: 20, color: '#333' }}>
          {message ||
            'デモ版です。ご家族専用リンクをご希望の方は、以下からリクエストしてください。'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleCtaClick}
            style={{
              padding: '12px 28px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'Nunito, sans-serif',
            }}
          >
            {ctaText}
          </button>
        </div>
      </div>
    </div>
  )
}
