import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getPairId } from '../lib/pairDaily'
import { fetchAlbum } from '../lib/journal'
import VoiceLibrary from '../components/VoiceLibrary'

const demoAlbumDays = [
  { date: '4月1日', photos: ['/demo-photos/kidstravelpakutasoIMG_3146_TP_V4.webp','/demo-photos/kidstravelpakutasoIMG_3155_TP_V.webp','/demo-photos/Gemini_Generated_Image_4fx62a4fx62a4fx6.png'] },
  { date: '3月31日', photos: ['/demo-photos/nekocyanPAKE5233-481_TP_V.webp','/demo-photos/Gemini_Generated_Image_dm6kcmdm6kcmdm6k.png'] },
  { date: '3月30日', photos: ['/demo-photos/08redsugar720_TP_V.webp','/demo-photos/susipakuKYPKPAR52703_TP_V.webp','/demo-photos/Gemini_Generated_Image_9jztwk9jztwk9jzt.png','/demo-photos/CCIMG_8140_TP_V4.webp'] },
  { date: '3月28日', photos: ['/demo-photos/pakutaso_go33036_TP_V.jpg','/demo-photos/Gemini_Generated_Image_ejq9x3ejq9x3ejq9.png'] },
  { date: '3月25日', photos: ['/demo-photos/TKLA__7DA5611_TP_V.jpg','/demo-photos/Family%20fun%20in%20winter%20wonderland.png'] },
]

function getDemoAllPhotos() {
  const all = []
  for (const day of demoAlbumDays) {
    for (const url of day.photos) all.push(url)
  }
  return all
}

export default function AlbumPage({ lang = 'ja' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const scrollToDate = location.state?.scrollToDate ?? null
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null) // index into allPhotos
  const [activeTab, setActiveTab] = useState('photo') // 'photo' | 'voice'
  const pairId = getPairId()
  const [samplePlayed, setSamplePlayed] = useState({}) // track played sample voices
  const [voiceHasData, setVoiceHasData] = useState(false)
  const sampleAudioRef = useRef(null)
  const [samplePlayingKey, setSamplePlayingKey] = useState(null)

  useEffect(() => {
    fetchAlbum(getPairId())
      .then(({ days: d }) => {
        setDays(d)
        setLoading(false)
      })
      .catch((e) => {
        setError(e?.message || String(e))
        setLoading(false)
      })
  }, [])

  // Flat array of all photos across all days (newest first, matching days order)
  const allPhotos = useMemo(() => {
    if (days.length > 0) {
      const flat = []
      for (const day of days) {
        for (const photo of day.photos) {
          flat.push({ ...photo, dateKey: day.dateKey })
        }
      }
      return flat
    }
    // Fallback: demo photos
    return getDemoAllPhotos().map((url) => ({ url, dateKey: '', storagePath: url }))
  }, [days])

  const openLightbox = useCallback((photo) => {
    const idx = allPhotos.findIndex((p) => p.storagePath === photo.storagePath)
    setLightboxIndex(idx >= 0 ? idx : 0)
  }, [allPhotos])

  const closeLightbox = useCallback(() => setLightboxIndex(null), [])

  const prevPhoto = useCallback(() => {
    setLightboxIndex((prev) => prev != null ? Math.max(0, prev - 1) : null)
  }, [])

  const nextPhoto = useCallback(() => {
    setLightboxIndex((prev) => prev != null ? Math.min(allPhotos.length - 1, prev + 1) : null)
  }, [allPhotos.length])

  useEffect(() => {
    if (loading || !scrollToDate) return
    const el = document.getElementById(`date-${scrollToDate}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loading, scrollToDate])

  useEffect(() => {
    if (lightboxIndex == null) return
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') prevPhoto()
      else if (e.key === 'ArrowRight') nextPhoto()
      else if (e.key === 'Escape') closeLightbox()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, prevPhoto, nextPhoto, closeLightbox])

  // Touch swipe support
  const touchStartRef = useRef(null)

  const handleTouchStart = useCallback((e) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])

  const handleTouchEnd = useCallback((e) => {
    if (!touchStartRef.current) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y
    touchStartRef.current = null
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return
    if (dx < 0) nextPhoto()
    else prevPhoto()
  }, [nextPhoto, prevPhoto])

  const formatDate = (dateKey) => {
    if (!dateKey) return dateKey
    const [y, m, d] = dateKey.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(
      lang === 'en' ? 'en-US' : 'ja-JP',
      { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }
    )
  }

  const formatDateShort = (dateKey) => {
    if (!dateKey) return ''
    const [, m, d] = dateKey.split('-').map(Number)
    return lang === 'en' ? `${new Date(2000, m - 1).toLocaleString('en', { month: 'short' })} ${d}` : `${m}月${d}日`
  }

  const currentPhoto = lightboxIndex != null ? allPhotos[lightboxIndex] : null

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#FFF8FF',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      color: '#333',
      overscrollBehavior: 'none',
    }}>
      <header style={{
        position: 'sticky',
        top: 0,
        background: '#FFF8FF',
        borderBottom: '1px solid #EEE8FF',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 100,
      }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: '0 4px', color: '#7050C0', lineHeight: 1 }}
          aria-label={lang === 'en' ? 'Back' : '戻る'}
        >
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#333' }}>
          {lang === 'en' ? 'Album' : 'アルバム'}
        </h1>
      </header>

      {/* Pill Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: '#FFF8FF', position: 'sticky', top: 49, zIndex: 99 }}>
        <button type="button" onClick={() => setActiveTab('photo')} style={{ flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 700, color: activeTab === 'photo' ? '#fff' : '#999', background: activeTab === 'photo' ? 'linear-gradient(135deg, #FF80C0, #A060FF)' : 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 20, cursor: 'pointer', transition: 'all 0.2s ease' }}>
          📷 {lang === 'en' ? 'Photos' : '写真'}
        </button>
        <button type="button" onClick={() => setActiveTab('voice')} style={{ flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 700, color: activeTab === 'voice' ? '#fff' : '#999', background: activeTab === 'voice' ? 'linear-gradient(135deg, #FF80C0, #A060FF)' : 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 20, cursor: 'pointer', transition: 'all 0.2s ease' }}>
          🎙 {lang === 'en' ? 'Voice' : '声'}
        </button>
      </div>

      <main style={{ padding: '16px', maxWidth: 480, margin: '0 auto' }}>
      {activeTab === 'voice' && (
        <>
          <VoiceLibrary lang={lang} pairId={pairId} onDataLoaded={(has) => setVoiceHasData(has)} />
          {!voiceHasData && (
            <section style={{ width: '100%', background: '#fff', borderRadius: 18, padding: 14, boxShadow: '0 2px 12px rgba(112,80,192,0.06)', overflow: 'hidden' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {lang === 'en' ? '🎧 Sample Voice History' : '🎧 サンプル音声'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {['2026-04-03', '2026-04-01', '2026-03-30', '2026-03-28', '2026-03-25'].map((dk, di) => {
                  const [, m, d] = dk.split('-').map(Number)
                  const dateLabel = lang === 'en' ? `${m}/${d}` : `${m}月${d}日`
                  const parentKey = `${dk}-parent`
                  const childKey = `${dk}-child`
                  const parentPlayed = !!samplePlayed[parentKey]
                  const childPlayed = !!samplePlayed[childKey]
                  const playSample = (key) => {
                    const el = sampleAudioRef.current
                    if (!el) return
                    if (samplePlayingKey === key) { el.pause(); el.currentTime = 0; setSamplePlayingKey(null); return }
                    el.pause()
                    el.src = '/demo-audio.mp3'
                    el.currentTime = 0
                    el.play().then(() => { setSamplePlayingKey(key); setSamplePlayed(p => ({ ...p, [key]: true })) }).catch(() => {})
                  }
                  return (
                    <div key={dk} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #EEE8FF' }}>
                      <span style={{ fontSize: 12, color: '#8070A0', fontWeight: 600, minWidth: 50 }}>{dateLabel}</span>
                      <button type="button" onClick={() => playSample(parentKey)} style={{ flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#555', background: samplePlayingKey === parentKey ? '#E8E0FF' : '#fff', border: parentPlayed ? '2px solid #30A870' : '2px solid #E04040', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 13 }}>{parentPlayed ? '✅' : '🔴'}</span>
                        <span>👴 {lang === 'en' ? 'Parent' : '親'}</span>
                        {samplePlayingKey === parentKey && <span style={{ fontSize: 11, marginLeft: 'auto' }}>▶</span>}
                      </button>
                      <button type="button" onClick={() => playSample(childKey)} style={{ flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#555', background: samplePlayingKey === childKey ? '#E8E0FF' : '#fff', border: childPlayed ? '2px solid #30A870' : '2px solid #E04040', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 13 }}>{childPlayed ? '✅' : '🔴'}</span>
                        <span>🧑 {lang === 'en' ? 'Child' : '子'}</span>
                        {samplePlayingKey === childKey && <span style={{ fontSize: 11, marginLeft: 'auto' }}>▶</span>}
                      </button>
                    </div>
                  )
                })}
              </div>
              <audio ref={sampleAudioRef} onEnded={() => setSamplePlayingKey(null)} onPause={() => setSamplePlayingKey(null)} style={{ display: 'none' }} />
              <p style={{ fontSize: 10, color: '#B0A0C0', textAlign: 'center', margin: '10px 0 0', fontStyle: 'italic' }}>
                {lang === 'en' ? 'Sample — your voice history will appear here' : 'サンプル — あなたの音声履歴がここに表示されます'}
              </p>
            </section>
          )}
        </>
      )}
      {activeTab === 'photo' && (<>

        {loading && (
          <p style={{ textAlign: 'center', color: '#888', fontSize: 14, marginTop: 32 }}>
            {lang === 'en' ? 'Loading...' : '読み込み中…'}
          </p>
        )}
        {error && (
          <p style={{ textAlign: 'center', color: '#c00', fontSize: 14, marginTop: 32 }}>{error}</p>
        )}
        {!loading && !error && days.length === 0 && (
          <>
            <p style={{ textAlign: 'center', color: '#999', fontSize: 12, margin: '16px 0 20px', fontStyle: 'italic' }}>
              {lang === 'en' ? 'Sample photos — your photos will appear here' : 'サンプル写真 — あなたの写真がここに表示されます'}
            </p>
            {demoAlbumDays.map((day) => {
              const demoAll = getDemoAllPhotos()
              return (
                <section key={day.date} style={{ marginBottom: 28 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#7a6a55', margin: '0 0 10px', letterSpacing: '0.03em' }}>{day.date}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {day.photos.map((url, i) => {
                      const globalIdx = demoAll.indexOf(url)
                      return (
                        <button key={url + i} type="button" onClick={() => setLightboxIndex(globalIdx >= 0 ? globalIdx : 0)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8, overflow: 'hidden', display: 'block' }}>
                          <img src={url} alt="" width={88} height={88} style={{ width: 88, height: 88, objectFit: 'cover', display: 'block', borderRadius: 8 }} loading="lazy" />
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </>
        )}
        {!loading && days.map(({ dateKey, photos }) => {
          const parentPhotos = photos.filter((p) => p.role === 'parent')
          const childPhotos = photos.filter((p) => p.role === 'child')
          return (
            <section key={dateKey} id={`date-${dateKey}`} style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#7a6a55', margin: '0 0 10px', letterSpacing: '0.03em' }}>
                {formatDate(dateKey)}
              </p>
              {parentPhotos.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 12, color: '#999', margin: '0 0 6px' }}>
                    {lang === 'en' ? 'From Parent' : '親から'}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {parentPhotos.map((photo, i) => (
                      <button
                        key={photo.storagePath + String(i)}
                        type="button"
                        onClick={() => openLightbox(photo)}
                        style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8, overflow: 'hidden', display: 'block' }}
                        aria-label={lang === 'en' ? 'Enlarge photo' : '写真を拡大'}
                      >
                        <img src={photo.url} alt="" width={88} height={88} style={{ width: 88, height: 88, objectFit: 'cover', display: 'block', borderRadius: 8 }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {childPhotos.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, color: '#999', margin: '0 0 6px' }}>
                    {lang === 'en' ? 'From Child' : '子から'}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {childPhotos.map((photo, i) => (
                      <button
                        key={photo.storagePath + String(i)}
                        type="button"
                        onClick={() => openLightbox(photo)}
                        style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8, overflow: 'hidden', display: 'block' }}
                        aria-label={lang === 'en' ? 'Enlarge photo' : '写真を拡大'}
                      >
                        <img src={photo.url} alt="" width={88} height={88} style={{ width: 88, height: 88, objectFit: 'cover', display: 'block', borderRadius: 8 }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </>)}
      </main>

      {currentPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={closeLightbox}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Date label */}
          <p style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.6)',
            fontSize: 13,
            margin: 0,
            whiteSpace: 'nowrap',
            zIndex: 1,
          }}>
            {formatDateShort(currentPhoto.dateKey)}
          </p>

          <button
            type="button"
            onClick={closeLightbox}
            style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#fff', fontSize: 30, cursor: 'pointer', padding: 8, lineHeight: 1, zIndex: 1 }}
            aria-label={lang === 'en' ? 'Close' : '閉じる'}
          >
            ×
          </button>

          {lightboxIndex > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prevPhoto() }}
              style={{ position: 'absolute', left: 8, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, lineHeight: 1 }}
              aria-label={lang === 'en' ? 'Previous' : '前へ'}
            >
              ‹
            </button>
          )}

          <img
            src={currentPhoto.url}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 'calc(100vw - 80px)',
              maxHeight: 'calc(100vh - 80px)',
              objectFit: 'contain',
              borderRadius: 8,
              userSelect: 'none',
            }}
          />

          {lightboxIndex < allPhotos.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); nextPhoto() }}
              style={{ position: 'absolute', right: 8, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, lineHeight: 1 }}
              aria-label={lang === 'en' ? 'Next' : '次へ'}
            >
              ›
            </button>
          )}

          {/* Counter */}
          <p style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.6)',
            fontSize: 13,
            margin: 0,
            whiteSpace: 'nowrap',
          }}>
            {lightboxIndex + 1} / {allPhotos.length}
          </p>
        </div>
      )}
    </div>
  )
}
