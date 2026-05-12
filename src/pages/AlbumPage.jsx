import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useLocation, useOutletContext } from 'react-router-dom'
import { fetchAlbum } from '../lib/journal'
import VoiceLibrary from '../components/VoiceLibrary'
import AlbumCalendar from '../components/AlbumCalendar'
import { getUserRole, clearUserRole } from '../lib/pairDaily'
import { buildInviteUrl, copyInviteLink } from '../lib/invite'
import RoleBadge from '../components/RoleBadge'

const DEMO_ALBUM_PHOTO_SETS = [
  ['/demo-photos/kidstravelpakutasoIMG_3146_TP_V4.webp','/demo-photos/kidstravelpakutasoIMG_3155_TP_V.webp','/demo-photos/Gemini_Generated_Image_4fx62a4fx62a4fx6.png'],
  ['/demo-photos/nekocyanPAKE5233-481_TP_V.webp','/demo-photos/Gemini_Generated_Image_dm6kcmdm6kcmdm6k.png'],
  ['/demo-photos/08redsugar720_TP_V.webp','/demo-photos/susipakuKYPKPAR52703_TP_V.webp','/demo-photos/CCIMG_8140_TP_V4.webp'],
  ['/demo-photos/TKLA__7DA5611_TP_V.jpg','/demo-photos/Family fun in winter wonderland.png','/demo-photos/pakutaso_go33036_TP_V.jpg'],
]

const DEMO_VOICE_META = [
  { parent: { dur: '0:42', seen: false }, child: { dur: '1:05', seen: false } },
  { parent: { dur: '1:12', seen: true }, child: { dur: '0:58', seen: true } },
  { parent: { dur: '0:33', seen: true }, child: null },
  { parent: null, child: { dur: '0:27', seen: true } },
  { parent: { dur: '0:45', seen: true }, child: { dur: '1:10', seen: true } },
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
  const voiceAudioRef = useRef(null)
  // pairId は /pair/:slug/album ルート下の outletContext から取得（公理1: URL = Source of Truth）
  const rawPairId = outletContext?.pairId ?? null
  const isDemo = rawPairId === 'PAIR-DEMOTEST'
  const pairId = (!rawPairId || BLOCKED_PAIR_IDS.includes(rawPairId) || isDemo) ? null : rawPairId

  const demoAlbumDays = useMemo(() => {
    const today = new Date()
    return DEMO_ALBUM_PHOTO_SETS.map((photos, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return {
        date: `${y}-${m}-${day}`,
        label: `${d.getMonth() + 1}月${d.getDate()}日`,
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
    const today = new Date()
    return DEMO_VOICE_META.map((meta, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const monthDay = `${d.getMonth() + 1}月${d.getDate()}日`
      return {
        dateKey: `${y}-${m}-${day}`,
        label: i === 0 ? `今日 · ${monthDay}` : monthDay,
        parent: meta.parent,
        child: meta.child,
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

  const handleShare = async () => {
    if (!slug) {
      setToastMsg(lang === 'en' ? 'Cannot share: invalid pair URL' : lang === 'es' ? 'Cannot share: invalid pair URL' : '共有できません。有効なペアURLからアクセスしてください')
      setTimeout(() => setToastMsg(null), 2500)
      return
    }
    const url = buildInviteUrl(slug)
    const result = await copyInviteLink(url)
    setToastMsg(result.success
      ? (lang === 'en' ? 'Link copied' : lang === 'es' ? 'Link copied' : 'リンクをコピーしました')
      : (lang === 'en' ? 'Failed to copy' : lang === 'es' ? 'Failed to copy' : 'コピーに失敗しました'))
    setTimeout(() => setToastMsg(null), 2500)
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
      lang === 'en' ? 'en-US' : lang === 'es' ? 'en-US' : 'ja-JP',
      { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }
    )
  }

  const formatDateShort = (dateKey) => {
    if (!dateKey) return ''
    const [, m, d] = dateKey.split('-').map(Number)
    return lang === 'en' ? `${new Date(2000, m - 1).toLocaleString('en', { month: 'short' })} ${d}` : lang === 'es' ? `${new Date(2000, m - 1).toLocaleString('en', { month: 'short' })} ${d}` : `${m}月${d}日`
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
          {lang === 'en' ? 'Pair ID required to view album.' : lang === 'es' ? 'Pair ID required to view album.' : 'アルバムを表示するにはペアIDが必要です。'}
        </p>
        <button type="button" onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')} style={{ marginTop: 16, padding: '10px 24px', fontSize: 14, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg, #FF80C0, #A060FF)', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
          {lang === 'en' ? '← Back' : lang === 'es' ? '← Back' : '← 戻る'}
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
          style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: '0 4px', color: '#7050C0', lineHeight: 1 }}
          aria-label={lang === 'en' ? 'Back' : lang === 'es' ? 'Back' : '戻る'}
        >
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#333', flex: 1 }}>
          {lang === 'en' ? 'Album' : lang === 'es' ? 'Album' : 'アルバム'}
        </h1>
        {/* 段階10-b-fix: tap で role clear → /pair/:slug に戻り RootRoute が RoleSelectPage を表示 */}
        <RoleBadge
          role={getUserRole()}
          lang={lang}
          onClick={slug ? () => { clearUserRole('switch-button', pairId); navigate(`/pair/${slug}`, { replace: true }) } : undefined}
        />
      </header>

      {/* Pill Tabs */}
      {(pairId || isDemo) && (
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', background: '#FFF8FF', position: 'sticky', top: 49, zIndex: 99 }}>
          <button type="button" onClick={() => setActiveTab('photo')} style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700, color: activeTab === 'photo' ? '#fff' : '#999', background: activeTab === 'photo' ? 'linear-gradient(90deg, #FF80C0, #A060FF)' : 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 20, cursor: 'pointer', transition: 'all 0.2s ease' }}>
            📷 {lang === 'en' ? 'Photos' : lang === 'es' ? 'Photos' : '写真'}
          </button>
          <button type="button" onClick={() => setActiveTab('voice')} style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700, color: activeTab === 'voice' ? '#fff' : '#999', background: activeTab === 'voice' ? 'linear-gradient(90deg, #FF80C0, #A060FF)' : 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 20, cursor: 'pointer', transition: 'all 0.2s ease' }}>
            🎙 {lang === 'en' ? 'Voice' : lang === 'es' ? 'Voice' : '声'}
          </button>
          <button type="button" onClick={() => setActiveTab('calendar')} style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700, color: activeTab === 'calendar' ? '#fff' : '#999', background: activeTab === 'calendar' ? 'linear-gradient(90deg, #FF80C0, #A060FF)' : 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 20, cursor: 'pointer', transition: 'all 0.2s ease' }}>
            📅 {lang === 'en' ? 'Calendar' : lang === 'es' ? 'Calendar' : 'カレンダー'}
          </button>
        </div>
      )}

      <main style={{ padding: '16px', maxWidth: 480, margin: '0 auto' }}>

      {/* Calendar tab */}
      {activeTab === 'calendar' && (pairId || isDemo) && (
        <AlbumCalendar
          pairId={isDemo ? 'PAIR-DEMOTEST' : pairId}
          lang={lang}
          onDateClick={(dateKey) => { setInternalScrollDate(dateKey); setActiveTab('photo') }}
          {...(isDemo ? { photoCountMap: demoPhotoCountMap, voiceCountMap: demoVoiceCountMap, photoUrlMap: demoPhotoUrlMap } : {})}
        />
      )}

      {/* Voice tab */}
      {pairId && !isDemo && activeTab === 'voice' && (
        <VoiceLibrary lang={lang} pairId={pairId} role={getUserRole()} />
      )}
      {isDemo && activeTab === 'voice' && (
        <section style={{ width: '100%' }}>
          <style>{`@keyframes vwave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }`}</style>
          <p style={{ textAlign: 'center', color: '#999', fontSize: 12, margin: '8px 0 16px', fontStyle: 'italic' }}>
            {lang === 'en' ? 'Sample — your voice history will appear here' : lang === 'es' ? 'Sample — your voice history will appear here' : 'サンプル — 声の履歴がここに表示されます'}
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
                {renderBtn('parent', day.parent, '👴', lang === 'en' ? 'Parent' : lang === 'es' ? 'Parent' : '親')}
                {renderBtn('child', day.child, '🧑', lang === 'en' ? 'Child' : lang === 'es' ? 'Child' : '子')}
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
              {lang === 'en' ? '📷 Photos' : lang === 'es' ? '📷 Photos' : '📷 写真'}
            </p>
            <p style={{ fontSize: 13, color: '#8070A0', textAlign: 'center', margin: 0 }}>
              {lang === 'en' ? 'Loading...' : lang === 'es' ? 'Loading...' : '読み込み中…'}
            </p>
          </section>
        )}
        {error && (
          <section style={{ width: '100%', background: '#F8F6FF', borderRadius: 18, padding: 14, overflow: 'hidden' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {lang === 'en' ? '📷 Photos' : lang === 'es' ? '📷 Photos' : '📷 写真'}
            </p>
            <p style={{ fontSize: 13, color: '#E04040', textAlign: 'center', margin: 0 }}>{error}</p>
          </section>
        )}
        {!loading && !error && flatPhotos.length === 0 && !isDemo && (
          <section style={{ width: '100%', background: '#F8F6FF', borderRadius: 18, padding: 14, overflow: 'hidden' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {lang === 'en' ? '📷 Photos' : lang === 'es' ? '📷 Photos' : '📷 写真'}
            </p>
            <p style={{ fontSize: 13, color: '#8070A0', textAlign: 'center', margin: 0 }}>
              {lang === 'en' ? 'No photos yet.' : lang === 'es' ? 'No photos yet.' : 'まだ写真がありません'}
            </p>
          </section>
        )}
        {!loading && !error && flatPhotos.length > 0 && (
          <>
            {isDemo && (
              <p style={{ textAlign: 'center', color: '#999', fontSize: 12, margin: '16px 0 12px', fontStyle: 'italic' }}>
                {lang === 'en' ? 'Sample photos — your photos will appear here' : lang === 'es' ? 'Sample photos — your photos will appear here' : 'サンプル写真 — あなたの写真がここに表示されます'}
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
                    aria-label={lang === 'en' ? 'Enlarge photo' : lang === 'es' ? 'Enlarge photo' : '写真を拡大'}
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
            aria-label={lang === 'en' ? 'Close' : lang === 'es' ? 'Close' : '閉じる'}
          >
            ×
          </button>

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '8px 14px', borderRadius: 8, lineHeight: 1, zIndex: 1, display: 'flex', alignItems: 'center', gap: 6 }}
            aria-label={lang === 'en' ? 'Download' : lang === 'es' ? 'Download' : 'ダウンロード'}
          >
            <span style={{ fontSize: 18 }}>⬇</span>
            {downloading ? '...' : (lang === 'en' ? 'Save' : lang === 'es' ? 'Save' : '保存')}
          </button>

          {/* iOS hint */}
          {iosHint && (
            <div onClick={(e) => e.stopPropagation()} style={{
              position: 'absolute', top: 56, left: 16, right: 16,
              background: 'rgba(0,0,0,0.85)', color: '#fff', fontSize: 13,
              padding: '12px 16px', borderRadius: 10, textAlign: 'center', zIndex: 2,
            }}>
              {lang === 'en' ? 'Long press the photo to save it' : lang === 'es' ? 'Long press the photo to save it' : '写真を長押しして保存してください'}
            </div>
          )}

          {lightboxIndex > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prevPhoto() }}
              style={{ position: 'absolute', left: 8, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, lineHeight: 1 }}
              aria-label={lang === 'en' ? 'Previous' : lang === 'es' ? 'Previous' : '前へ'}
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
              aria-label={lang === 'en' ? 'Next' : lang === 'es' ? 'Next' : '次へ'}
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
        <button type="button" onClick={() => { if (!slug) { console.error('slug required'); return } navigate(`/pair/${slug}`) }}><span style={{ fontSize: 20 }}>🏠</span><span>{lang === 'en' ? 'Home' : lang === 'es' ? 'Home' : 'ホーム'}</span></button>
        <button type="button" className="active"><span style={{ fontSize: 20 }}>🖼</span><span>{lang === 'en' ? 'Album' : lang === 'es' ? 'Album' : 'アルバム'}</span></button>
        <button type="button" onClick={handleShare}><span style={{ fontSize: 20 }}>👋</span><span>{lang === 'en' ? 'Invite' : lang === 'es' ? 'Invite' : '招待'}</span></button>
      </nav>

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 14, padding: '8px 20px', borderRadius: 20, zIndex: 20000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{toastMsg}</div>
      )}
    </div>
  )
}
