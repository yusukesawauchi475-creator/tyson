import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { getDateKey, fetchAudioForPlayback, hasTodayAudio, getListenRoleMeta, markSeen, uploadAudio, genRequestId, getStreak, updateStreak } from '../lib/pairDaily'
import { markVoiceListened } from '../lib/listenedTracking'
import { getPartnerUnreadState } from '../lib/unreadState'
import { getUpcomingHoliday } from '../lib/holidayBanner'
import { uploadJournalImage, fetchTodayJournalMeta, fetchJournalViewUrl, resizeImageIfNeeded } from '../lib/journal'
import { buildInviteUrl } from '../lib/invite'
import { buildInviteMessage } from '../lib/inviteShare'
import { getFinalOneLiner, getAnalysisPlaceholder } from '../lib/uiCopy'
import { t, getMonthName } from '../lib/i18n'
import DailyPromptCard from '../components/DailyPromptCard'
import LanguageSwitch from '../components/LanguageSwitch'
import { getIdTokenForApi, auth, isFirebaseConfigured } from '../lib/firebase'
import { getAuth } from 'firebase/auth'
import { formatDeployedAtLocal, getBuildHash } from '../lib/dateFormat'
import { useAudioLevel } from '../lib/useAudioLevel'
import Visualizer from '../components/Visualizer'
import UploadErrorModal from '../components/UploadErrorModal'
import WeeklySummary from '../components/WeeklySummary'
import RoleBadge from '../components/RoleBadge'
import DemoModal from '../components/DemoModal'
import InviteModal from '../components/InviteModal'

export default function PairDailyPage({ lang = 'ja', onChangeRole, role = 'child' }) {
  const outletContext = useOutletContext()
  const slug = outletContext?.slug
  const [today, setToday] = useState('')
  const [streakCount, setStreakCount] = useState(null)
  const [daysSinceStart, setDaysSinceStart] = useState(null)
  // Phase X-2.5: DEMO link で write 系操作タップ時に表示する CTA モーダル
  const [demoModalOpen, setDemoModalOpen] = useState(false)
  // Phase II-share: 招待 share UI 統一（iOS share sheet 廃止、LINE + clipboard）
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteUrl, setInviteUrl] = useState(null)
  const [inviteText, setInviteText] = useState(null)
  const [dateKey, setDateKey] = useState(getDateKey())
  const [hasAudio, setHasAudio] = useState(null)
  const [debugAuthInfo, setDebugAuthInfo] = useState('...')
  const [isChildUnseen, setIsChildUnseen] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [unreadState, setUnreadState] = useState({ todayUnreadCount: 0, todayTotalCount: 0, anyPeriodUnreadExists: false, albumBadgeCount: 0 })
  // Holiday banner: 14 日以内の最近接 holiday (再 mount + visibilitychange で再計算)
  const [upcomingHoliday, setUpcomingHoliday] = useState(() => getUpcomingHoliday(lang))
  const [errorLine, setErrorLine] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
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
  const { level, isSpeaking, start: startAudioLevel, stop: stopAudioLevel, analyserRef } = useAudioLevel()
  const [uploadErrorModal, setUploadErrorModal] = useState({ visible: false, message: '', onRetry: null })
  const lastFailedPhotoRef = useRef(null)
  const partnerDateKeyRef = useRef(null)

  const navigate = useNavigate()
  const ROLE_CHILD = role
  const LISTEN_ROLE_PARENT = 'parent'
  const [currentPairId] = useState(() => outletContext?.pairId ?? null)
  const isDemoTest = currentPairId === 'PAIR-DEMOTEST'

  useEffect(() => {
    if (isDemoTest) {
      setHasAudio(true)
      setAudioUrl('/demo-audio.mp3')
    }
  }, [isDemoTest])

  useEffect(() => {
    if (!isUploading && !isRecording) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isUploading, isRecording])

  const handleTopicChange = useCallback((topic) => {
    setDailyTopic(topic)
    topicRef.current = topic
  }, [])

  const refreshStatus = () => {
    if (isDemoTest) { setHasAudio(true); return }
    setHasAudio(null)
    setIsChildUnseen(false)
    getListenRoleMeta(LISTEN_ROLE_PARENT, currentPairId).then(({ hasAudio, isUnseen, dateKey: dk }) => {
      setHasAudio(hasAudio)
      setIsChildUnseen(!!isUnseen)
      if (dk) partnerDateKeyRef.current = dk
    })
  }

  const refreshComment = useCallback(async () => {
    if (isDemoTest) return
    const idToken = await getIdTokenForApi()
    if (!idToken) return
    
    setCommentStatus('loading')
    try {
      const currentDateKey = dateKey || getDateKey()
      const res = await fetch(`/api/analysis-comment?pairId=${currentPairId}&dateKey=${currentDateKey}&role=${ROLE_CHILD}`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      })
      
      const ct = res.headers.get('content-type') || ''
      if (res.ok && ct.includes('application/json')) {
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
      } else if (!res.ok && (res.status === 404 || res.status === 401)) {
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
    if (isDemoTest) { setDemoModalOpen(true); return }
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
      const result = await uploadJournalImage(toUpload, reqId, currentPairId, ROLE_CHILD, kind)
      setJournalUploading(false)
      if (result.success) {
        console.log('[upload success]', { requestId: reqId, kind, result: { success: result.success, requestId: result.requestId, dateKey: result.dateKey, storagePath: result.storagePath } })
        setToastMsg(t(lang, 'photoSentToast'))
        setTimeout(() => setToastMsg(null), 3000)
        setJournalRequestId(result.requestId)
        if (kind === 'journal_image') {
          setJournalUploaded(true)
          if (result.dateKey) setJournalDateKey(result.dateKey)
          fetchTodayJournalMeta(currentPairId, ROLE_CHILD).then((r) => {
            setJournalUploaded(!!r.hasImage)
            if (r.dateKey) setJournalDateKey(r.dateKey)
          })
          fetchMyJournal()
          setTimeout(() => fetchMyJournal(), 600)
        }
        if (kind === 'generic_image') {
          setDailyPhotoLimitMessage(null)
          const doRefresh = () => fetchTodayJournalMeta(currentPairId, ROLE_CHILD).then((r) => setPhotos((r.photos ?? []).filter((ph) => ph?.url)))
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
    fetchTodayJournalMeta(currentPairId, 'child')
      .then(({ hasImage, dateKey, photos: p }) => {
        setJournalUploaded(!!hasImage)
        if (dateKey) setJournalDateKey(dateKey)
        setPhotos(Array.isArray(p) ? p.filter((ph) => ph?.url) : [])
      })
      .catch((e) => setJournalError(t(lang, 'initError', { msg: e?.message || String(e) })))
  }, [lang])

  const fetchMyJournal = useCallback(async () => {
    setMyJournalLoading(true)
    setMyJournalError(null)
    try {
      const url = await fetchJournalViewUrl(currentPairId, 'child')
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
    setToday(d.toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }))
    const currentDateKey = getDateKey()
    setDateKey(currentDateKey)
    let cancelled = false
    if (!isDemoTest) {
      getListenRoleMeta(LISTEN_ROLE_PARENT, currentPairId).then(({ hasAudio, isUnseen, dateKey: dk }) => {
        if (!cancelled) {
          setHasAudio(hasAudio)
          setIsChildUnseen(!!isUnseen)
          if (dk) partnerDateKeyRef.current = dk
        }
      })
    }
    return () => { cancelled = true }
  }, [lang])

  useEffect(() => {
    getStreak(currentPairId).then(({ count, firstDateKey }) => {
      setStreakCount(count)
      if (firstDateKey) {
        const first = new Date(firstDateKey + 'T00:00:00')
        const now = new Date()
        const days = Math.floor((now - first) / 86400000) + 1
        setDaysSinceStart(days)
      }
    })
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

  // Phase 1: partner (parent) voice の unread state fetch (mount + visibilitychange)
  const refreshPartnerStats = useCallback(() => {
    if (isDemoTest || !currentPairId) return
    getPartnerUnreadState(currentPairId, LISTEN_ROLE_PARENT)
      .then((state) => setUnreadState(state))
      .catch(() => {})
  }, [currentPairId, isDemoTest])

  useEffect(() => {
    refreshPartnerStats()
    const onVis = () => { if (document.visibilityState === 'visible') refreshPartnerStats() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refreshPartnerStats])

  // Holiday banner: lang 変更 + visibilitychange (日跨ぎ) で再計算
  useEffect(() => {
    setUpcomingHoliday(getUpcomingHoliday(lang))
    const onVis = () => { if (document.visibilityState === 'visible') setUpcomingHoliday(getUpcomingHoliday(lang)) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [lang])

  const handleStop = () => {
    const el = audioRef.current
    if (el) { el.pause(); el.currentTime = 0 }
    setIsPlaying(false)
  }

  const handlePlay = async () => {
    if (isPlaying) { handleStop(); return }
    if (hasAudio === false) return

    setIsLoading(true)
    setErrorLine(null)

    const el = audioRef.current
    if (el) {
      el.pause()
      el.src = ''
      el.load()
    }
    setAudioUrl(null)

    if (isDemoTest) {
      setAudioUrl('/demo-audio.mp3')
      setIsLoading(false)
      const el2 = audioRef.current
      if (el2) { el2.src = '/demo-audio.mp3'; el2.currentTime = 0; await el2.play(); setIsPlaying(true) }
      return
    }

    const result = await fetchAudioForPlayback(LISTEN_ROLE_PARENT, currentPairId)

    if (result.error) {
      console.error('[handlePlay] fetchAudio error:', result.errorCode, result.error)
      setErrorLine(`再生エラー: ${result.errorCode} - ${result.error}`)
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
      console.log('[handlePlay] setting src:', result.url?.substring(0, 80), 'mode:', result.mode)
      if (el) {
        el.src = result.url
        el.currentTime = 0
        console.log('[handlePlay] calling play()...')
        await el.play()
        console.log('[handlePlay] play() succeeded')
        setIsPlaying(true)
        const seenDateKey = result.dateKey || partnerDateKeyRef.current
        markSeen(LISTEN_ROLE_PARENT, currentPairId, seenDateKey).then(() => setIsChildUnseen(false)).catch(() => {})
        // Phase 1: Home Play は最新 voice 再生 → unread count 即減
        const todayKey = getDateKey()
        if (seenDateKey) {
          markVoiceListened(currentPairId, seenDateKey, LISTEN_ROLE_PARENT, null)
          setUnreadState((prev) => {
            const newAlbumBadgeCount = Math.max(0, prev.albumBadgeCount - 1)
            return {
              todayTotalCount: prev.todayTotalCount,
              todayUnreadCount: seenDateKey === todayKey ? Math.max(0, prev.todayUnreadCount - 1) : prev.todayUnreadCount,
              albumBadgeCount: newAlbumBadgeCount,
              anyPeriodUnreadExists: newAlbumBadgeCount > 0,
            }
          })
        }
      }
    } catch (playErr) {
      console.error('[handlePlay] play() FAILED:', playErr?.name, playErr?.message, playErr)
      setErrorLine(`${t(lang, 'playFailed')} (${playErr?.name}: ${playErr?.message})`)
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
    if (isDemoTest) { setDemoModalOpen(true); return }
    if (isUploading) return
    setErrorLine(null)
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
        const result = await uploadAudio(blob, ROLE_CHILD, currentPairId, getDateKey(), reqId)

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
          setToastMsg(t(lang, 'voiceSentToast'))
          setTimeout(() => setToastMsg(null), 3000)
          setErrorLine(null)
          // 親と子の両方が録音済みならstreakを更新
          if (hasAudio === true) {
            updateStreak(currentPairId).then(({ success, count }) => {
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
                  pairId: currentPairId,
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
                  pairId: currentPairId,
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
                  
                  const res = await fetch(`/api/analysis-comment?pairId=${currentPairId}&dateKey=${dateKeyForThisUpload}&role=${ROLE_CHILD}`, {
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

  const handleShare = () => {
    if (isRecording) {
      const msg = lang === 'en' ? 'Recording in progress. Stop and navigate away?' : lang === 'es' ? 'Grabación en curso. ¿Detener y salir?' : '録音中です。中断して移動しますか？'
      if (!window.confirm(msg)) return
      stopRecording()
    }
    if (!slug) {
      setToastMsg(lang === 'en' ? 'Cannot share: invalid pair URL' : lang === 'es' ? 'No se puede compartir: URL de pareja inválida' : '共有できません。有効なペアURLからアクセスしてください')
      setTimeout(() => setToastMsg(null), 2500)
      return
    }
    // Phase II-share: iOS share sheet 廃止、InviteModal 経由で LINE + clipboard 統一
    const url = buildInviteUrl(slug)
    const text = buildInviteMessage(lang, null, url)
    setInviteUrl(url)
    setInviteText(text)
    setInviteModalOpen(true)
  }

  const handleRecordClick = () => {
    if (isUploading) return
    if (isRecording) stopRecording()
    else startRecording()
  }

  const _dateNow = new Date()
  const dateDay = _dateNow.getDate()
  const dateMonthYear = lang === 'ja'
    ? `${_dateNow.getFullYear()}年 ${getMonthName(lang, _dateNow.getMonth())}`
    : `${getMonthName(lang, _dateNow.getMonth())} ${_dateNow.getFullYear()}`

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', background: 'var(--color-bg)', color: 'var(--color-text)', paddingBottom: 72, overflow: 'hidden' }}>
      {/* Caribbean blue glass header */}
      <header style={{ flexShrink: 0, background: 'linear-gradient(135deg, rgba(0,180,216,0.28), rgba(0,150,199,0.22), rgba(72,202,228,0.20))', borderBottom: '1px solid rgba(255,255,255,0.35)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="Hum" width={36} height={36} style={{ borderRadius: 10, objectFit: 'cover' }} />
          <span style={{ fontSize: 24, fontWeight: 800, color: '#005f80', textShadow: '0 1px 4px rgba(0,80,120,0.2)' }}>Hum</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LanguageSwitch lang={lang} />
        </div>
      </header>

      {/* Holiday banner — 14 日以内最近接 holiday、tap で録音 card scroll */}
      {upcomingHoliday && (
        <div
          onClick={() => document.getElementById('record-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          style={{
            margin: '6px 8px 0',
            padding: '6px 10px',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'linear-gradient(90deg, rgba(255,180,200,.35), rgba(255,210,180,.35))',
            border: '1px solid rgba(255,140,170,.3)',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 15, flexShrink: 0 }}>{upcomingHoliday.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#a04060' }}>
              {upcomingHoliday.daysLeft === 0
                ? t(lang, 'holidayToday', { name: t(lang, `holiday_${upcomingHoliday.name}`) })
                : t(lang, 'holidayUpcoming', { name: t(lang, `holiday_${upcomingHoliday.name}`), days: upcomingHoliday.daysLeft })}
            </div>
            <div style={{ fontSize: 9, color: '#c06080', fontWeight: 500 }}>
              {t(lang, 'holidayCta')}
            </div>
          </div>
          <span style={{ fontSize: 12, color: '#a04060', opacity: 0.6 }}>→</span>
        </div>
      )}

      {/* Date bar */}
      <div style={{ background: '#F8F0FF', borderBottom: '1px solid #EEE8FF', padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, flexShrink: 1 }}>
          <span style={{ fontSize: 22, fontWeight: 600, color: '#6B5B95', lineHeight: 1 }}>{dateDay}</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: '#6B5B95', opacity: 0.75, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>{dateMonthYear}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {(daysSinceStart > 0 || streakCount > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {daysSinceStart > 0 && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, lineHeight: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#6040c0', lineHeight: 1 }}>{daysSinceStart}</span>
                  <span style={{ fontSize: 7, fontWeight: 600, color: '#6040c0', lineHeight: 1 }}>{lang === 'en' ? 'days' : lang === 'es' ? 'días' : '日目'}</span>
                </div>
              )}
              {streakCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, lineHeight: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#e06020', lineHeight: 1 }}>🔥{streakCount}</span>
                  <span style={{ fontSize: 7, fontWeight: 600, color: '#e06020', lineHeight: 1 }}>{lang === 'en' ? 'streak' : lang === 'es' ? 'racha' : '連続'}</span>
                </div>
              )}
            </div>
          )}
          {/* 段階10-b: Switch button を RoleBadge に吸収（常時 role 表示 + tap で変更） */}
          {onChangeRole && (
            <RoleBadge role={role} lang={lang} onClick={onChangeRole} />
          )}
        </div>
      </div>

      <main className="page-content page" style={{ flex: 1, maxWidth: 480, margin: '0 auto', width: '100%', paddingTop: 8 }}>
        <WeeklySummary lang={lang} pairId={currentPairId} />

        {/* (1) Receive card — 3D lavender */}
        <section style={{ width: '100%', background: 'linear-gradient(145deg, #f0eeff, #e8f0ff)', borderRadius: 20, padding: 16, boxShadow: '0 4px 0 #c8b8f0, 0 6px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)', overflow: 'hidden', fontFamily: 'Nunito, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👂</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#1a5c3a' }}>{lang === 'en' ? "Listen to partner's voice" : lang === 'es' ? "Escucha la voz de tu pareja" : '相手の声を聴く'}</span>
          </div>
          <div style={{ position: 'relative', width: '100%' }}>
            {hasAudio === true ? (
              <button type="button" onClick={handlePlay} disabled={isLoading} style={{ position: 'relative', overflow: 'hidden', width: '100%', padding: 14, fontSize: 17, fontWeight: 800, color: '#fff', background: 'linear-gradient(90deg, #8b5cf6, #a78bfa, #c084fc)', border: 'none', borderRadius: 12, cursor: isLoading ? 'wait' : 'pointer', fontFamily: 'Nunito, sans-serif' }}>
                <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.18), transparent)', pointerEvents: 'none' }} />
                {isLoading ? t(lang, 'loading') : (
                  <>
                    {isPlaying
                      ? (lang === 'en' ? '⏹ Stop' : lang === 'es' ? '⏹ Detener' : '⏹ 停止')
                      : (lang === 'en' ? '▶ Play' : lang === 'es' ? '▶ Reproducir' : '▶ 再生')}
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginLeft: 6 }}>
                      ({unreadState.todayTotalCount - unreadState.todayUnreadCount}/{unreadState.todayTotalCount})
                    </span>
                    {!isPlaying && unreadState.anyPeriodUnreadExists ? ' 🔴' : ''}
                  </>
                )}
              </button>
            ) : (
              <button type="button" disabled style={{ position: 'relative', overflow: 'hidden', width: '100%', padding: 14, fontSize: 17, fontWeight: 800, color: '#fff', background: 'linear-gradient(90deg, #8b5cf6, #a78bfa, #c084fc)', border: 'none', borderRadius: 12, cursor: 'default', opacity: 0.4, fontFamily: 'Nunito, sans-serif' }}>
                <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.18), transparent)', pointerEvents: 'none' }} />
                {lang === 'en' ? '▶ Play' : lang === 'es' ? '▶ Reproducir' : '▶ 再生'}
              </button>
            )}
            {hasAudio === true && isPlaying && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 12, overflow: 'hidden' }}>
                <Visualizer source={audioRef.current} active color="rgba(255,255,255,0.35)" />
              </div>
            )}
          </div>
        </section>

        {/* (2) Send card — 3D pink */}
        <section id="record-card" style={{ width: '100%', background: 'linear-gradient(145deg, #fff0f5, #fff5ee)', borderRadius: 20, padding: 16, boxShadow: '0 4px 0 #f0b8cc, 0 6px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)', overflow: 'hidden', fontFamily: 'Nunito, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎙</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#6b2a3a' }}>{lang === 'en' ? 'Record & send your voice' : lang === 'es' ? 'Graba y envía tu voz' : '声を録って送る'}</span>
          </div>
          {/* 段階10-b: 録音直上に role 確認 text、誤 upload 防止 */}
          <p style={{ textAlign: 'center', fontSize: 12, color: '#6b2a3a', margin: '0 0 8px', fontWeight: 600 }}>
            ▶ {lang === 'en' ? 'Recording as Child' : lang === 'es' ? 'Grabando como Hijo/Hija' : '子として録音します'} 👦👧
          </p>
          <div style={{ position: 'relative', width: '100%' }}>
            <button type="button" onClick={handleRecordClick} disabled={isUploading} style={{ position: 'relative', overflow: 'hidden', width: '100%', padding: 14, fontSize: 17, fontWeight: 800, color: '#fff', background: isUploading ? '#B0A0C8' : isRecording ? 'linear-gradient(90deg, #ef4444, #f97316, #f59e0b)' : 'linear-gradient(90deg, #c084fc, #e879a0, #f97316)', opacity: isUploading ? 1 : 0.85, border: 'none', borderRadius: 12, cursor: isUploading ? 'wait' : 'pointer', fontFamily: 'Nunito, sans-serif' }}>
              <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.18), transparent)', pointerEvents: 'none' }} />
              {isUploading ? t(lang, 'sending') : isRecording ? (lang === 'en' ? '⏹ Recording...' : lang === 'es' ? '⏹ Grabando...' : '⏹ 録音中…') : (lang === 'en' ? '🎙 Record' : lang === 'es' ? '🎙 Grabar' : '🎙 録音')}
            </button>
            {isRecording && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 12, overflow: 'hidden' }}>
                <Visualizer source={analyserRef.current} active color="rgba(255,255,255,0.4)" />
              </div>
            )}
          </div>

          <DailyPromptCard pairId={currentPairId} role={ROLE_CHILD} onTopicChange={handleTopicChange} lang={lang} />
        </section>

        {/* (3) Photos card — 3D purple */}
        {/* Phase X-2.5: DEMO でもセクション render、tap で CTA モーダル */}
        <section style={{ width: '100%', background: 'linear-gradient(145deg, #f4f0ff, #ede8ff)', borderRadius: 20, padding: 16, boxShadow: '0 4px 0 #c0a8f0, 0 6px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)', overflow: 'hidden', fontFamily: 'Nunito, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📷</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#3a1a7a' }}>
              {lang === 'en' ? 'Send photos' : lang === 'es' ? 'Enviar fotos' : '写真を送る'} · {photos.filter((p) => p.role === ROLE_CHILD).length}/3
            </span>
          </div>

          <input ref={genericGalleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f && typeof f.type === 'string' && f.type.startsWith('image/')) handleJournalFile(f, 'generic_image'); e.target.value = '' }} />
          <input ref={genericCameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJournalFile(f, 'generic_image'); e.target.value = '' }} />

          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {photos.slice(0, 6).map((ph, i) => (
                <button key={ph.storagePath + String(i)} type="button" onClick={() => { if (!slug) { console.error('slug required'); return } navigate(`/pair/${slug}/album`, { state: { scrollToDate: dateKey } }) }} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }} aria-label={lang === 'en' ? 'View in album' : lang === 'es' ? 'Ver en el álbum' : 'アルバムで見る'}>
                  <img src={ph.url || ''} alt="" width={48} height={48} style={{ width: 48, height: 48, objectFit: 'cover', display: 'block', borderRadius: 10 }} />
                </button>
              ))}
            </div>
          )}

          {dailyPhotoLimitMessage && <p style={{ fontSize: 11, color: '#5a3a8a', margin: '0 0 4px' }}>{dailyPhotoLimitMessage}</p>}

          <button type="button" disabled={journalUploading} onClick={() => { if (isDemoTest) { setDemoModalOpen(true); return } if (genericGalleryInputRef.current) { genericGalleryInputRef.current.value = ''; genericGalleryInputRef.current.click() } }} style={{ position: 'relative', overflow: 'hidden', width: '100%', padding: 14, fontSize: 17, fontWeight: 800, color: '#fff', background: 'linear-gradient(90deg, #7c3aed, #a855f7, #ec4899)', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
            <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.18), transparent)', pointerEvents: 'none' }} />
            {lang === 'en' ? '📷 Add Photo' : lang === 'es' ? '📷 Añadir foto' : '📷 写真を追加する'}
          </button>
        </section>

        {errorLine && <p style={{ fontSize: 14, color: '#E04040', textAlign: 'center', margin: 0 }}>{errorLine}</p>}
      </main>

      {/* Bottom nav */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9000, display: 'flex', background: '#fff', borderTop: '2px solid #F0E8FF', boxShadow: '0 -4px 20px rgba(180,120,255,0.15)', paddingBottom: 'max(4px, env(safe-area-inset-bottom))' }}>
        {[
          { icon: '🏠', label: lang === 'en' ? 'Home' : lang === 'es' ? 'Inicio' : 'ホーム', bg: '#FFE8F4', bgActive: '#FFD0E8', active: true, onClick: null, badge: 0 },
          { icon: '🖼', label: lang === 'en' ? 'Album' : lang === 'es' ? 'Álbum' : 'アルバム', bg: '#F0E8FF', bgActive: '#E0D0FF', active: false, badge: unreadState.albumBadgeCount, onClick: () => {
            if (isRecording) {
              const msg = lang === 'en' ? 'Recording in progress. Stop and navigate away?' : lang === 'es' ? 'Grabación en curso. ¿Detener y salir?' : '録音中です。中断して移動しますか？'
              if (!window.confirm(msg)) return
              stopRecording()
            }
            if (!slug) { console.error('slug required'); return }
            navigate(`/pair/${slug}/album`)
          } },
          { icon: '👋', label: lang === 'en' ? 'Invite' : lang === 'es' ? 'Invitar' : '招待', bg: '#FFF0E8', bgActive: '#FFE0D0', active: false, onClick: handleShare, badge: 0 },
        ].map((item) => (
          <button key={item.label} type="button" onClick={item.onClick} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 0 4px', border: 'none', background: 'none', cursor: 'pointer' }}>
            <span style={{ width: item.active ? 40 : 36, height: item.active ? 40 : 36, borderRadius: 20, background: item.active ? item.bgActive : item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: item.active ? 22 : 18, transition: 'all 0.2s', position: 'relative' }}>
              {item.icon}
              {item.badge > 0 && (
                <span style={{ position: 'absolute', top: -2, right: -6, minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 9, background: '#B8A0E8', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, border: '1.5px solid #fff', fontFamily: 'Nunito, sans-serif' }}>
                  {item.badge >= 10 ? '9+' : item.badge}
                </span>
              )}
            </span>
            <span style={{ fontSize: 10, fontWeight: item.active ? 800 : 600, color: item.active ? '#0096c7' : '#999', background: item.active ? 'linear-gradient(135deg,#0096c7,#00b4d8)' : 'none', WebkitBackgroundClip: item.active ? 'text' : 'unset', WebkitTextFillColor: item.active ? 'transparent' : 'unset' }}>{item.label}</span>
          </button>
        ))}
      </nav>

      <audio ref={audioRef} onEnded={handleEnded} onPause={() => setIsPlaying(false)} style={{ display: 'none' }} />

      {previewOpen && myJournalUrl && (
        <div role="button" tabIndex={0} onClick={() => setPreviewOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setPreviewOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box', cursor: 'pointer' }}>
          <img src={myJournalUrl} alt={t(lang, 'myJournal')} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, pointerEvents: 'none' }} />
        </div>
      )}

      {toastMsg && (
        <div className="popup-toast">{toastMsg}</div>
      )}

      <UploadErrorModal visible={uploadErrorModal.visible} message={uploadErrorModal.message} onRetry={uploadErrorModal.onRetry} onClose={() => setUploadErrorModal({ visible: false, message: '', onRetry: null })} lang={lang} />

      {/* Phase X-2.5: DEMO link 用 CTA モーダル */}
      <DemoModal isOpen={demoModalOpen} onClose={() => setDemoModalOpen(false)} />

      {/* Phase II-share: 招待 share モーダル */}
      <InviteModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        inviteUrl={inviteUrl}
        inviteText={inviteText}
        lang={lang}
      />
    </div>
  )
}
