/**
 * InstallRecoveryPage — PWA standalone 起動時 + localStorage に slug なしの時に表示。
 *
 * iOS Safari の standalone mode（ホーム追加アイコン起動）は Safari タブと別の localStorage
 * context を持つため（Apple 仕様）、段階7 の「`hum_last_slug` から /pair/:slug に復元」が
 * 永久に trigger されない。LandingPage の「デモを見る」CTA 経由で demo に誘導される bug を
 * 防ぐため、PWA standalone + 空 localStorage 時はこの案内画面を表示する。
 * See docs/migrations/pair-world-refactor.md "Known Debt / Phase 3 Candidate"。
 */
export default function InstallRecoveryPage({ lang = 'ja' }) {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      background: '#FFF8FF',
      fontFamily: 'var(--font-sans)',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 360, width: '100%' }}>
        <img
          src="/logo.png"
          alt="Hum"
          width={88}
          height={88}
          style={{ borderRadius: 22, objectFit: 'cover', boxShadow: '0 8px 32px rgba(192,128,255,0.2)', marginBottom: 24 }}
        />
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 16px', color: '#5A4A6A' }}>
          {lang === 'en' ? 'Open Hum from the link' : 'リンクから開いてください'}
        </h1>
        <p style={{ fontSize: 15, color: '#7A6A8A', margin: 0, lineHeight: 1.7 }}>
          {lang === 'en'
            ? 'Please open Hum again from the link shared in LINE.'
            : 'LINEで共有されたリンクから、もう一度Humを開いてください。'}
        </p>
      </div>
    </div>
  )
}
