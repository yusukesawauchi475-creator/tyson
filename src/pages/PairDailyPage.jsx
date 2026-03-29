import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDateKey, fetchAudioForPlayback, hasTodayAudio, getListenRoleMeta, markSeen, uploadAudio, getPairId, genRequestId, getStreak, updateStreak, generatePairId } from '../lib/pairDaily'
import { uploadJournalImage, fetchTodayJournalMeta, fetchJournalViewUrl, resizeImageIfNeeded } from '../lib/journal'
import { getFinalOneLiner, getAnalysisPlaceholder } from '../lib/uiCopy'
import { t } from '../lib/i18n'
import DailyPromptCard, { getCountry, cycleCountry } from '../components/DailyPromptCard'
import LanguageSwitch from '../components/LanguageSwitch'
import { getIdTokenForApi, auth, isFirebaseConfigured } from '../lib/firebase'
import { getAuth } from 'firebase/auth'
import { formatDeployedAtLocal, getBuildHash } from '../lib/dateFormat'
import { useAudioLevel } from '../lib/useAudioLevel'
import UploadErrorModal from '../components/UploadErrorModal'
import WeeklySummary from '../components/WeeklySummary'
import OneYearAgoBanner from '../components/OneYearAgoBanner'
import FamilyInsightCard from '../components/FamilyInsightCard'

export default function PairDailyPage({ lang = 'ja', onChangeRole, role = 'child' }) {
  const [today, setToday] = useState('')
  const [streakCount, setStreakCount] = useState(null)
  const [dateKey, setDateKey] = useState(getDateKey())
  const [hasAudio, setHasAudio] = useState(null)
  const [debugAuthInfo, setDebugAuthInfo] = useState('...')
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
  const [toastMsg, setToastMsg] = useState(null)
  const [journalUploading, setJournalUploading] = useState(false)
  const [journalRequestId, setJournalRequestId] = useState(null)
  const [journalUploaded, setJournalUploaded] = useState(false)
  const [journalDateKey, setJournalDateKey] = useState(null)
  const [journalError, setJournalError] = useState(null)
  const [myJournalUrl, setMyJournalUrl] = useState(null)
  const [myJournalLoading, setMyJournalLoading] = useState(false)
  const [myJournalError, setMyJournalError] = useState(null)
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
  const [uploadErrorModal, setUploadErrorModal] = useState({ visible: false, message: '', onRetry: null })
  const lastFailedPhotoRef = useRef(null)

  const navigate = useNavigate()
  const ROLE_CHILD = role
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
          fetchTodayJournalMeta(getPairId(), ROLE_CHILD).then((r) => {
            setJournalUploaded(!!r.hasImage)
            if (r.dateKey) setJournalDateKey(r.dateKey)
          })
          fetchMyJournal()
          setTimeout(() => fetchMyJournal(), 600)
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
          lastFailedPhotoRef.current = { file, kind }
          setUploadErrorModal({
            visible: true,
            message: errMsg,
            onRetry: () => {
              setUploadErrorModal({ visible: false, message: '', onRetry: null })
              if (lastFailedPhotoRef.current) handleJournalFile(lastFailedPhotoRef.current.file, lastFailedPhotoRef.current.kind)
            },
          })
        }
      }
    } catch (e) {
      setJournalUploading(false)
      setJournalError(e?.message || String(e))
      setUploadErrorModal({
        visible: true,
        message: e?.message || String(e),
        onRetry: null,
      })
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

  const fetchMyJournal = useCallback(async () => {
    setMyJournalLoading(true)
    setMyJournalError(null)
    try {
      const url = await fetchJournalViewUrl(getPairId(), 'child')
      setMyJournalUrl(url)
    } catch (e) {
      setMyJournalError(e?.message || String(e))
      setMyJournalUrl(null)
    } finally {
      setMyJournalLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMyJournal()
  }, [fetchMyJournal])

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
    getStreak(getPairId()).then(({ count }) => setStreakCount(count))
  }, [])

  // デバッグ用: getIdTokenForApi の結果を UI に表示
  useEffect(() => {
    getIdTokenForApi().then(token => {
      setDebugAuthInfo(token ? `OK(${token.slice(-6)})` : 'NULL')
    }).catch(e => setDebugAuthInfo('ERR:' + e?.message?.slice(0, 20)))
  }, [])

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
          // 親と子の両方が録音済みならstreakを更新
          if (hasAudio === true) {
            updateStreak(getPairId()).then(({ success, count }) => {
              if (success) setStreakCount(count)
            })
          }
          // 一言表示開始（0-200msで即時表示）
          setOneLiner(t(lang, 'uploadSuccessThanks'))
          setOneLinerStage('immediate')
          setOneLinerVisible(true)
          // 300ms後にtopicに応じたテンプレに差し替え
          oneLinerTimerRef.current = setTimeout(() => {
            const topic = topicRef.current
            const finalMessage = getFinalOneLiner(lang, topic, ROLE_CHILD)
            setOneLiner(finalMessage)
            setOneLinerStage('final')
            oneLinerTimerRef.current = null
          }, 300)
          // さらに700ms後（送信成功から1000ms後）に解析コメントを表示
          analysisTimerRef.current = setTimeout(() => {
            const topic = topicRef.current
            const placeholder = getAnalysisPlaceholder(lang, topic, ROLE_CHILD)
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
          setUploadErrorModal({
            visible: true,
            message: result.error || result.errorCode || '',
            onRetry: () => {
              setUploadErrorModal({ visible: false, message: '', onRetry: null })
              startRecording()
            },
          })
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

  const handleShare = async () => {
    const pairId = getPairId()
    const url = `https://tyson-two.vercel.app/#/?pairId=${encodeURIComponent(pairId)}`
    const text = lang === 'en'
      ? "Let's exchange voices every day on Hum. Listen to today's message 👋"
      : 'Humで毎日声を交換しよう。今日のメッセージを聞いてね 👋'
    if (navigator.share) {
      try { await navigator.share({ text, url }) } catch (_) {}
    } else {
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`)
        alert(lang === 'en' ? 'Link copied!' : 'リンクをコピーしました')
      } catch (_) {
        alert(lang === 'en' ? 'Copy failed' : 'コピーに失敗しました')
      }
    }
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
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', background: 'var(--color-bg)', color: 'var(--color-text)', paddingBottom: 72, overflow: 'hidden' }}>
      {/* Gradient Header */}
      <header style={{ flexShrink: 0, background: 'linear-gradient(135deg, #FF80C0 0%, #C080FF 50%, #80C0FF 100%)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="Hum" width={36} height={36} style={{ borderRadius: 10, objectFit: 'cover' }} />
          <span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>Hum</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onChangeRole && (
            <button type="button" onClick={onChangeRole} style={{ padding: '4px 10px', fontSize: 11, color: '#fff', background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 20, cursor: 'pointer', fontWeight: 600 }}>
              {lang === 'en' ? 'Switch' : '変更'}
            </button>
          )}
          <button type="button" onClick={() => { cycleCountry(); window.location.reload() }} style={{ padding: '4px 10px', fontSize: 11, color: '#fff', background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 20, cursor: 'pointer', fontWeight: 600 }}>
            {getCountry().toUpperCase()}
          </button>
          {streakCount > 0 && (
            <span style={{ padding: '4px 12px', fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', borderRadius: 20 }}>
              {streakCount}
            </span>
          )}
          {getPairId() === 'demo' && (
            <button type="button" onClick={async () => {
              const newId = generatePairId()
              const url = `https://tyson-two.vercel.app/#/?pairId=${encodeURIComponent(newId)}`
              const text = lang === 'en' ? `Join me on Hum with this link! Your pair ID: ${newId}` : `Humで一緒に使おう！あなた専用リンク（ID: ${newId}）`
              try { if (navigator.share) { await navigator.share({ title: 'Hum', text, url }) } else { await navigator.clipboard.writeText(`${text}\n${url}`); alert(lang === 'en' ? 'Link copied!' : 'リンクをコピーしました') } } catch (_) {}
            }} style={{ padding: '4px 10px', fontSize: 11, color: '#fff', background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 20, cursor: 'pointer', fontWeight: 600 }}>
              {lang === 'en' ? 'New' : '新規'}
            </button>
          )}
        </div>
      </header>

      {/* Date bar */}
      <div style={{ background: '#F8F0FF', borderBottom: '1px solid #EEE8FF', padding: '8px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' }}>
        <time style={{ fontSize: 11, color: '#8070A0', fontWeight: 600 }}>{today || '...'}</time>
        <FamilyInsightCard lang={lang} />
      </div>

      <main className="page-content page" style={{ flex: 1, maxWidth: 480, margin: '0 auto', width: '100%', paddingTop: 14 }}>
        <WeeklySummary lang={lang} />

        {/* (1) Receive card */}
        <section style={{ width: '100%', background: '#E8FFF4', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(48,168,112,0.06)', overflow: 'hidden' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#30A870', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(lang, 'partnerRecordingListen')}</p>
          {hasAudio === true ? (
            <>
              <p style={{ fontSize: 14, color: '#1A6040', fontWeight: 700, margin: '0 0 10px' }}>
                {t(lang, 'received')}
                {isChildUnseen && <span style={{ marginLeft: 6, color: '#E04040' }} title={lang === 'en' ? 'Unplayed' : '未再生'}>●</span>}
              </p>
              <button type="button" onClick={handlePlay} disabled={isLoading} style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, color: '#fff', background: isLoading ? '#B0A0C8' : 'linear-gradient(160deg,#40D890,#18B868)', border: 'none', borderRadius: 14, cursor: isLoading ? 'wait' : 'pointer', boxShadow: isLoading ? 'none' : '0 5px 0 #109848', marginBottom: 10 }}>
                {isLoading ? t(lang, 'loading') : isPlaying ? t(lang, 'playing') : t(lang, 'play')}
              </button>
            </>
          ) : hasAudio === false ? (
            <p style={{ fontSize: 14, color: '#1A6040', margin: '0 0 10px', opacity: 0.6 }}>{t(lang, 'notReceivedYetOk')}</p>
          ) : (
            <>
              <p style={{ fontSize: 14, color: '#1A6040', margin: '0 0 10px', opacity: 0.6 }}>{t(lang, 'checking')}</p>
              {showReloadButton && (
                <button type="button" onClick={() => window.location.reload()} style={{ padding: '6px 14px', fontSize: 12, color: '#30A870', border: '1.5px solid #30A870', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>{t(lang, 'reload')}</button>
              )}
            </>
          )}
          {hasAudio !== null && (
            <button type="button" onClick={refreshStatus} style={{ padding: '5px 14px', fontSize: 12, color: '#30A870', background: 'transparent', border: '1.5px solid #30A870', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>{t(lang, 'refresh')}</button>
          )}
        </section>

        {/* (2) Send card */}
        <section style={{ width: '100%', background: '#FFF4E8', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(208,112,48,0.06)', overflow: 'hidden' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#D07030', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(lang, 'myRecordingRecordSend')}</p>
          <button type="button" onClick={handleRecordClick} disabled={isUploading} style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, color: '#fff', background: isUploading ? '#B0A0C8' : isRecording ? 'linear-gradient(160deg,#FF4040,#C02020)' : 'linear-gradient(160deg,#FF8848,#F04818)', border: 'none', borderRadius: 14, cursor: isUploading ? 'wait' : 'pointer', boxShadow: isUploading ? 'none' : isRecording ? '0 5px 0 #901010' : '0 5px 0 #C03010' }}>
            {isUploading ? t(lang, 'sending') : isRecording ? t(lang, 'recording') : t(lang, 'record')}
          </button>

          {isRecording && isSpeaking && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 8, height: 24 }}>
              {[0, 1, 2, 3, 4].map((i) => {
                const jitter = (Math.random() - 0.5) * 0.1
                const scale = Math.max(0.2, Math.min(1.0, level * 8 + jitter))
                return <span key={i} style={{ width: 3, height: '100%', background: '#FF8848', borderRadius: 2, transform: `scaleY(${scale})`, transformOrigin: 'center', transition: 'transform 0.1s ease-out' }} />
              })}
            </div>
          )}

          {sentAt && (
            <p style={{ fontSize: 14, color: '#804020', fontWeight: 600, margin: '10px 0 0', textAlign: 'center' }}>
              {t(lang, 'sentAt', { time: sentAtStr })}
            </p>
          )}

          <DailyPromptCard pairId={getPairId()} role={ROLE_CHILD} onTopicChange={handleTopicChange} lang={lang} />

          {oneLinerVisible && oneLiner && (
            <div style={{ width: '100%', marginTop: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.55)', borderRadius: 10, fontSize: 14, color: '#804020', textAlign: 'center', lineHeight: 1.5 }}>{oneLiner}</div>
          )}
          {(analysisVisible && analysisComment) || commentText ? (
            <div style={{ width: '100%', marginTop: 8, padding: '8px 12px', fontSize: 12, color: '#B08050', textAlign: 'center', lineHeight: 1.4, whiteSpace: 'pre-line' }}>
              {commentText || (analysisVisible ? analysisComment : '')}
            </div>
          ) : null}
        </section>

        {/* (3) Photos card */}
        <section style={{ width: '100%', background: '#F0EEFF', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(112,80,192,0.06)', overflow: 'hidden' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#7050C0', margin: '0 0 10px' }}>
            📷 {lang === 'en' ? "Today's Photos" : '今日の写真'}　<span style={{ fontWeight: 500, color: '#8070A0' }}>{photos.filter((p) => p.role === ROLE_CHILD).length}/3{lang === 'en' ? '' : '枚'}</span>
          </p>

          <input ref={genericGalleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f && typeof f.type === 'string' && f.type.startsWith('image/')) handleJournalFile(f, 'generic_image'); e.target.value = '' }} />
          <input ref={genericCameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJournalFile(f, 'generic_image'); e.target.value = '' }} />

          {/* Thumbnails + add box */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {photos.slice(0, 6).map((ph, i) => (
              <button key={ph.storagePath + String(i)} type="button" onClick={() => navigate(lang === 'en' ? '/album/eng' : '/album', { state: { scrollToDate: dateKey } })} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 11, overflow: 'hidden', flexShrink: 0 }} aria-label={lang === 'en' ? 'View in album' : 'アルバムで見る'}>
                <img src={ph.url || ''} alt="" width={52} height={52} style={{ width: 52, height: 52, objectFit: 'cover', display: 'block', borderRadius: 11 }} />
              </button>
            ))}
            {photos.filter((p) => p.role === ROLE_CHILD).length < 3 && (
              <button type="button" onClick={() => { if (genericGalleryInputRef.current) { genericGalleryInputRef.current.value = ''; genericGalleryInputRef.current.click() } }} disabled={journalUploading} style={{ width: 52, height: 52, border: '2px dashed #9070C8', borderRadius: 11, background: 'rgba(112,80,208,0.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, cursor: 'pointer', padding: 0 }}>
                <span style={{ fontSize: 20, lineHeight: 1 }}>📷</span>
                <span style={{ fontSize: 8, color: '#9070C8', fontWeight: 600, lineHeight: 1 }}>{lang === 'en' ? 'Add' : '追加'}</span>
              </button>
            )}
          </div>

          {dailyPhotoLimitMessage && <p style={{ fontSize: 12, color: '#B0A0C8', margin: '0 0 8px' }}>{dailyPhotoLimitMessage}</p>}

          <button type="button" disabled={journalUploading} onClick={() => { if (genericGalleryInputRef.current) { genericGalleryInputRef.current.value = ''; genericGalleryInputRef.current.click() } }} style={{ width: '100%', padding: 13, fontSize: 14, fontWeight: 700, color: '#fff', background: 'linear-gradient(160deg,#B890F8,#8058D0)', border: 'none', borderRadius: 14, cursor: 'pointer', boxShadow: '0 4px 0 #5838A8' }}>
            {lang === 'en' ? '📷 Add Photo' : '📷 写真を追加する'}
          </button>

          <button type="button" onClick={() => navigate(lang === 'en' ? '/album/eng' : '/album', { state: { scrollToDate: dateKey } })} style={{ width: '100%', marginTop: 10, padding: 11, fontSize: 13, fontWeight: 600, color: '#7050C0', background: 'rgba(112,80,208,0.1)', border: '1.5px solid #9070C8', borderRadius: 12, cursor: 'pointer', textAlign: 'center' }}>
            {lang === 'en' ? '🖼 View past photos' : '🖼 過去の写真を見る'}
          </button>
        </section>

        <OneYearAgoBanner lang={lang} />

        {/* (4) Journal card - HIDDEN */}
        {false && <section style={{ width: '100%', background: '#F0EEFF', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(112,80,192,0.06)', overflow: 'hidden' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(lang, 'journalSharedAi')}</p>
          <p style={{ fontSize: 11, color: '#8070A0', margin: '0 0 12px', lineHeight: 1.4 }}>{t(lang, 'journalNotice')}</p>
          <p style={{ fontSize: 13, color: '#7050C0', margin: '0 0 6px', fontWeight: 600 }}>{t(lang, 'myJournal')}</p>
          {myJournalLoading && <p style={{ fontSize: 12, color: '#B0A0C8', margin: '0 0 8px' }}>{t(lang, 'loading')}</p>}
          {!myJournalLoading && myJournalUrl && (
            <>
              <div style={{ width: 96, height: 96, borderRadius: 11, overflow: 'hidden', marginBottom: 4 }}>
                <img src={myJournalUrl} alt={t(lang, 'myJournal')} role="button" tabIndex={0} onClick={() => setPreviewOpen(true)} onKeyDown={(e) => e.key === 'Enter' && setPreviewOpen(true)} width={96} height={96} style={{ width: 96, height: 96, objectFit: 'cover', display: 'block', cursor: 'pointer' }} />
              </div>
              <p style={{ fontSize: 12, color: '#B0A0C8', margin: '0 0 8px' }}>{t(lang, 'tapToEnlarge')}</p>
            </>
          )}
          {!myJournalLoading && !myJournalUrl && !myJournalError && <p style={{ fontSize: 12, color: '#B0A0C8', margin: '0 0 8px' }}>{t(lang, 'notUploadedYet')}</p>}
          {myJournalError && <p style={{ fontSize: 12, color: '#8070A0', margin: '0 0 8px' }}>{myJournalError}</p>}

          <input ref={journalGalleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJournalFile(f, 'journal_image'); e.target.value = '' }} />
          <input ref={journalCameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJournalFile(f, 'journal_image'); e.target.value = '' }} />

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button type="button" disabled={journalUploading} onClick={() => { if (journalGalleryInputRef.current) { journalGalleryInputRef.current.value = ''; journalGalleryInputRef.current.click() } }} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '10px 0', fontSize: 22, background: 'linear-gradient(160deg,#B890F8,#8058D0)', color: '#fff', border: 'none', borderRadius: 14, cursor: 'pointer', boxShadow: '0 4px 0 #5838A8' }}>
              <span>📁</span><span style={{ fontSize: 11, fontWeight: 700 }}>{lang === 'en' ? 'Gallery' : 'ギャラリー'}</span>
            </button>
            <button type="button" disabled={journalUploading} onClick={() => { if (journalCameraInputRef.current) { journalCameraInputRef.current.value = ''; journalCameraInputRef.current.click() } }} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '10px 0', fontSize: 22, background: 'linear-gradient(160deg,#B890F8,#8058D0)', color: '#fff', border: 'none', borderRadius: 14, cursor: 'pointer', boxShadow: '0 4px 0 #5838A8' }}>
              <span>📸</span><span style={{ fontSize: 11, fontWeight: 700 }}>{t(lang, 'camera')}</span>
            </button>
          </div>

          {journalUploaded && <p style={{ fontSize: 12, color: '#30A870', fontWeight: 600, margin: '0 0 4px' }}>{journalDateKey ? t(lang, 'savedWithDate', { date: journalDateKey }) : t(lang, 'saved')}</p>}
          {(journalRequestId || lastRequestId) && (
            <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12, color: '#8070A0', marginTop: 4 }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>REQ: {journalRequestId || lastRequestId}</span>
              <button type="button" onClick={() => navigator.clipboard?.writeText(journalRequestId || lastRequestId).then(() => {}).catch(() => {})} style={{ flex: '0 0 auto', padding: '2px 8px', fontSize: 11, cursor: 'pointer', border: '1px solid #DDD4FF', borderRadius: 6, background: '#fff', fontWeight: 600, color: '#8070A0' }}>{t(lang, 'copy')}</button>
            </span>
          )}
          {journalError && <p style={{ fontSize: 11, color: '#E04040', margin: '4px 0 0' }}>{journalError}</p>}
        </section>}

        {errorLine && <p style={{ fontSize: 14, color: '#E04040', textAlign: 'center', margin: 0 }}>{errorLine}</p>}
      </main>

      {/* Bottom nav */}
      <nav className="bottom-nav">
        <button type="button" className="active"><span style={{ fontSize: 20 }}>🏠</span><span>{lang === 'en' ? 'Home' : 'ホーム'}</span></button>
        <button type="button" onClick={() => navigate(lang === 'en' ? '/album/eng' : '/album')}><span style={{ fontSize: 20 }}>🖼</span><span>{lang === 'en' ? 'Album' : 'アルバム'}</span></button>
        <button type="button" onClick={handleShare}><span style={{ fontSize: 20 }}>👋</span><span>{lang === 'en' ? 'Invite' : '招待'}</span></button>
      </nav>

      <audio ref={audioRef} onEnded={handleEnded} onPause={() => setIsPlaying(false)} style={{ display: 'none' }} />

      {previewOpen && myJournalUrl && (
        <div role="button" tabIndex={0} onClick={() => setPreviewOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setPreviewOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box', cursor: 'pointer' }}>
          <img src={myJournalUrl} alt={t(lang, 'myJournal')} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, pointerEvents: 'none' }} />
        </div>
      )}

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 14, padding: '8px 20px', borderRadius: 20, zIndex: 20000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{toastMsg}</div>
      )}

      <UploadErrorModal visible={uploadErrorModal.visible} message={uploadErrorModal.message} onRetry={uploadErrorModal.onRetry} onClose={() => setUploadErrorModal({ visible: false, message: '', onRetry: null })} lang={lang} />
    </div>
  )
}
