import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { uploadAudio, fetchAudioForPlayback, getListenRoleMeta, markSeen, getDateKey, genRequestId, getStreak, updateStreak } from '../lib/pairDaily'
import { markVoiceListened, getTodayPartnerUnlistenedStats, getAnyPartnerUnlistenedFlagServerSeen } from '../lib/listenedTracking'
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

export default function HomePage({ lang = 'ja', onChangeRole }) {
  const navigate = useNavigate()
  const outletContext = useOutletContext()
  const slug = outletContext?.slug
  const [streakCount, setStreakCount] = useState(null)
  const [daysSinceStart, setDaysSinceStart] = useState(null)
  // Phase X-2.5: DEMO link で write 系操作タップ時に表示する CTA モーダル
  const [demoModalOpen, setDemoModalOpen] = useState(false)
  // Phase II-share: 招待 share UI 統一（iOS share sheet 廃止、LINE + clipboard）
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteUrl, setInviteUrl] = useState(null)
  const [inviteText, setInviteText] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [errorLine, setErrorLine] = useState(null)
  const [hasParentAudio, setHasParentAudio] = useState(null)
  const [debugAuthInfo, setDebugAuthInfo] = useState('...')
  const [isParentUnseen, setIsParentUnseen] = useState(false)
  const [parentAudioUrl, setParentAudioUrl] = useState(null)
  const [isLoadingParent, setIsLoadingParent] = useState(false)
  const [isPlayingParent, setIsPlayingParent] = useState(false)
  // Phase 1: 今日 partner (child) voice の 未聴 stats
  const [partnerStats, setPartnerStats] = useState({ unlistened: 0, total: 0, latestHhmm: null })
  // Fix 1+2: 全期間 partner 未聴 count (date またぎ 🔴 + Album badge 全期間カウント用)
  const [anyPartnerUnlistened, setAnyPartnerUnlistened] = useState(0)
  // Holiday banner: 14 日以内の最近接 holiday (再 mount + visibilitychange で再計算)
  const [upcomingHoliday, setUpcomingHoliday] = useState(() => getUpcomingHoliday(lang))
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
  const [toastMsg, setToastMsg] = useState(null)
  const [photos, setPhotos] = useState([])
  const [dailyPhotoLimitMessage, setDailyPhotoLimitMessage] = useState(null)
  const [myJournalUrl, setMyJournalUrl] = useState(null)
  const [myJournalLoading, setMyJournalLoading] = useState(false)
  const [myJournalError, setMyJournalError] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [dateKey] = useState(getDateKey())
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
  const partnerDateKeyRef = useRef(null)
  const journalGalleryInputRef = useRef(null)
  const journalCameraInputRef = useRef(null)
  const genericGalleryInputRef = useRef(null)
  const genericCameraInputRef = useRef(null)
  const { level, isSpeaking, start: startAudioLevel, stop: stopAudioLevel, analyserRef } = useAudioLevel()
  const [uploadErrorModal, setUploadErrorModal] = useState({ visible: false, message: '', onRetry: null })
  const lastFailedAudioRef = useRef(null)
  const lastFailedPhotoRef = useRef(null)

  useEffect(() => {
    uploadingRef.current = isUploading
    loadingParentRef.current = isLoadingParent
    playingParentRef.current = isPlayingParent
  }, [isUploading, isLoadingParent, isPlayingParent])

  useEffect(() => {
    if (!isUploading && !isRecording) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isUploading, isRecording])

  const ROLE_PARENT = 'parent'
  const LISTEN_ROLE_CHILD = 'child'
  const [currentPairId] = useState(() => outletContext?.pairId ?? null)
  const isDemoTest = currentPairId === 'PAIR-DEMOTEST'

  useEffect(() => {
    if (isDemoTest) {
      setHasParentAudio(true)
      setParentAudioUrl('/demo-audio.mp3')
    }
  }, [isDemoTest])

  const handleTopicChange = useCallback((topic) => {
    setDailyTopic(topic)
    topicRef.current = topic
  }, [])

  const startRecording = async () => {
    if (isDemoTest) { setDemoModalOpen(true); return }
    if (isUploading) return
    setErrorLine(null)
    setOneLinerVisible(false)
    setAnalysisVisible(false)
    analysisReqSeqRef.current += 1
    if (oneLinerTimerRef.current) { clearTimeout(oneLinerTimerRef.current); oneLinerTimerRef.current = null }
    if (analysisTimerRef.current) { clearTimeout(analysisTimerRef.current); analysisTimerRef.current = null }
    if (analysisFetchTimerRef.current) { clearTimeout(analysisFetchTimerRef.current); analysisFetchTimerRef.current = null }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      startAudioLevel(stream)
      let mimeType = 'audio/webm'
      if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4'
      else if (MediaRecorder.isTypeSupported('audio/aac')) mimeType = 'audio/aac'
      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recordStartRef.current = Date.now()
      mr.onstop = async () => {
        stopAudioLevel()
        const blob = new Blob(chunksRef.current, { type: mr.mimeType })
        const duration = recordStartRef.current ? (Date.now() - recordStartRef.current) / 1000 : 0
        if (duration < 1 || blob.size < 4 * 1024) { setErrorLine(t(lang, 'tryAgain')); return }
        const reqId = genRequestId()
        setLastRequestId(reqId)
        setIsUploading(true)
        const durationSec = recordStartRef.current
          ? Math.max(1, Math.min(6000, Math.round((Date.now() - recordStartRef.current) / 1000)))
          : null
        const result = await uploadAudio(blob, ROLE_PARENT, currentPairId, getDateKey(), reqId)
        if (result.success) {
          if (oneLinerTimerRef.current) { clearTimeout(oneLinerTimerRef.current); oneLinerTimerRef.current = null }
          if (analysisTimerRef.current) { clearTimeout(analysisTimerRef.current); analysisTimerRef.current = null }
          if (analysisFetchTimerRef.current) { clearTimeout(analysisFetchTimerRef.current); analysisFetchTimerRef.current = null }
          setAnalysisVisible(false)
          if (dailyTopic) topicRef.current = dailyTopic
          const dateKeyForThisUpload = result?.dateKey || getDateKey()
          analysisReqSeqRef.current += 1
          const seq = analysisReqSeqRef.current
          setToastMsg(t(lang, 'voiceSentToast'))
          setTimeout(() => setToastMsg(null), 3000)
          setErrorLine(null)
          if (hasParentAudio === true) {
            updateStreak(currentPairId).then(({ success, count }) => { if (success) setStreakCount(count) })
          }
          setOneLiner(t(lang, 'uploadSuccessThanks'))
          setOneLinerStage('immediate')
          setOneLinerVisible(true)
          oneLinerTimerRef.current = setTimeout(() => {
            const topic = topicRef.current
            setOneLiner(getFinalOneLiner(lang, topic, ROLE_PARENT))
            setOneLinerStage('final')
            oneLinerTimerRef.current = null
          }, 300)
          analysisTimerRef.current = setTimeout(() => {
            const topic = topicRef.current
            setAnalysisComment(getAnalysisPlaceholder(lang, topic, ROLE_PARENT))
            setAnalysisVisible(true)
            analysisTimerRef.current = null
          }, 1000)
          ;(async () => {
            try {
              const idToken = await getIdTokenForApi()
              if (!idToken) return
              await fetch('/api/analysis-comment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ pairId: currentPairId, dateKey: dateKeyForThisUpload, role: ROLE_PARENT, topic: topicRef.current, durationSec }),
              })
            } catch {}
          })()
          ;(async () => {
            try {
              const idToken = await getIdTokenForApi()
              if (!idToken) return
              const sourceVersion = result?.version
              if (!sourceVersion) return
              fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ pairId: currentPairId, dateKey: dateKeyForThisUpload, role: ROLE_PARENT, sourceVersion, version: sourceVersion }),
              }).catch(() => {})
            } catch {}
          })()
          analysisFetchTimerRef.current = setTimeout(() => {
            ;(async () => {
              if (analysisReqSeqRef.current !== seq) return
              const maxPollCount = 20
              const pollInterval = 2000
              let pollCount = 0
              const pollAnalysis = async () => {
                if (analysisReqSeqRef.current !== seq) return false
                try {
                  const idToken = await getIdTokenForApi()
                  if (!idToken) return false
                  if (analysisReqSeqRef.current !== seq) return false
                  const res = await fetch(`/api/analysis-comment?pairId=${currentPairId}&dateKey=${dateKeyForThisUpload}&role=${ROLE_PARENT}`, {
                    headers: { Authorization: `Bearer ${idToken}` },
                  })
                  if (analysisReqSeqRef.current !== seq) return false
                  if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
                    const data = await res.json()
                    if (data.success) {
                      if (data.aiStatus === 'done' && data.aiText) {
                        if (analysisReqSeqRef.current === seq) setAnalysisComment(data.aiText)
                        return true
                      }
                      if (data.aiStatus === 'error') return true
                      const displayText = data.aiText || data.text
                      if (displayText && pollCount === 0 && analysisReqSeqRef.current === seq) setAnalysisComment(displayText)
                    }
                  }
                } catch {}
                return false
              }
              const done = await pollAnalysis()
              if (done) return
              const pollLoop = setInterval(async () => {
                pollCount++
                if (analysisReqSeqRef.current !== seq) { clearInterval(pollLoop); return }
                const done = await pollAnalysis()
                if (done || pollCount >= maxPollCount) clearInterval(pollLoop)
              }, pollInterval)
            })()
          }, 1200 + Math.random() * 300)
        } else {
          const reqId = result.requestId || 'REQ-XXXX'
          setErrorLine(t(lang, 'uploadFailed', { id: reqId }))
          if (import.meta.env.DEV) console.error('[HomePage]', result.requestId, result.errorCode, result.error)
          lastFailedAudioRef.current = { blob, reqId }
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
    if (mr?.state === 'recording') { mr.stop(); stopAudioLevel() }
    setIsRecording(false)
  }

  const handleJournalFile = async (file, kind = 'journal_image') => {
    if (isDemoTest) { setDemoModalOpen(true); return }
    if (!file || journalUploading) return
    if (typeof file.type !== 'string' || !file.type.startsWith('image/')) {
      setJournalError(t(lang, 'selectImage'))
      return
    }
    if (kind === 'journal_image' && journalUploaded && !window.confirm(t(lang, 'journalOverwriteConfirm'))) return
    if (kind === 'generic_image') {
      const myCount = photos.filter((p) => p.role === ROLE_PARENT).length
      if (myCount >= 3) { setDailyPhotoLimitMessage(t(lang, 'dailyPhotoLimit')); return }
    }
    setJournalUploading(true)
    setJournalError(null)
    try {
      const reqId = genRequestId()
      const toUpload = await resizeImageIfNeeded(file)
      const result = await uploadJournalImage(toUpload, reqId, currentPairId, ROLE_PARENT, kind)
      setJournalUploading(false)
      if (result.success) {
        setToastMsg(t(lang, 'photoSentToast'))
        setTimeout(() => setToastMsg(null), 3000)
        setJournalRequestId(result.requestId)
        if (kind === 'journal_image') {
          setJournalUploaded(true)
          if (result.dateKey) setJournalDateKey(result.dateKey)
          fetchTodayJournalMeta(currentPairId, ROLE_PARENT).then((r) => {
            setJournalUploaded(!!r.hasImage)
            if (r.dateKey) setJournalDateKey(r.dateKey)
          })
          fetchMyJournal()
          setTimeout(() => fetchMyJournal(), 600)
        }
        if (kind === 'generic_image') {
          setDailyPhotoLimitMessage(null)
          const doRefresh = () => fetchTodayJournalMeta(currentPairId, ROLE_PARENT).then((r) => setPhotos((r.photos ?? []).filter((ph) => ph?.url)))
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

  const handleClick = () => {
    if (isUploading) return
    if (isRecording) stopRecording()
    else startRecording()
  }

  const refreshParentStatus = () => {
    if (isDemoTest) { setHasParentAudio(true); return }
    setHasParentAudio(null)
    setIsParentUnseen(false)
    getListenRoleMeta(LISTEN_ROLE_CHILD, currentPairId).then(({ hasAudio, isUnseen, dateKey: dk }) => {
      setHasParentAudio(hasAudio)
      setIsParentUnseen(!!isUnseen)
      if (dk) partnerDateKeyRef.current = dk
    })
  }

  const fetchMyJournal = useCallback(async () => {
    setMyJournalLoading(true)
    setMyJournalError(null)
    try {
      const url = await fetchJournalViewUrl(currentPairId, 'parent')
      setMyJournalUrl(url)
    } catch (e) {
      setMyJournalError(e?.message || String(e))
      setMyJournalUrl(null)
    } finally {
      setMyJournalLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTodayJournalMeta(currentPairId)
      .then(({ hasImage, dateKey, photos: p }) => {
        setJournalUploaded(!!hasImage)
        if (dateKey) setJournalDateKey(dateKey)
        const validPhotos = Array.isArray(p) ? p.filter((ph) => ph?.url) : []
        setPhotos(validPhotos)
      })
      .catch((e) => setJournalError(e?.message || String(e)))
  }, [])

  useEffect(() => { fetchMyJournal() }, [fetchMyJournal])

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

  useEffect(() => {
    const timer = setTimeout(() => setShowReloadButton(true), 10000)
    return () => clearTimeout(timer)
  }, [])

  // デバッグ用: getIdTokenForApi の結果を UI に表示
  useEffect(() => {
    getIdTokenForApi().then(token => {
      setDebugAuthInfo(token ? `OK(${token.slice(-6)})` : 'NULL')
    }).catch(e => setDebugAuthInfo('ERR:' + e?.message?.slice(0, 20)))
  }, [])

  useEffect(() => {
    if (isDemoTest) return
    let cancelled = false
    getListenRoleMeta(LISTEN_ROLE_CHILD, currentPairId)
      .then(({ hasAudio, isUnseen, dateKey: dk }) => {
        if (!cancelled) { setHasParentAudio(hasAudio); setIsParentUnseen(!!isUnseen); if (dk) partnerDateKeyRef.current = dk }
      })
      .catch((e) => setJournalError(t(lang, 'initError', { msg: e?.message || String(e) })))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (isDemoTest) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (uploadingRef.current || loadingParentRef.current || playingParentRef.current) return
      getListenRoleMeta(LISTEN_ROLE_CHILD, currentPairId).then(({ hasAudio, isUnseen, dateKey: dk }) => {
        setHasParentAudio(hasAudio)
        setIsParentUnseen(!!isUnseen)
        if (dk) partnerDateKeyRef.current = dk
      }).catch(() => {})
    }
    const start = () => { if (pollIntervalRef.current != null) return; pollIntervalRef.current = setInterval(tick, 60 * 1000) }
    const stop = () => { if (pollIntervalRef.current != null) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null } }
    if (document.visibilityState === 'visible') start()
    const onVisibility = () => { if (document.visibilityState === 'visible') start(); else stop() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  // Phase 1: 今日 partner (child) voice の 未聴 stats fetch (mount + visibilitychange)
  const refreshPartnerStats = useCallback(() => {
    if (isDemoTest || !currentPairId) return
    getTodayPartnerUnlistenedStats(currentPairId, LISTEN_ROLE_CHILD)
      .then((s) => setPartnerStats(s))
      .catch(() => {})
    // Fix 2: 全期間 partner 未聴 flag (date またぎ 🔴 + Album badge)
    getAnyPartnerUnlistenedFlagServerSeen(currentPairId, LISTEN_ROLE_CHILD)
      .then((flag) => setAnyPartnerUnlistened(flag))
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

  const handleStopParent = () => {
    const el = parentAudioRef.current
    if (el) { el.pause(); el.currentTime = 0 }
    setIsPlayingParent(false)
  }

  const handlePlayParent = async () => {
    if (isPlayingParent) { handleStopParent(); return }
    if (hasParentAudio === false) return
    setIsLoadingParent(true)
    setErrorLine(null)
    const el = parentAudioRef.current
    if (el) { el.pause(); el.src = ''; el.load() }
    setParentAudioUrl(null)
    if (isDemoTest) {
      setParentAudioUrl('/demo-audio.mp3')
      setIsLoadingParent(false)
      const el2 = parentAudioRef.current
      if (el2) { el2.src = '/demo-audio.mp3'; el2.currentTime = 0; await el2.play(); setIsPlayingParent(true) }
      return
    }
    const result = await fetchAudioForPlayback(LISTEN_ROLE_CHILD, currentPairId)
    if (result.error) {
      console.error('[handlePlayParent] fetchAudio error:', result.errorCode, result.error)
      setErrorLine(`再生エラー: ${result.errorCode} - ${result.error}`)
      setIsLoadingParent(false)
      if (result.hasAudio === false) { setHasParentAudio(false); setIsParentUnseen(false) }
      return
    }
    setParentAudioUrl(result.url)
    setIsLoadingParent(false)
    if (result.hasAudio !== undefined) setHasParentAudio(result.hasAudio)
    try {
      const el = parentAudioRef.current
      console.log('[handlePlayParent] setting src:', result.url?.substring(0, 80), 'mode:', result.mode)
      if (el) {
        el.src = result.url
        el.currentTime = 0
        console.log('[handlePlayParent] calling play()...')
        await el.play()
        console.log('[handlePlayParent] play() succeeded')
        setIsPlayingParent(true)
        const seenDateKey = result.dateKey || partnerDateKeyRef.current
        markSeen(LISTEN_ROLE_CHILD, currentPairId, seenDateKey).then(() => setIsParentUnseen(false)).catch(() => {})
        // Phase 1: Home Play は最新 voice 再生 → 該当 hhmm を listened にマーク + count 即減
        const todayKey = getDateKey()
        if (seenDateKey === todayKey && partnerStats.latestHhmm !== null) {
          markVoiceListened(currentPairId, todayKey, LISTEN_ROLE_CHILD, partnerStats.latestHhmm)
          setPartnerStats((prev) => ({ ...prev, unlistened: Math.max(0, prev.unlistened - 1) }))
        }
      }
    } catch (playErr) {
      console.error('[handlePlayParent] play() FAILED:', playErr?.name, playErr?.message, playErr)
      setErrorLine(`${t(lang, 'playFailed')} (${playErr?.name}: ${playErr?.message})`)
    }
  }

  const handleParentEnded = () => setIsPlayingParent(false)

  useEffect(() => {
    return () => {
      if (parentAudioUrl && parentAudioUrl.startsWith('blob:')) URL.revokeObjectURL(parentAudioUrl)
      if (oneLinerTimerRef.current) clearTimeout(oneLinerTimerRef.current)
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current)
      if (analysisFetchTimerRef.current) clearTimeout(analysisFetchTimerRef.current)
    }
  }, [parentAudioUrl])

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
            <RoleBadge role="parent" lang={lang} onClick={onChangeRole} />
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
            {hasParentAudio === true ? (
              <button type="button" onClick={handlePlayParent} disabled={isLoadingParent} style={{ position: 'relative', overflow: 'hidden', width: '100%', padding: 14, fontSize: 17, fontWeight: 800, color: '#fff', background: 'linear-gradient(90deg, #8b5cf6, #a78bfa, #c084fc)', border: 'none', borderRadius: 12, cursor: isLoadingParent ? 'wait' : 'pointer', fontFamily: 'Nunito, sans-serif' }}>
                <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.18), transparent)', pointerEvents: 'none' }} />
                {isLoadingParent ? t(lang, 'loading') : (
                  <>
                    {isPlayingParent
                      ? (lang === 'en' ? '⏹ Stop' : lang === 'es' ? '⏹ Detener' : '⏹ 停止')
                      : (lang === 'en' ? '▶ Play' : lang === 'es' ? '▶ Reproducir' : '▶ 再生')}
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginLeft: 6 }}>
                      ({partnerStats.total - partnerStats.unlistened}/{partnerStats.total})
                    </span>
                    {!isPlayingParent && anyPartnerUnlistened > 0 ? ' 🔴' : ''}
                  </>
                )}
              </button>
            ) : (
              <button type="button" disabled style={{ position: 'relative', overflow: 'hidden', width: '100%', padding: 14, fontSize: 17, fontWeight: 800, color: '#fff', background: 'linear-gradient(90deg, #8b5cf6, #a78bfa, #c084fc)', border: 'none', borderRadius: 12, cursor: 'default', opacity: 0.4, fontFamily: 'Nunito, sans-serif' }}>
                <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.18), transparent)', pointerEvents: 'none' }} />
                {lang === 'en' ? '▶ Play' : lang === 'es' ? '▶ Reproducir' : '▶ 再生'}
              </button>
            )}
            {hasParentAudio === true && isPlayingParent && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 12, overflow: 'hidden' }}>
                <Visualizer source={parentAudioRef.current} active color="rgba(255,255,255,0.35)" />
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
            ▶ {lang === 'en' ? 'Recording as Parent' : lang === 'es' ? 'Grabando como Padre/Madre' : '親として録音します'} 👴🏻👵🏻
          </p>
          <div style={{ position: 'relative', width: '100%' }}>
            <button type="button" onClick={handleClick} disabled={isUploading} style={{ position: 'relative', overflow: 'hidden', width: '100%', padding: 14, fontSize: 17, fontWeight: 800, color: '#fff', background: isUploading ? '#B0A0C8' : isRecording ? 'linear-gradient(90deg, #ef4444, #f97316, #f59e0b)' : 'linear-gradient(90deg, #c084fc, #e879a0, #f97316)', opacity: isUploading ? 1 : 0.85, border: 'none', borderRadius: 12, cursor: isUploading ? 'wait' : 'pointer', fontFamily: 'Nunito, sans-serif' }}>
              <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.18), transparent)', pointerEvents: 'none' }} />
              {isUploading ? t(lang, 'sending') : isRecording ? (lang === 'en' ? '⏹ Recording...' : lang === 'es' ? '⏹ Grabando...' : '⏹ 録音中…') : (lang === 'en' ? '🎙 Record' : lang === 'es' ? '🎙 Grabar' : '🎙 録音')}
            </button>
            {isRecording && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 12, overflow: 'hidden' }}>
                <Visualizer source={analyserRef.current} active color="rgba(255,255,255,0.4)" />
              </div>
            )}
          </div>

          <DailyPromptCard pairId={currentPairId} role={ROLE_PARENT} onTopicChange={handleTopicChange} lang={lang} />
        </section>

        {/* (3) Photos card — 3D purple */}
        <section style={{ width: '100%', background: 'linear-gradient(145deg, #f4f0ff, #ede8ff)', borderRadius: 20, padding: 16, boxShadow: '0 4px 0 #c0a8f0, 0 6px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)', overflow: 'hidden', fontFamily: 'Nunito, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📷</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#3a1a7a' }}>
              {lang === 'en' ? 'Send photos' : lang === 'es' ? 'Enviar fotos' : '写真を送る'} · {isDemoTest ? 3 : photos.filter((p) => p.role === ROLE_PARENT).length}/3
            </span>
          </div>

          {/* Phase X-2.5: DEMO でも通常 flow に統一、tap で CTA モーダル */}
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

          {dailyPhotoLimitMessage && (
            <p style={{ fontSize: 11, color: '#5a3a8a', margin: '0 0 4px' }}>{dailyPhotoLimitMessage}</p>
          )}

          <button type="button" disabled={journalUploading} onClick={() => { if (isDemoTest) { setDemoModalOpen(true); return } if (genericGalleryInputRef.current) { genericGalleryInputRef.current.value = ''; genericGalleryInputRef.current.click() } }} style={{ position: 'relative', overflow: 'hidden', width: '100%', padding: 14, fontSize: 17, fontWeight: 800, color: '#fff', background: 'linear-gradient(90deg, #7c3aed, #a855f7, #ec4899)', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
            <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.18), transparent)', pointerEvents: 'none' }} />
            {lang === 'en' ? '📷 Add Photo' : lang === 'es' ? '📷 Añadir foto' : '📷 写真を追加する'}
          </button>

        </section>

        {errorLine && <p style={{ fontSize: 14, color: '#E04040', textAlign: 'center', margin: 0 }}>{errorLine}</p>}
      </main>

      {/* Bottom nav */}
      <nav className="bottom-nav">
        <button type="button" className="active"><span style={{ fontSize: 20 }}>🏠</span><span>{lang === 'en' ? 'Home' : lang === 'es' ? 'Inicio' : 'ホーム'}</span></button>
        <button type="button" onClick={() => {
          if (isRecording) {
            const msg = lang === 'en' ? 'Recording in progress. Stop and navigate away?' : lang === 'es' ? 'Grabación en curso. ¿Detener y salir?' : '録音中です。中断して移動しますか？'
            if (!window.confirm(msg)) return
            stopRecording()
          }
          if (!slug) { console.error('slug required'); return }
          navigate(`/pair/${slug}/album`)
        }}><span style={{ fontSize: 20, position: 'relative', display: 'inline-block' }}>🖼{anyPartnerUnlistened > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 9, background: '#B8A0E8', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, border: '1.5px solid #fff', fontFamily: 'Nunito, sans-serif' }}>
            {anyPartnerUnlistened >= 10 ? '9+' : anyPartnerUnlistened}
          </span>
        )}</span><span>{lang === 'en' ? 'Album' : lang === 'es' ? 'Álbum' : 'アルバム'}</span></button>
        <button type="button" onClick={handleShare}><span style={{ fontSize: 20 }}>👋</span><span>{lang === 'en' ? 'Invite' : lang === 'es' ? 'Invitar' : '招待'}</span></button>
      </nav>

      <audio ref={parentAudioRef} onEnded={handleParentEnded} onPause={() => setIsPlayingParent(false)} style={{ display: 'none' }} />

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
