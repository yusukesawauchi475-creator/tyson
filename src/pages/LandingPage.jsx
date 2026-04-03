import { useNavigate } from 'react-router-dom'

export default function LandingPage({ lang = 'ja' }) {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      background: 'linear-gradient(160deg, #FFF0F8 0%, #F0E8FF 40%, #E8F0FF 100%)',
      fontFamily: 'var(--font-sans)',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 380, width: '100%' }}>
        {/* Logo */}
        <div style={{ marginBottom: 16 }}>
          <img src="/logo.png" alt="Hum" width={64} height={64} style={{ borderRadius: 16, objectFit: 'cover' }} />
        </div>

        <h1 style={{ fontSize: 36, fontWeight: 800, color: '#333', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          Hum
        </h1>

        <p style={{ fontSize: 18, fontWeight: 600, color: '#7050C0', margin: '0 0 12px' }}>
          {lang === 'en' ? '1 min a day, connected by voice' : '毎日1分、声でつながる'}
        </p>

        <p style={{ fontSize: 14, color: '#8070A0', margin: '0 0 40px', lineHeight: 1.6 }}>
          {lang === 'en'
            ? 'A family voice app. Record a short message each day and stay connected with the people you love.'
            : '家族の声アプリ。毎日短いメッセージを録音して、大切な人とつながろう。'}
        </p>

        {/* CTA */}
        <button
          type="button"
          onClick={() => navigate('/demo')}
          style={{
            width: '100%',
            padding: 18,
            fontSize: 17,
            fontWeight: 700,
            color: '#fff',
            background: 'linear-gradient(135deg, #FF80C0 0%, #A060FF 50%, #80C0FF 100%)',
            border: 'none',
            borderRadius: 16,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(160,96,255,0.3)',
            marginBottom: 12,
          }}
        >
          {lang === 'en' ? '✨ Try the demo' : '✨ デモを見る'}
        </button>

        <p style={{ fontSize: 12, color: '#B0A0C0', margin: 0 }}>
          {lang === 'en' ? 'No sign-up required' : 'アカウント登録不要'}
        </p>
      </div>
    </div>
  )
}
