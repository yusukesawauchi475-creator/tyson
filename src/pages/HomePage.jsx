import { useState, useRef, useEffect, useCallback } from 'react'
import { uploadAudio, fetchAudioForPlayback, getListenRoleMeta, markSeen, getPairId, getDateKey, genRequestId } from '../lib/pairDaily'
import { uploadJournalImage, fetchTodayJournalMeta } from '../lib/journal'
import { getFinalOneLiner, getAnalysisPlaceholder } from '../lib/uiCopy'
import DailyPromptCard from '../components/DailyPromptCard'
import { getIdTokenForApi } from '../lib/firebase'
import { useAudioLevel } from '../lib/useAudioLevel'

export default function HomePage() {
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [sentAt, setSentAt] = useState(null)
  const [errorLine, setErrorLine] = useState(null)
  const [hasParentAudio, setHasParentAudio] = useState(null)
  const [isParentUnseen, setIsParentUnseen] = useState(false)
  const [parentAudioUrl, setParentAudioUrl] = useState(null)
  const [isLoadingParent, setIsLoadingParent] = useState(false)
  const [isPlayingParent, setIsPlayingParent] = useState(false)
  const [oneLiner, setOneLiner] = useState('')
  const [oneLinerStage, setOneLinerStage] = useState(null)
  const [oneLinerVisible, setOneLinerVisible] = useState(false)
  const [dailyTopic, setDailyTopic] = useState(null)
  const [analysisComment, setAnalysisComment] = useState('')
  const [analysisVisible, setAnalysisVisible] = useState(false)
  const [lastRequestId, setLastRequestId] = useState(null)
  const [journalUploading, setJournalUploading] = useState(false)
  const [journalRequestId, setJournalRequestId] = useState(null)
  const [journalUploaded, setJournalUploaded] = useState(false)
  const [journalDateKey, setJournalDateKey] = useState(null)
  const [journalError, setJournalError] = useState(null)
  const [showReloadButton, setShowReloadButton] = useState(false)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const recordStartRef = useRef(null)
  const parentAudioRef = useRef(null)
  const oneLinerTimerRef = useRef(null)
  const topicRef = useRef(null)
  const analysisTimerRef = useRef(null)
  const analysisFetchTimerRef = useRef(null)
  const analysisReqSeqRef = useRef(0)
  const pollIntervalRef = useRef(null)
  const uploadingRef = useRef(false)
  const loadingParentRef = useRef(false)
  const playingParentRef = useRef(false)
  const galleryInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const { level, isSpeaking, start: startAudioLevel, stop: stopAudioLevel } = useAudioLevel()

  useEffect(() => {
    uploadingRef.current = isUploading
    loadingParentRef.current = isLoadingParent
    playingParentRef.current = isPlayingParent
  }, [isUploading, isLoadingParent, isPlayingParent])

  const ROLE_PARENT = 'parent'
  const LISTEN_ROLE_CHILD = 'child'

  const handleTopicChange = useCallback((topic) => {
    setDailyTopic(topic)
    topicRef.current = topic
  }, [])

  const startRecording = async () => {
    if (isUploading) return
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

      // 音量レベル監視を開始
      startAudioLevel(stream)

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
        // 音量レベル監視を停止
        stopAudioLevel()
        const blob = new Blob(chunksRef.current, { type: mr.mimeType })
        const duration = recordStartRef.current ? (Date.now() - recordStartRef.current) / 1000 : 0

        if (duration < 1 || blob.size < 4 * 1024) {
          setErrorLine('もう一度お試しください')
          return
        }

        const reqId = genRequestId()
        setLastRequestId(reqId)
        setIsUploading(true)
        const durationSec = recordStartRef.current
          ? Math.max(1, Math.min(6000, Math.round((Date.now() - recordStartRef.current) / 1000)))
          : null
        const result = await uploadAudio(blob, ROLE_PARENT, getPairId(), getDateKey(), reqId)

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
          if (dailyTopic) topicRef.current = dailyTopic
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
                  pairId: getPairId(),
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

          // 非同期でAI解析を開始（fire-and-forget、awaitしない）
          ;(async () => {
            try {
              const idToken = await getIdTokenForApi()
              if (!idToken) return
              
              // uploadAudioのレスポンスからversionを取得
              const sourceVersion = result?.version
              if (!sourceVersion) {
                console.error('[HomePage] uploadAudio result missing version, skipping analyze')
                return
              }
              
              fetch('/api/analyze', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                  pairId: getPairId(),
                  dateKey: dateKeyForThisUpload,
                  role: ROLE_PARENT,
                  sourceVersion,
                  version: sourceVersion, // 互換性のため
                }),
              }).catch(() => {
                // エラーは無視（UIを止めない）
              })
            } catch (e) {
              // エラーは無視（UIを止めない）
            }
          })()

          // 1200-1500ms後にGETして、取れたら差し替え（ポーリング開始）
          analysisFetchTimerRef.current = setTimeout(() => {
            ;(async () => {
              // 古いリクエストの結果が刺さらないようにガード
              if (analysisReqSeqRef.current !== seq) return
              
              const maxPollCount = 20
              const pollInterval = 2000 // 2秒間隔
              let pollCount = 0
              
              const pollAnalysis = async () => {
                // seqガード（各ポーリング開始時）
                if (analysisReqSeqRef.current !== seq) return false
                
                try {
                  const idToken = await getIdTokenForApi()
                  if (!idToken) return false
                  
                  // 再度チェック（非同期処理中にseqが変わった可能性）
                  if (analysisReqSeqRef.current !== seq) return false
                  
                  const res = await fetch(`/api/analysis-comment?pairId=${getPairId()}&dateKey=${dateKeyForThisUpload}&role=${ROLE_PARENT}`, {
                    headers: {
                      Authorization: `Bearer ${idToken}`,
                    },
                  })
                  
                  // レスポンス取得後もチェック
                  if (analysisReqSeqRef.current !== seq) return false
                  
                  if (res.ok) {
                    const data = await res.json()
                    if (data.success) {
                      // aiStatusがdoneならaiTextを表示して終了
                      if (data.aiStatus === 'done' && data.aiText) {
                        if (analysisReqSeqRef.current === seq) {
                          setAnalysisComment(data.aiText)
                        }
                        return true // 完了
                      }
                      
                      // aiStatusがerrorなら静かに終了（placeholderのまま）
                      if (data.aiStatus === 'error') {
                        return true // 終了（エラーでもUIは止めない）
                      }
                      
                      // aiTextがあれば優先、なければtextを使用（初期表示用）
                      const displayText = data.aiText || data.text
                      if (displayText && pollCount === 0) {
                        // 最初のポーリングで既存textがあれば表示
                        if (analysisReqSeqRef.current === seq) {
                          setAnalysisComment(displayText)
                        }
                      }
                    }
                  }
                } catch (e) {
                  // エラーは無視（UIを止めない）
                }
                
                return false // 継続
              }
              
              // 最初のポーリング
              const done = await pollAnalysis()
              if (done) return
              
              // 最大回数までポーリング
              const pollLoop = setInterval(async () => {
                pollCount++
                
                if (analysisReqSeqRef.current !== seq) {
                  clearInterval(pollLoop)
                  return
                }
                
                const done = await pollAnalysis()
                if (done || pollCount >= maxPollCount) {
                  clearInterval(pollLoop)
                  // 最大回数に達しても静かに終了（placeholderのまま）
                }
              }, pollInterval)
            })()
          }, 1200 + Math.random() * 300) // 1200-1500msの間でランダム
        } else {
          const reqId = result.requestId || 'REQ-XXXX'
          setErrorLine(`うまくいきませんでした。もう一度お試しください（ID: ${reqId}）`)
          if (import.meta.env.DEV) console.error('[HomePage]', result.requestId, result.errorCode, result.error)
        }
        setIsUploading(false)

        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        // 音量レベル監視を停止（念のため）
        stopAudioLevel()
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
    if (mr?.state === 'recording') {
      mr.stop()
      // 音量レベル監視を停止
      stopAudioLevel()
    }
    setIsRecording(false)
  }

  const MAX_IMAGE_EDGE = 1600
  const JPEG_QUALITY = 0.65

  const resizeImageIfNeeded = (file) => {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const w = img.naturalWidth || img.width
        const h = img.naturalHeight || img.height
        if (w <= MAX_IMAGE_EDGE && h <= MAX_IMAGE_EDGE) {
          resolve(file)
          return
        }
        const scale = Math.min(MAX_IMAGE_EDGE / w, MAX_IMAGE_EDGE / h)
        const c = document.createElement('canvas')
        c.width = Math.round(w * scale)
        c.height = Math.round(h * scale)
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0, c.width, c.height)
        c.toBlob((blob) => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name || 'page-01.jpg', { type: file.type || 'image/jpeg' }))
        }, file.type || 'image/jpeg', JPEG_QUALITY)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(file)
      }
      img.src = url
    })
  }

  const handleJournalFile = async (file) => {
    if (!file || journalUploading) return
    if (typeof file.type !== 'string' || !file.type.startsWith('image/')) {
      setJournalError('画像ファイルを選んでください')
      return
    }
    setJournalUploading(true)
    setJournalError(null)
    try {
      const reqId = genRequestId()
      const toUpload = await resizeImageIfNeeded(file)
      const result = await uploadJournalImage(toUpload, reqId, getPairId())
      setJournalUploading(false)
      if (result.success) {
        setJournalRequestId(result.requestId)
        setJournalUploaded(true)
        if (result.dateKey) setJournalDateKey(result.dateKey)
        setLastRequestId(result.requestId)
      } else {
        setJournalError(result.error || 'アップロードに失敗しました')
      }
    } catch (e) {
      setJournalUploading(false)
      setJournalError(e?.message || String(e))
    }
  }

  const handleClick = () => {
    if (isUploading) return
    if (isRecording) stopRecording()
    else startRecording()
  }

  const refreshParentStatus = () => {
    setHasParentAudio(null)
    setIsParentUnseen(false)
    getListenRoleMeta(LISTEN_ROLE_CHILD).then(({ hasAudio, isUnseen }) => {
      setHasParentAudio(hasAudio)
      setIsParentUnseen(!!isUnseen)
    })
  }

  useEffect(() => {
    fetchTodayJournalMeta(getPairId())
      .then(({ hasImage, dateKey }) => {
        setJournalUploaded(!!hasImage)
        if (dateKey) setJournalDateKey(dateKey)
      })
      .catch((e) => setJournalError(e?.message || String(e)))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setShowReloadButton(true), 10000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    getListenRoleMeta(LISTEN_ROLE_CHILD)
      .then(({ hasAudio, isUnseen }) => {
        if (!cancelled) {
          setHasParentAudio(hasAudio)
          setIsParentUnseen(!!isUnseen)
        }
      })
      .catch((e) => setJournalError('初期化: ' + (e?.message || String(e))))
    return () => { cancelled = true }
  }, [])

  // 60秒ポーリング（visible時のみ、送信中/再生中はスキップ）
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (uploadingRef.current || loadingParentRef.current || playingParentRef.current) return
      getListenRoleMeta(LISTEN_ROLE_CHILD).then(({ hasAudio, isUnseen }) => {
        setHasParentAudio(hasAudio)
        setIsParentUnseen(!!isUnseen)
      }).catch((e) => { if (import.meta.env.DEV) console.debug('[HomePage] poll', e?.message) })
    }
    const start = () => {
      if (pollIntervalRef.current != null) return
      pollIntervalRef.current = setInterval(tick, 60 * 1000)
    }
    const stop = () => {
      if (pollIntervalRef.current != null) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
    if (document.visibilityState === 'visible') start()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const handlePlayParent = async () => {
    if (hasParentAudio === false) return

    setIsLoadingParent(true)
    setErrorLine(null)

    const el = parentAudioRef.current
    if (el) {
      el.pause()
      el.src = ''
      el.load()
    }
    if (parentAudioUrl && parentAudioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(parentAudioUrl)
    }
    setParentAudioUrl(null)
    
    const result = await fetchAudioForPlayback(LISTEN_ROLE_CHILD)

    if (result.error) {
      const reqId = result.requestId || 'REQ-XXXX'
      setErrorLine(`うまくいきませんでした。もう一度お試しください（ID: ${reqId}）`)
      if (import.meta.env.DEV) console.error('[HomePage]', result.requestId, result.errorCode, result.error)
      setIsLoadingParent(false)
      if (result.hasAudio === false) {
        setHasParentAudio(false)
        setIsParentUnseen(false)
      }
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
        markSeen(LISTEN_ROLE_CHILD).then(() => setIsParentUnseen(false))
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
      if (analysisFetchTimerRef.current) {
        clearTimeout(analysisFetchTimerRef.current)
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
      <div style={{ position: 'fixed', top: 6, right: 6, zIndex: 9999, fontSize: 10, color: '#999', background: 'rgba(255,255,255,0.8)', padding: '2px 4px', borderRadius: 4 }}>
        Build: {import.meta.env.MODE === 'production' ? 'prod' : import.meta.env.MODE} {import.meta.env.VITE_BUILD_TIME || 'no_time'}
      </div>
      <header style={{ flexShrink: 0, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <time style={{ fontSize: 14, color: '#666' }}>
          {new Date().toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
          })}
        </time>
        <span style={{ fontSize: 11, color: '#999' }}>pairId: {getPairId()}</span>
        {lastRequestId && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' }}>
            REQ: {lastRequestId}
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(lastRequestId).then(() => {}).catch(() => {})}
              style={{ padding: '2px 6px', fontSize: 11, cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: '#fff' }}
            >
              Copy
            </button>
          </span>
        )}
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <section style={{ width: '100%', maxWidth: 320 }}>
          <p style={{ fontSize: 14, color: '#666', margin: '0 0 8px', textAlign: 'center' }}>
            相手（子）の音声
          </p>
          {hasParentAudio === true ? (
            <>
              <p style={{ fontSize: 14, color: '#2e7d32', textAlign: 'center', margin: '0 0 8px', fontWeight: 500 }}>
                届いています
                {isParentUnseen && <span style={{ marginLeft: 4, color: '#f44336' }} title="未再生">●</span>}
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
            <>
              <p style={{ fontSize: 14, color: '#888', textAlign: 'center', margin: '0 0 16px' }}>
                確認中…
              </p>
              {showReloadButton && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  style={{ padding: '6px 12px', fontSize: 12, color: '#4a90d9', border: '1px solid #4a90d9', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                >
                  再読み込み
                </button>
              )}
            </>
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

          {isRecording && isSpeaking && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
              marginTop: 8,
              height: 24,
            }}>
              {[0, 1, 2, 3, 4].map((i) => {
                const jitter = (Math.random() - 0.5) * 0.1
                const scale = Math.max(0.2, Math.min(1.0, level * 8 + jitter))
                return (
                  <span
                    key={i}
                    style={{
                      width: 3,
                      height: '100%',
                      background: '#4a90d9',
                      borderRadius: 2,
                      transform: `scaleY(${scale})`,
                      transformOrigin: 'center',
                      transition: 'transform 0.1s ease-out',
                    }}
                  />
                )
              })}
            </div>
          )}

          {sentAt && (
            <p style={{ fontSize: 16, color: '#2e7d32', fontWeight: 500, margin: '8px 0 0', textAlign: 'center' }}>
              送信しました（{sentAtStr}）
            </p>
          )}

          <p style={{ fontSize: 14, color: '#666', margin: '16px 0 8px', textAlign: 'center' }}>
            ジャーナル写真をアップ
          </p>
          <input
            ref={galleryInputRef}
            type="file"
            accept="*/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleJournalFile(f)
              e.target.value = ''
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleJournalFile(f)
              e.target.value = ''
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={journalUploading}
              onClick={() => {
                if (galleryInputRef.current) {
                  galleryInputRef.current.value = ''
                  galleryInputRef.current.click()
                }
              }}
              style={{
                padding: '8px 14px',
                fontSize: 14,
                color: '#4a90d9',
                background: '#fff',
                border: '1px solid #4a90d9',
                borderRadius: 8,
                cursor: journalUploading ? 'not-allowed' : 'pointer',
              }}
            >
              Filesから選ぶ
            </button>
            <button
              type="button"
              disabled={journalUploading}
              onClick={() => {
                if (cameraInputRef.current) {
                  cameraInputRef.current.value = ''
                  cameraInputRef.current.click()
                }
              }}
              style={{
                padding: '8px 14px',
                fontSize: 14,
                color: '#4a90d9',
                background: '#fff',
                border: '1px solid #4a90d9',
                borderRadius: 8,
                cursor: journalUploading ? 'not-allowed' : 'pointer',
              }}
            >
              カメラで撮る
            </button>
          </div>
          {journalUploaded && (
            <p style={{ fontSize: 13, color: '#2e7d32', margin: '0 0 4px' }}>
              保存済み{journalDateKey ? `（${journalDateKey}）` : ''}
            </p>
          )}
          {(journalRequestId || lastRequestId) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666', marginTop: 4 }}>
              REQ: {journalRequestId || lastRequestId}
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(journalRequestId || lastRequestId).then(() => {}).catch(() => {})}
                style={{ padding: '2px 6px', fontSize: 11, cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: '#fff' }}
              >
                Copy
              </button>
            </span>
          )}
          {journalError && (
            <p style={{ fontSize: 11, color: '#666', margin: '4px 0 0' }}>{journalError}</p>
          )}

          <DailyPromptCard pairId={getPairId()} role={ROLE_PARENT} onTopicChange={handleTopicChange} />

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
        ref={parentAudioRef}
        onEnded={handleParentEnded}
        onPause={() => setIsPlayingParent(false)}
        style={{ display: 'none' }}
      />
    </div>
  )
}
