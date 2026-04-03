import { useState, useRef, useMemo } from 'react'
import { t } from '../lib/i18n'

const DEMO_PAIR_ID = 'PAIR-FSEAN5'
const DEMO_AUDIO_URL = '/demo-audio.mp3'

// Generate 100 sample photo URLs from Unsplash Source API
function generateSamplePhotos() {
  const photos = []
  const categories = [
    { query: 'dog,cat', count: 40 },
    { query: 'portrait,family', count: 20 },
    { query: 'orange,fruit', count: 20 },
    { query: 'kotatsu,japanese-room', count: 20 },
  ]
  let idx = 0
  for (const { query, count } of categories) {
    for (let i = 0; i < count; i++) {
      photos.push({
        url: `https://source.unsplash.com/300x300/?${query}&sig=${idx}`,
        id: idx,
      })
      idx++
    }
  }
  // Shuffle deterministically by interleaving categories
  const shuffled = []
  for (let i = 0; i < 40; i++) {
    shuffled.push(photos[i]) // dog,cat
    if (i < 20) shuffled.push(photos[40 + i]) // portrait
    if (i < 20) shuffled.push(photos[60 + i]) // fruit
    if (i < 20) shuffled.push(photos[80 + i]) // kotatsu
  }
  return shuffled
}

export default function DemoPage({ lang = 'ja' }) {
  const [isPlayingParent, setIsPlayingParent] = useState(false)
  const [errorLine, setErrorLine] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const parentAudioRef = useRef(null)
  const touchStartRef = useRef(null)

  const samplePhotos = useMemo(() => generateSamplePhotos(), [])

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
    if (dx < 0 && lightboxIndex < samplePhotos.length - 1) setLightboxIndex(lightboxIndex + 1)
    else if (dx > 0 && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1)
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', background: 'var(--color-bg)', color: 'var(--color-text)', paddingBottom: 90, overflow: 'hidden' }}>
      {/* Gradient Header */}
      <header style={{ flexShrink: 0, background: 'linear-gradient(135deg, #FF80C0 0%, #C080FF 50%, #80C0FF 100%)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="Hum" width={36} height={36} style={{ borderRadius: 10, objectFit: 'cover' }} />
          <span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>Hum</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 10 }}>DEMO</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ padding: '4px 12px', fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', borderRadius: 20 }}>
            55{lang === 'en' ? 'd' : '日目'}
          </span>
          <span style={{ padding: '4px 12px', fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', borderRadius: 20 }}>
            🔥7{lang === 'en' ? 'd' : '日連続'}
          </span>
        </div>
      </header>

      {/* Date bar */}
      <div style={{ background: '#F8F0FF', borderBottom: '1px solid #EEE8FF', padding: '8px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <time style={{ fontSize: 11, color: '#8070A0', fontWeight: 600 }}>{today}</time>
          <span style={{ fontSize: 11, fontStyle: 'italic', color: '#9080B0' }}>{lang === 'en' ? '1 min a day, connected by voice' : '毎日1分、声でつながる'}</span>
        </div>
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

        {/* (3) Sample photo gallery */}
        <section style={{ width: '100%', background: '#F0EEFF', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(112,80,192,0.06)', overflow: 'hidden' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#7050C0', margin: '0 0 10px' }}>
            📷 {lang === 'en' ? 'Photo Album' : 'フォトアルバム'}　<span style={{ fontWeight: 500, color: '#8070A0' }}>100{lang === 'en' ? ' photos' : '枚'}</span>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {samplePhotos.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setLightboxIndex(i)}
                style={{ padding: 0, border: 'none', background: '#E8E0FF', cursor: 'pointer', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', display: 'block' }}
              >
                <img
                  src={photo.url}
                  alt=""
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </button>
            ))}
          </div>
        </section>

        {errorLine && <p style={{ fontSize: 14, color: '#E04040', textAlign: 'center', margin: 0 }}>{errorLine}</p>}
      </main>

      {/* CTA button */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9000, background: 'linear-gradient(0deg, #FFF8FF 80%, transparent)', padding: '16px 18px max(16px, env(safe-area-inset-bottom))' }}>
        <button
          type="button"
          onClick={() => { window.location.href = '/#/?pairId=PAIR-FSEAN5' }}
          style={{ width: '100%', maxWidth: 480, margin: '0 auto', display: 'block', padding: 16, fontSize: 16, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #FF80C0 0%, #C080FF 50%, #80C0FF 100%)', border: 'none', borderRadius: 16, cursor: 'pointer', boxShadow: '0 4px 16px rgba(192,128,255,0.4)' }}
        >
          {lang === 'en' ? '✨ Try this app' : '✨ このアプリを使ってみる'}
        </button>
      </div>

      <audio ref={parentAudioRef} onEnded={() => setIsPlayingParent(false)} onPause={() => setIsPlayingParent(false)} style={{ display: 'none' }} />

      {/* Lightbox */}
      {lightboxIndex != null && samplePhotos[lightboxIndex] && (
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
            src={samplePhotos[lightboxIndex].url}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 'calc(100vw - 80px)', maxHeight: 'calc(100vh - 80px)', objectFit: 'contain', borderRadius: 8, userSelect: 'none' }}
          />

          {lightboxIndex < samplePhotos.length - 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1) }} style={{ position: 'absolute', right: 8, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, lineHeight: 1 }}>›</button>
          )}

          <p style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: 0 }}>
            {lightboxIndex + 1} / {samplePhotos.length}
          </p>
        </div>
      )}
    </div>
  )
}
