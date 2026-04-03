import { useState, useRef, useMemo, useEffect } from 'react'
import { t } from '../lib/i18n'


const DEMO_PAIR_ID = 'PAIR-DEMOTEST'
const DEMO_AUDIO_URL = '/demo-audio.mp3'

const albumDays = [
  {
    date: '4月1日',
    photos: [
      '/demo-photos/kidstravelpakutasoIMG_3146_TP_V4.webp',
      '/demo-photos/kidstravelpakutasoIMG_3155_TP_V.webp',
      '/demo-photos/Gemini_Generated_Image_4fx62a4fx62a4fx6.png',
    ]
  },
  {
    date: '3月31日',
    photos: [
      '/demo-photos/nekocyanPAKE5233-481_TP_V.webp',
      '/demo-photos/Gemini_Generated_Image_dm6kcmdm6kcmdm6k.png',
    ]
  },
  {
    date: '3月30日',
    photos: [
      '/demo-photos/08redsugar720_TP_V.webp',
      '/demo-photos/susipakuKYPKPAR52703_TP_V.webp',
      '/demo-photos/Gemini_Generated_Image_9jztwk9jztwk9jzt.png',
      '/demo-photos/CCIMG_8140_TP_V4.webp',
    ]
  },
  {
    date: '3月28日',
    photos: [
      '/demo-photos/pakutaso_go33036_TP_V.jpg',
      '/demo-photos/Gemini_Generated_Image_ejq9x3ejq9x3ejq9.png',
    ]
  },
  {
    date: '3月25日',
    photos: [
      '/demo-photos/TKLA__7DA5611_TP_V.jpg',
      '/demo-photos/Family%20fun%20in%20winter%20wonderland.png',
      '/demo-photos/Gemini_Generated_Image_v6ips5v6ips5v6ip.png',
    ]
  },
  {
    date: '3月20日',
    photos: [
      '/demo-photos/nekocyanPAKE5233-481_TP_V4.webp',
      '/demo-photos/Gemini_Generated_Image_7if52r7if52r7if5.png',
      '/demo-photos/Gemini_Generated_Image_bnqbafbnqbafbnqb.png',
    ]
  },
]

// Flatten all photos for lightbox navigation
function getAllPhotos() {
  const all = []
  for (const day of albumDays) {
    for (const url of day.photos) all.push(url)
  }
  return all
}

// Inject pulse animation CSS once
const PULSE_STYLE_ID = 'demo-pulse-style'
function ensurePulseStyle() {
  if (document.getElementById(PULSE_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PULSE_STYLE_ID
  style.textContent = `@keyframes demoPulse { 0%, 100% { transform: scale(1); box-shadow: 0 4px 16px rgba(192,128,255,0.4); } 50% { transform: scale(1.03); box-shadow: 0 6px 24px rgba(192,128,255,0.6); } }`
  document.head.appendChild(style)
}

export default function DemoPage({ lang = 'ja' }) {
  const [isPlayingParent, setIsPlayingParent] = useState(false)
  const [errorLine, setErrorLine] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const parentAudioRef = useRef(null)
  const touchStartRef = useRef(null)

  const allPhotos = useMemo(() => getAllPhotos(), [])

  useEffect(() => { ensurePulseStyle() }, [])

  const handlePlayParent = async () => {
    const el = parentAudioRef.current
    if (!el) return
    if (isPlayingParent) {
      el.pause()
      el.currentTime = 0
      setIsPlayingParent(false)
      return
    }
    setErrorLine(null)
    try {
      el.src = DEMO_AUDIO_URL
      el.currentTime = 0
      await el.play()
      setIsPlayingParent(true)
    } catch (err) {
      setErrorLine(`再生に失敗しました (${err?.name}: ${err?.message})`)
    }
  }

  const handleShareDemo = async () => {
    const url = 'https://tyson-two.vercel.app/#/?pairId=PAIR-DEMOTEST'
    const text = lang === 'en'
      ? "Let's exchange voices every day on Hum. Listen to today's message 👋"
      : 'Humで毎日声を交換しよう。今日のメッセージを聞いてね 👋'
    if (navigator.share) {
      try { await navigator.share({ text, url }) } catch (_) {}
    } else {
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`)
        alert(lang === 'en' ? 'Link copied!' : 'リンクをコピーしました')
      } catch (_) {
        alert(lang === 'en' ? 'Copy failed' : 'コピーに失敗しました')
      }
    }
  }

  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  })

  // Lightbox swipe
  const handleTouchStart = (e) => {
    touchStartRef.current = { x: e.touches[0].clientX }
  }
  const handleTouchEnd = (e) => {
    if (!touchStartRef.current) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    touchStartRef.current = null
    if (Math.abs(dx) < 40) return
    if (dx < 0 && lightboxIndex < allPhotos.length - 1) setLightboxIndex(lightboxIndex + 1)
    else if (dx > 0 && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1)
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', background: 'var(--color-bg)', color: 'var(--color-text)', paddingBottom: 160, overflow: 'hidden' }}>
      {/* Hero Header */}
      <header style={{ flexShrink: 0, background: 'linear-gradient(135deg, #FF60B0 0%, #A060FF 50%, #60B0FF 100%)', padding: '20px 18px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <img src="/logo.png" alt="Hum" width={44} height={44} style={{ borderRadius: 12, objectFit: 'cover' }} />
          <span style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>Hum</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#FF8C00', padding: '3px 10px', borderRadius: 10 }}>DEMO</span>
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.9)', margin: 0, letterSpacing: '0.02em' }}>
          {lang === 'en' ? '1 min a day, connected by voice' : '毎日1分、声でつながる家族アプリ'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ padding: '4px 12px', fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', borderRadius: 20 }}>
            55{lang === 'en' ? 'd' : '日目'}
          </span>
          <span style={{ padding: '4px 12px', fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', borderRadius: 20 }}>
            🔥7{lang === 'en' ? 'd' : '日連続'}
          </span>
        </div>
      </header>

      {/* Date bar */}
      <div style={{ background: '#F8F0FF', borderBottom: '1px solid #EEE8FF', padding: '8px 18px' }}>
        <time style={{ fontSize: 11, color: '#8070A0', fontWeight: 600 }}>{today}</time>
      </div>

      <main className="page-content page" style={{ flex: 1, maxWidth: 480, margin: '0 auto', width: '100%', paddingTop: 14 }}>
        {/* (1) Receive card - local audio */}
        <section style={{ width: '100%', background: '#E8FFF4', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(48,168,112,0.06)', overflow: 'hidden' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#30A870', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(lang, 'partnerRecordingListen')}</p>
          <p style={{ fontSize: 14, color: '#1A6040', fontWeight: 700, margin: '0 0 10px' }}>
            {t(lang, 'received')}
            <span style={{ marginLeft: 6, color: '#E04040' }}>●</span>
          </p>
          <button type="button" onClick={handlePlayParent} style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, color: '#fff', background: isPlayingParent ? 'linear-gradient(160deg,#E04040,#C02020)' : 'linear-gradient(160deg,#40D890,#18B868)', border: 'none', borderRadius: 14, cursor: 'pointer', boxShadow: isPlayingParent ? '0 5px 0 #901010' : '0 5px 0 #109848', marginBottom: 10 }}>
            {isPlayingParent ? (lang === 'en' ? '⏹ Stop' : '⏹ 停止') : (lang === 'en' ? '▶ Play' : '▶ 再生')}
          </button>
        </section>

        {/* (2) Send card - disabled */}
        <section style={{ width: '100%', background: '#FFF4E8', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(208,112,48,0.06)', overflow: 'hidden', opacity: 0.6 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#D07030', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(lang, 'myRecordingRecordSend')}</p>
          <button type="button" disabled style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, color: '#fff', background: '#B0A0C8', border: 'none', borderRadius: 14, cursor: 'not-allowed', boxShadow: 'none' }}>
            {t(lang, 'record')}
          </button>
          <p style={{ fontSize: 11, color: '#B08050', textAlign: 'center', margin: '8px 0 0' }}>
            {lang === 'en' ? 'Recording is disabled in demo mode' : 'デモモードでは録音できません'}
          </p>
        </section>

        {/* (3) Photo album grouped by date */}
        <section style={{ width: '100%', background: '#F0EEFF', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(112,80,192,0.06)', overflow: 'hidden' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#7050C0', margin: '0 0 14px' }}>
            📷 {lang === 'en' ? 'Photo Album' : 'フォトアルバム'}　<span style={{ fontWeight: 500, color: '#8070A0' }}>{allPhotos.length}{lang === 'en' ? ' photos' : '枚'}</span>
          </p>

          {/* Disabled add button */}
          <button type="button" disabled style={{ width: '100%', padding: 13, fontSize: 14, fontWeight: 700, color: '#fff', background: '#B0A0C8', border: 'none', borderRadius: 14, cursor: 'not-allowed', boxShadow: 'none', opacity: 0.4, marginBottom: 14 }}>
            {lang === 'en' ? '📷 Add Photo' : '📷 写真を追加する'}
          </button>

          {albumDays.map((day) => (
            <div key={day.date} style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#8070A0', margin: '0 0 6px' }}>{day.date}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                {day.photos.map((url, i) => {
                  const globalIdx = allPhotos.indexOf(url)
                  return (
                    <button
                      key={url + i}
                      type="button"
                      onClick={() => setLightboxIndex(globalIdx >= 0 ? globalIdx : 0)}
                      style={{ padding: 0, border: 'none', background: '#E8E0FF', cursor: 'pointer', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', display: 'block' }}
                    >
                      <img src={url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </section>

        {/* (4) Voice Library - demo with local audio */}
        <section style={{ width: '100%', background: '#F8F6FF', borderRadius: 18, padding: 14, overflow: 'hidden' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {lang === 'en' ? '🎧 Voice History' : '🎧 過去の声'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { date: '4月3日', parentUnseen: true, childUnseen: false },
              { date: '4月2日', parentUnseen: false, childUnseen: false },
              { date: '4月1日', parentUnseen: false, childUnseen: true },
              { date: '3月31日', parentUnseen: false, childUnseen: false },
              { date: '3月30日', parentUnseen: false, childUnseen: false },
            ].map((day) => (
              <div key={day.date} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #EEE8FF' }}>
                <span style={{ fontSize: 12, color: '#8070A0', fontWeight: 600, minWidth: 50 }}>{day.date}</span>
                <button type="button" onClick={() => { const el = parentAudioRef.current; if (el) { el.src = DEMO_AUDIO_URL; el.currentTime = 0; el.play().then(() => setIsPlayingParent(true)).catch(() => {}) } }} style={{ flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#555', background: '#fff', border: day.parentUnseen ? '2px solid #E04040' : '2px solid #30A870', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 13 }}>{day.parentUnseen ? '🔴' : '✅'}</span>
                  <span>{lang === 'en' ? 'Parent' : '親'}</span>
                </button>
                <button type="button" onClick={() => { const el = parentAudioRef.current; if (el) { el.src = DEMO_AUDIO_URL; el.currentTime = 0; el.play().then(() => setIsPlayingParent(true)).catch(() => {}) } }} style={{ flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#555', background: '#fff', border: day.childUnseen ? '2px solid #E04040' : '2px solid #30A870', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 13 }}>{day.childUnseen ? '🔴' : '✅'}</span>
                  <span>{lang === 'en' ? 'Child' : '子'}</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        {errorLine && <p style={{ fontSize: 14, color: '#E04040', textAlign: 'center', margin: 0 }}>{errorLine}</p>}
      </main>

      {/* Bottom nav */}
      <nav className="bottom-nav" style={{ bottom: 72 }}>
        <button type="button" className="active"><span style={{ fontSize: 20 }}>🏠</span><span>{lang === 'en' ? 'Home' : 'ホーム'}</span></button>
        <button type="button" disabled style={{ opacity: 0.4 }}><span style={{ fontSize: 20 }}>🖼</span><span>{lang === 'en' ? 'Album' : 'アルバム'}</span></button>
        <button type="button" onClick={handleShareDemo}><span style={{ fontSize: 20 }}>👋</span><span>{lang === 'en' ? 'Share' : '共有'}</span></button>
      </nav>

      {/* CTA button - fixed bottom with pulse */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9000, background: 'linear-gradient(0deg, #FFF8FF 80%, transparent)', padding: '16px 18px max(16px, env(safe-area-inset-bottom))' }}>
        <button
          type="button"
          onClick={() => { window.location.href = '/#/?pairId=PAIR-DEMOTEST' }}
          style={{ width: '100%', maxWidth: 480, margin: '0 auto', display: 'block', padding: 20, fontSize: 18, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg, #FF60B0 0%, #A060FF 50%, #60B0FF 100%)', border: 'none', borderRadius: 18, cursor: 'pointer', boxShadow: '0 4px 16px rgba(192,128,255,0.4)', animation: 'demoPulse 2s ease-in-out infinite', letterSpacing: '0.02em' }}
        >
          {lang === 'en' ? '✨ Try this app' : '✨ このアプリを使ってみる'}
        </button>
      </div>

      <audio ref={parentAudioRef} onEnded={() => setIsPlayingParent(false)} onPause={() => setIsPlayingParent(false)} style={{ display: 'none' }} />

      {/* Lightbox */}
      {lightboxIndex != null && allPhotos[lightboxIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLightboxIndex(null)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button type="button" onClick={() => setLightboxIndex(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#fff', fontSize: 30, cursor: 'pointer', padding: 8, lineHeight: 1, zIndex: 1 }}>×</button>

          {lightboxIndex > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1) }} style={{ position: 'absolute', left: 8, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, lineHeight: 1 }}>‹</button>
          )}

          <img
            src={allPhotos[lightboxIndex]}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 'calc(100vw - 80px)', maxHeight: 'calc(100vh - 80px)', objectFit: 'contain', borderRadius: 8, userSelect: 'none' }}
          />

          {lightboxIndex < allPhotos.length - 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1) }} style={{ position: 'absolute', right: 8, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, lineHeight: 1 }}>›</button>
          )}

          <p style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: 0 }}>
            {lightboxIndex + 1} / {allPhotos.length}
          </p>
        </div>
      )}
    </div>
  )
}
