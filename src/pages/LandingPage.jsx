import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../lib/i18n'

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

        {/* Mic value box — pink→purple gradient circle + emphasis copy */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '8px 0 32px' }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #ec4899, #a855f7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 40,
            color: '#fff',
            boxShadow: '0 8px 24px rgba(168,85,247,.3)',
          }}>🎙️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#005f80', margin: '12px 0 4px' }}>
            {t(lang, 'valueBoxMain')}
          </h2>
          <p style={{ fontSize: 13, color: '#6B5B95', margin: 0 }}>
            {t(lang, 'valueBoxSub')}
          </p>
        </div>

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

        {/* 4 segment grid */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          maxWidth: 400,
          margin: '32px auto 0',
        }}>
          {[
            { icon: '✈️', titleKey: 'segOverseas', descKey: 'segOverseasDesc' },
            { icon: '🏠', titleKey: 'segApart', descKey: 'segApartDesc' },
            { icon: '🏥', titleKey: 'segFacility', descKey: 'segFacilityDesc' },
            { icon: '🎂', titleKey: 'segAnniversary', descKey: 'segAnniversaryDesc' },
          ].map((s) => (
            <div key={s.titleKey} style={{
              background: 'linear-gradient(145deg, #ffffff, #f8f4ff)',
              borderRadius: 12,
              padding: 16,
              boxShadow: '0 4px 0 rgba(168,85,247,.15), 0 6px 12px rgba(0,0,0,.06), inset 0 1px 0 rgba(255,255,255,.8)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{s.icon}</div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#6040c0', margin: '0 0 4px' }}>
                {t(lang, s.titleKey)}
              </h3>
              <p style={{ fontSize: 11, color: '#888', margin: 0, lineHeight: 1.4 }}>
                {t(lang, s.descKey)}
              </p>
            </div>
          ))}
        </section>

        {/* Facility CTA — For Facilities pilot */}
        <section style={{
          background: 'linear-gradient(135deg, rgba(0,180,216,.15), rgba(168,85,247,.10))',
          borderRadius: 16,
          padding: 24,
          maxWidth: 400,
          margin: '40px auto 0',
          textAlign: 'center',
        }}>
          <span style={{
            display: 'inline-block',
            background: 'linear-gradient(90deg, #0096c7, #00b4d8)',
            color: '#fff',
            padding: '4px 12px',
            borderRadius: 12,
            fontSize: 10,
            fontWeight: 700,
            marginBottom: 8,
            letterSpacing: '0.05em',
          }}>For Facilities</span>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#005f80', margin: '0 0 8px' }}>
            {t(lang, 'facilityTitle')}
          </h2>
          <p style={{ fontSize: 12, color: '#6B5B95', margin: '0 0 16px', lineHeight: 1.5 }}>
            {t(lang, 'facilityDesc')}
          </p>
          <a href="mailto:hum.family.app@gmail.com?subject=Facility%20Pilot" style={{
            color: '#0096c7',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
          }}>{t(lang, 'facilityCta')}</a>
        </section>
      </div>
    </div>
  )
}
