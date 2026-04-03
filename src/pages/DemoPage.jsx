import { useState, useRef, useEffect, useCallback } from 'react'
import { fetchAudioForPlayback, getListenRoleMeta, markSeen, getDateKey, getStreak } from '../lib/pairDaily'
import { fetchTodayJournalMeta, fetchJournalViewUrl } from '../lib/journal'
import { t } from '../lib/i18n'
import WeeklySummary from '../components/WeeklySummary'
import OneYearAgoBanner from '../components/OneYearAgoBanner'
import VoiceLibrary from '../components/VoiceLibrary'

const DEMO_PAIR_ID = 'PAIR-FSEAN5'

export default function DemoPage({ lang = 'ja' }) {
  const [streakCount, setStreakCount] = useState(null)
  const [daysSinceStart, setDaysSinceStart] = useState(null)
  const [hasParentAudio, setHasParentAudio] = useState(null)
  const [isParentUnseen, setIsParentUnseen] = useState(false)
  const [parentAudioUrl, setParentAudioUrl] = useState(null)
  const [isLoadingParent, setIsLoadingParent] = useState(false)
  const [isPlayingParent, setIsPlayingParent] = useState(false)
  const [showReloadButton, setShowReloadButton] = useState(false)
  const [photos, setPhotos] = useState([])
  const [myJournalUrl, setMyJournalUrl] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [dateKey] = useState(getDateKey())
  const [errorLine, setErrorLine] = useState(null)
  const parentAudioRef = useRef(null)

  const LISTEN_ROLE_CHILD = 'child'

  useEffect(() => {
    getListenRoleMeta(LISTEN_ROLE_CHILD, DEMO_PAIR_ID)
      .then(({ hasAudio, isUnseen }) => { setHasParentAudio(hasAudio); setIsParentUnseen(!!isUnseen) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    getStreak(DEMO_PAIR_ID).then(({ count, firstDateKey }) => {
      setStreakCount(count)
      if (firstDateKey) {
        const first = new Date(firstDateKey + 'T00:00:00')
        const days = Math.floor((new Date() - first) / 86400000) + 1
        setDaysSinceStart(days)
      }
    })
  }, [])

  useEffect(() => {
    fetchTodayJournalMeta(DEMO_PAIR_ID)
      .then(({ photos: p }) => setPhotos(Array.isArray(p) ? p : []))
      .catch(() => {})
  }, [])

  const fetchMyJournal = useCallback(async () => {
    try {
      const url = await fetchJournalViewUrl(DEMO_PAIR_ID, 'parent')
      setMyJournalUrl(url)
    } catch (_) {}
  }, [])
  useEffect(() => { fetchMyJournal() }, [fetchMyJournal])

  useEffect(() => {
    const timer = setTimeout(() => setShowReloadButton(true), 10000)
    return () => clearTimeout(timer)
  }, [])

  const handleStopParent = () => {
    const el = parentAudioRef.current
    if (el) { el.pause(); el.currentTime = 0 }
    setIsPlayingParent(false)
  }

  const handlePlayParent = async () => {
    if (isPlayingParent) { handleStopParent(); return }
    if (hasParentAudio === false) return
    setIsLoadingParent(true)
    setErrorLine(null)
    const el = parentAudioRef.current
    if (el) { el.pause(); el.src = ''; el.load() }
    setParentAudioUrl(null)
    const result = await fetchAudioForPlayback(LISTEN_ROLE_CHILD, DEMO_PAIR_ID)
    if (result.error) {
      setErrorLine(`再生エラー: ${result.errorCode} - ${result.error}`)
      setIsLoadingParent(false)
      if (result.hasAudio === false) { setHasParentAudio(false); setIsParentUnseen(false) }
      return
    }
    setParentAudioUrl(result.url)
    setIsLoadingParent(false)
    if (result.hasAudio !== undefined) setHasParentAudio(result.hasAudio)
    try {
      const el = parentAudioRef.current
      if (el) {
        el.src = result.url
        el.currentTime = 0
        await el.play()
        setIsPlayingParent(true)
        markSeen(LISTEN_ROLE_CHILD, DEMO_PAIR_ID).then(() => setIsParentUnseen(false))
      }
    } catch (playErr) {
      setErrorLine(`再生に失敗しました (${playErr?.name}: ${playErr?.message})`)
    }
  }

  const refreshParentStatus = () => {
    setHasParentAudio(null)
    setIsParentUnseen(false)
    getListenRoleMeta(LISTEN_ROLE_CHILD, DEMO_PAIR_ID).then(({ hasAudio, isUnseen }) => {
      setHasParentAudio(hasAudio)
      setIsParentUnseen(!!isUnseen)
    })
  }

  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  })

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
          {daysSinceStart > 0 && (
            <span style={{ padding: '4px 12px', fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', borderRadius: 20 }}>
              {daysSinceStart}{lang === 'en' ? 'd' : '日目'}
            </span>
          )}
          {streakCount > 0 && (
            <span style={{ padding: '4px 12px', fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', borderRadius: 20 }}>
              🔥{streakCount}{lang === 'en' ? 'd' : '日連続'}
            </span>
          )}
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
        <WeeklySummary lang={lang} pairId={DEMO_PAIR_ID} />

        {/* (1) Receive card */}
        <section style={{ width: '100%', background: '#E8FFF4', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(48,168,112,0.06)', overflow: 'hidden' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#30A870', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(lang, 'partnerRecordingListen')}</p>
          {hasParentAudio === true ? (
            <>
              <p style={{ fontSize: 14, color: '#1A6040', fontWeight: 700, margin: '0 0 10px' }}>
                {t(lang, 'received')}
                {isParentUnseen && <span style={{ marginLeft: 6, color: '#E04040' }}>●</span>}
              </p>
              <button type="button" onClick={handlePlayParent} disabled={isLoadingParent} style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, color: '#fff', background: isLoadingParent ? '#B0A0C8' : isPlayingParent ? 'linear-gradient(160deg,#E04040,#C02020)' : 'linear-gradient(160deg,#40D890,#18B868)', border: 'none', borderRadius: 14, cursor: isLoadingParent ? 'wait' : 'pointer', boxShadow: isLoadingParent ? 'none' : isPlayingParent ? '0 5px 0 #901010' : '0 5px 0 #109848', marginBottom: 10 }}>
                {isLoadingParent ? t(lang, 'loading') : isPlayingParent ? (lang === 'en' ? '⏹ Stop' : '⏹ 停止') : (lang === 'en' ? '▶ Play' : '▶ 再生')}
              </button>
            </>
          ) : hasParentAudio === false ? (
            <p style={{ fontSize: 14, color: '#1A6040', margin: '0 0 10px', opacity: 0.6 }}>{t(lang, 'notReceivedYet')}</p>
          ) : (
            <>
              <p style={{ fontSize: 14, color: '#1A6040', margin: '0 0 10px', opacity: 0.6 }}>{t(lang, 'checking')}</p>
              {showReloadButton && (
                <button type="button" onClick={() => window.location.reload()} style={{ padding: '6px 14px', fontSize: 12, color: '#30A870', border: '1.5px solid #30A870', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>{t(lang, 'reload')}</button>
              )}
            </>
          )}
          {hasParentAudio !== null && (
            <button type="button" onClick={refreshParentStatus} style={{ padding: '5px 14px', fontSize: 12, color: '#30A870', background: 'transparent', border: '1.5px solid #30A870', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>{t(lang, 'refresh')}</button>
          )}
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

        {/* (3) Photos card - read only */}
        {photos.length > 0 && (
          <section style={{ width: '100%', background: '#F0EEFF', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(112,80,192,0.06)', overflow: 'hidden' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#7050C0', margin: '0 0 10px' }}>
              📷 {lang === 'en' ? "Today's Photos" : '今日の写真'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {photos.slice(0, 6).map((ph, i) => (
                <button key={ph.storagePath + String(i)} type="button" onClick={() => { /* read-only */ }} style={{ padding: 0, border: 'none', background: 'none', cursor: 'default', borderRadius: 11, overflow: 'hidden', flexShrink: 0 }}>
                  <img src={ph.url || ''} alt="" width={52} height={52} style={{ width: 52, height: 52, objectFit: 'cover', display: 'block', borderRadius: 11 }} />
                </button>
              ))}
            </div>
          </section>
        )}

        <OneYearAgoBanner lang={lang} pairId={DEMO_PAIR_ID} />

        <VoiceLibrary lang={lang} role="parent" pairId={DEMO_PAIR_ID} />

        {/* Journal - read only */}
        {myJournalUrl && (
          <section style={{ width: '100%', background: '#FFF4F8', borderRadius: 18, padding: 14, overflow: 'hidden' }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: '#C04080', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
              {lang === 'en' ? '📔 TODAY\'S NOTE' : '📔 今日の記録'}
            </p>
            <button type="button" onClick={() => setPreviewOpen(true)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 10, overflow: 'hidden' }}>
              <img src={myJournalUrl} alt="" width={52} height={52} style={{ width: 52, height: 52, objectFit: 'cover', display: 'block', borderRadius: 10 }} />
            </button>
          </section>
        )}

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

      {previewOpen && myJournalUrl && (
        <div role="button" tabIndex={0} onClick={() => setPreviewOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setPreviewOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box', cursor: 'pointer' }}>
          <img src={myJournalUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, pointerEvents: 'none' }} />
        </div>
      )}
    </div>
  )
}
