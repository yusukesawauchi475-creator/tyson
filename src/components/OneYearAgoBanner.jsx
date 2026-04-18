import { useState, useEffect, useRef } from 'react'
import { getIdTokenForApi } from '../lib/firebase'

/**
 * Past voice banner.
 * Searches for audio at 7/14/30/90/365 days ago (±1 day each).
 * Hidden if app used less than 7 days.
 */

const CHECKPOINTS = [
  { days: 7, ja: '先週のあなたの声', en: 'Your voice from last week' },
  { days: 14, ja: '2週間前のあなたの声', en: 'Your voice from 2 weeks ago' },
  { days: 30, ja: '1ヶ月前のあなたの声', en: 'Your voice from 1 month ago' },
  { days: 90, ja: '3ヶ月前のあなたの声', en: 'Your voice from 3 months ago' },
  { days: 365, ja: '1年前のあなたの声', en: 'Your voice from 1 year ago' },
]

function datesToCheck(daysAgo) {
  const dates = []
  const base = new Date(Date.now() - daysAgo * 86400000)
  for (const offset of [0, -1, 1]) {
    const d = new Date(base.getTime() + offset * 86400000)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${dd}`)
  }
  return [...new Set(dates)]
}

export default function OneYearAgoBanner({ lang = 'ja' }) {
  const [result, setResult] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    ;(async () => {
      try {
        const idToken = await getIdTokenForApi()
        if (!idToken) return
        const pairId = null

        // First check if 7 days of data exists (app usage check)
        const sevenDaysAgo = datesToCheck(7)
        let hasMinHistory = false
        for (const dateKey of sevenDaysAgo) {
          for (const role of ['parent', 'child']) {
            try {
              const res = await fetch(
                `/api/pair-media?pairId=${encodeURIComponent(pairId)}&dateKey=${encodeURIComponent(dateKey)}&listenRole=${encodeURIComponent(role)}&mode=signed&v=${Date.now()}`,
                { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
              )
              if (res.ok) {
                const d = await res.json().catch(() => ({}))
                if (d?.url) { hasMinHistory = true; break }
              }
            } catch {}
          }
          if (hasMinHistory) break
        }
        if (!hasMinHistory) return // Less than 7 days of usage

        // Search checkpoints in order
        for (const checkpoint of CHECKPOINTS) {
          const dates = datesToCheck(checkpoint.days)
          for (const dateKey of dates) {
            for (const role of ['parent', 'child']) {
              try {
                const res = await fetch(
                  `/api/pair-media?pairId=${encodeURIComponent(pairId)}&dateKey=${encodeURIComponent(dateKey)}&listenRole=${encodeURIComponent(role)}&mode=signed&v=${Date.now()}`,
                  { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
                )
                if (res.ok) {
                  const d = await res.json().catch(() => ({}))
                  if (d?.url) {
                    setResult({ url: d.url, dateKey, checkpoint })
                    return
                  }
                }
              } catch {}
            }
          }
        }
      } catch {}
    })()
  }, [])

  if (!result) return null

  const isEn = lang === 'en'
  const label = isEn ? result.checkpoint.en : result.checkpoint.ja

  const handlePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (isPlaying) { el.pause(); setIsPlaying(false) }
    else { el.src = result.url; el.play().then(() => setIsPlaying(true)).catch(() => {}) }
  }

  return (
    <div className="card" style={{ padding: '12px 16px', background: 'linear-gradient(135deg, #fef3e2 0%, #fff 100%)', borderColor: '#e8d4a8' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
            📅 {label}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 8 }}>
            {result.dateKey.slice(5)}
          </span>
        </div>
        <button
          type="button"
          onClick={handlePlay}
          style={{
            padding: '6px 16px', fontSize: 13, fontWeight: 600, color: '#fff',
            background: isPlaying ? 'var(--color-danger)' : 'var(--color-primary)',
            border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          }}
        >
          {isPlaying ? (isEn ? 'Stop' : '停止') : (isEn ? 'Play' : '再生')}
        </button>
      </div>
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} style={{ display: 'none' }} />
    </div>
  )
}
