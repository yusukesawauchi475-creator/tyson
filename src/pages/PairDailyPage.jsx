import { useState, useEffect, useRef, useCallback } from 'react'
import { getDateKey, fetchAudioForPlayback, hasTodayAudio, uploadAudio, PAIR_ID_DEMO } from '../lib/pairDaily'
import { getFinalOneLiner, getAnalysisPlaceholder } from '../lib/uiCopy'
import DailyPromptCard from '../components/DailyPromptCard'
import { getIdTokenForApi } from '../lib/firebase'

export default function PairDailyPage() {
  const [today, setToday] = useState('')
  const [hasAudio, setHasAudio] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [errorLine, setErrorLine] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [sentAt, setSentAt] = useState(null)
  const [oneLiner, setOneLiner] = useState('')
  const [oneLinerStage, setOneLinerStage] = useState(null)
  const [oneLinerVisible, setOneLinerVisible] = useState(false)
  const [dailyTopic, setDailyTopic] = useState(null)
  const [analysisComment, setAnalysisComment] = useState('')
  const [analysisVisible, setAnalysisVisible] = useState(false)
  const audioRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const recordStartRef = useRef(null)
  const oneLinerTimerRef = useRef(null)
  const topicRef = useRef(null)
  const analysisTimerRef = useRef(null)
  const analysisFetchTimerRef = useRef(null)
  const analysisReqSeqRef = useRef(0)

  const ROLE_PARENT = 'parent'
  const LISTEN_ROLE_CHILD = 'child'

  const handleTopicChange = useCallback((topic) => {
    setDailyTopic(topic)
    topicRef.current = topic
  }, [])

  const refreshStatus = () => {
    setHasAudio(null)
    hasTodayAudio(LISTEN_ROLE_CHILD).then(setHasAudio)
  }

  useEffect(() => {
    const d = new Date()
    setToday(d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }))
    let cancelled = false
    hasTodayAudio(LISTEN_ROLE_CHILD).then((v) => {
      if (!cancelled) setHasAudio(v)
    })
    return () => { cancelled = true }
  }, [])

  const handlePlay = async () => {
    if (hasAudio === false) return

    setIsLoading(true)
    setErrorLine(null)
    
    // 古いObjectURLがあれば破棄（毎回最新を取得するため）
    if (audioUrl && audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioUrl(null)
    
    const result = await fetchAudioForPlayback(LISTEN_ROLE_CHILD)

    if (result.error) {
      const reqId = result.requestId || 'REQ-XXXX'
      setErrorLine(`うまくいきませんでした。もう一度お試しください（ID: ${reqId}）`)
      if (import.meta.env.DEV) console.error('[PairDaily]', result.requestId, result.errorCode, result.error)
      setIsLoading(false)
      if (result.hasAudio === false) setHasAudio(false)
      return
    }

    // 古いObjectURLがあれば破棄
    if (audioUrl && audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioUrl)
    }

    setAudioUrl(result.url)
    setIsLoading(false)
    if (result.hasAudio !== undefined) setHasAudio(result.hasAudio)

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

  // unmount時にObjectURLを破棄
  useEffect(() => {
    return () => {
      if (audioUrl && audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrl)
      }
      if (oneLinerTimerRef.current) {
        clearTimeout(oneLinerTimerRef.current)
      }
      if (analysisTimerRef.current) {
        clearTimeout(analysisTimerRef.current)
      }
      if (analysisFetchTimerRef.current) {
        clearTimeout(analysisFetchTimerRef.current)
      }
    }
  }, [audioUrl])

  const startRecording = async () => {
    setErrorLine(null)
    setSentAt(null)
    // 録音開始時に一言を非表示
    setOneLinerVisible(false)
    setAnalysisVisible(false)
    // 録音開始＝過去の解析結果は全部無効
    analysisReqSeqRef.current += 1
    if (oneLinerTimerRef.current) {
      clearTimeout(oneLinerTimerRef.current)
      oneLinerTimerRef.current = null
    }
    if (analysisTimerRef.current) {
      clearTimeout(analysisTimerRef.current)
      analysisTimerRef.current = null
    }
    if (analysisFetchTimerRef.current) {
      clearTimeout(analysisFetchTimerRef.current)
      analysisFetchTimerRef.current = null
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

        // 録音秒数を算出（整数秒、1-6000の範囲）
        const durationSec = recordStartRef.current
          ? Math.max(1, Math.min(6000, Math.round((Date.now() - recordStartRef.current) / 1000)))
          : null

        setIsUploading(true)
        const result = await uploadAudio(blob, ROLE_PARENT)

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
          if (analysisFetchTimerRef.current) {
            clearTimeout(analysisFetchTimerRef.current)
            analysisFetchTimerRef.current = null
          }
          setAnalysisVisible(false)
          // 送信成功時のtopicをrefに保持（競合対策）
          topicRef.current = dailyTopic
          // dateKeyを固定（このupload用に1回だけ作る）
          const dateKeyForThisUpload = result?.dateKey || getDateKey()
          // リクエストシーケンス番号をインクリメント
          analysisReqSeqRef.current += 1
          const seq = analysisReqSeqRef.current
          setSentAt(new Date())
          setErrorLine(null)
          // 一言表示開始（0-200msで即時表示）
          setOneLiner('録音ありがとうございます！送信できました。')
          setOneLinerStage('immediate')
          setOneLinerVisible(true)
          // 300ms後にtopicに応じたテンプレに差し替え
          oneLinerTimerRef.current = setTimeout(() => {
            const topic = topicRef.current
            const finalMessage = getFinalOneLiner(topic, ROLE_PARENT)
            setOneLiner(finalMessage)
            setOneLinerStage('final')
            oneLinerTimerRef.current = null
          }, 300)
          // さらに700ms後（送信成功から1000ms後）に解析コメントを表示
          analysisTimerRef.current = setTimeout(() => {
            const topic = topicRef.current
            const placeholder = getAnalysisPlaceholder(topic, ROLE_PARENT)
            setAnalysisComment(placeholder)
            setAnalysisVisible(true)
            analysisTimerRef.current = null
          }, 1000)

          // 非同期で解析コメントAPIをPOST（awaitしない、失敗しても無視）
          ;(async () => {
            try {
              const idToken = await getIdTokenForApi()
              if (!idToken) return
              await fetch('/api/analysis-comment', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                  pairId: PAIR_ID_DEMO,
                  dateKey: dateKeyForThisUpload,
                  role: ROLE_PARENT,
                  topic: topicRef.current,
                  durationSec: durationSec,
                }),
              })
            } catch (e) {
              // エラーは無視（UIを止めない）
            }
          })()

          // 1200-1500ms後にGETして、取れたら差し替え
          analysisFetchTimerRef.current = setTimeout(() => {
            ;(async () => {
              // 古いリクエストの結果が刺さらないようにガード
              if (analysisReqSeqRef.current !== seq) return
              try {
                const idToken = await getIdTokenForApi()
                if (!idToken) return
                // 再度チェック（非同期処理中にseqが変わった可能性）
                if (analysisReqSeqRef.current !== seq) return
                const res = await fetch(`/api/analysis-comment?pairId=${PAIR_ID_DEMO}&dateKey=${dateKeyForThisUpload}&role=${ROLE_PARENT}`, {
                  headers: {
                    Authorization: `Bearer ${idToken}`,
                  },
                })
                // レスポンス取得後もチェック
                if (analysisReqSeqRef.current !== seq) return
                if (res.ok) {
                  const data = await res.json()
                  if (data.success && data.text) {
                    // 最後のチェック
                    if (analysisReqSeqRef.current === seq) {
                      setAnalysisComment(data.text)
                    }
                  }
                }
              } catch (e) {
                // エラーは無視（UIを止めない）
              }
            })()
          }, 1200 + Math.random() * 300) // 1200-1500msの間でランダム
        } else {
          const reqId = result.requestId || 'REQ-XXXX'
          setErrorLine(`うまくいきませんでした。もう一度お試しください（ID: ${reqId}）`)
          if (import.meta.env.DEV) console.error('[PairDaily]', result.requestId, result.errorCode, result.error)
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

  const handleRecordClick = () => {
    if (isRecording) stopRecording()
    else startRecording()
  }

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
        <time style={{ fontSize: 14, color: '#666' }}>{today || '...'}</time>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: '#888' }}>
          {hasAudio === true ? '今日は声が届いています' : hasAudio === false ? 'まだです（今日はこれで大丈夫です）' : '確認中…'}
        </p>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <section style={{ width: '100%', maxWidth: 320 }}>
          <p style={{ fontSize: 14, color: '#666', margin: '0 0 8px', textAlign: 'center' }}>
            相手（子）の音声
          </p>
          {hasAudio === true ? (
            <>
              <p style={{ fontSize: 14, color: '#2e7d32', textAlign: 'center', margin: '0 0 8px', fontWeight: 500 }}>
                届いています
              </p>
              <button
                type="button"
                onClick={handlePlay}
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  fontSize: 16,
                  fontWeight: 500,
                  color: '#fff',
                  background: isLoading ? '#999' : '#4a90d9',
                  border: 'none',
                  borderRadius: 8,
                  cursor: isLoading ? 'wait' : 'pointer',
                  marginBottom: 16,
                }}
              >
                {isLoading ? '読み込み中…' : isPlaying ? '再生中…' : '再生'}
              </button>
            </>
          ) : hasAudio === false ? (
            <p style={{ fontSize: 14, color: '#888', textAlign: 'center', margin: '0 0 16px' }}>
              まだ届いていません（今日はこれで大丈夫です）
            </p>
          ) : (
            <p style={{ fontSize: 14, color: '#888', textAlign: 'center', margin: '0 0 16px' }}>
              確認中…
            </p>
          )}
          {hasAudio !== null && (
            <button
              type="button"
              onClick={refreshStatus}
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
            onClick={handleRecordClick}
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

          <DailyPromptCard pairId={PAIR_ID_DEMO} role={ROLE_PARENT} onTopicChange={handleTopicChange} />

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
              whiteSpace: 'pre-line',
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
        ref={audioRef}
        onEnded={handleEnded}
        onPause={() => setIsPlaying(false)}
        style={{ display: 'none' }}
      />
    </div>
  )
}
