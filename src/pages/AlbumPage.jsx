import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getPairId } from '../lib/pairDaily'
import { fetchAlbum } from '../lib/journal'

export default function AlbumPage({ lang = 'ja' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const scrollToDate = location.state?.scrollToDate ?? null
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightbox, setLightbox] = useState(null) // { photos: [], index: number }

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

  const openLightbox = useCallback((photos, index) => {
    setLightbox({ photos, index })
  }, [])

  const closeLightbox = useCallback(() => setLightbox(null), [])

  const prevPhoto = useCallback(() => {
    setLightbox((prev) => prev ? { ...prev, index: Math.max(0, prev.index - 1) } : null)
  }, [])

  const nextPhoto = useCallback(() => {
    setLightbox((prev) => prev ? { ...prev, index: Math.min(prev.photos.length - 1, prev.index + 1) } : null)
  }, [])

  useEffect(() => {
    if (loading || !scrollToDate) return
    const el = document.getElementById(`date-${scrollToDate}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loading, scrollToDate])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') prevPhoto()
      else if (e.key === 'ArrowRight') nextPhoto()
      else if (e.key === 'Escape') closeLightbox()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, prevPhoto, nextPhoto, closeLightbox])

  const formatDate = (dateKey) => {
    if (!dateKey) return dateKey
    const [y, m, d] = dateKey.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(
      lang === 'en' ? 'en-US' : 'ja-JP',
      { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }
    )
  }

  const roleLabel = (role) => {
    if (lang === 'en') return role === 'parent' ? 'Parent' : role === 'child' ? 'Child' : ''
    return role === 'parent' ? '親' : role === 'child' ? '子' : ''
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      color: '#333',
    }}>
      <header style={{
        position: 'sticky',
        top: 0,
        background: '#fff',
        borderBottom: '1px solid #e8e0d4',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 100,
      }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: '0 4px', color: '#4a90d9', lineHeight: 1 }}
          aria-label={lang === 'en' ? 'Back' : '戻る'}
        >
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#333' }}>
          {lang === 'en' ? 'Album' : 'アルバム'}
        </h1>
      </header>

      <main style={{ padding: '16px', maxWidth: 480, margin: '0 auto' }}>
        {loading && (
          <p style={{ textAlign: 'center', color: '#888', fontSize: 14, marginTop: 32 }}>
            {lang === 'en' ? 'Loading...' : '読み込み中…'}
          </p>
        )}
        {error && (
          <p style={{ textAlign: 'center', color: '#c00', fontSize: 14, marginTop: 32 }}>{error}</p>
        )}
        {!loading && !error && days.length === 0 && (
          <p style={{ textAlign: 'center', color: '#888', fontSize: 14, marginTop: 32 }}>
            {lang === 'en' ? 'No photos yet.' : 'まだ写真がありません。'}
          </p>
        )}
        {!loading && days.map(({ dateKey, photos }) => (
          <section key={dateKey} id={`date-${dateKey}`} style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#7a6a55', margin: '0 0 10px', letterSpacing: '0.03em' }}>
              {formatDate(dateKey)}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {photos.map((photo, i) => (
                <div key={photo.storagePath + String(i)} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => openLightbox(photos, i)}
                    style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8, overflow: 'hidden', display: 'block' }}
                    aria-label={lang === 'en' ? 'Enlarge photo' : '写真を拡大'}
                  >
                    <img
                      src={photo.url}
                      alt=""
                      width={88}
                      height={88}
                      style={{ width: 88, height: 88, objectFit: 'cover', display: 'block', borderRadius: 8 }}
                    />
                  </button>
                  <span style={{
                    position: 'absolute',
                    bottom: 4,
                    left: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fff',
                    background: 'rgba(0,0,0,0.55)',
                    padding: '1px 5px',
                    borderRadius: 4,
                    lineHeight: 1.4,
                    pointerEvents: 'none',
                  }}>
                    {roleLabel(photo.role)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      {lightbox && (
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
        >
          <button
            type="button"
            onClick={closeLightbox}
            style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#fff', fontSize: 30, cursor: 'pointer', padding: 8, lineHeight: 1, zIndex: 1 }}
            aria-label={lang === 'en' ? 'Close' : '閉じる'}
          >
            ×
          </button>

          {lightbox.index > 0 && (
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
            src={lightbox.photos[lightbox.index]?.url}
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

          {lightbox.index < lightbox.photos.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); nextPhoto() }}
              style={{ position: 'absolute', right: 8, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, lineHeight: 1 }}
              aria-label={lang === 'en' ? 'Next' : '次へ'}
            >
              ›
            </button>
          )}

          <p style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.65)',
            fontSize: 13,
            margin: 0,
            whiteSpace: 'nowrap',
          }}>
            {lightbox.index + 1} / {lightbox.photos.length}
          </p>
        </div>
      )}
    </div>
  )
}
