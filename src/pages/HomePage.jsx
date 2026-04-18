import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { uploadAudio, fetchAudioForPlayback, getListenRoleMeta, markSeen, getPairId, getDateKey, genRequestId, getStreak, updateStreak } from '../lib/pairDaily'
import { uploadJournalImage, fetchTodayJournalMeta, fetchJournalViewUrl, resizeImageIfNeeded } from '../lib/journal'
import { getFinalOneLiner, getAnalysisPlaceholder } from '../lib/uiCopy'
import { t } from '../lib/i18n'
import DailyPromptCard, { getCountry, cycleCountry } from '../components/DailyPromptCard'
import LanguageSwitch from '../components/LanguageSwitch'
import { getIdTokenForApi, auth, isFirebaseConfigured, db } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { formatDeployedAtLocal, getBuildHash } from '../lib/dateFormat'
import { useAudioLevel } from '../lib/useAudioLevel'
import UploadErrorModal from '../components/UploadErrorModal'
import WeeklySummary from '../components/WeeklySummary'

export default function HomePage({ lang = 'ja', onChangeRole }) {
  const navigate = useNavigate()
  const outletContext = useOutletContext()
  const slug = outletContext?.slug
  const [streakCount, setStreakCount] = useState(null)
  const [daysSinceStart, setDaysSinceStart] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [sentAt, setSentAt] = useState(null)
  const [errorLine, setErrorLine] = useState(null)
  const [hasParentAudio, setHasParentAudio] = useState(null)
  const [debugAuthInfo, setDebugAuthInfo] = useState('...')
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
  const { level, isSpeaking, start: startAudioLevel, stop: stopAudioLevel } = useAudioLevel()
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
  const [currentPairId] = useState(() => outletContext?.pairId ?? getPairId())
  const isDemoTest = currentPairId === 'PAIR-DEMOTEST'

  const handleTopicChange = useCallback((topic) => {
    setDailyTopic(topic)
    topicRef.current = topic
  }, [])

  const startRecording = async () => {
    if (isDemoTest) { setToastMsg(lang === 'en' ? 'This is a demo. Audio will not be sent.' : 'これはデモです。音声は送信されません'); setTimeout(() => setToastMsg(null), 2500); return }
    if (isUploading) return
    setErrorLine(null)
    setSentAt(null)
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
          setSentAt(new Date())
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
    if (isDemoTest) { setToastMsg(lang === 'en' ? 'This is a demo. Photos will not be added.' : 'これはデモです。写真はアルバムに追加されません'); setTimeout(() => setToastMsg(null), 2500); return }
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

  const handleShare = async () => {
    if (isRecording) {
      const msg = lang === 'en' ? 'Recording in progress. Stop and navigate away?' : '録音中です。中断して移動しますか？'
      if (!window.confirm(msg)) return
      stopRecording()
    }
    const pid = currentPairId
    if (!pid) {
      alert(lang === 'en' ? 'Pair ID not found. Please open from your invite link.' : 'ペアIDが見つかりません。招待リンクからアクセスしてください。')
      return
    }
    let url = `https://www.humfamily.com/#/?pairId=${encodeURIComponent(pid)}&role=child&openExternalBrowser=1`
    if (slug) {
      url = `https://www.humfamily.com/pair/${slug}?role=child&openExternalBrowser=1`
    } else {
      try {
        const snap = await getDoc(doc(db, 'pairs', pid))
        const num = snap.data()?.number
        if (num) url = `https://www.humfamily.com/pair/${num}?role=child&openExternalBrowser=1`
      } catch (_) {}
    }
    const text = lang === 'en'
      ? 'Connect with your family every day with Hum. Open this link to get started.'
      : '毎日1分、声でつながるアプリHumです。このリンクを開いて始めてください。'
    if (navigator.share) {
      try { await navigator.share({ title: 'Hum', text, url }) } catch (_) {}
    } else {
      try {
        await navigator.clipboard.writeText(url)
        alert(lang === 'en' ? 'Link copied!' : 'リンクをコピーしました')
      } catch (_) {
        alert(lang === 'en' ? 'Copy failed' : 'コピーに失敗しました')
      }
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
    getListenRoleMeta(LISTEN_ROLE_CHILD).then(({ hasAudio, isUnseen, dateKey: dk }) => {
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
    let cancelled = false
    getListenRoleMeta(LISTEN_ROLE_CHILD)
      .then(({ hasAudio, isUnseen, dateKey: dk }) => {
        if (!cancelled) { setHasParentAudio(hasAudio); setIsParentUnseen(!!isUnseen); if (dk) partnerDateKeyRef.current = dk }
      })
      .catch((e) => setJournalError(t(lang, 'initError', { msg: e?.message || String(e) })))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (uploadingRef.current || loadingParentRef.current || playingParentRef.current) return
      getListenRoleMeta(LISTEN_ROLE_CHILD).then(({ hasAudio, isUnseen, dateKey: dk }) => {
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
    const result = await fetchAudioForPlayback(LISTEN_ROLE_CHILD)
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
        markSeen(LISTEN_ROLE_CHILD, undefined, seenDateKey).then(() => setIsParentUnseen(false)).catch(() => {})
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

  const sentAtStr = sentAt
    ? sentAt.toLocaleTimeString(lang === 'en' ? 'en-US' : 'ja-JP', { hour: '2-digit', minute: '2-digit' })
    : ''

  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  })

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', background: 'var(--color-bg)', color: 'var(--color-text)', paddingBottom: 72, overflow: 'hidden' }}>
      {/* Gradient Header */}
      <header style={{ flexShrink: 0, background: 'linear-gradient(135deg, #FF80C0 0%, #C080FF 50%, #80C0FF 100%)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="Hum" width={36} height={36} style={{ borderRadius: 10, objectFit: 'cover' }} />
          <span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>Hum</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {daysSinceStart > 0 && (
            <span style={{ padding: '4px 12px', fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', borderRadius: 20 }}>
              {daysSinceStart}{lang === 'en' ? 'd' : '日目'}
            </span>
          )}
          {streakCount > 0 && (
            <span style={{ padding: '4px 12px', fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', borderRadius: 20 }}>
              🔥{streakCount}{lang === 'en' ? 'd' : '日連続'}
            </span>
          )}
        </div>
      </header>

      {/* Date bar */}
      <div style={{ background: '#F8F0FF', borderBottom: '1px solid #EEE8FF', padding: '8px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <time style={{ fontSize: 11, color: '#8070A0', fontWeight: 600 }}>{today}</time>
          <span style={{ fontSize: 11, fontStyle: 'italic', color: '#9080B0' }}>{lang === 'en' ? '1 min a day, connected by voice' : '毎日1分、声でつながる'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onChangeRole && (
            <button type="button" onClick={onChangeRole} style={{ padding: '2px 6px', fontSize: 10, color: '#8070A0', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              {lang === 'en' ? 'Switch' : '変更'}
            </button>
          )}
          <button type="button" onClick={() => { cycleCountry(); window.location.reload() }} style={{ padding: '2px 6px', fontSize: 10, color: '#8070A0', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            {getCountry().toUpperCase()}
          </button>
        </div>
      </div>

      <main className="page-content page" style={{ flex: 1, maxWidth: 480, margin: '0 auto', width: '100%', paddingTop: 8 }}>
        <WeeklySummary lang={lang} />

        {/* (1) Receive card — green */}
        <section style={{ width: '100%', background: '#b8f0d8', borderRadius: 20, padding: 16, boxShadow: '0 4px 0 0 #6bbf96', overflow: 'hidden', fontFamily: 'Nunito, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👂</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#1a5c3a' }}>{lang === 'en' ? "Listen to partner's voice" : '相手の声を聴く'}</span>
          </div>
          {hasParentAudio === true ? (
            <button type="button" onClick={handlePlayParent} disabled={isLoadingParent} style={{ width: '100%', padding: 14, fontSize: 17, fontWeight: 800, color: '#1a6645', background: '#fff', border: 'none', borderRadius: 14, cursor: isLoadingParent ? 'wait' : 'pointer', boxShadow: '0 4px 0 #a8d8bc', fontFamily: 'Nunito, sans-serif' }}>
              {isLoadingParent ? t(lang, 'loading') : isPlayingParent ? (lang === 'en' ? '⏹ Stop' : '⏹ 停止') : (lang === 'en' ? '▶ Play' : '▶ 再生')}
              {isParentUnseen && !isPlayingParent && !isLoadingParent && <span style={{ marginLeft: 6, color: '#E04040' }}>●</span>}
            </button>
          ) : (
            <button type="button" disabled style={{ width: '100%', padding: 14, fontSize: 17, fontWeight: 800, color: '#1a6645', background: '#fff', border: 'none', borderRadius: 14, cursor: 'default', boxShadow: '0 4px 0 #a8d8bc', opacity: 0.4, fontFamily: 'Nunito, sans-serif' }}>
              {hasParentAudio === false ? (lang === 'en' ? '▶ Not yet received' : '▶ まだ届いていません') : (lang === 'en' ? '▶ Checking...' : '▶ 確認中…')}
            </button>
          )}
        </section>

        {/* (2) Send card — pink */}
        <section style={{ width: '100%', background: '#f5d8e0', borderRadius: 20, padding: 16, boxShadow: '0 4px 0 0 #c98fa0', overflow: 'hidden', fontFamily: 'Nunito, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎙</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#6b2a3a' }}>{lang === 'en' ? 'Record & send your voice' : '声を録って送る'}</span>
          </div>
          <button type="button" onClick={handleClick} disabled={isUploading} style={{ width: '100%', padding: 14, fontSize: 17, fontWeight: 800, color: '#fff', background: isUploading ? '#B0A0C8' : isRecording ? '#E04040' : '#c0536e', border: 'none', borderRadius: 14, cursor: isUploading ? 'wait' : 'pointer', boxShadow: isUploading ? 'none' : isRecording ? '0 4px 0 #901010' : '0 4px 0 #8a2a42', fontFamily: 'Nunito, sans-serif' }}>
            {isUploading ? t(lang, 'sending') : isRecording ? (lang === 'en' ? '⏹ Recording...' : '⏹ 録音中…') : (lang === 'en' ? '🎙 Record' : '🎙 録音')}
          </button>

          {isRecording && isSpeaking && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 8, height: 20 }}>
              {[0, 1, 2, 3, 4].map((i) => {
                const jitter = (Math.random() - 0.5) * 0.1
                const scale = Math.max(0.2, Math.min(1.0, level * 8 + jitter))
                return <span key={i} style={{ width: 3, height: '100%', background: '#c0536e', borderRadius: 2, transform: `scaleY(${scale})`, transformOrigin: 'center', transition: 'transform 0.1s ease-out' }} />
              })}
            </div>
          )}

          {sentAt && (
            <p style={{ fontSize: 12, color: '#6b2a3a', fontWeight: 700, margin: '8px 0 0', textAlign: 'center', fontFamily: 'Nunito, sans-serif' }}>
              {t(lang, 'sentAt', { time: sentAtStr })}
            </p>
          )}

          <DailyPromptCard pairId={currentPairId} role={ROLE_PARENT} onTopicChange={handleTopicChange} lang={lang} />
        </section>

        {/* (3) Photos card — purple */}
        <section style={{ width: '100%', background: '#d4bfff', borderRadius: 20, padding: 16, boxShadow: '0 4px 0 0 #8b6bd4', overflow: 'hidden', fontFamily: 'Nunito, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📷</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#3a1a7a' }}>
              {lang === 'en' ? 'Send photos' : '写真を送る'} · {isDemoTest ? 3 : photos.filter((p) => p.role === ROLE_PARENT).length}/3
            </span>
          </div>

          {isDemoTest ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {['/demo-photos/kidstravelpakutasoIMG_3146_TP_V4.webp', '/demo-photos/Gemini_Generated_Image_4fx62a4fx62a4fx6.png', '/demo-photos/kidstravelpakutasoIMG_3155_TP_V.webp'].map((url, i) => (
                <img key={i} src={url} alt="" width={48} height={48} style={{ width: 48, height: 48, objectFit: 'cover', display: 'block', borderRadius: 10 }} />
              ))}
            </div>
          ) : (
            <>
              <input ref={genericGalleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f && typeof f.type === 'string' && f.type.startsWith('image/')) handleJournalFile(f, 'generic_image'); e.target.value = '' }} />
              <input ref={genericCameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJournalFile(f, 'generic_image'); e.target.value = '' }} />

              {photos.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {photos.slice(0, 6).map((ph, i) => (
                    <button key={ph.storagePath + String(i)} type="button" onClick={() => navigate(slug ? `/pair/${slug}/album` : (lang === 'en' ? `/album/eng?pairId=${currentPairId}` : `/album?pairId=${currentPairId}`), { state: { scrollToDate: dateKey, from: window.location.pathname + window.location.search || '/' } })} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }} aria-label={lang === 'en' ? 'View in album' : 'アルバムで見る'}>
                      <img src={ph.url || ''} alt="" width={48} height={48} style={{ width: 48, height: 48, objectFit: 'cover', display: 'block', borderRadius: 10 }} />
                    </button>
                  ))}
                </div>
              )}

              {dailyPhotoLimitMessage && (
                <p style={{ fontSize: 11, color: '#5a3a8a', margin: '0 0 4px' }}>{dailyPhotoLimitMessage}</p>
              )}

              <button type="button" disabled={journalUploading} onClick={() => { if (genericGalleryInputRef.current) { genericGalleryInputRef.current.value = ''; genericGalleryInputRef.current.click() } }} style={{ width: '100%', padding: 14, fontSize: 17, fontWeight: 800, color: '#fff', background: '#7c4fd4', border: 'none', borderRadius: 14, cursor: 'pointer', boxShadow: '0 4px 0 #4a2490', fontFamily: 'Nunito, sans-serif' }}>
                {lang === 'en' ? '📷 Add Photo' : '📷 写真を追加する'}
              </button>
            </>
          )}

        </section>

        {errorLine && <p style={{ fontSize: 14, color: '#E04040', textAlign: 'center', margin: 0 }}>{errorLine}</p>}
      </main>

      {/* Bottom nav */}
      <nav className="bottom-nav">
        <button type="button" className="active"><span style={{ fontSize: 20 }}>🏠</span><span>{lang === 'en' ? 'Home' : 'ホーム'}</span></button>
        <button type="button" onClick={() => {
          if (isRecording) {
            const msg = lang === 'en' ? 'Recording in progress. Stop and navigate away?' : '録音中です。中断して移動しますか？'
            if (!window.confirm(msg)) return
            stopRecording()
          }
          navigate(slug ? `/pair/${slug}/album` : (lang === 'en' ? `/album/eng?pairId=${currentPairId}` : `/album?pairId=${currentPairId}`), { state: { from: window.location.pathname + window.location.search || '/' } })
        }}><span style={{ fontSize: 20 }}>🖼</span><span>{lang === 'en' ? 'Album' : 'アルバム'}</span></button>
        <button type="button" onClick={handleShare}><span style={{ fontSize: 20 }}>👋</span><span>{lang === 'en' ? 'Invite' : '招待'}</span></button>
      </nav>

      <audio ref={parentAudioRef} onEnded={handleParentEnded} onPause={() => setIsPlayingParent(false)} style={{ display: 'none' }} />

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
