import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useLocation, useOutletContext } from 'react-router-dom'
import { fetchAlbum } from '../lib/journal'
import VoiceLibrary from '../components/VoiceLibrary'
import AlbumCalendar from '../components/AlbumCalendar'
import { getUserRole, clearUserRole } from '../lib/pairDaily'
import { buildInviteUrl } from '../lib/invite'
import { buildInviteMessage } from '../lib/inviteShare'
import RoleBadge from '../components/RoleBadge'
import InviteModal from '../components/InviteModal'
import { t } from '../lib/i18n'

const DEMO_ALBUM_DAYS = [
  { date: '2026-05-29', photos: ['/demo-photos/Gemini_Generated_Image_ejq9x3ejq9x3ejq9.png', '/demo-photos/CCIMG_8140_TP_V4.webp'] },
  { date: '2026-05-28', photos: ['/demo-photos/kidstravelpakutasoIMG_3146_TP_V4.webp', '/demo-photos/Gemini_Generated_Image_ejq9x3ejq9x3ejq9.png', '/demo-photos/Gemini_Generated_Image_4fx62a4fx62a4fx6.png'] },
  { date: '2026-05-27', photos: ['/demo-photos/nekocyanPAKE5233-481_TP_V.webp', '/demo-photos/Gemini_Generated_Image_dm6kcmdm6kcmdm6k.png'] },
  { date: '2026-05-26', photos: ['/demo-photos/08redsugar720_TP_V.webp', '/demo-photos/susipakuKYPKPAR52703_TP_V.webp', '/demo-photos/CCIMG_8140_TP_V4.webp'] },
  { date: '2026-05-25', photos: ['/demo-photos/TKLA__7DA5611_TP_V.jpg', '/demo-photos/Family fun in winter wonderland.png', '/demo-photos/pakutaso_go33036_TP_V.jpg'] },
  { date: '2026-05-23', photos: ['/demo-photos/pakutaso_go33036_TP_V.jpg', '/demo-photos/Gemini_Generated_Image_4fx62a4fx62a4fx6.png'] },
  { date: '2026-05-21', photos: ['/demo-photos/Gemini_Generated_Image_9jztwk9jztwk9jzt.png'] },
  { date: '2026-05-18', photos: ['/demo-photos/nekocyanPAKE5233-481_TP_V.webp', '/demo-photos/Gemini_Generated_Image_a8fon3a8fon3a8fo.png'] },
  { date: '2026-05-16', photos: ['/demo-photos/Gemini_Generated_Image_dkjiz0dkjiz0dkji.png', '/demo-photos/08redsugar720_TP_V.webp'] },
  { date: '2026-05-13', photos: ['/demo-photos/kidstravelpakutasoIMG_3155_TP_V.webp'] },
  { date: '2026-05-11', photos: ['/demo-photos/Gemini_Generated_Image_jq19t9jq19t9jq19.png', '/demo-photos/CCIMG_8140_TP_V4.webp'] },
  { date: '2026-05-08', photos: ['/demo-photos/Gemini_Generated_Image_oth8wvoth8wvoth8.png'] },
  { date: '2026-05-06', photos: ['/demo-photos/nekocyanPAKE5233-481_TP_V4.webp', '/demo-photos/TKLA__7DA5611_TP_V.jpg'] },
  { date: '2026-05-03', photos: ['/demo-photos/Gemini_Generated_Image_s0fbejs0fbejs0fb.png'] },
  { date: '2026-05-01', photos: ['/demo-photos/Gemini_Generated_Image_v6ips5v6ips5v6ip.png', '/demo-photos/pakutaso_go33036_TP_V.jpg'] },
]

const DEMO_VOICE_DAYS = [
  { dateKey: '2026-05-29', parent: { dur: '0:42', seen: false }, child: { dur: '1:05', seen: false } },
  { dateKey: '2026-05-28', parent: { dur: '1:12', seen: false }, child: { dur: '0:58', seen: false } },
  { dateKey: '2026-05-27', parent: { dur: '0:33', seen: true }, child: { dur: '0:44', seen: false } },
  { dateKey: '2026-05-25', parent: { dur: '0:51', seen: false }, child: { dur: '1:10', seen: true } },
  { dateKey: '2026-05-23', parent: { dur: '0:45', seen: false }, child: { dur: '0:37', seen: false } },
  { dateKey: '2026-05-21', parent: { dur: '1:03', seen: true }, child: { dur: '0:49', seen: false } },
  { dateKey: '2026-05-18', parent: { dur: '0:56', seen: false }, child: { dur: '0:32', seen: true } },
  { dateKey: '2026-05-16', parent: { dur: '0:39', seen: false }, child: { dur: '1:01', seen: false } },
  { dateKey: '2026-05-13', parent: { dur: '0:47', seen: true }, child: { dur: '0:52', seen: false } },
  { dateKey: '2026-05-11', parent: { dur: '1:08', seen: false }, child: { dur: '0:41', seen: true } },
]

const BLOCKED_PAIR_IDS = []

export default function AlbumPage({ lang = 'ja' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const outletContext = useOutletContext()
  const slug = outletContext?.slug
  const scrollToDate = location.state?.scrollToDate ?? null
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [activeTab, setActiveTab] = useState('photo')
  const [internalScrollDate, setInternalScrollDate] = useState(null)
  const [playingKey, setPlayingKey] = useState(null)
  const [playedKeys, setPlayedKeys] = useState({})
  const [toastMsg, setToastMsg] = useState(null)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteUrl, setInviteUrl] = useState(null)
  const [inviteText, setInviteText] = useState(null)
  const [albumRetryKey, setAlbumRetryKey] = useState(0)
  const voiceAudioRef = useRef(null)
  // pairId は /pair/:slug/album ルート下の outletContext から取得（公理1: URL = Source of Truth）
  const rawPairId = outletContext?.pairId ?? null
  const isDemo = rawPairId === 'PAIR-DEMOTEST'
  const pairId = (!rawPairId || BLOCKED_PAIR_IDS.includes(rawPairId) || isDemo) ? null : rawPairId

  const demoAlbumDays = useMemo(() => {
    return DEMO_ALBUM_DAYS.map(({ date, photos }) => {
      const [, mm, dd] = date.split('-')
      return {
        date,
        label: `${parseInt(mm, 10)}月${parseInt(dd, 10)}日`,
        photos,
      }
    })
  }, [])

  const demoAllPhotos = useMemo(() => {
    const all = []
    for (const day of demoAlbumDays) {
      for (const url of day.photos) all.push(url)
    }
    return all
  }, [demoAlbumDays])

  const demoVoiceDays = useMemo(() => {
    return DEMO_VOICE_DAYS.map((day, i) => {
      const [, mm, dd] = day.dateKey.split('-')
      const monthDay = `${parseInt(mm, 10)}月${parseInt(dd, 10)}日`
      return {
        dateKey: day.dateKey,
        label: i === 0 ? `今日 · ${monthDay}` : monthDay,
        parent: day.parent,
        child: day.child,
      }
    })
  }, [])

  const demoPhotoCountMap = useMemo(() => {
    if (!isDemo) return undefined
    const map = {}
    for (const d of demoAlbumDays) {
      map[d.date] = Array.isArray(d.photos) ? d.photos.length : 0
    }
    return map
  }, [isDemo, demoAlbumDays])

  const demoVoiceCountMap = useMemo(() => {
    if (!isDemo) return undefined
    const map = {}
    for (const d of demoVoiceDays) {
      map[d.dateKey] = (d.parent ? 1 : 0) + (d.child ? 1 : 0)
    }
    return map
  }, [isDemo, demoVoiceDays])

  // 段階13: demo カレンダー cell に表示する写真 URL（その日の最初の 1 枚）
  const demoPhotoUrlMap = useMemo(() => {
    if (!isDemo) return undefined
    const map = {}
    for (const d of demoAlbumDays) {
      if (Array.isArray(d.photos) && d.photos.length > 0) map[d.date] = d.photos[0]
    }
    return map
  }, [isDemo, demoAlbumDays])

  useEffect(() => {
    if (!pairId) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAlbum(pairId, undefined, slug)
      .then(({ days: d }) => {
        if (cancelled) return
        setDays(d)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message || String(e))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [pairId, slug, albumRetryKey])

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
    if (isDemo) return demoAllPhotos.map((url) => ({ url, dateKey: '', storagePath: url }))
    return []
  }, [days, isDemo, demoAllPhotos])

  // Phase D: dense grid 用の flat 写真配列（dateKey + role を維持、API 順を尊重）
  const flatPhotos = useMemo(() => {
    if (days.length > 0) {
      const all = []
      for (const day of days) {
        for (const photo of day.photos) {
          all.push({ ...photo, dateKey: day.dateKey })
        }
      }
      return all
    }
    if (isDemo) {
      const all = []
      for (const day of demoAlbumDays) {
        const photos = day.photos || []
        for (let i = 0; i < photos.length; i++) {
          const url = photos[i]
          all.push({ url, dateKey: day.date, role: i % 2 === 0 ? 'parent' : 'child', storagePath: url })
        }
      }
      return all
    }
    return []
  }, [days, isDemo, demoAlbumDays])

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
    if (activeTab !== 'photo' || loading) return
    const target = internalScrollDate || scrollToDate
    if (!target) return
    const t = setTimeout(() => {
      const el = document.getElementById(`date-${target}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => clearTimeout(t)
  }, [activeTab, loading, internalScrollDate, scrollToDate])

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

  const handleShare = () => {
    if (!slug) {
      setToastMsg(lang === 'en' ? 'Cannot share: invalid pair URL' : lang === 'es' ? 'No se puede compartir: URL de pareja inválida' : '共有できません。有効なペアURLからアクセスしてください')
      setTimeout(() => setToastMsg(null), 2500)
      return
    }
    const url = buildInviteUrl(slug)
    const text = buildInviteMessage(lang, null, url)
    setInviteUrl(url)
    setInviteText(text)
    setInviteModalOpen(true)
  }

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
      lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'ja-JP',
      { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }
    )
  }

  const formatDateShort = (dateKey) => {
    if (!dateKey) return ''
    const [, m, d] = dateKey.split('-').map(Number)
    return lang === 'en' ? `${new Date(2000, m - 1).toLocaleString('en', { month: 'short' })} ${d}` : lang === 'es' ? `${new Date(2000, m - 1).toLocaleString('es', { month: 'short' })} ${d}` : `${m}月${d}日`
  }

  // Phase D: dense grid 用の overlay 表記（4/24 形式）
  const formatTinyDate = (dateKey) => {
    if (!dateKey) return ''
    const parts = dateKey.split('-')
    if (parts.length < 3) return dateKey
    return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`
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
          {lang === 'en' ? 'Pair ID required to view album.' : lang === 'es' ? 'Se requiere ID de pareja para ver el álbum.' : 'アルバムを表示するにはペアIDが必要です。'}
        </p>
        <button type="button" onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')} style={{ marginTop: 16, padding: '10px 24px', fontSize: 14, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg, #FF80C0, #A060FF)', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
          {lang === 'en' ? '← Back' : lang === 'es' ? '← Atrás' : '← 戻る'}
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
      paddingBottom: 72,
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
          onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
          style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: '0 4px', color: '#0096c7', lineHeight: 1 }}
          aria-label={lang === 'en' ? 'Back' : lang === 'es' ? 'Atrás' : '戻る'}
        >
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#333', flex: 1 }}>
          {lang === 'en' ? 'Album' : lang === 'es' ? 'Álbum' : 'アルバム'}
        </h1>
        {/* 段階10-b-fix: tap で role clear → /pair/:slug に戻り RootRoute が RoleSelectPage を表示 */}
        <RoleBadge
          role={getUserRole()}
          lang={lang}
          onClick={slug ? () => { clearUserRole('switch-button', pairId); navigate(`/pair/${slug}`, { replace: true }) } : undefined}
        />
      </header>

      {/* Pill Tabs — Caribbean 整合 (5984a56) */}
      {(pairId || isDemo) && (
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', background: '#FFF8FF', position: 'sticky', top: 49, zIndex: 99 }}>
          <button type="button" onClick={() => setActiveTab('photo')} style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700, color: activeTab === 'photo' ? '#fff' : '#999', background: activeTab === 'photo' ? 'linear-gradient(90deg, #0096c7, #00b4d8)' : 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 20, cursor: 'pointer', transition: 'all 0.2s ease' }}>
            📷 {lang === 'en' ? 'Photos' : lang === 'es' ? 'Fotos' : '写真'}
          </button>
          <button type="button" onClick={() => setActiveTab('voice')} style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700, color: activeTab === 'voice' ? '#fff' : '#999', background: activeTab === 'voice' ? 'linear-gradient(90deg, #0096c7, #00b4d8)' : 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 20, cursor: 'pointer', transition: 'all 0.2s ease' }}>
            🎙 {lang === 'en' ? 'Voice' : lang === 'es' ? 'Voz' : '声'}
          </button>
          <button type="button" onClick={() => setActiveTab('calendar')} style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700, color: activeTab === 'calendar' ? '#fff' : '#999', background: activeTab === 'calendar' ? 'linear-gradient(90deg, #0096c7, #00b4d8)' : 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 20, cursor: 'pointer', transition: 'all 0.2s ease' }}>
            📅 {lang === 'en' ? 'Calendar' : lang === 'es' ? 'Calendario' : 'カレンダー'}
          </button>
        </div>
      )}

      <main style={{ padding: '16px', maxWidth: 480, margin: '0 auto' }}>

      {/* Calendar tab */}
      {activeTab === 'calendar' && (pairId || isDemo) && (
        <AlbumCalendar
          pairId={isDemo ? 'PAIR-DEMOTEST' : pairId}
          slug={slug}
          lang={lang}
          onDateClick={(dateKey) => { setInternalScrollDate(dateKey); setActiveTab('photo') }}
          {...(isDemo ? { photoCountMap: demoPhotoCountMap, voiceCountMap: demoVoiceCountMap, photoUrlMap: demoPhotoUrlMap } : {})}
        />
      )}

      {/* Voice tab */}
      {pairId && !isDemo && activeTab === 'voice' && (
        <VoiceLibrary lang={lang} pairId={pairId} slug={slug} role={getUserRole()} />
      )}
      {isDemo && activeTab === 'voice' && (
        <section style={{ width: '100%' }}>
          <style>{`@keyframes vwave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }`}</style>
          <p style={{ textAlign: 'center', color: '#999', fontSize: 12, margin: '8px 0 16px', fontStyle: 'italic' }}>
            {lang === 'en' ? 'Sample — your voice history will appear here' : lang === 'es' ? 'Muestra — tu historial de voz aparecerá aquí' : 'サンプル — 声の履歴がここに表示されます'}
          </p>
          {demoVoiceDays.map((day) => {
            const playVoice = (key) => {
              const el = voiceAudioRef.current
              if (!el) return
              if (playingKey === key) { el.pause(); el.currentTime = 0; setPlayingKey(null); return }
              el.pause(); el.src = '/demo-audio.mp3'; el.currentTime = 0
              el.play().then(() => { setPlayingKey(key); setPlayedKeys(p => ({ ...p, [key]: true })) }).catch(() => {})
            }
            const btnBase = { flex: 1, minWidth: 0, padding: '10px 8px', fontSize: 12, fontWeight: 600, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5, minHeight: 42, boxSizing: 'border-box' }
            const renderBtn = (role, data, emoji, label) => {
              if (!data) return (
                <div key={role} style={{
                  ...btnBase,
                  background: 'linear-gradient(145deg, #f8f4ff, #fff5f5)',
                  border: '1px dashed rgba(184,160,232,.35)',
                  color: '#ccc',
                  justifyContent: 'center',
                  gap: 6,
                }}>
                  <span style={{ fontSize: 14, opacity: 0.4 }}>🎙️</span>
                  <span style={{ fontSize: 11 }}>{t(lang, 'noRecording')}</span>
                </div>
              )
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
                <span style={{ fontSize: 12, color: '#8070A0', fontWeight: 600, width: 90, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{day.label}</span>
                {renderBtn('parent', day.parent, '👴', lang === 'en' ? 'Parent' : lang === 'es' ? 'Padre/Madre' : '親')}
                {renderBtn('child', day.child, '🧑', lang === 'en' ? 'Child' : lang === 'es' ? 'Hijo/Hija' : '子')}
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
            <style>{`
              @keyframes humPhotoLoadingBounce { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-5px) scale(1.04); } }
              @keyframes humPhotoLoadingShimmer { 0% { opacity: .55; transform: translateX(-8px); } 50% { opacity: 1; transform: translateX(0); } 100% { opacity: .55; transform: translateX(8px); } }
            `}</style>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {lang === 'en' ? '📷 Photos' : lang === 'es' ? '📷 Fotos' : '📷 写真'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 12px' }}>
              <span style={{ fontSize: 30, lineHeight: 1, display: 'inline-block', animation: 'humPhotoLoadingBounce 1.2s ease-in-out infinite' }}>🖼️</span>
            </div>
            <div style={{ display: 'grid', gap: 8, margin: '0 auto 10px', maxWidth: 320 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    height: i === 0 ? 42 : 34,
                    borderRadius: 12,
                    background: 'linear-gradient(90deg, #ECE8F8 0%, #FFF8FC 50%, #ECE8F8 100%)',
                    animation: `humPhotoLoadingShimmer 1.35s ease-in-out ${i * 0.12}s infinite`,
                  }}
                />
              ))}
            </div>
            <p style={{ fontSize: 12, color: '#8070A0', textAlign: 'center', margin: 0, fontWeight: 600 }}>
              {lang === 'en' ? 'Loading...' : lang === 'es' ? 'Cargando...' : '読み込み中…'}
            </p>
          </section>
        )}
        {error && (
          <section style={{ width: '100%', background: '#F8F6FF', borderRadius: 18, padding: 14, overflow: 'hidden' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {lang === 'en' ? '📷 Photos' : lang === 'es' ? '📷 Fotos' : '📷 写真'}
            </p>
            <p style={{ fontSize: 13, color: '#E04040', textAlign: 'center', margin: 0 }}>{error}</p>
            <button
              type="button"
              onClick={() => setAlbumRetryKey((v) => v + 1)}
              style={{ display: 'block', margin: '12px auto 0', padding: '8px 20px', fontSize: 12, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg,#FF80C0,#A060FF)', border: 'none', borderRadius: 10, cursor: 'pointer' }}
            >
              {lang === 'en' ? 'Retry' : lang === 'es' ? 'Reintentar' : '再試行'}
            </button>
          </section>
        )}
        {!loading && !error && flatPhotos.length === 0 && !isDemo && (
          <section style={{ width: '100%', background: '#F8F6FF', borderRadius: 18, padding: 14, overflow: 'hidden' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {lang === 'en' ? '📷 Photos' : lang === 'es' ? '📷 Fotos' : '📷 写真'}
            </p>
            <p style={{ fontSize: 13, color: '#8070A0', textAlign: 'center', margin: 0 }}>
              {lang === 'en' ? 'No photos yet.' : lang === 'es' ? 'Aún no hay fotos.' : 'まだ写真がありません'}
            </p>
          </section>
        )}
        {!loading && !error && flatPhotos.length > 0 && (
          <>
            {isDemo && (
              <p style={{ textAlign: 'center', color: '#999', fontSize: 12, margin: '16px 0 12px', fontStyle: 'italic' }}>
                {lang === 'en' ? 'Sample photos — your photos will appear here' : lang === 'es' ? 'Fotos de muestra — tus fotos aparecerán aquí' : 'サンプル写真 — あなたの写真がここに表示されます'}
              </p>
            )}
            {/* Phase D: iPhone カメラロール風 dense grid（3 列、gap 2px、左下に M/D + 親/子 overlay） */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              {flatPhotos.map((photo, idx) => {
                const isFirstOfDate = idx === 0 || flatPhotos[idx - 1].dateKey !== photo.dateKey
                const isParent = photo.role === 'parent'
                const isChild = photo.role === 'child'
                const roleEmoji = isParent ? '👴🏻👵🏻' : isChild ? '👦👧' : ''
                const overlayStyle = {
                  position: 'absolute',
                  left: 0,
                  bottom: 0,
                  padding: '3px 7px',
                  background: isParent ? 'rgba(245, 245, 245, 0.92)' : isChild ? 'rgba(250, 199, 117, 0.92)' : 'rgba(0,0,0,0.55)',
                  color: isParent ? '#444' : isChild ? '#633806' : '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  borderTopRightRadius: 6,
                  borderTop: isParent ? '1px solid rgba(0, 0, 0, 0.08)' : 'none',
                  borderRight: isParent ? '1px solid rgba(0, 0, 0, 0.08)' : 'none',
                  fontFamily: 'Nunito, sans-serif',
                  pointerEvents: 'none',
                }
                return (
                  <button
                    key={(photo.storagePath || photo.url) + String(idx)}
                    type="button"
                    id={isFirstOfDate && photo.dateKey ? `date-${photo.dateKey}` : undefined}
                    onClick={() => openLightbox(photo)}
                    style={{
                      position: 'relative',
                      aspectRatio: '1 / 1',
                      padding: 0,
                      border: 'none',
                      background: '#F5F0FF',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      display: 'block',
                    }}
                    aria-label={lang === 'en' ? 'Enlarge photo' : lang === 'es' ? 'Ampliar foto' : '写真を拡大'}
                  >
                    <img
                      src={photo.url}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <div style={overlayStyle}>
                      {formatTinyDate(photo.dateKey)} {roleEmoji}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
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
            aria-label={lang === 'en' ? 'Close' : lang === 'es' ? 'Cerrar' : '閉じる'}
          >
            ×
          </button>

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '8px 14px', borderRadius: 8, lineHeight: 1, zIndex: 1, display: 'flex', alignItems: 'center', gap: 6 }}
            aria-label={lang === 'en' ? 'Download' : lang === 'es' ? 'Descargar' : 'ダウンロード'}
          >
            <span style={{ fontSize: 18 }}>⬇</span>
            {downloading ? '...' : (lang === 'en' ? 'Save' : lang === 'es' ? 'Guardar' : '保存')}
          </button>

          {/* iOS hint */}
          {iosHint && (
            <div onClick={(e) => e.stopPropagation()} style={{
              position: 'absolute', top: 56, left: 16, right: 16,
              background: 'rgba(0,0,0,0.85)', color: '#fff', fontSize: 13,
              padding: '12px 16px', borderRadius: 10, textAlign: 'center', zIndex: 2,
            }}>
              {lang === 'en' ? 'Long press the photo to save it' : lang === 'es' ? 'Mantén presionada la foto para guardarla' : '写真を長押しして保存してください'}
            </div>
          )}

          {lightboxIndex > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prevPhoto() }}
              style={{ position: 'absolute', left: 8, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, lineHeight: 1 }}
              aria-label={lang === 'en' ? 'Previous' : lang === 'es' ? 'Anterior' : '前へ'}
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
              aria-label={lang === 'en' ? 'Next' : lang === 'es' ? 'Siguiente' : '次へ'}
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

      {/* Bottom nav */}
      <nav className="bottom-nav">
        <button type="button" onClick={() => { if (!slug) { console.error('slug required'); return } navigate(`/pair/${slug}`) }}><span style={{ fontSize: 20 }}>🏠</span><span>{lang === 'en' ? 'Home' : lang === 'es' ? 'Inicio' : 'ホーム'}</span></button>
        <button type="button" className="active"><span style={{ fontSize: 20 }}>🖼</span><span>{lang === 'en' ? 'Album' : lang === 'es' ? 'Álbum' : 'アルバム'}</span></button>
        <button type="button" onClick={handleShare}><span style={{ fontSize: 20 }}>👋</span><span>{lang === 'en' ? 'Invite' : lang === 'es' ? 'Invitar' : '招待'}</span></button>
      </nav>

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 14, padding: '8px 20px', borderRadius: 20, zIndex: 20000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{toastMsg}</div>
      )}

      <InviteModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        inviteUrl={inviteUrl}
        inviteText={inviteText}
        lang={lang}
      />
    </div>
  )
}
