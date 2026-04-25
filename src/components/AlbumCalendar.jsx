import { useState, useEffect, useMemo } from 'react'
import { fetchAlbum } from '../lib/journal'
import { fetchVoiceMonth, getDateKeyNY } from '../lib/pairDaily'

/**
 * AlbumCalendar — 月次カレンダーで写真・音声の有無を俯瞰。
 * Philosophy #2: pairId は props のみから受け取り、localStorage は読み書きしない。
 */
export default function AlbumCalendar({ pairId, lang = 'ja', onDateClick, photoCountMap, voiceCountMap }) {
  const today = getDateKeyNY()
  const todayMonth = today.slice(0, 7)
  const [currentMonth, setCurrentMonth] = useState(todayMonth)
  const [fetchedPhotoCount, setFetchedPhotoCount] = useState({})
  const [fetchedVoiceCount, setFetchedVoiceCount] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const skipFetch = photoCountMap !== undefined && voiceCountMap !== undefined

  useEffect(() => {
    if (skipFetch) { setLoading(false); return }
    if (!pairId) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchAlbum(pairId, currentMonth).catch((e) => { throw e }),
      fetchVoiceMonth(pairId, currentMonth).catch((e) => { throw e }),
    ]).then(([albumRes, voiceRes]) => {
      if (cancelled) return
      const pc = {}
      for (const day of albumRes.days || []) {
        const photos = day.photos || []
        if (photos.length > 0) pc[day.dateKey] = photos.length
      }
      const vc = {}
      for (const day of voiceRes.days || []) {
        const count = (day.hasParent ? 1 : 0) + (day.hasChild ? 1 : 0)
        if (count > 0) vc[day.date] = count
      }
      setFetchedPhotoCount(pc)
      setFetchedVoiceCount(vc)
      setLoading(false)
    }).catch((e) => {
      if (cancelled) return
      setError(e?.message || String(e))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [pairId, currentMonth, skipFetch])

  const photoCounts = photoCountMap ?? fetchedPhotoCount
  const voiceCounts = voiceCountMap ?? fetchedVoiceCount

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
            const photoCount = photoCounts[dateKey] || 0
            const voiceCount = voiceCounts[dateKey] || 0
            const hasContent = photoCount > 0 || voiceCount > 0
            const isToday = dateKey === today
            const borderColor = isToday ? '#FF80C0' : 'transparent'
            const borderWidth = isToday ? 2 : 0
            const opacity = inMonth ? 1 : 0.28
            const clickable = inMonth && hasContent

            const badgeFontSize = (photoCount > 0 && voiceCount > 0) ? 16 : 18
            return (
              <button
                key={dateKey}
                type="button"
                onClick={clickable ? () => onDateClick?.(dateKey) : undefined}
                disabled={!clickable}
                style={{
                  aspectRatio: '1',
                  padding: 4,
                  border: `${borderWidth}px solid ${borderColor}`,
                  borderRadius: 8,
                  background: hasContent ? '#F0E8FF' : '#FAFAFA',
                  cursor: clickable ? 'pointer' : 'default',
                  opacity,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  boxSizing: 'border-box',
                }}
              >
                {/* Day number */}
                <span style={{
                  alignSelf: 'flex-start',
                  fontSize: 11,
                  fontWeight: 400,
                  color: hasContent ? '#444' : inMonth ? '#888' : '#BBB',
                  lineHeight: 1,
                }}>{day}</span>
                {/* 段階12: 件数バッジ大型化、cell 中央配置 */}
                {hasContent && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, flexWrap: 'wrap' }}>
                    {photoCount > 0 && (
                      <span style={{ fontSize: badgeFontSize, fontWeight: 500, color: '#B04080', fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>📷{photoCount}</span>
                    )}
                    {voiceCount > 0 && (
                      <span style={{ fontSize: badgeFontSize, fontWeight: 500, color: '#2A8050', fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>🎙{voiceCount}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
