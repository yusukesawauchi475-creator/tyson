import { useState, useRef, useEffect, useCallback } from 'react'
import { uploadAudio, fetchAudioForPlayback, hasTodayAudio, PAIR_ID_DEMO } from '../lib/pairDaily'
import DailyPromptCard from '../components/DailyPromptCard'

export default function HomePage() {
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [sentAt, setSentAt] = useState(null)
  const [errorLine, setErrorLine] = useState(null)
  const [hasParentAudio, setHasParentAudio] = useState(null)
  const [parentAudioUrl, setParentAudioUrl] = useState(null)
  const [isLoadingParent, setIsLoadingParent] = useState(false)
  const [isPlayingParent, setIsPlayingParent] = useState(false)
  const [oneLiner, setOneLiner] = useState('')
  const [oneLinerStage, setOneLinerStage] = useState(null)
  const [oneLinerVisible, setOneLinerVisible] = useState(false)
  const [dailyTopic, setDailyTopic] = useState(null)
  const [analysisComment, setAnalysisComment] = useState('')
  const [analysisVisible, setAnalysisVisible] = useState(false)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const recordStartRef = useRef(null)
  const parentAudioRef = useRef(null)
  const oneLinerTimerRef = useRef(null)
  const topicRef = useRef(null)
  const analysisTimerRef = useRef(null)

  const ROLE_CHILD = 'child'
  const LISTEN_ROLE_PARENT = 'parent'

  const handleTopicChange = useCallback((topic) => {
    setDailyTopic(topic)
    topicRef.current = topic
  }, [])

  const startRecording = async () => {
    setErrorLine(null)
    setSentAt(null)
    // 録音開始時に一言を非表示
    setOneLinerVisible(false)
    setAnalysisVisible(false)
    if (oneLinerTimerRef.current) {
      clearTimeout(oneLinerTimerRef.current)
      oneLinerTimerRef.current = null
    }
    if (analysisTimerRef.current) {
      clearTimeout(analysisTimerRef.current)
      analysisTimerRef.current = null
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      let mimeType = 'audio/webm'
      if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4'
      else if (MediaRecorder.isTypeSupported('audio/aac')) mimeType = 'audio/aac'

      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recordStartRef.current = Date.now()

      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType })
        const duration = recordStartRef.current ? (Date.now() - recordStartRef.current) / 1000 : 0

        if (duration < 1 || blob.size < 4 * 1024) {
          setErrorLine('もう一度お試しください')
          return
        }

        setIsUploading(true)
        const result = await uploadAudio(blob, ROLE_CHILD)

        if (result.success) {
          // 古いタイマーをクリア（連続録音対策）
          if (oneLinerTimerRef.current) {
            clearTimeout(oneLinerTimerRef.current)
            oneLinerTimerRef.current = null
          }
          if (analysisTimerRef.current) {
            clearTimeout(analysisTimerRef.current)
            analysisTimerRef.current = null
          }
          setAnalysisVisible(false)
          // 送信成功時のtopicをrefに保持（競合対策）
          topicRef.current = dailyTopic
          setSentAt(new Date())
          setErrorLine(null)
          // 一言表示開始（0-200msで即時表示）
          setOneLiner('録音ありがとうございます！送信できました。')
          setOneLinerStage('immediate')
          setOneLinerVisible(true)
          // 300ms後にtopicに応じたテンプレに差し替え
          oneLinerTimerRef.current = setTimeout(() => {
            const topic = topicRef.current
            let finalMessage = 'いいですね！今日のいちばんはどれでした？' // 汎用フォールバック
            if (topic) {
              if (topic.includes('何食べた')) {
                finalMessage = 'いいですね！いちばんおいしかったのはどれでした？'
              } else if (topic.includes('天気')) {
                finalMessage = 'いいね！今日の空で印象に残ったのはどんな感じ？'
              } else if (topic.includes('一番楽しかった') || topic.includes('ハイライト')) {
                finalMessage = '最高。いちばん嬉しかったのはどれ？'
              } else if (topic.includes('誰に会った')) {
                finalMessage = 'いいね！その人と何話した？'
              } else if (topic.includes('気分') || topic.includes('色')) {
                finalMessage = 'いいね。今の気分、もう少し言葉にすると？'
              }
            }
            setOneLiner(finalMessage)
            setOneLinerStage('final')
            oneLinerTimerRef.current = null
          }, 300)
          // さらに700ms後（送信成功から1000ms後）に解析コメントを表示
          analysisTimerRef.current = setTimeout(() => {
            const topic = topicRef.current
            let comment = '今日の記録、ありがとうございます' // 汎用フォールバック
            if (topic) {
              if (topic.includes('何食べた')) {
                comment = '食事の記録、ありがとうございます'
              } else if (topic.includes('天気')) {
                comment = '今日の空の様子、ありがとうございます'
              } else if (topic.includes('一番楽しかった') || topic.includes('ハイライト')) {
                comment = '今日のハイライト、ありがとうございます'
              } else if (topic.includes('誰に会った')) {
                comment = '今日の出会い、ありがとうございます'
              } else if (topic.includes('気分') || topic.includes('色')) {
                comment = '今日の気持ち、ありがとうございます'
              }
            }
            setAnalysisComment(comment)
            setAnalysisVisible(true)
            analysisTimerRef.current = null
          }, 1000)
        } else {
          const reqId = result.requestId || 'REQ-XXXX'
          setErrorLine(`うまくいきませんでした。もう一度お試しください（ID: ${reqId}）`)
          if (import.meta.env.DEV) console.error('[HomePage]', result.requestId, result.errorCode, result.error)
        }
        setIsUploading(false)

        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      mr.start()
      setIsRecording(true)
    } catch (e) {
      setErrorLine('マイクへのアクセスが許可されていません')
      if (import.meta.env.DEV) console.error('startRecording:', e)
    }
  }

  const stopRecording = () => {
    if (!isRecording || isUploading) return
    const mr = mediaRecorderRef.current
    if (mr?.state === 'recording') mr.stop()
    setIsRecording(false)
  }

  const handleClick = () => {
    if (isRecording) stopRecording()
    else startRecording()
  }

  const refreshParentStatus = () => {
    setHasParentAudio(null)
    hasTodayAudio(LISTEN_ROLE_PARENT).then(setHasParentAudio)
  }

  useEffect(() => {
    let cancelled = false
    hasTodayAudio(LISTEN_ROLE_PARENT).then((v) => {
      if (!cancelled) setHasParentAudio(v)
    })
    return () => { cancelled = true }
  }, [])

  const handlePlayParent = async () => {
    if (hasParentAudio === false) return

    setIsLoadingParent(true)
    setErrorLine(null)
    
    // 古いObjectURLがあれば破棄（毎回最新を取得するため）
    if (parentAudioUrl && parentAudioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(parentAudioUrl)
    }
    setParentAudioUrl(null)
    
    const result = await fetchAudioForPlayback(LISTEN_ROLE_PARENT)

    if (result.error) {
      const reqId = result.requestId || 'REQ-XXXX'
      setErrorLine(`うまくいきませんでした。もう一度お試しください（ID: ${reqId}）`)
      if (import.meta.env.DEV) console.error('[HomePage]', result.requestId, result.errorCode, result.error)
      setIsLoadingParent(false)
      if (result.hasAudio === false) setHasParentAudio(false)
      return
    }

    // 古いObjectURLがあれば破棄
    if (parentAudioUrl && parentAudioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(parentAudioUrl)
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
      }
    } catch (_) {
      setErrorLine(`うまくいきませんでした。もう一度お試しください（ID: PLAY-ERR）`)
    }
  }

  const handleParentEnded = () => setIsPlayingParent(false)

  // unmount時にObjectURLを破棄
  useEffect(() => {
    return () => {
      if (parentAudioUrl && parentAudioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(parentAudioUrl)
      }
      if (oneLinerTimerRef.current) {
        clearTimeout(oneLinerTimerRef.current)
      }
      if (analysisTimerRef.current) {
        clearTimeout(analysisTimerRef.current)
      }
    }
  }, [parentAudioUrl])

  const sentAtStr = sentAt
    ? sentAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    : ''

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
        <time style={{ fontSize: 14, color: '#666' }}>
          {new Date().toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
          })}
        </time>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <section style={{ width: '100%', maxWidth: 320 }}>
          <p style={{ fontSize: 14, color: '#666', margin: '0 0 8px', textAlign: 'center' }}>
            相手（親）の音声
          </p>
          {hasParentAudio === true ? (
            <>
              <p style={{ fontSize: 14, color: '#2e7d32', textAlign: 'center', margin: '0 0 8px', fontWeight: 500 }}>
                届いています
              </p>
              <button
                type="button"
                onClick={handlePlayParent}
                disabled={isLoadingParent}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  fontSize: 16,
                  fontWeight: 500,
                  color: '#fff',
                  background: isLoadingParent ? '#999' : '#4a90d9',
                  border: 'none',
                  borderRadius: 8,
                  cursor: isLoadingParent ? 'wait' : 'pointer',
                  marginBottom: 16,
                }}
              >
                {isLoadingParent ? '読み込み中…' : isPlayingParent ? '再生中…' : '再生'}
              </button>
            </>
          ) : hasParentAudio === false ? (
            <p style={{ fontSize: 14, color: '#888', textAlign: 'center', margin: '0 0 16px' }}>
              まだ届いていません
            </p>
          ) : (
            <p style={{ fontSize: 14, color: '#888', textAlign: 'center', margin: '0 0 16px' }}>
              確認中…
            </p>
          )}
          {hasParentAudio !== null && (
            <button
              type="button"
              onClick={refreshParentStatus}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                color: '#4a90d9',
                background: 'transparent',
                border: '1px solid #4a90d9',
                borderRadius: 6,
                cursor: 'pointer',
                marginBottom: 16,
              }}
            >
              更新
            </button>
          )}
        </section>

        <section style={{ width: '100%', maxWidth: 320 }}>
          <p style={{ fontSize: 14, color: '#666', margin: '0 0 8px', textAlign: 'center' }}>
            自分の録音
          </p>
          <button
            type="button"
            onClick={handleClick}
            disabled={isUploading}
            style={{
              width: '100%',
              padding: '18px 24px',
              fontSize: 18,
              fontWeight: 500,
              color: '#fff',
              background: isUploading ? '#999' : isRecording ? '#c00' : '#4a90d9',
              border: 'none',
              borderRadius: 12,
              cursor: isUploading ? 'wait' : 'pointer',
              boxShadow: isRecording ? '0 0 0 4px rgba(200, 0, 0, 0.3)' : 'none',
            }}
          >
            {isUploading ? '送信中…' : isRecording ? '録音中…' : '録音'}
          </button>

          {sentAt && (
            <p style={{ fontSize: 16, color: '#2e7d32', fontWeight: 500, margin: '8px 0 0', textAlign: 'center' }}>
              送信しました（{sentAtStr}）
            </p>
          )}

          <DailyPromptCard pairId={PAIR_ID_DEMO} role={ROLE_CHILD} onTopicChange={handleTopicChange} />

          {oneLinerVisible && oneLiner && (
            <div style={{
              width: '100%',
              maxWidth: 320,
              marginTop: 16,
              padding: '12px 16px',
              background: '#e8f5e9',
              border: '1px solid #c8e6c9',
              borderRadius: 8,
              fontSize: 14,
              color: '#2e7d32',
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              {oneLiner}
            </div>
          )}

          {analysisVisible && analysisComment && (
            <div style={{
              width: '100%',
              maxWidth: 320,
              marginTop: 8,
              padding: '8px 12px',
              fontSize: 12,
              color: '#666',
              textAlign: 'center',
              lineHeight: 1.4,
            }}>
              {analysisComment}
            </div>
          )}
        </section>

        {errorLine && (
          <p style={{ fontSize: 14, color: '#c00', textAlign: 'center', margin: 0 }}>
            {errorLine}
          </p>
        )}
      </main>

      <audio
        ref={parentAudioRef}
        onEnded={handleParentEnded}
        onPause={() => setIsPlayingParent(false)}
        style={{ display: 'none' }}
      />
    </div>
  )
}
