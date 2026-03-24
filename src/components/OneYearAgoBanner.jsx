import { useState, useEffect, useRef } from 'react'
import { getIdTokenForApi } from '../lib/firebase'
import { getPairId, getDateKeyNY } from '../lib/pairDaily'

/**
 * "1 year ago today" banner.
 * Checks ±3 days around 1 year ago for audio. If found, shows play button.
 */
export default function OneYearAgoBanner({ lang = 'ja' }) {
  const [audioData, setAudioData] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    ;(async () => {
      try {
        const idToken = await getIdTokenForApi()
        if (!idToken) return
        const pairId = getPairId()

        // Generate dates: 1 year ago ± 3 days
        const now = new Date()
        const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
        const dates = []
        for (let offset = 0; offset <= 3; offset++) {
          for (const sign of [0, 1, -1]) {
            if (offset === 0 && sign !== 0) continue
            const d = new Date(oneYearAgo.getTime() + sign * offset * 86400000)
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const dd = String(d.getDate()).padStart(2, '0')
            dates.push(`${y}-${m}-${dd}`)
          }
        }
        // Remove duplicates
        const uniqueDates = [...new Set(dates)]

        // Try each date for audio (check both roles)
        for (const dateKey of uniqueDates) {
          for (const listenRole of ['parent', 'child']) {
            try {
              const res = await fetch(
                `/api/pair-media?pairId=${encodeURIComponent(pairId)}&dateKey=${encodeURIComponent(dateKey)}&listenRole=${encodeURIComponent(listenRole)}&mode=signed&v=${Date.now()}`,
                { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
              )
              if (res.ok) {
                const d = await res.json().catch(() => ({}))
                if (d?.url) {
                  setAudioData({ url: d.url, dateKey, role: listenRole })
                  return
                }
              }
            } catch {}
          }
        }
      } catch {}
    })()
  }, [])

  if (!audioData) return null

  const isEn = lang === 'en'

  const handlePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (isPlaying) {
      el.pause()
      setIsPlaying(false)
    } else {
      el.src = audioData.url
      el.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }

  return (
    <div className="card" style={{ padding: '12px 16px', background: 'linear-gradient(135deg, #fef3e2 0%, #fff 100%)', borderColor: '#e8d4a8' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
            📅 {isEn ? '1 year ago today' : '1年前のあなたの声'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 8 }}>
            {audioData.dateKey.slice(5)}
          </span>
        </div>
        <button
          type="button"
          onClick={handlePlay}
          style={{
            padding: '6px 16px',
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            background: isPlaying ? 'var(--color-danger)' : 'var(--color-primary)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
        >
          {isPlaying ? (isEn ? 'Stop' : '停止') : (isEn ? 'Play' : '再生')}
        </button>
      </div>
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} style={{ display: 'none' }} />
    </div>
  )
}
