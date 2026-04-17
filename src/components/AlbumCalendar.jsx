import { useState, useEffect, useMemo } from 'react'
import { fetchAlbum } from '../lib/journal'
import { fetchVoiceMonth, getDateKeyNY } from '../lib/pairDaily'

/**
 * AlbumCalendar — 月次カレンダーで写真・音声の有無を俯瞰。
 * Philosophy #2: pairId は props のみから受け取り、localStorage は読み書きしない。
 */
export default function AlbumCalendar({ pairId, lang = 'ja', onDateClick }) {
  const today = getDateKeyNY()
  const todayMonth = today.slice(0, 7)
  const [currentMonth, setCurrentMonth] = useState(todayMonth)
  const [photoMap, setPhotoMap] = useState({})
  const [voiceMap, setVoiceMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!pairId) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchAlbum(pairId, currentMonth).catch((e) => { throw e }),
      fetchVoiceMonth(pairId, currentMonth).catch((e) => { throw e }),
    ]).then(([albumRes, voiceRes]) => {
      if (cancelled) return
      const pm = {}
      for (const day of albumRes.days || []) {
        const photos = day.photos || []
        if (photos.length > 0) {
          const sorted = [...photos].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
          pm[day.dateKey] = sorted[0].url
        }
      }
      const vm = {}
      for (const day of voiceRes.days || []) {
        vm[day.date] = { hasParent: !!day.hasParent, hasChild: !!day.hasChild }
      }
      setPhotoMap(pm)
      setVoiceMap(vm)
      setLoading(false)
    }).catch((e) => {
      if (cancelled) return
      setError(e?.message || String(e))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [pairId, currentMonth])

  const cells = useMemo(() => {
    const [y, m] = currentMonth.split('-').map(Number)
    const firstOfMonth = new Date(y, m - 1, 1)
    const firstSunday = new Date(firstOfMonth)
    firstSunday.setDate(firstOfMonth.getDate() - firstOfMonth.getDay())
    const out = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(firstSunday)
      d.setDate(firstSunday.getDate() + i)
      const yr = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, '0')
      const dy = String(d.getDate()).padStart(2, '0')
      const dateKey = `${yr}-${mo}-${dy}`
      const inMonth = d.getMonth() === m - 1 && d.getFullYear() === y
      out.push({ dateKey, day: d.getDate(), inMonth })
    }
    return out
  }, [currentMonth])

  const canGoNext = currentMonth < todayMonth
  const goPrev = () => {
    const [y, m] = currentMonth.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const goNext = () => {
    if (!canGoNext) return
    const [y, m] = currentMonth.split('-').map(Number)
    const d = new Date(y, m, 1)
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthLabel = (() => {
    const [y, m] = currentMonth.split('-').map(Number)
    return new Date(y, m - 1).toLocaleDateString(
      lang === 'en' ? 'en-US' : 'ja-JP',
      { year: 'numeric', month: 'long' }
    )
  })()

  const weekdayLabels = lang === 'en'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['日', '月', '火', '水', '木', '金', '土']

  return (
    <section style={{ width: '100%' }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 12px' }}>
        <button
          type="button"
          onClick={goPrev}
          style={{ background: 'none', border: 'none', fontSize: 20, color: '#7050C0', cursor: 'pointer', padding: '4px 12px', lineHeight: 1 }}
          aria-label={lang === 'en' ? 'Previous month' : '前月'}
        >‹</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#333' }}>{monthLabel}</span>
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          style={{ background: 'none', border: 'none', fontSize: 20, color: canGoNext ? '#7050C0' : '#DDD', cursor: canGoNext ? 'pointer' : 'default', padding: '4px 12px', lineHeight: 1 }}
          aria-label={lang === 'en' ? 'Next month' : '翌月'}
        >›</button>
      </div>

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {weekdayLabels.map((w, i) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: i === 0 ? '#E04070' : i === 6 ? '#4070E0' : '#999', padding: '2px 0' }}>{w}</div>
        ))}
      </div>

      {loading && (
        <p style={{ textAlign: 'center', fontSize: 13, color: '#8070A0', padding: '32px 0' }}>
          {lang === 'en' ? 'Loading...' : '読み込み中...'}
        </p>
      )}
      {error && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <p style={{ fontSize: 13, color: '#E04040', margin: '0 0 12px' }}>{error}</p>
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => m)}
            style={{ padding: '8px 20px', fontSize: 12, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg,#FF80C0,#A060FF)', border: 'none', borderRadius: 10, cursor: 'pointer' }}
          >
            {lang === 'en' ? 'Retry' : '再試行'}
          </button>
        </div>
      )}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map(({ dateKey, day, inMonth }) => {
            const photoUrl = photoMap[dateKey]
            const voice = voiceMap[dateKey]
            const hasContent = !!photoUrl || !!voice
            const isToday = dateKey === today
            const borderColor = isToday ? '#FF80C0' : 'transparent'
            const borderWidth = isToday ? 2 : 0
            const opacity = inMonth ? 1 : 0.28
            const clickable = inMonth && hasContent

            return (
              <button
                key={dateKey}
                type="button"
                onClick={clickable ? () => onDateClick?.(dateKey) : undefined}
                disabled={!clickable}
                style={{
                  position: 'relative',
                  aspectRatio: '1',
                  padding: 0,
                  border: `${borderWidth}px solid ${borderColor}`,
                  borderRadius: 8,
                  background: photoUrl
                    ? `url(${photoUrl}) center/cover`
                    : voice ? '#F0E8FF' : '#FAFAFA',
                  cursor: clickable ? 'pointer' : 'default',
                  opacity,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                }}
              >
                {/* Day number */}
                <span style={{
                  position: 'absolute',
                  top: 2,
                  left: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  color: photoUrl ? '#fff' : inMonth ? '#555' : '#999',
                  textShadow: photoUrl ? '0 1px 2px rgba(0,0,0,0.6)' : 'none',
                  lineHeight: 1,
                }}>{day}</span>
                {/* Voice-only center icon */}
                {!photoUrl && voice && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🎙</span>
                )}
                {/* Photo + voice badge */}
                {photoUrl && voice && (
                  <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: 10, background: 'rgba(255,255,255,0.85)', borderRadius: 6, padding: '0 3px', lineHeight: 1.2 }}>🎙</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
