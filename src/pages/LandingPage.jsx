import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const STYLE_ID = 'landing-animations'
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes logoFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    @keyframes bounce3d { 0%,100% { transform: translateY(0) scale(1); } 30% { transform: translateY(-12px) scale(1.05); } 60% { transform: translateY(-4px) scale(1.02); } }
    @keyframes cfb { 0%,100% { transform: translateY(0); opacity: 0.9; } 50% { transform: translateY(-6px); opacity: 1; } }
    @keyframes wave1 { 0% { transform: translate(-30%,-20%) rotate(0deg); } 100% { transform: translate(30%,20%) rotate(360deg); } }
    @keyframes wave2 { 0% { transform: translate(30%,20%) rotate(0deg); } 100% { transform: translate(-30%,-20%) rotate(-360deg); } }
    @keyframes wave3 { 0% { transform: translate(0%,-30%) rotate(0deg); } 100% { transform: translate(0%,30%) rotate(360deg); } }
    @keyframes ctaPulse { 0%,100% { transform: scale(1); box-shadow: 0 4px 20px rgba(160,96,255,0.3); } 50% { transform: scale(1.02); box-shadow: 0 6px 28px rgba(160,96,255,0.5); } }
  `
  document.head.appendChild(style)
}

export default function LandingPage({ lang = 'ja' }) {
  const navigate = useNavigate()
  useEffect(() => { ensureStyles() }, [])

  const humLetters = 'Hum'.split('')
  const connectLetters = 'connect'.split('')
  const familyLetters = 'family'.split('')

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
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Wave background blobs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,128,192,0.12) 0%, transparent 70%)', top: '10%', left: '10%', animation: 'wave1 20s linear infinite' }} />
        <div style={{ position: 'absolute', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,128,255,0.10) 0%, transparent 70%)', top: '30%', right: '5%', animation: 'wave2 25s linear infinite' }} />
        <div style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(128,192,255,0.10) 0%, transparent 70%)', bottom: '10%', left: '20%', animation: 'wave3 18s linear infinite' }} />
      </div>

      <div style={{ maxWidth: 400, width: '100%', position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ marginBottom: 20, animation: 'logoFloat 4s ease-in-out infinite' }}>
          <img src="/logo.png" alt="Hum" width={100} height={100} style={{ borderRadius: 24, objectFit: 'cover', boxShadow: '0 8px 32px rgba(192,128,255,0.2)' }} />
        </div>

        {/* "Hum" title with per-letter bounce */}
        <h1 style={{ fontSize: 72, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {humLetters.map((ch, i) => (
            <span key={i} style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #FF80C0, #C080FF, #80C0FF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: `bounce3d 2.5s ease-in-out ${i * 0.15}s infinite`,
            }}>{ch}</span>
          ))}
        </h1>

        {/* "connect family" */}
        <p style={{ fontSize: 22, fontWeight: 800, margin: '0 0 20px', display: 'flex', justifyContent: 'center', gap: 8 }}>
          <span>
            {connectLetters.map((ch, i) => (
              <span key={i} style={{
                display: 'inline-block',
                background: 'linear-gradient(135deg, #FF80C0, #E060A0)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: `cfb 3s ease-in-out ${i * 0.08}s infinite`,
              }}>{ch}</span>
            ))}
          </span>
          <span>
            {familyLetters.map((ch, i) => (
              <span key={i} style={{
                display: 'inline-block',
                background: 'linear-gradient(135deg, #80C0FF, #60A0E0)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: `cfb 3s ease-in-out ${(i + 8) * 0.08}s infinite`,
              }}>{ch}</span>
            ))}
          </span>
        </p>

        {/* Catchphrase */}
        <p style={{ fontSize: 20, fontWeight: 600, color: '#5A4A6A', margin: '0 0 8px' }}>
          {lang === 'en' ? '1 min a day, connected by voice' : lang === 'es' ? '1 minuto al día, conectados por voz' : '毎日1分、声でつながる'}
        </p>

        {/* Sub */}
        <p style={{ fontSize: 15, color: '#9A8AAA', margin: '0 0 40px', lineHeight: 1.6 }}>
          {lang === 'en'
            ? 'Daily voice messages between you and your family'
            : '家族との毎日のボイスメッセージ'}
        </p>

        {/* CTA */}
        <button
          type="button"
          onClick={() => navigate('/demo?pairId=PAIR-DEMOTEST')}
          style={{
            width: '100%',
            padding: 20,
            fontSize: 18,
            fontWeight: 800,
            color: '#fff',
            background: 'linear-gradient(135deg, #FF80C0 0%, #A060FF 50%, #80C0FF 100%)',
            border: 'none',
            borderRadius: 18,
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(160,96,255,0.3)',
            animation: 'ctaPulse 2.5s ease-in-out infinite',
            letterSpacing: '0.02em',
          }}
        >
          {lang === 'en' ? '✨ Try the demo' : lang === 'es' ? '✨ Prueba la demo' : '✨ デモを見る'}
        </button>

        <p style={{ fontSize: 12, color: '#B0A0C0', margin: '12px 0 0' }}>
          {lang === 'en' ? 'No sign-up required' : lang === 'es' ? 'No se requiere registro' : 'アカウント登録不要'}
        </p>
      </div>
    </div>
  )
}
