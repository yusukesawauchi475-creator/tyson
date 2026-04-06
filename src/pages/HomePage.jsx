import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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

  const ROLE_PARENT = 'parent'
  const LISTEN_ROLE_CHILD = 'child'
  const [currentPairId] = useState(() => getPairId())
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
        const result = await uploadAudio(blob, ROLE_PARENT, getPairId(), getDateKey(), reqId)
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
            updateStreak(getPairId()).then(({ success, count }) => { if (success) setStreakCount(count) })
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
                body: JSON.stringify({ pairId: getPairId(), dateKey: dateKeyForThisUpload, role: ROLE_PARENT, topic: topicRef.current, durationSec }),
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
                body: JSON.stringify({ pairId: getPairId(), dateKey: dateKeyForThisUpload, role: ROLE_PARENT, sourceVersion, version: sourceVersion }),
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
                  const res = await fetch(`/api/analysis-comment?pairId=${getPairId()}&dateKey=${dateKeyForThisUpload}&role=${ROLE_PARENT}`, {
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
      const result = await uploadJournalImage(toUpload, reqId, getPairId(), ROLE_PARENT, kind)
      setJournalUploading(false)
      if (result.success) {
        setJournalRequestId(result.requestId)
        if (kind === 'journal_image') {
          setJournalUploaded(true)
          if (result.dateKey) setJournalDateKey(result.dateKey)
          fetchTodayJournalMeta(getPairId(), ROLE_PARENT).then((r) => {
            setJournalUploaded(!!r.hasImage)
            if (r.dateKey) setJournalDateKey(r.dateKey)
          })
          fetchMyJournal()
          setTimeout(() => fetchMyJournal(), 600)
        }
        if (kind === 'generic_image') {
          setDailyPhotoLimitMessage(null)
          const doRefresh = () => fetchTodayJournalMeta(getPairId(), ROLE_PARENT).then((r) => setPhotos(r.photos ?? []))
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
    const pid = getPairId()
    let url = `https://www.humfamily.com/#/?pairId=${encodeURIComponent(pid)}`
    try {
      const snap = await getDoc(doc(db, 'pairs', pid))
      const num = snap.data()?.number
      if (num) url = `https://www.humfamily.com/pair/${num}`
    } catch (_) {}
    const text = lang === 'en'
      ? "Let's exchange voices every day on Hum. Listen to today's message 👋"
      : 'Humで毎日声を交換しよう。今日のメッセージを聞いてね 👋'
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
    getListenRoleMeta(LISTEN_ROLE_CHILD).then(({ hasAudio, isUnseen }) => {
      setHasParentAudio(hasAudio)
      setIsParentUnseen(!!isUnseen)
    })
  }

  const fetchMyJournal = useCallback(async () => {
    setMyJournalLoading(true)
    setMyJournalError(null)
    try {
      const url = await fetchJournalViewUrl(getPairId(), 'parent')
      setMyJournalUrl(url)
    } catch (e) {
      setMyJournalError(e?.message || String(e))
      setMyJournalUrl(null)
    } finally {
      setMyJournalLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTodayJournalMeta(getPairId())
      .then(({ hasImage, dateKey, photos: p }) => {
        setJournalUploaded(!!hasImage)
        if (dateKey) setJournalDateKey(dateKey)
        setPhotos(Array.isArray(p) ? p : [])
      })
      .catch((e) => setJournalError(e?.message || String(e)))
  }, [])

  useEffect(() => { fetchMyJournal() }, [fetchMyJournal])

  useEffect(() => {
    getStreak(getPairId()).then(({ count, firstDateKey }) => {
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
      .then(({ hasAudio, isUnseen }) => {
        if (!cancelled) { setHasParentAudio(hasAudio); setIsParentUnseen(!!isUnseen) }
      })
      .catch((e) => setJournalError(t(lang, 'initError', { msg: e?.message || String(e) })))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (uploadingRef.current || loadingParentRef.current || playingParentRef.current) return
      getListenRoleMeta(LISTEN_ROLE_CHILD).then(({ hasAudio, isUnseen }) => {
        setHasParentAudio(hasAudio)
        setIsParentUnseen(!!isUnseen)
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
        markSeen(LISTEN_ROLE_CHILD).then(() => setIsParentUnseen(false))
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
      <header style={{ flexShrink: 0, background: 'linear-gradient(135deg, #FF80C0 0%, #C080FF 50%, #80C0FF 100%)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

      <main className="page-content page" style={{ flex: 1, maxWidth: 480, margin: '0 auto', width: '100%', paddingTop: 14 }}>
        <WeeklySummary lang={lang} />

        {/* (1) Receive card */}
        <section style={{ width: '100%', minHeight: 160, background: '#E8FFF4', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(48,168,112,0.06)', overflow: 'hidden' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#30A870', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(lang, 'partnerRecordingListen')}</p>
          {hasParentAudio === true ? (
            <>
              <p style={{ fontSize: 14, color: '#1A6040', fontWeight: 700, margin: '0 0 10px' }}>
                {t(lang, 'received')}
                {isParentUnseen && <span style={{ marginLeft: 6, color: '#E04040' }} title={lang === 'en' ? 'Unplayed' : '未再生'}>●</span>}
              </p>
              <button type="button" onClick={handlePlayParent} disabled={isLoadingParent} style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, color: '#fff', background: isLoadingParent ? '#B0A0C8' : isPlayingParent ? 'linear-gradient(160deg,#E04040,#C02020)' : 'linear-gradient(160deg,#40D890,#18B868)', border: 'none', borderRadius: 14, cursor: isLoadingParent ? 'wait' : 'pointer', boxShadow: isLoadingParent ? 'none' : isPlayingParent ? '0 5px 0 #901010' : '0 5px 0 #109848', marginBottom: 10 }}>
                {isLoadingParent ? t(lang, 'loading') : isPlayingParent ? (lang === 'en' ? '⏹ Stop' : '⏹ 停止') : (lang === 'en' ? '▶ Play' : '▶ 再生')}
              </button>
            </>
          ) : hasParentAudio === false ? (
            <p style={{ fontSize: 14, color: '#1A6040', margin: '0 0 10px', opacity: 0.6 }}>{t(lang, 'notReceivedYet')}</p>
          ) : (
            <>
              <p style={{ fontSize: 14, color: '#1A6040', margin: '0 0 10px', opacity: 0.6 }}>{t(lang, 'checking')}</p>
              {showReloadButton && (
                <button type="button" onClick={() => window.location.reload()} style={{ padding: '6px 14px', fontSize: 12, color: '#30A870', border: '1.5px solid #30A870', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>{t(lang, 'reload')}</button>
              )}
            </>
          )}
          {hasParentAudio !== null && (
            <button type="button" onClick={refreshParentStatus} style={{ padding: '5px 14px', fontSize: 12, color: '#30A870', background: 'transparent', border: '1.5px solid #30A870', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>{t(lang, 'refresh')}</button>
          )}
        </section>

        {/* (2) Send card */}
        <section style={{ width: '100%', minHeight: 160, background: '#FFF4E8', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(208,112,48,0.06)', overflow: 'hidden' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#D07030', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(lang, 'myRecordingRecordSend')}</p>
          <button type="button" onClick={handleClick} disabled={isUploading} style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, color: '#fff', background: isUploading ? '#B0A0C8' : isRecording ? 'linear-gradient(160deg,#FF4040,#C02020)' : 'linear-gradient(160deg,#FF8848,#F04818)', border: 'none', borderRadius: 14, cursor: isUploading ? 'wait' : 'pointer', boxShadow: isUploading ? 'none' : isRecording ? '0 5px 0 #901010' : '0 5px 0 #C03010' }}>
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

          <DailyPromptCard pairId={getPairId()} role={ROLE_PARENT} onTopicChange={handleTopicChange} lang={lang} />

          {oneLinerVisible && oneLiner && (
            <div style={{ width: '100%', marginTop: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.55)', borderRadius: 10, fontSize: 14, color: '#804020', textAlign: 'center', lineHeight: 1.5 }}>{oneLiner}</div>
          )}
          {analysisVisible && analysisComment && (
            <div style={{ width: '100%', marginTop: 8, padding: '8px 12px', fontSize: 12, color: '#B08050', textAlign: 'center', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{analysisComment}</div>
          )}
        </section>

        {/* (3) Photos card */}
        <section style={{ width: '100%', minHeight: 160, background: '#F0EEFF', borderRadius: 18, padding: 18, boxShadow: '0 2px 16px rgba(112,80,192,0.06)', overflow: 'hidden' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#7050C0', margin: '0 0 10px' }}>
            📷 {lang === 'en' ? "Today's Photos" : '今日の写真'}　<span style={{ fontWeight: 500, color: '#8070A0' }}>{isDemoTest ? 3 : photos.filter((p) => p.role === ROLE_PARENT).length}/3{lang === 'en' ? '' : '枚'}</span>
          </p>

          {isDemoTest ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['/demo-photos/kidstravelpakutasoIMG_3146_TP_V4.webp', '/demo-photos/Gemini_Generated_Image_4fx62a4fx62a4fx6.png', '/demo-photos/kidstravelpakutasoIMG_3155_TP_V.webp'].map((url, i) => (
                <img key={i} src={url} alt="" width={88} height={88} style={{ width: 88, height: 88, objectFit: 'cover', display: 'block', borderRadius: 11 }} />
              ))}
            </div>
          ) : (
            <>
              <input ref={genericGalleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f && typeof f.type === 'string' && f.type.startsWith('image/')) handleJournalFile(f, 'generic_image'); e.target.value = '' }} />
              <input ref={genericCameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJournalFile(f, 'generic_image'); e.target.value = '' }} />

              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {photos.slice(0, 6).map((ph, i) => (
                  <button key={ph.storagePath + String(i)} type="button" onClick={() => navigate(lang === 'en' ? '/album/eng' : '/album', { state: { scrollToDate: dateKey } })} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 11, overflow: 'hidden', flexShrink: 0 }} aria-label={lang === 'en' ? 'View in album' : 'アルバムで見る'}>
                    <img src={ph.url || ''} alt="" width={52} height={52} style={{ width: 52, height: 52, objectFit: 'cover', display: 'block', borderRadius: 11 }} />
                  </button>
                ))}
                {photos.filter((p) => p.role === ROLE_PARENT).length < 3 && (
                  <button type="button" onClick={() => { if (genericGalleryInputRef.current) { genericGalleryInputRef.current.value = ''; genericGalleryInputRef.current.click() } }} disabled={journalUploading} style={{ width: 52, height: 52, border: '2px dashed #9070C8', borderRadius: 11, background: 'rgba(112,80,208,0.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, cursor: 'pointer', padding: 0 }}>
                    <span style={{ fontSize: 20, lineHeight: 1 }}>📷</span>
                    <span style={{ fontSize: 8, color: '#9070C8', fontWeight: 600, lineHeight: 1 }}>{lang === 'en' ? 'Add' : '追加'}</span>
                  </button>
                )}
              </div>

              {dailyPhotoLimitMessage && (
                <p style={{ fontSize: 12, color: '#B0A0C8', margin: '0 0 8px' }}>{dailyPhotoLimitMessage}</p>
              )}

              <button type="button" disabled={journalUploading} onClick={() => { if (genericGalleryInputRef.current) { genericGalleryInputRef.current.value = ''; genericGalleryInputRef.current.click() } }} style={{ width: '100%', padding: 13, fontSize: 14, fontWeight: 700, color: '#fff', background: 'linear-gradient(160deg,#B890F8,#8058D0)', border: 'none', borderRadius: 14, cursor: 'pointer', boxShadow: '0 4px 0 #5838A8' }}>
                {lang === 'en' ? '📷 Add Photo' : '📷 写真を追加する'}
              </button>
            </>
          )}

        </section>

        {/* (4) Journal card */}
        <section style={{ width: '100%', minHeight: 160, background: '#FFF4F8', borderRadius: 18, padding: '28px 18px', boxShadow: '0 2px 16px rgba(192,64,128,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#C04080', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {lang === 'en' ? '📔 TODAY\'S NOTE' : '📔 今日の記録'}
          </p>
          <span style={{ fontSize: 32, lineHeight: 1, margin: '6px 0' }}>🔜</span>
          <p style={{ fontSize: 16, color: '#C080A0', margin: '8px 0 0', textAlign: 'center', fontWeight: 700 }}>
            Coming Soon
          </p>
        </section>

        {errorLine && <p style={{ fontSize: 14, color: '#E04040', textAlign: 'center', margin: 0 }}>{errorLine}</p>}
      </main>

      {/* Bottom nav */}
      <nav className="bottom-nav">
        <button type="button" className="active"><span style={{ fontSize: 20 }}>🏠</span><span>{lang === 'en' ? 'Home' : 'ホーム'}</span></button>
        <button type="button" onClick={() => navigate(lang === 'en' ? '/album/eng' : '/album')}><span style={{ fontSize: 20 }}>🖼</span><span>{lang === 'en' ? 'Album' : 'アルバム'}</span></button>
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
