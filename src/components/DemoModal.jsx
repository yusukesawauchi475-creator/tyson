/**
 * DemoModal — DEMO link で write 系操作 (録音送信 / 写真送信) 時に表示する CTA モーダル
 *
 * Phase X-2.5: core-philosophy.md 軸 1 (upstream format 統一) + 軸 3 (物理的に違反生成不能) を
 * UI level で enforce。DEMO は他 pair と完全同 UI で render し、write 系操作タップ時に
 * 本モーダルを trigger する。
 *
 * acquisition flow: 広告 → DEMO link → 録音 / 写真 体験 → 送信 button → 本モーダル → humfamily.com top
 */
export default function DemoModal({
  isOpen,
  onClose,
  message,
  ctaText = 'リクエストする',
  ctaUrl = 'https://www.humfamily.com/',
}) {
  if (!isOpen) return null

  const handleCtaClick = () => {
    window.location.href = ctaUrl
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
            'デモ版です。ご家族専用リンクをご希望の方は humfamily.com トップページからお申し込みください'}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: '1px solid #ccc',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: 'Nunito, sans-serif',
            }}
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={handleCtaClick}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
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
