import { useState, useEffect, useRef, useCallback } from 'react'
import { getDateKey, fetchAudioForPlayback, hasTodayAudio, getListenRoleMeta, markSeen, uploadAudio, getPairId, genRequestId } from '../lib/pairDaily'
import { uploadJournalImage, fetchTodayJournalMeta, fetchJournalViewUrl, resizeImageIfNeeded } from '../lib/journal'
import { getFinalOneLiner, getAnalysisPlaceholder } from '../lib/uiCopy'
import { t } from '../lib/i18n'
import DailyPromptCard from '../components/DailyPromptCard'
import LanguageSwitch from '../components/LanguageSwitch'
import { getIdTokenForApi } from '../lib/firebase'
import { formatBuildTimeLocal } from '../lib/dateFormat'
import { useAudioLevel } from '../lib/useAudioLevel'

export default function PairDailyPage({ lang = 'ja' }) {
  const [today, setToday] = useState('')
  const [dateKey, setDateKey] = useState(getDateKey())
  const [hasAudio, setHasAudio] = useState(null)
  const [isChildUnseen, setIsChildUnseen] = useState(false)
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
  const [commentText, setCommentText] = useState('')
  const [commentStatus, setCommentStatus] = useState('idle')
  const [lastRequestId, setLastRequestId] = useState(null)
  const [showReloadButton, setShowReloadButton] = useState(false)
  const [journalUploading, setJournalUploading] = useState(false)
  const [journalRequestId, setJournalRequestId] = useState(null)
  const [journalUploaded, setJournalUploaded] = useState(false)
  const [journalDateKey, setJournalDateKey] = useState(null)
  const [journalError, setJournalError] = useState(null)
  const [parentJournalUrl, setParentJournalUrl] = useState(null)
  const [parentJournalLoading, setParentJournalLoading] = useState(false)
  const [parentJournalError, setParentJournalError] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [photos, setPhotos] = useState([])
  const [dailyPhotoLimitMessage, setDailyPhotoLimitMessage] = useState(null)
  const audioRef = useRef(null)
  const journalGalleryInputRef = useRef(null)
  const journalCameraInputRef = useRef(null)
  const genericGalleryInputRef = useRef(null)
  const genericCameraInputRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const recordStartRef = useRef(null)
  const oneLinerTimerRef = useRef(null)
  const topicRef = useRef(null)
  const analysisTimerRef = useRef(null)
  const analysisFetchTimerRef = useRef(null)
  const analysisReqSeqRef = useRef(0)
  const { level, isSpeaking, start: startAudioLevel, stop: stopAudioLevel } = useAudioLevel()

  const ROLE_CHILD = 'child'
  const LISTEN_ROLE_PARENT = 'parent'

  const handleTopicChange = useCallback((topic) => {
    setDailyTopic(topic)
    topicRef.current = topic
  }, [])

  const refreshStatus = () => {
    setHasAudio(null)
    setIsChildUnseen(false)
    getListenRoleMeta(LISTEN_ROLE_PARENT).then(({ hasAudio, isUnseen }) => {
      setHasAudio(hasAudio)
      setIsChildUnseen(!!isUnseen)
    })
  }

  const refreshComment = useCallback(async () => {
    const idToken = await getIdTokenForApi()
    if (!idToken) return
    
    setCommentStatus('loading')
    try {
      const currentDateKey = dateKey || getDateKey()
      const res = await fetch(`/api/analysis-comment?pairId=${getPairId()}&dateKey=${currentDateKey}&role=${ROLE_CHILD}`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      })
      
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.aiText) {
          setCommentText(data.aiText)
          setCommentStatus('done')
        } else if (data.success && data.text) {
          setCommentText(data.text)
          setCommentStatus('done')
        } else {
          setCommentText('')
          setCommentStatus('done')
        }
      } else if (res.status === 404 || res.status === 401) {
        // 404/401は静かにfail
        setCommentText('')
        setCommentStatus('done')
      } else {
        console.warn('[PairDailyPage] refreshComment error:', { status: res.status })
        setCommentText('')
        setCommentStatus('done')
      }
    } catch (e) {
      console.warn('[PairDailyPage] refreshComment exception:', e)
      setCommentText('')
      setCommentStatus('done')
    }
  }, [dateKey])

  const handleJournalFile = async (file, kind = 'journal_image') => {
    if (!file || journalUploading) return
    if (typeof file.type !== 'string' || !file.type.startsWith('image/')) {
      setJournalError(t(lang, 'selectImage'))
      return
    }
    // 動作確認: ジャーナルは常に1枚、2回目はconfirmで上書き確認
    if (kind === 'journal_image' && journalUploaded && !window.confirm(t(lang, 'journalOverwriteConfirm'))) return
    // 動作確認: 4枚目はアップロード拒否して画面にグレー文字で表示
    if (kind === 'generic_image') {
      const myCount = photos.filter((p) => p.role === ROLE_CHILD).length
      if (myCount >= 3) {
        setDailyPhotoLimitMessage(t(lang, 'dailyPhotoLimit'))
        return
      }
    }
    setJournalUploading(true)
    setJournalError(null)
    try {
      const reqId = genRequestId()
      const toUpload = await resizeImageIfNeeded(file)
      const result = await uploadJournalImage(toUpload, reqId, getPairId(), ROLE_CHILD, kind)
      setJournalUploading(false)
      if (result.success) {
        console.log('[upload success]', { requestId: reqId, kind, result: { success: result.success, requestId: result.requestId, dateKey: result.dateKey, storagePath: result.storagePath } })
        setJournalRequestId(result.requestId)
        if (kind === 'journal_image') {
          setJournalUploaded(true)
          if (result.dateKey) setJournalDateKey(result.dateKey)
        }
        if (kind === 'generic_image') {
          setDailyPhotoLimitMessage(null)
          const doRefresh = () => fetchTodayJournalMeta(getPairId(), ROLE_CHILD).then((r) => setPhotos(r.photos ?? []))
          doRefresh()
          setTimeout(doRefresh, 400)
        }
        setLastRequestId(result.requestId)
      } else {
        if (result.errorCode === 'daily_photos_limit' || (result.error && result.error.includes('limit'))) {
          setDailyPhotoLimitMessage(t(lang, 'dailyPhotoLimit'))
        } else {
          const errMsg = result.errorCode === 'payload_too_large'
            ? t(lang, 'uploadErrorSize')
            : result.errorCode === 'invalid_image_type'
              ? t(lang, 'uploadErrorType')
              : result.errorCode === 'network'
                ? t(lang, 'uploadErrorNetwork')
                : (result.error || t(lang, 'uploadError'))
          setJournalError(errMsg)
        }
      }
    } catch (e) {
      setJournalUploading(false)
      setJournalError(e?.message || String(e))
    }
  }

  useEffect(() => {
    fetchTodayJournalMeta(getPairId(), 'child')
      .then(({ hasImage, dateKey, photos: p }) => {
        setJournalUploaded(!!hasImage)
        if (dateKey) setJournalDateKey(dateKey)
        setPhotos(Array.isArray(p) ? p : [])
      })
      .catch((e) => setJournalError(t(lang, 'initError', { msg: e?.message || String(e) })))
  }, [lang])

  const fetchParentJournal = useCallback(async () => {
    setParentJournalLoading(true)
    setParentJournalError(null)
    try {
      const url = await fetchJournalViewUrl(getPairId(), 'parent')
      setParentJournalUrl(url)
    } catch (e) {
      setParentJournalError(e?.message || String(e))
      setParentJournalUrl(null)
    } finally {
      setParentJournalLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchParentJournal()
  }, [fetchParentJournal])

  useEffect(() => {
    const d = new Date()
    setToday(d.toLocaleDateString(lang === 'en' ? 'en-US' : 'ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }))
    const currentDateKey = getDateKey()
    setDateKey(currentDateKey)
    let cancelled = false
    getListenRoleMeta(LISTEN_ROLE_PARENT).then(({ hasAudio, isUnseen }) => {
      if (!cancelled) {
        setHasAudio(hasAudio)
        setIsChildUnseen(!!isUnseen)
      }
    })
    return () => { cancelled = true }
  }, [lang])

  useEffect(() => {
    const t = setTimeout(() => setShowReloadButton(true), 10000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    refreshComment()
  }, [refreshComment])

  const handlePlay = async () => {
    if (hasAudio === false) return

    setIsLoading(true)
    setErrorLine(null)

    const el = audioRef.current
    if (el) {
      el.pause()
      el.src = ''
      el.load()
    }
    if (audioUrl && audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioUrl(null)
    
    const result = await fetchAudioForPlayback(LISTEN_ROLE_PARENT)

    if (result.error) {
      const reqId = result.requestId || 'REQ-XXXX'
      setErrorLine(t(lang, 'uploadFailed', { id: reqId }))
      if (import.meta.env.DEV) console.error('[PairDaily]', result.requestId, result.errorCode, result.error)
      setIsLoading(false)
      if (result.hasAudio === false) {
        setHasAudio(false)
        setIsChildUnseen(false)
      }
      return
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
        markSeen(LISTEN_ROLE_PARENT).then(() => setIsChildUnseen(false))
      }
    } catch (_) {
      setErrorLine(t(lang, 'playFailed'))
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
          setErrorLine(t(lang, 'tryAgain'))
          return
        }

        const reqId = genRequestId()
        setLastRequestId(reqId)
        setIsUploading(true)
        const durationSec = recordStartRef.current
          ? Math.max(1, Math.min(6000, Math.round((Date.now() - recordStartRef.current) / 1000)))
          : null
        const result = await uploadAudio(blob, ROLE_CHILD, getPairId(), getDateKey(), reqId)

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
            const finalMessage = getFinalOneLiner(topic, ROLE_CHILD)
            setOneLiner(finalMessage)
            setOneLinerStage('final')
            oneLinerTimerRef.current = null
          }, 300)
          // さらに700ms後（送信成功から1000ms後）に解析コメントを表示
          analysisTimerRef.current = setTimeout(() => {
            const topic = topicRef.current
            const placeholder = getAnalysisPlaceholder(topic, ROLE_CHILD)
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
                  role: ROLE_CHILD,
                  topic: topicRef.current,
                  durationSec: durationSec,
                }),
              })
            } catch (e) {
              // エラーは無視（UIを止めない）
            }
          })()

          // 非同期でAI解析を開始（awaitしてsuccess確認後、refreshCommentを呼ぶ）
          ;(async () => {
            try {
              const idToken = await getIdTokenForApi()
              if (!idToken) return
              
              // uploadAudioのレスポンスからversionを取得
              const sourceVersion = result?.version
              if (!sourceVersion) {
                console.error('[PairDailyPage] uploadAudio result missing version, skipping analyze')
                return
              }
              
              const r = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                  pairId: getPairId(),
                  dateKey: dateKeyForThisUpload,
                  role: ROLE_CHILD,
                  sourceVersion,
                  version: sourceVersion, // 互換性のため
                }),
              })
              const j = await r.json().catch(() => null)
              if (j?.success) {
                // Firestore反映ラグ対策で300ms待ってからrefreshCommentを呼ぶ
                setTimeout(() => refreshComment(), 300)
              }
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
                  
                  const res = await fetch(`/api/analysis-comment?pairId=${getPairId()}&dateKey=${dateKeyForThisUpload}&role=${ROLE_CHILD}`, {
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
          setErrorLine(t(lang, 'uploadFailed', { id: reqId }))
          if (import.meta.env.DEV) console.error('[PairDaily]', result.requestId, result.errorCode, result.error)
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
      setErrorLine(t(lang, 'micDenied'))
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

  const handleRecordClick = () => {
    if (isUploading) return
    if (isRecording) stopRecording()
    else startRecording()
  }

  const sentAtStr = sentAt
    ? sentAt.toLocaleTimeString(lang === 'en' ? 'en-US' : 'ja-JP', { hour: '2-digit', minute: '2-digit' })
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
        Build: {import.meta.env.MODE === 'production' ? 'prod' : import.meta.env.MODE} {formatBuildTimeLocal()}
      </div>
      <header style={{ flexShrink: 0, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
        <time style={{ fontSize: 14, color: '#666' }}>{today || '...'}</time>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: '#888' }}>
          {hasAudio === true ? t(lang, 'voiceReceivedToday') : hasAudio === false ? t(lang, 'notYetOkToday') : t(lang, 'checking')}
        </p>
        </div>
        <LanguageSwitch lang={lang} variant="pair" />
        <span style={{ fontSize: 11, color: '#999' }}>pairId: {getPairId()}</span>
        {lastRequestId && (
          <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12, color: '#666' }}>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>REQ: {lastRequestId}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(lastRequestId).then(() => {}).catch(() => {})}
              style={{ flex: '0 0 auto', padding: '2px 6px', fontSize: 11, cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: '#fff' }}
            >
              Copy
            </button>
          </span>
        )}
      </header>

      <main className="page-content page" style={{ flex: 1, maxWidth: 320, margin: '0 auto', width: '100%' }}>
        {/* (1) 相手の録音（聞く） */}
        <section className="card" style={{ width: '100%' }}>
          <h2 className="cardHead">🎧 {t(lang, 'partnerRecordingListen')}</h2>
          {hasAudio === true ? (
            <>
              <p style={{ fontSize: 14, color: '#2e7d32', textAlign: 'center', margin: '0 0 8px', fontWeight: 500 }}>
                {t(lang, 'received')}
                {isChildUnseen && <span style={{ marginLeft: 4, color: '#f44336' }} title={lang === 'en' ? 'Unplayed' : '未再生'}>●</span>}
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
                {isLoading ? t(lang, 'loading') : isPlaying ? t(lang, 'playing') : t(lang, 'play')}
              </button>
            </>
          ) : hasAudio === false ? (
            <p style={{ fontSize: 14, color: '#888', textAlign: 'center', margin: '0 0 16px' }}>
              {t(lang, 'notReceivedYetOk')}
            </p>
          ) : (
            <>
              <p style={{ fontSize: 14, color: '#888', textAlign: 'center', margin: '0 0 16px' }}>
                {t(lang, 'checking')}
              </p>
              {showReloadButton && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  style={{ padding: '6px 12px', fontSize: 12, color: '#4a90d9', border: '1px solid #4a90d9', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                >
                  {t(lang, 'reload')}
                </button>
              )}
            </>
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
                marginBottom: 0,
              }}
            >
              {t(lang, 'refresh')}
            </button>
          )}
        </section>

        {/* (2) 自分の録音（録る/送る） */}
        <section className="card" style={{ width: '100%' }}>
          <h2 className="cardHead">🎙 {t(lang, 'myRecordingRecordSend')}</h2>
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
            {isUploading ? t(lang, 'sending') : isRecording ? t(lang, 'recording') : t(lang, 'record')}
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
              {t(lang, 'sentAt', { time: sentAtStr })}
            </p>
          )}

          <DailyPromptCard pairId={getPairId()} role={ROLE_CHILD} onTopicChange={handleTopicChange} lang={lang} />

          {oneLinerVisible && oneLiner && (
            <div style={{
              width: '100%',
              marginTop: 12,
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

          {(analysisVisible && analysisComment) || commentText ? (
            <div style={{
              width: '100%',
              marginTop: 8,
              padding: '8px 12px',
              fontSize: 12,
              color: '#666',
              textAlign: 'center',
              lineHeight: 1.4,
              whiteSpace: 'pre-line',
            }}>
              {commentText || (analysisVisible ? analysisComment : '')}
            </div>
          ) : null}
        </section>

        {/* (3) ジャーナル（解析・共有）※1日1枚 */}
        <section className="card card-journal" style={{ width: '100%' }}>
          <h2 className="cardHead">📝 {t(lang, 'journalSharedAi')}</h2>
          <p style={{ fontSize: 11, color: '#666', margin: '0 0 12px', lineHeight: 1.4 }}>{t(lang, 'journalNotice')}</p>
          <p className="title">{t(lang, 'parentJournalToday')}</p>
          {parentJournalLoading && (
            <p className="sub" style={{ margin: '0 0 8px' }}>{t(lang, 'loading')}</p>
          )}
          {!parentJournalLoading && parentJournalUrl && (
            <>
              <div className="thumbWrap" style={{ display: 'inline-block' }}>
                <img
                  src={parentJournalUrl}
                  alt={t(lang, 'parentJournalAlt')}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPreviewOpen(true)}
                  onKeyDown={(e) => e.key === 'Enter' && setPreviewOpen(true)}
                  className="photo-thumb"
                  style={{ cursor: 'pointer', objectFit: 'cover' }}
                />
                <span className="thumbBadge">{t(lang, 'roleLabelParent')}</span>
              </div>
              <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0', textAlign: 'center' }}>{t(lang, 'tapToEnlarge')}</p>
            </>
          )}
          {!parentJournalLoading && !parentJournalUrl && !parentJournalError && (
            <p className="sub" style={{ margin: '0 0 8px' }}>{t(lang, 'notUploadedYet')}</p>
          )}
          {parentJournalError && (
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px', textAlign: 'center' }}>{parentJournalError}</p>
          )}
          <button
            type="button"
            onClick={fetchParentJournal}
            disabled={parentJournalLoading}
            style={{ padding: '4px 12px', fontSize: 12, color: '#4a90d9', background: 'transparent', border: '1px solid #4a90d9', borderRadius: 6, cursor: parentJournalLoading ? 'wait' : 'pointer', marginTop: 4, marginBottom: 12 }}
          >
            {t(lang, 'refresh')}
          </button>

          <p className="title" style={{ marginTop: 12 }}>{t(lang, 'myJournal')}</p>
          <input
            ref={journalGalleryInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleJournalFile(f, 'journal_image')
              e.target.value = ''
            }}
          />
          <input
            ref={journalCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleJournalFile(f, 'journal_image')
              e.target.value = ''
            }}
          />
          <div className="btnGrid" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="btn"
              disabled={journalUploading}
              onClick={() => {
                if (journalGalleryInputRef.current) {
                  journalGalleryInputRef.current.value = ''
                  journalGalleryInputRef.current.click()
                }
              }}
              style={{ borderColor: '#4a90d9', color: '#4a90d9', background: '#fff' }}
            >
              {t(lang, 'gallery')}
            </button>
            <button
              type="button"
              className="btn btnPrimary"
              disabled={journalUploading}
              onClick={() => {
                if (journalCameraInputRef.current) {
                  journalCameraInputRef.current.value = ''
                  journalCameraInputRef.current.click()
                }
              }}
              style={{ background: journalUploading ? '#999' : '#4a90d9', borderColor: journalUploading ? '#999' : '#4a90d9' }}
            >
              {t(lang, 'camera')}
            </button>
          </div>
          {journalUploaded && (
            <p className="sub" style={{ color: '#2e7d32', margin: '0 0 4px' }}>
              {journalDateKey ? t(lang, 'savedWithDate', { date: journalDateKey }) : t(lang, 'saved')}
            </p>
          )}
          {(journalRequestId || lastRequestId) && (
            <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12, color: '#666', marginTop: 4 }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>REQ: {journalRequestId || lastRequestId}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(journalRequestId || lastRequestId).then(() => {}).catch(() => {})}
                style={{ flex: '0 0 auto', padding: '2px 6px', fontSize: 11, cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: '#fff' }}
              >
                {t(lang, 'copy')}
              </button>
            </span>
          )}
          {journalError && (
            <p style={{ fontSize: 11, color: '#c00', margin: '4px 0 0' }}>{journalError}</p>
          )}
        </section>

        {/* (4) 日常写真（共有）※最大3枚 */}
        <section className="card card-photos" style={{ width: '100%' }}>
          <h2 className="cardHead">📷 {t(lang, 'dailyPhotosShared')}</h2>
          <p className="title">{t(lang, 'todayPhotosCount', { count: photos.filter((p) => p.role === ROLE_CHILD).length })}</p>
          <input
            ref={genericGalleryInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f && typeof f.type === 'string' && f.type.startsWith('image/')) handleJournalFile(f, 'generic_image')
              e.target.value = ''
            }}
          />
          <input
            ref={genericCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleJournalFile(f, 'generic_image')
              e.target.value = ''
            }}
          />
          <div className="btnGrid" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="btn"
              disabled={journalUploading}
              onClick={() => {
                if (genericGalleryInputRef.current) {
                  genericGalleryInputRef.current.value = ''
                  genericGalleryInputRef.current.click()
                }
              }}
              style={{ borderColor: '#4a90d9', color: '#4a90d9', background: '#fff' }}
            >
              {t(lang, 'gallery')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={journalUploading}
              onClick={() => {
                if (genericCameraInputRef.current) {
                  genericCameraInputRef.current.value = ''
                  genericCameraInputRef.current.click()
                }
              }}
              style={{ borderColor: '#4a90d9', color: '#4a90d9', background: '#fff' }}
            >
              {t(lang, 'camera')}
            </button>
          </div>
          {dailyPhotoLimitMessage && (
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 8px' }}>{dailyPhotoLimitMessage}</p>
          )}
          {photos.length > 0 &&
          (() => {
            const parentPhotos = photos.filter((p) => p.role === 'parent')
            const childPhotos = photos.filter((p) => p.role === 'child')
            const renderStrip = (list) => (
              <div className="photo-strip">
                {list.slice(0, 6).map((ph, i) => (
                  <div key={ph.storagePath + String(i)} className="thumbWrap">
                    <img src={ph.url || ''} alt="" className="photo-thumb" />
                  </div>
                ))}
              </div>
            )
            return (
              <>
                {parentPhotos.length > 0 && (
                  <div className="photo-row">
                    <div className="photo-row-title">{t(lang, 'photoFromParent')}</div>
                    {renderStrip(parentPhotos)}
                  </div>
                )}
                {childPhotos.length > 0 && (
                  <div className="photo-row">
                    <div className="photo-row-title">{t(lang, 'photoFromChild')}</div>
                    {renderStrip(childPhotos)}
                  </div>
                )}
              </>
            )
          })()}
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

      {previewOpen && parentJournalUrl && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setPreviewOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setPreviewOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
            cursor: 'pointer',
          }}
        >
          <img
            src={parentJournalUrl}
            alt={t(lang, 'parentJournalZoomAlt')}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, pointerEvents: 'none' }}
          />
        </div>
      )}
    </div>
  )
}
