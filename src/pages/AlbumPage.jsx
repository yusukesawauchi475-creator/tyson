import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { fetchAlbum } from '../lib/journal'
import VoiceLibrary from '../components/VoiceLibrary'
import { getUserRole, getPairId } from '../lib/pairDaily'

const demoAlbumDays = [
  { date: '2026-04-01', label: '4月1日', photos: ['/demo-photos/kidstravelpakutasoIMG_3146_TP_V4.webp','/demo-photos/kidstravelpakutasoIMG_3155_TP_V.webp','/demo-photos/Gemini_Generated_Image_4fx62a4fx62a4fx6.png'] },
  { date: '2026-03-31', label: '3月31日', photos: ['/demo-photos/nekocyanPAKE5233-481_TP_V.webp','/demo-photos/Gemini_Generated_Image_dm6kcmdm6kcmdm6k.png'] },
  { date: '2026-03-30', label: '3月30日', photos: ['/demo-photos/08redsugar720_TP_V.webp','/demo-photos/susipakuKYPKPAR52703_TP_V.webp','/demo-photos/CCIMG_8140_TP_V4.webp'] },
  { date: '2026-03-25', label: '3月25日', photos: ['/demo-photos/TKLA__7DA5611_TP_V.jpg','/demo-photos/Family fun in winter wonderland.png','/demo-photos/pakutaso_go33036_TP_V.jpg'] },
]

function getDemoAllPhotos() {
  const all = []
  for (const day of demoAlbumDays) {
    for (const url of day.photos) all.push(url)
  }
  return all
}

const BLOCKED_PAIR_IDS = []

const demoVoiceDays = [
  { dateKey: '2026-04-03', label: '今日 · 4月3日', parent: { dur: '0:42', seen: false }, child: { dur: '1:05', seen: false } },
  { dateKey: '2026-04-02', label: '4月2日', parent: { dur: '1:12', seen: true }, child: { dur: '0:58', seen: true } },
  { dateKey: '2026-04-01', label: '4月1日', parent: { dur: '0:33', seen: true }, child: null },
  { dateKey: '2026-03-31', label: '3月31日', parent: null, child: { dur: '0:27', seen: true } },
  { dateKey: '2026-03-30', label: '3月30日', parent: { dur: '0:45', seen: true }, child: { dur: '1:10', seen: true } },
]

export default function AlbumPage({ lang = 'ja' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const scrollToDate = location.state?.scrollToDate ?? null
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [activeTab, setActiveTab] = useState('photo')
  const [playingKey, setPlayingKey] = useState(null)
  const [playedKeys, setPlayedKeys] = useState({})
  const voiceAudioRef = useRef(null)
  // URL pairId extraction: try react-router search, then hash fallback
  const rawPairId = (() => {
    try {
      // react-router useLocation().search (works with navigate())
      const fromRouter = new URLSearchParams(location.search).get('pairId')?.trim()
      if (fromRouter) return fromRouter
      // fallback: parse hash directly (works with window.location.href)
      const hash = window.location.hash || ''
      const qi = hash.indexOf('?')
      if (qi >= 0) {
        const fromHash = new URLSearchParams(hash.slice(qi + 1)).get('pairId')?.trim()
        if (fromHash) return fromHash
      }
      // fallback: localStorage（/pair/1 経由でpairIdが保存済みの場合）
      const stored = getPairId()
      if (stored && stored !== 'demo') return stored
      return null
    } catch (_) { return null }
  })()
  const isDemo = rawPairId === 'PAIR-DEMOTEST'
  const pairId = (!rawPairId || BLOCKED_PAIR_IDS.includes(rawPairId) || isDemo) ? null : rawPairId

  useEffect(() => {
    if (!pairId) { setLoading(false); return }
    fetchAlbum(pairId)
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
    // Fallback: demo photos only for PAIR-DEMOTEST
    if (isDemo) return getDemoAllPhotos().map((url) => ({ url, dateKey: '', storagePath: url }))
    return []
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
  const [downloading, setDownloading] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

  const handleDownload = useCallback(async (e) => {
    e.stopPropagation()
    if (!currentPhoto?.url) return
    if (isIOS) { setIosHint(true); setTimeout(() => setIosHint(false), 3000); return }
    setDownloading(true)
    try {
      const res = await fetch(currentPhoto.url)
      const blob = await res.blob()
      const ext = blob.type?.includes('png') ? 'png' : blob.type?.includes('webp') ? 'webp' : 'jpg'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `hum_${currentPhoto.dateKey || 'photo'}_${lightboxIndex + 1}.${ext}`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (_) {}
    setDownloading(false)
  }, [currentPhoto, lightboxIndex, isIOS])

  if (!pairId && !isDemo) {
    return (
      <div style={{ minHeight: '100dvh', background: '#FFF8FF', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 24 }}>
        <p style={{ fontSize: 16, color: '#7050C0', fontWeight: 600, textAlign: 'center' }}>
          {lang === 'en' ? 'Pair ID required to view album.' : 'アルバムを表示するにはペアIDが必要です。'}
        </p>
        <button type="button" onClick={() => navigate(-1)} style={{ marginTop: 16, padding: '10px 24px', fontSize: 14, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg, #FF80C0, #A060FF)', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
          {lang === 'en' ? '← Back' : '← 戻る'}
        </button>
      </div>
    )
  }

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
      {(pairId || isDemo) && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: '#FFF8FF', position: 'sticky', top: 49, zIndex: 99 }}>
          <button type="button" onClick={() => setActiveTab('photo')} style={{ flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 700, color: activeTab === 'photo' ? '#fff' : '#999', background: activeTab === 'photo' ? 'linear-gradient(90deg, #FF80C0, #A060FF)' : 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 20, cursor: 'pointer', transition: 'all 0.2s ease' }}>
            📷 {lang === 'en' ? 'Photos' : '写真'}
          </button>
          <button type="button" onClick={() => setActiveTab('voice')} style={{ flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 700, color: activeTab === 'voice' ? '#fff' : '#999', background: activeTab === 'voice' ? 'linear-gradient(90deg, #FF80C0, #A060FF)' : 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 20, cursor: 'pointer', transition: 'all 0.2s ease' }}>
            🎙 {lang === 'en' ? 'Voice' : '声'}
          </button>
        </div>
      )}

      <main style={{ padding: '16px', maxWidth: 480, margin: '0 auto' }}>

      {/* Voice tab */}
      {pairId && !isDemo && activeTab === 'voice' && (
        <VoiceLibrary lang={lang} pairId={pairId} role={getUserRole()} />
      )}
      {isDemo && activeTab === 'voice' && (
        <section style={{ width: '100%' }}>
          <style>{`@keyframes vwave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }`}</style>
          <p style={{ textAlign: 'center', color: '#999', fontSize: 12, margin: '8px 0 16px', fontStyle: 'italic' }}>
            {lang === 'en' ? 'Sample — your voice history will appear here' : 'サンプル — 声の履歴がここに表示されます'}
          </p>
          {demoVoiceDays.map((day) => {
            const playVoice = (key) => {
              const el = voiceAudioRef.current
              if (!el) return
              if (playingKey === key) { el.pause(); el.currentTime = 0; setPlayingKey(null); return }
              el.pause(); el.src = '/demo-audio.mp3'; el.currentTime = 0
              el.play().then(() => { setPlayingKey(key); setPlayedKeys(p => ({ ...p, [key]: true })) }).catch(() => {})
            }
            const btnBase = { flex: 1, padding: '10px 8px', fontSize: 12, fontWeight: 600, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5, minHeight: 42 }
            const renderBtn = (role, data, emoji, label) => {
              if (!data) return <div key={role} style={{ ...btnBase, background: '#FAFAFA', border: '2px solid #EEE', color: '#ccc', justifyContent: 'center' }}>—</div>
              const key = `${day.dateKey}-${role}`
              const isPlaying = playingKey === key
              const hasPlayed = data.seen || !!playedKeys[key]
              return (
                <button key={role} type="button" onClick={() => playVoice(key)} style={{
                  ...btnBase, color: '#555', cursor: 'pointer',
                  background: isPlaying ? '#E8E0FF' : '#fff',
                  border: isPlaying ? '2px solid #A060FF' : hasPlayed ? '2px solid #30A870' : '2px solid #E04040',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 13 }}>{hasPlayed ? '✅' : '🔴'}</span>
                    <span>{emoji} {label}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: '#999' }}>{data.dur}</span>
                    {isPlaying && (
                      <span style={{ display: 'flex', gap: 2 }}>
                        {[0,1,2].map(i => <span key={i} style={{ width: 3, height: 12, background: '#A060FF', borderRadius: 2, animation: `vwave 0.6s ease-in-out ${i*0.15}s infinite` }} />)}
                      </span>
                    )}
                  </span>
                </button>
              )
            }
            return (
              <div key={day.dateKey} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #EEE8FF' }}>
                <span style={{ fontSize: 12, color: '#8070A0', fontWeight: 600, minWidth: 50 }}>{day.label}</span>
                {renderBtn('parent', day.parent, '👴', lang === 'en' ? 'Parent' : '親')}
                {renderBtn('child', day.child, '🧑', lang === 'en' ? 'Child' : '子')}
              </div>
            )
          })}
          <audio ref={voiceAudioRef} onEnded={() => setPlayingKey(null)} onPause={() => setPlayingKey(null)} style={{ display: 'none' }} />
        </section>
      )}

      {/* Photo tab */}
      {(activeTab === 'photo') && (<>

        {loading && (
          <section style={{ width: '100%', background: '#F8F6FF', borderRadius: 18, padding: 14, overflow: 'hidden' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {lang === 'en' ? '📷 Photos' : '📷 写真'}
            </p>
            <p style={{ fontSize: 13, color: '#8070A0', textAlign: 'center', margin: 0 }}>
              {lang === 'en' ? 'Loading...' : '読み込み中…'}
            </p>
          </section>
        )}
        {error && (
          <section style={{ width: '100%', background: '#F8F6FF', borderRadius: 18, padding: 14, overflow: 'hidden' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {lang === 'en' ? '📷 Photos' : '📷 写真'}
            </p>
            <p style={{ fontSize: 13, color: '#E04040', textAlign: 'center', margin: 0 }}>{error}</p>
          </section>
        )}
        {!loading && !error && days.length === 0 && !isDemo && (
          <section style={{ width: '100%', background: '#F8F6FF', borderRadius: 18, padding: 14, overflow: 'hidden' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {lang === 'en' ? '📷 Photos' : '📷 写真'}
            </p>
            <p style={{ fontSize: 13, color: '#8070A0', textAlign: 'center', margin: 0 }}>
              {lang === 'en' ? 'No photos yet.' : 'まだ写真がありません'}
            </p>
          </section>
        )}
        {!loading && !error && days.length === 0 && isDemo && (
          <>
            <p style={{ textAlign: 'center', color: '#999', fontSize: 12, margin: '16px 0 20px', fontStyle: 'italic' }}>
              {lang === 'en' ? 'Sample photos — your photos will appear here' : 'サンプル写真 — あなたの写真がここに表示されます'}
            </p>
            {demoAlbumDays.map((day) => {
              const demoAll = getDemoAllPhotos()
              return (
                <section key={day.date} style={{ marginBottom: 28 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#7a6a55', margin: '0 0 10px', letterSpacing: '0.03em' }}>{day.label}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {day.photos.map((url, i) => {
                      const globalIdx = demoAll.indexOf(url)
                      return (
                        <button key={url + i} type="button" onClick={() => setLightboxIndex(globalIdx >= 0 ? globalIdx : 0)} style={{ padding: 0, border: 'none', background: '#E8E0FF', cursor: 'pointer', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', display: 'block' }}>
                          <img src={url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '8px 14px', borderRadius: 8, lineHeight: 1, zIndex: 1, display: 'flex', alignItems: 'center', gap: 6 }}
            aria-label={lang === 'en' ? 'Download' : 'ダウンロード'}
          >
            <span style={{ fontSize: 18 }}>⬇</span>
            {downloading ? '...' : (lang === 'en' ? 'Save' : '保存')}
          </button>

          {/* iOS hint */}
          {iosHint && (
            <div onClick={(e) => e.stopPropagation()} style={{
              position: 'absolute', top: 56, left: 16, right: 16,
              background: 'rgba(0,0,0,0.85)', color: '#fff', fontSize: 13,
              padding: '12px 16px', borderRadius: 10, textAlign: 'center', zIndex: 2,
            }}>
              {lang === 'en' ? 'Long press the photo to save it' : '写真を長押しして保存してください'}
            </div>
          )}

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
