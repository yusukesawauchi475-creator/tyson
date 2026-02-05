import { useState, useEffect, useRef } from 'react'
import { getDateKey, fetchAudioForPlayback, hasTodayAudio } from '../lib/pairDaily'

export default function PairDailyPage() {
  const [today, setToday] = useState('')
  const [hasAudio, setHasAudio] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [errorLine, setErrorLine] = useState(null)
  const audioRef = useRef(null)

  useEffect(() => {
    const d = new Date()
    setToday(d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }))
    let cancelled = false
    hasTodayAudio().then((v) => {
      if (!cancelled) setHasAudio(v)
    })
    return () => { cancelled = true }
  }, [])

  const handlePlay = async () => {
    if (audioUrl) {
      try {
        const el = audioRef.current
        if (el) {
          el.currentTime = 0
          el.play()
          setIsPlaying(true)
        }
      } catch (_) {
        setErrorLine(`うまくいきませんでした。もう一度お試しください（ID: PLAY-ERR）`)
      }
      return
    }

    setIsLoading(true)
    setErrorLine(null)
    const result = await fetchAudioForPlayback()

    if (result.error) {
      const reqId = result.requestId || 'REQ-XXXX'
      setErrorLine(`うまくいきませんでした。もう一度お試しください（ID: ${reqId}）`)
      if (import.meta.env.DEV) console.error('[PairDaily]', result.requestId, result.errorCode, result.error)
      setIsLoading(false)
      return
    }

    setAudioUrl(result.url)
    setIsLoading(false)

    try {
      const el = audioRef.current
      if (el) {
        el.src = result.url
        el.currentTime = 0
        await el.play()
        setIsPlaying(true)
      }
    } catch (_) {
      setErrorLine(`うまくいきませんでした。もう一度お試しください（ID: PLAY-ERR）`)
    }
  }

  const handleEnded = () => setIsPlaying(false)

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      background: '#fff',
      color: '#333',
    }}>
      <header style={{ flexShrink: 0, marginBottom: 24 }}>
        <time style={{ fontSize: 14, color: '#666' }}>{today || '...'}</time>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: '#888' }}>
          {hasAudio === true ? '今日は声が届いています' : hasAudio === false ? 'まだです' : '確認中...'}
        </p>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <section>
          <button
            type="button"
            onClick={handlePlay}
            disabled={isLoading}
            style={{
              width: '100%',
              maxWidth: 320,
              padding: '18px 24px',
              fontSize: 18,
              fontWeight: 500,
              color: '#fff',
              background: isLoading ? '#999' : '#4a90d9',
              border: 'none',
              borderRadius: 12,
              cursor: isLoading ? 'wait' : 'pointer',
            }}
          >
            {isLoading ? '読み込み中...' : isPlaying ? '再生中' : '再生'}
          </button>
        </section>

        {errorLine && (
          <p style={{ fontSize: 14, color: '#c00', textAlign: 'center', margin: 0 }}>
            {errorLine}
          </p>
        )}
      </main>

      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onPause={() => setIsPlaying(false)}
        style={{ display: 'none' }}
      />
    </div>
  )
}
