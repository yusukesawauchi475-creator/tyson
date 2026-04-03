import { useState, useEffect, useRef } from 'react'
import { getPairId } from '../lib/pairDaily'
import { getIdTokenForApi } from '../lib/firebase'

export default function VoiceLibrary({ lang = 'ja', role = 'parent', pairId: pairIdProp }) {
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [playingKey, setPlayingKey] = useState(null) // "dateKey-role"
  const audioRef = useRef(null)

  const effectivePairId = pairIdProp || getPairId()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const idToken = await getIdTokenForApi()
      if (!idToken || cancelled) { setLoading(false); return }
      try {
        const res = await fetch(`/api/pair-media?action=voice-history&pairId=${encodeURIComponent(effectivePairId)}&limit=7`, {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        })
        if (!res.ok) { setLoading(false); return }
        const data = await res.json()
        if (!cancelled && data.days) setDays(data.days)
      } catch (_) {}
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [effectivePairId])

  const handlePlay = (dateKey, r, url) => {
    const key = `${dateKey}-${r}`
    const el = audioRef.current
    if (!el || !url) return

    if (playingKey === key) {
      el.pause()
      el.currentTime = 0
      setPlayingKey(null)
      return
    }

    el.pause()
    el.src = url
    el.currentTime = 0
    el.play().then(() => setPlayingKey(key)).catch(() => setPlayingKey(null))
  }

  const handleEnded = () => setPlayingKey(null)

  const formatDate = (dateKey) => {
    if (!dateKey) return ''
    const [, m, d] = dateKey.split('-').map(Number)
    return lang === 'en' ? `${m}/${d}` : `${m}月${d}日`
  }

  if (loading) return null
  if (days.length === 0) return null

  return (
    <section style={{ width: '100%', background: '#F8F6FF', borderRadius: 18, padding: 14, overflow: 'hidden' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {lang === 'en' ? '🎧 Voice History' : '🎧 過去の声'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {days.map(({ dateKey, parent, child }) => (
          <div key={dateKey} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #EEE8FF' }}>
            <span style={{ fontSize: 12, color: '#8070A0', fontWeight: 600, minWidth: 50 }}>{formatDate(dateKey)}</span>

            {/* Parent voice */}
            <button
              type="button"
              disabled={!parent?.url}
              onClick={() => parent?.url && handlePlay(dateKey, 'parent', parent.url)}
              style={{
                flex: 1,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 600,
                color: parent?.url ? '#555' : '#CCC',
                background: playingKey === `${dateKey}-parent` ? '#E8E0FF' : '#fff',
                border: parent?.hasAudio ? (parent.isUnseen ? '2px solid #E04040' : '2px solid #30A870') : '1px solid #E8E0FF',
                borderRadius: 10,
                cursor: parent?.url ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span style={{ fontSize: 13 }}>
                {!parent?.hasAudio ? '—' : parent.isUnseen ? '🔴' : '✅'}
              </span>
              <span>{lang === 'en' ? 'Parent' : '親'}</span>
              {playingKey === `${dateKey}-parent` && <span style={{ fontSize: 11, marginLeft: 'auto' }}>▶</span>}
            </button>

            {/* Child voice */}
            <button
              type="button"
              disabled={!child?.url}
              onClick={() => child?.url && handlePlay(dateKey, 'child', child.url)}
              style={{
                flex: 1,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 600,
                color: child?.url ? '#555' : '#CCC',
                background: playingKey === `${dateKey}-child` ? '#E8E0FF' : '#fff',
                border: child?.hasAudio ? (child.isUnseen ? '2px solid #E04040' : '2px solid #30A870') : '1px solid #E8E0FF',
                borderRadius: 10,
                cursor: child?.url ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span style={{ fontSize: 13 }}>
                {!child?.hasAudio ? '—' : child.isUnseen ? '🔴' : '✅'}
              </span>
              <span>{lang === 'en' ? 'Child' : '子'}</span>
              {playingKey === `${dateKey}-child` && <span style={{ fontSize: 11, marginLeft: 'auto' }}>▶</span>}
            </button>
          </div>
        ))}
      </div>

      <audio ref={audioRef} onEnded={handleEnded} onPause={() => setPlayingKey(null)} style={{ display: 'none' }} />
    </section>
  )
}
