import { useState, useEffect, useRef } from 'react'
import '../App.css'
import { db } from '../lib/firebase'
import { collection, doc, updateDoc, query, orderBy, getDocs, limit, getDoc } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { saveAudioToIndexedDB, getSavedAudioCount, getAllSavedAudio, deleteAudioFromIndexedDB, markAsSynced, addPendingDiagnosis, getAllPendingDiagnosis, removePendingDiagnosis, clearAllPendingDiagnosis } from '../lib/indexedDB'
import { TYSON_DEFAULT_THEME, TYSON_FALLBACK_THEMES, isTysonTheme } from '../lib/tysonThemes'
import { formatTodayJST, getBuildHash } from '../lib/dateFormat'

function HomePage() {
  const [isRecording, setIsRecording] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [streak, setStreak] = useState(0)
  const [lastRecordDate, setLastRecordDate] = useState(null)
  const [userName, setUserName] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)
  const [dailyTheme, setDailyTheme] = useState(TYSON_DEFAULT_THEME)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [sonMessage, setSonMessage] = useState('')
  const [fogCleared, setFogCleared] = useState(false)
  const [toast, setToast] = useState(null)
  const [debugInfo, setDebugInfo] = useState(null) // デバッグ情報
  const [hasBackupData, setHasBackupData] = useState(false)
  const [isOpenAIConfigured, setIsOpenAIConfigured] = useState(true) // デフォルトはtrue（後でチェック）
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const sonMessageAudioRef = useRef(null)
  const analyserRef = useRef(null)
  const audioContextRef = useRef(null)
  const animationFrameRef = useRef(null)
  const [audioData, setAudioData] = useState(new Array(60).fill(0))
  const wakeLockRef = useRef(null)
  const [micPermissionDenied, setMicPermissionDenied] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const recordingStartTimeRef = useRef(null)
  const [envParseError, setEnvParseError] = useState(null)
  const [pendingDiagnosisList, setPendingDiagnosisList] = useState([])
  const [isRetryingDiagnosis, setIsRetryingDiagnosis] = useState(false)
  const [envCheckOk, setEnvCheckOk] = useState(null)
  const [envCheckLoading, setEnvCheckLoading] = useState(false)
  const [apiErrorBanner, setApiErrorBanner] = useState(null)
  const [envCheckResult, setEnvCheckResult] = useState(null)

  const showApiError = (rawMessage) => {
    const msg = typeof rawMessage === 'string' ? rawMessage : (rawMessage?.message ?? String(rawMessage))
    setApiErrorBanner(msg)
    try {
      window.alert('サーバーエラー\n\n' + msg)
    } catch (_) {}
  }

  const waitSyncUnblock = () => {
    const until = (typeof window !== 'undefined' && window.__SYNC_BLOCKED_UNTIL) || 0
    const ms = Math.max(0, until - Date.now())
    return ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve()
  }

  const forceReload = () => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('APP_VERSION')
      if (typeof indexedDB !== 'undefined') {
        indexedDB.deleteDatabase('tyson-db')
        indexedDB.deleteDatabase('TysonAudioBackup')
      }
    } catch (_) {}
    window.location.href = window.location.origin + '?v=' + Date.now()
  }

  // 生のエラーを即時・全画面表示（403 Forbidden / 404 Not Found 等）
  const showRawErrorOverlay = (code, message, label = 'Storage') => {
    const id = 'raw-error-overlay'
    const existing = document.getElementById(id)
    if (existing) existing.remove()
    const httpMap = {
      'storage/unauthorized': '403 Forbidden',
      'storage/unauthenticated': '401 Unauthorized',
      'storage/object-not-found': '404 Not Found',
      'storage/quota-exceeded': '507 Insufficient Storage',
      'storage/retry-limit-exceeded': '503 Service Unavailable',
      'storage/canceled': '499 Client Closed Request',
      'storage/unknown': '500 Internal Server Error',
      'storage/timeout': '408 Request Timeout',
      'firestore/timeout': '408 Request Timeout',
      'permission-denied': '403 Forbidden',
      'unavailable': '503 Service Unavailable'
    }
    const httpStyle = httpMap[code] || code || 'N/A'
    const rawMsg = typeof message === 'string' ? message : (message?.message ?? String(message))
    const msg = rawMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const isCorsLike = /403|unauthorized|permission-denied|unauthenticated|cors/i.test(String(code) + rawMsg)
    const corsHint = isCorsLike
      ? '<div style="margin-top:12px;color:#7bed9f;">👉 CORS未設定なら <a href="/docs/CORS_SETUP_CEO.md" target="_blank" rel="noopener" style="color:#7bed9f;text-decoration:underline;">開通手順（コピペで完了）</a> を参照</div>'
      : ''
    const el = document.createElement('div')
    el.id = id
    el.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: #1a1a2e; color: #ff6b6b;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 16px; padding: 24px; z-index: 999999;
      font-family: monospace; text-align: center; font-size: clamp(14px, 3.5vw, 20px);
    `
    el.innerHTML = `
      <div style="font-size: clamp(20px, 5vw, 32px); font-weight: 900;">🚨 ${label} 生のエラー</div>
      <div style="font-size: clamp(18px, 4.5vw, 28px); color: #ffaa00;">${httpStyle}</div>
      <div style="color: #ccc;">code: ${code ?? 'N/A'}</div>
      <div style="color: #aaa; word-break: break-all; max-width: 90vw;">message: ${msg}</div>
      ${corsHint}
      <button id="raw-error-close" style="margin-top: 24px; padding: 12px 24px; font-size: 18px; cursor: pointer; background: #ff6600; color: #000; border: none; border-radius: 8px;">閉じる</button>
    `
    document.body.appendChild(el)
    document.getElementById('raw-error-close').onclick = () => { el.remove() }
  }

  // JST基準で日付を取得（時差問題を解決）
  const getJSTDate = () => {
    const now = new Date()
    // JST = UTC + 9時間
    const jstOffset = 9 * 60 * 60 * 1000
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000)
    const jstTime = new Date(utcTime + jstOffset)
    jstTime.setHours(0, 0, 0, 0)
    return jstTime
  }

  // 連続日数の計算と検証を強化（JST基準、防弾化）
  const calculateStreak = () => {
    const savedStreak = localStorage.getItem('tyson_streak')
    const savedLastDate = localStorage.getItem('tyson_lastDate')
    const today = getJSTDate()
    
    if (!savedStreak || !savedLastDate) {
      return { streak: 0, lastDate: null }
    }

    const streakNum = parseInt(savedStreak, 10)
    
    // savedLastDate を JST 日付として解釈（UTC ISO 文字列として保存されている場合も JST に変換）
    const savedDate = new Date(savedLastDate)
    const jstOffset = 9 * 60 * 60 * 1000
    const utcTime = savedDate.getTime() + (savedDate.getTimezoneOffset() * 60 * 1000)
    const lastDate = new Date(utcTime + jstOffset)
    lastDate.setHours(0, 0, 0, 0)
    
    const daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24))
    
    if (daysDiff === 0) {
      return { streak: streakNum, lastDate: lastDate }
    } else if (daysDiff === 1) {
      return { streak: streakNum, lastDate: lastDate, canIncrement: true }
    } else if (daysDiff > 1) {
      return { streak: 0, lastDate: null, reset: true }
    } else {
      return { streak: streakNum, lastDate: lastDate }
    }
  }

  // Firestoreから最新の記録を取得して連続日数を検証（防弾化：JST 基準）
  const verifyStreakFromFirestore = async () => {
    try {
      const q = query(
        collection(db, 'shugyo'),
        orderBy('timestamp', 'desc'),
        limit(1)
      )
      const querySnapshot = await getDocs(q)
      
      if (!querySnapshot.empty) {
        const latestDoc = querySnapshot.docs[0].data()
        const latestTimestamp = latestDoc.timestamp?.toDate() || new Date(latestDoc.createdAt?.toDate())
        const latestStreak = latestDoc.streakCount || 0
        
        const today = getJSTDate()
        
        // latestTimestamp を JST 日付に変換
        const jstOffset = 9 * 60 * 60 * 1000
        const utcTime = latestTimestamp.getTime() + (latestTimestamp.getTimezoneOffset() * 60 * 1000)
        const latestJST = new Date(utcTime + jstOffset)
        latestJST.setHours(0, 0, 0, 0)
        
        const daysDiff = Math.floor((today - latestJST) / (1000 * 60 * 60 * 24))
        
        // localStorage には JST 日付を YYYY-MM-DD 文字列で保存（ISO ではなく）
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const latestStr = `${latestJST.getFullYear()}-${String(latestJST.getMonth() + 1).padStart(2, '0')}-${String(latestJST.getDate()).padStart(2, '0')}`
        
        if (daysDiff === 0) {
          setStreak(latestStreak)
          localStorage.setItem('tyson_streak', latestStreak.toString())
          localStorage.setItem('tyson_lastDate', todayStr)
          setLastRecordDate(today)
        } else if (daysDiff === 1) {
          setStreak(latestStreak)
          localStorage.setItem('tyson_streak', latestStreak.toString())
          localStorage.setItem('tyson_lastDate', latestStr)
          setLastRecordDate(latestJST)
        } else {
          setStreak(0)
          localStorage.removeItem('tyson_streak')
          localStorage.removeItem('tyson_lastDate')
          setLastRecordDate(null)
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Firestoreからの連続日数検証に失敗しました:', error)
      }
    }
  }

  // 日替わりの修行テーマを取得（防弾: API落ちても必ずTyson重厚フォールバック）
  const fetchDailyTheme = async () => {
    const tysonFallback = () => TYSON_FALLBACK_THEMES[Math.floor(Math.random() * TYSON_FALLBACK_THEMES.length)]
    setDailyTheme(tysonFallback())
    
    try {
      const cachedTheme = localStorage.getItem('daily_theme')
      const cachedDate = localStorage.getItem('daily_theme_date')
      const today = new Date().toISOString().split('T')[0]
      
      // キャッシュはTysonテーマの場合のみ使用（平凡な旧キャッシュを破棄）
      if (cachedTheme && cachedDate === today && isTysonTheme(cachedTheme)) {
        setDailyTheme(cachedTheme)
        return
      }
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 500)
      
      try {
        const response = await fetch('/api/daily-theme', { signal: controller.signal })
        clearTimeout(timeoutId)
        
        if (response.ok) {
          const data = await response.json()
          const theme = data?.theme || ''
          if (isTysonTheme(theme)) {
            setDailyTheme(theme)
            localStorage.setItem('daily_theme', theme)
            localStorage.setItem('daily_theme_date', today)
          }
        }
      } catch (fetchError) {
        clearTimeout(timeoutId)
        setDailyTheme(tysonFallback())
      }
    } catch (error) {
      setDailyTheme(tysonFallback())
    }
  }

  const getOrCreateUserId = () => {
    let id = localStorage.getItem('tyson_user_id')
    if (!id) {
      id = `user_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
      localStorage.setItem('tyson_user_id', id)
    }
    return id
  }

  const uploadRecordViaApi = async (audioBlob, meta) => {
    const controller = new AbortController()
    const timeoutMs = 10000
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const formData = new FormData()
      formData.append('file', audioBlob, `recording.${meta.extension || 'webm'}`)
      formData.append('userId', meta.userId)
      formData.append('userName', meta.userName || '')
      formData.append('date', meta.date)
      formData.append('mimeType', audioBlob.type || 'audio/webm')
      formData.append('extension', meta.extension || 'webm')
      formData.append('streakCount', String(meta.streakCount || 0))

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        const code = data?.code
        const vercelHint = data?.vercelHint
        const detail = data?.detail
        if (response.status === 503 && (code === 'FIREBASE_SERVICE_ACCOUNT_PARSE_ERROR' || code === 'FIREBASE_SERVICE_ACCOUNT_EMPTY') && vercelHint) {
          const err = new Error(data?.error || 'FIREBASE_SERVICE_ACCOUNT の設定に問題があります。')
          err.code = code
          err.vercelHint = vercelHint
          err.detail = detail
          throw err
        }
        const text = (data?.error && typeof data.error === 'string') ? data.error : JSON.stringify(data) || 'Unknown error'
        const err = new Error(`API upload failed (${response.status}): ${text}`)
        err.detail = detail
        throw err
      }

      const result = await response.json()
      return result
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  // IndexedDB同期エンジン: 未送信データをバックグラウンドで送信（/api/upload 経由のゾンビ送信）
  const syncIndexedDBToFirebase = async () => {
    try {
      const savedAudios = await getAllSavedAudio()
      const unsyncedAudios = savedAudios.filter(record => !record.synced)
      
      if (unsyncedAudios.length === 0) {
        return
      }
      
      console.log(`📦 IndexedDB同期エンジン: ${unsyncedAudios.length}件の未送信データを検出`)
      
      let syncFailCount = 0
      for (const record of unsyncedAudios) {
        try {
          const audioBlob = record.audioBlob || new Blob([record.audioData], { type: record.mimeType })

          const today = record.date ? new Date(record.date) : getJSTDate()
          const year = today.getFullYear()
          const month = String(today.getMonth() + 1).padStart(2, '0')
          const day = String(today.getDate()).padStart(2, '0')
          const dateString = `${year}-${month}-${day}`

          const userId = getOrCreateUserId()
          const extension = record.mimeType.includes('mp4')
            ? 'mp4'
            : record.mimeType.includes('m4a')
              ? 'm4a'
              : 'webm'

          await uploadRecordViaApi(audioBlob, {
            userId,
            userName: record.userName || '',
            date: dateString,
            extension,
            streakCount: record.streakCount || 1
          })

          await markAsSynced(record.id)
          await deleteAudioFromIndexedDB(record.id)

          console.log(`✅ IndexedDB同期成功: ID ${record.id}`)
        } catch (error) {
          if (error?.code && error?.vercelHint) {
            setEnvParseError({ vercelHint: error.vercelHint })
            if (import.meta.env.DEV) console.error('IndexedDB同期: 環境変数エラー', error)
            return
          }
          if (import.meta.env.DEV) console.error(`IndexedDB同期失敗: ID ${record.id}`, error)
          syncFailCount += 1
        }
      }
      if (syncFailCount > 0 && import.meta.env.DEV) {
        console.warn(`${syncFailCount}件の送信に失敗。再接続時に自動再試行します。`)
      }
      
      // 同期完了通知
      if (unsyncedAudios.length > 0) {
        setToast({ type: 'success', message: '以前の録音を送信しました ✅' })
        setTimeout(() => setToast(null), 3000)
      }
      
      // バックアップデータの状態を更新
      const remainingCount = await getSavedAudioCount()
      setHasBackupData(remainingCount > 0)
    } catch (error) {
      if (error?.code && error?.vercelHint) setEnvParseError({ vercelHint: error.vercelHint })
      if (import.meta.env.DEV) console.error('IndexedDB同期エンジンエラー:', error)
    }
  }

  const refreshPendingDiagnosis = async () => {
    const list = await getAllPendingDiagnosis()
    setPendingDiagnosisList(list)
  }

  // 起動時: pendingDiagnoses 全スキャン ＋ Firestore 整合性チェックで自動削除（端末間同期）
  useEffect(() => {
    const run = async () => {
      try {
        await waitSyncUnblock()
        const list = await getAllPendingDiagnosis()
        if (!list.length) {
          setPendingDiagnosisList([])
          return
        }
        let changed = false
        for (const item of list) {
          try {
            const ref = doc(db, 'shugyo', item.docId)
            const snap = await getDoc(ref)
            if (!snap.exists()) {
              // サーバーにデータが存在しない（404相当）→ 修復不能なエラーとしてローカルの pending を削除
              await removePendingDiagnosis(item.id)
              changed = true
              continue
            }
            const data = snap.data()
            if (data?.analysisResult) {
              // サーバー側で既に完了 → ローカルの pending を削除
              await removePendingDiagnosis(item.id)
              changed = true
            }
          } catch (e) {
            // ネットワークエラーや権限エラーなど → エラーコードを確認して404相当なら削除
            const code = e?.code || ''
            if (code.includes('not-found') || code.includes('permission-denied') || code.includes('unavailable')) {
              // 修復不能なエラーとしてローカルの pending を削除
              try {
                await removePendingDiagnosis(item.id)
                changed = true
              } catch (removeErr) {
                if (import.meta.env.DEV) console.error('削除失敗:', item.id, removeErr)
              }
            } else {
              if (import.meta.env.DEV) console.error('Firestore 整合性チェック:', item.docId, e)
            }
          }
        }
        const next = await getAllPendingDiagnosis()
        setPendingDiagnosisList(next)
      } catch (e) {
        console.error('❌ 診断待ち一覧の取得に失敗:', e)
        setToast({ type: 'error', message: `診断待ち取得エラー: ${e?.message ?? String(e)}` })
        setTimeout(() => setToast(null), 5000)
        setPendingDiagnosisList([])
      }
    }
    run()
  }, [])

  // 環境変数オーバーレイ表示時、env-check で予備チェック（不備時は再試行を無効化）
  useEffect(() => {
    if (!envParseError) {
      setEnvCheckOk(null)
      return
    }
    let done = false
    setEnvCheckLoading(true)
    fetch('/api/env-check')
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (!done) setEnvCheckOk(d?.ok === true)
      })
      .catch((e) => {
        if (!done) {
          console.error('❌ 環境変数予備チェック失敗:', e)
          setToast({ type: 'error', message: `環境変数チェック失敗: ${e?.message ?? String(e)}` })
          setTimeout(() => setToast(null), 5000)
          setEnvCheckOk(false)
        }
      })
      .finally(() => {
        if (!done) setEnvCheckLoading(false)
      })
    return () => { done = true }
  }, [envParseError])

  // アプリ起動時とネットワーク復帰時に同期（起動後 5 秒間はブロック [cite: 2026-01-28]）
  useEffect(() => {
    const checkBackupData = async () => {
      try {
        await waitSyncUnblock()
        const count = await getSavedAudioCount()
        setHasBackupData(count > 0)
        
        // 未送信データがあれば同期を開始
        if (count > 0) {
          syncIndexedDBToFirebase()
        }
      } catch (error) {
        // IndexedDBの確認に失敗しても続行
        if (import.meta.env.DEV) {
          console.log('IndexedDB確認エラー:', error)
        }
      }
    }
    checkBackupData()
    
    // ネットワーク復帰時の監視（5 秒経過後なら即時同期）
    const handleOnline = () => {
      waitSyncUnblock().then(() => {
        console.log('🌐 ネットワーク復帰を検出、IndexedDB同期を開始')
        syncIndexedDBToFirebase()
      })
    }
    
    window.addEventListener('online', handleOnline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  // OpenAIの設定状態を確認
  useEffect(() => {
    const checkOpenAIConfig = async () => {
      try {
        const response = await fetch('/api/health-check')
        if (response.ok) {
          const result = await response.json()
          const openAIService = result.services?.openai
          if (openAIService && openAIService.configured === false) {
            setIsOpenAIConfigured(false)
            console.log('⚠️ OpenAI API key is not configured - AI分析をスキップします')
          } else {
            setIsOpenAIConfigured(true)
          }
        }
      } catch (error) {
        // 健全性チェックに失敗しても続行（デフォルトでAI分析を試行）
        if (import.meta.env.DEV) {
          console.log('健全性チェックエラー:', error)
        }
      }
    }
    checkOpenAIConfig()
  }, [])

  // localStorageから連続日数とユーザー名を読み込む
  useEffect(() => {
    const initializeApp = async () => {
      const savedUserName = localStorage.getItem('tyson_userName')
      
      if (savedUserName) {
        setUserName(savedUserName)
      } else {
        const defaultUserName = '修行者'
        setUserName(defaultUserName)
        localStorage.setItem('tyson_userName', defaultUserName)
      }
      
      const calculated = calculateStreak()
      if (calculated.streak > 0) {
        setStreak(calculated.streak)
        setLastRecordDate(calculated.lastDate)
      }
      
      try {
        await verifyStreakFromFirestore()
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Firestoreからの連続日数検証に失敗しました（localStorageの値を使用します）:', error)
        }
      }
      
      // 日替わりのテーマを取得
      await fetchDailyTheme()
    }
    
    initializeApp()
  }, [])

  // 7日目ペイウォールのチェック
  useEffect(() => {
    if (streak > 0 && streak % 7 === 0) {
      setShowPaywall(true)
    } else {
      setShowPaywall(false)
    }
  }, [streak])

  // マイク権限のチェック
  const checkMicrophonePermission = async () => {
    try {
      if ('permissions' in navigator) {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' })
        
        if (permissionStatus.state === 'denied') {
          setMicPermissionDenied(true)
          return false
        }
      }
      
      // 権限が不明な場合、実際にgetUserMediaを試行
      try {
        const testStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        testStream.getTracks().forEach(track => track.stop())
        setMicPermissionDenied(false)
        return true
      } catch (error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setMicPermissionDenied(true)
          return false
        }
        throw error
      }
    } catch (error) {
      // permissions APIがサポートされていない場合、getUserMediaで確認
      try {
        const testStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        testStream.getTracks().forEach(track => track.stop())
        setMicPermissionDenied(false)
        return true
      } catch (testError) {
        if (testError.name === 'NotAllowedError' || testError.name === 'PermissionDeniedError') {
          setMicPermissionDenied(true)
          return false
        }
        throw testError
      }
    }
  }

  // Wake Lock API の有効化
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
        console.log('✅ Wake Lock 有効化')
      }
    } catch (error) {
      console.warn('⚠️ Wake Lock の有効化に失敗:', error)
    }
  }

  // Wake Lock API の無効化
  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release()
        wakeLockRef.current = null
        console.log('✅ Wake Lock 無効化')
      }
    } catch (error) {
      console.warn('⚠️ Wake Lock の無効化に失敗:', error)
    }
  }

  // Firebase Storageに音声ファイルをアップロード
  const uploadAudioToStorage = async (audioBlob, extension = 'webm', onProgress) => {
    // 環境変数の完全マッピングと検証（Vercelで設定されているか確認）
    const requiredEnvVars = [
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_STORAGE_BUCKET',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_AUTH_DOMAIN'
    ]
    
    const missingVars = []
    const envStatus = {}
    
    requiredEnvVars.forEach(varName => {
      const value = import.meta.env[varName]
      const isMissing = value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
      envStatus[varName] = {
        value: value,
        type: typeof value,
        isMissing: isMissing
      }
      if (isMissing) {
        missingVars.push(varName)
        console.error(`❌ 環境変数未設定: ${varName}`, { value, type: typeof value, isUndefined: value === undefined })
      }
    })
    
    if (missingVars.length > 0) {
      const errorMsg = `⚠️ 設定エラー：以下の環境変数が設定されていません: ${missingVars.join(', ')}`
      console.error('❌ 環境変数エラー:', { missingVars, envStatus })
      
      // 警告バナーを表示
      const warningDiv = document.getElementById('firebase-env-warning') || document.createElement('div')
      warningDiv.id = 'firebase-env-warning'
      warningDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
        color: #ffffff;
        padding: 20px;
        font-size: 24px;
        font-weight: 700;
        text-align: center;
        z-index: 99999;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        border-bottom: 4px solid #ffffff;
      `
      warningDiv.innerHTML = `
        <div style="max-width: 1200px; margin: 0 auto;">
          ${errorMsg}
          <div style="font-size: 16px; margin-top: 8px; opacity: 0.9;">
            Vercelの環境変数設定を確認してください。
          </div>
        </div>
      `
      if (!document.getElementById('firebase-env-warning')) {
        document.body.appendChild(warningDiv)
      }
      
      throw new Error(errorMsg)
    }
    
    try {
      // STEP 1: storageRefの生成
      const timestamp = new Date().getTime()
      const fileName = `shugyo_${timestamp}_${userName}.${extension}`
      let storageRef
      try {
        storageRef = ref(storage, `shugyo/${fileName}`)
        console.log('✅ STEP 1: SUCCESS - storageRef生成完了', { fileName, path: `shugyo/${fileName}` })
      } catch (error) {
        console.error('❌ STEP 1: ERROR - storageRef生成失敗', { error: error.message, code: error.code, stack: error.stack })
        throw new Error(`通信エラー：storageRef生成失敗。IndexedDBに退避します。`)
      }
      
      // STEP 2: uploadBytesResumableでアップロード（Promise.raceで30秒タイムアウト）
      console.log('DEBUG: Storage Start', { fileName, size: audioBlob.size })
      
      const uploadPromise = new Promise((resolve, reject) => {
        let uploadTask = null
        let isResolved = false
        let isRejected = false
        
        const rejectWithCleanup = (error) => {
          if (isRejected) return
          isRejected = true
          if (uploadTask) {
            try {
              uploadTask.cancel()
            } catch (e) {
              // キャンセルエラーは無視
            }
          }
          reject(error)
        }
        
        try {
          uploadTask = uploadBytesResumable(storageRef, audioBlob)
          
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              
              if (onProgress) {
                onProgress({
                  step: 'Storageアップロード',
                  status: '実行中',
                  progress: Math.round(progress),
                  bytesTransferred: snapshot.bytesTransferred,
                  totalBytes: snapshot.totalBytes
                })
              }
              
              if (progress === 100) {
                console.log('✅ STEP 2: SUCCESS - アップロード完了 (100%)', { 
                  bytesTransferred: snapshot.bytesTransferred, 
                  totalBytes: snapshot.totalBytes,
                  progress: `${progress.toFixed(2)}%`
                })
              } else {
                console.log(`📊 STEP 2: アップロード進捗 ${progress.toFixed(2)}%`, {
                  bytesTransferred: snapshot.bytesTransferred,
                  totalBytes: snapshot.totalBytes
                })
              }
            },
            (error) => {
              console.error('❌ STEP 2: ERROR - アップロード失敗', { 
                error: error.message, 
                code: error.code, 
                stack: error.stack 
              })
              const code = error.code ?? 'N/A'
              const msg = error.message ?? String(error)
              showRawErrorOverlay(code, msg, 'Storage')
              rejectWithCleanup(new Error(`Storage: ${code} — ${msg}`))
            },
            async () => {
              if (isResolved || isRejected) return
              
              // STEP 3: getDownloadURLでURL取得
              try {
                if (onProgress) {
                  onProgress({ step: 'URL取得', status: '実行中' })
                }
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref)
                console.log('✅ STEP 3: SUCCESS - downloadURL取得完了', { 
                  downloadURL: downloadURL,
                  fileName: fileName
                })
                console.log('DEBUG: Storage Success', { downloadURL })
                if (onProgress) {
                  onProgress({ step: 'URL取得', status: '成功', downloadURL })
                }
                isResolved = true
                resolve(downloadURL)
              } catch (error) {
                console.error('❌ STEP 3: ERROR - downloadURL取得失敗', { 
                  error: error.message, 
                  code: error.code, 
                  stack: error.stack 
                })
                showRawErrorOverlay(error.code ?? 'N/A', error.message ?? String(error), 'URL取得')
                if (onProgress) {
                  onProgress({ step: 'URL取得', status: '失敗', error: error.message })
                }
                rejectWithCleanup(new Error(`ダウンロードURLの取得に失敗しました: ${error.message}`))
              }
            }
          )
        } catch (error) {
          console.error('❌ STEP 2: ERROR - uploadBytesResumable初期化失敗', { 
            error: error.message, 
            code: error.code, 
            stack: error.stack 
          })
          showRawErrorOverlay(error.code ?? 'N/A', error.message ?? String(error), 'アップロード初期化')
          reject(error)
        }
      })
      
      const UPLOAD_TIMEOUT_MS = 10000
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          console.error('❌ STEP 2: ERROR - アップロードタイムアウト')
          showRawErrorOverlay('storage/timeout', `${UPLOAD_TIMEOUT_MS / 1000}秒で応答なし。CORSまたはネットワークを確認してください。`, 'Storage タイムアウト')
          reject(new Error(`Storage: storage/timeout — ${UPLOAD_TIMEOUT_MS / 1000}秒で応答なし。IndexedDBに保存しました。`))
        }, UPLOAD_TIMEOUT_MS)
      })
      
      return Promise.race([uploadPromise, timeoutPromise]).catch((error) => {
        console.error('❌ uploadAudioToStorage エラー:', error)
        if (!error.message?.startsWith('Storage:')) {
          window.alert(`❌ アップロードエラー\n\ncode: ${error.code ?? 'N/A'}\nmessage: ${error.message ?? String(error)}`)
        }
        throw error
      })
    } catch (error) {
      // エラーは既にログ出力済みなので、再スローするだけ
      throw error
    }
  }

  // Firestoreに修行記録を保存（JST基準で日付を保存）
  // audioURL が null のときはメタデータのみ保存（Storage失敗時の退避）
  const saveToFirestore = async (audioURL, currentStreak) => {
    try {
      const today = getJSTDate()
      const year = today.getFullYear()
      const month = String(today.getMonth() + 1).padStart(2, '0')
      const day = String(today.getDate()).padStart(2, '0')
      const dateString = `${year}-${month}-${day}`
      const metadataOnly = audioURL == null || audioURL === ''
      const docData = {
        date: dateString,
        timestamp: today,
        userName: userName,
        audioURL: audioURL ?? '',
        streakCount: currentStreak,
        createdAt: new Date(),
        ...(metadataOnly && { storageFailed: true, note: 'Storage失敗・音声はIndexedDBに退避' })
      }
      
      console.log('📝 STEP 4: Firestoreへの書き込み開始', { 
        collection: 'shugyo',
        data: docData
      })
      console.log('DEBUG: Firestore Start', { collection: 'shugyo', audioURL, currentStreak })
      
      // STEP 4: addDocでFirestoreに書き込み（Promise.raceで30秒タイムアウト）
      const firestorePromise = addDoc(collection(db, 'shugyo'), docData)
        .then((docRef) => {
          console.log('✅ STEP 4: SUCCESS - Firestore書き込み完了', { 
            docId: docRef.id,
            collection: 'shugyo',
            date: dateString,
            streakCount: currentStreak
          })
          console.log('DEBUG: Firestore Success', { docId: docRef.id })
          return docRef.id
        })
        .catch((error) => {
          console.error('❌ STEP 4: ERROR - Firestore書き込み失敗', { 
            error: error.message, 
            code: error.code, 
            stack: error.stack,
            collection: 'shugyo'
          })
          showRawErrorOverlay(error.code ?? 'N/A', error.message ?? String(error), 'Firestore')
          throw new Error(`Firestore: ${error.code ?? 'N/A'} — ${error.message ?? String(error)}`)
        })
      
      const FIRESTORE_TIMEOUT_MS = 10000
      const firestoreTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          console.error('❌ STEP 4: ERROR - Firestore書き込みタイムアウト')
          showRawErrorOverlay('firestore/timeout', `${FIRESTORE_TIMEOUT_MS / 1000}秒で応答なし。ネットワークまたはルールを確認してください。`, 'Firestore タイムアウト')
          reject(new Error(`Firestore: firestore/timeout — ${FIRESTORE_TIMEOUT_MS / 1000}秒で応答なし`))
        }, FIRESTORE_TIMEOUT_MS)
      })
      
      return Promise.race([firestorePromise, firestoreTimeoutPromise])
    } catch (error) {
      console.error('❌ saveToFirestore 予期しないエラー:', error)
      showRawErrorOverlay(error.code ?? 'N/A', error.message ?? String(error), 'Firestore 予期しないエラー')
      throw error
    }
  }

  // AI分析を実行（防弾: 403/500時も必ずフリーズさせない）
  const analyzeAudio = async (audioURL, docId) => {
    try {
      setIsAnalyzing(true)
      
      const analysisStartTime = Date.now()
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)
      
      let response
      try {
        response = await fetch('/api/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audioURL: audioURL,
            docId: docId,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
      } catch (fetchError) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') {
          throw new Error('AI分析がタイムアウトしました。しばらくしてから再度お試しください。')
        }
        if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError')) {
          throw new Error('ネットワークエラーが発生しました。インターネット接続を確認してください。')
        }
        throw fetchError
      }

      if (!response.ok) {
        let errorMessage = 'AI分析に失敗しました'
        let rawDetail = ''
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
          rawDetail = errorData.detail || ''
          if (rawDetail) console.error('[/api/analyze] detail:', rawDetail)
          let debug = rawDetail
          if (errorData.expectedEnv && Array.isArray(errorData.expectedEnv)) {
            debug += `\n[expectedEnv] ${errorData.expectedEnv.join(', ')}`
          }
          if (errorData.vercelHint) debug += `\n${errorData.vercelHint}`
          if (errorData.hint) debug += `\n${errorData.hint}`
          if (errorData.step) debug += `\n[step] ${errorData.step}${errorData.subStep ? ` / ${errorData.subStep}` : ''}`
          if (response.status === 500 && errorMessage.includes('OpenAI API key')) {
            const err = new Error('OpenAI API keyが設定されていません')
            err.detail = debug
            throw err
          }
          if (response.status === 403 || errorData?.subStep === 'forbidden' || errorData?.status === 403) {
            const action = errorData?.userAction || '権限設定を確認してください。Firebase Storage の CORS 設定および Storage Rules を確認し、gsutil cors set cors.json gs://BUCKET を実行してください。'
            const err = new Error(`403 Forbidden (audioURL fetch)。${action}`)
            err.detail = debug
            err.userAction = action
            throw err
          }
          const err = new Error(errorMessage)
          err.detail = debug
          if (errorData?.userAction) err.userAction = errorData.userAction
          throw err
        } catch (parseError) {
          if (parseError instanceof Error && (parseError.message.includes('OpenAI') || parseError.message.includes('CORS'))) {
            throw parseError
          }
          const err = new Error(`サーバーエラー (${response.status})`)
          err.detail = rawDetail || String(parseError?.message || parseError)
          throw err
        }
      }

      const result = await response.json()
      const analysisDuration = (Date.now() - analysisStartTime) / 1000
      
      // 分析結果を保存
      setAnalysisResult(result.analysis)
      setSonMessage(result.analysis.advice || '今日もよく頑張りました！')
      
      // 霧を晴らす
      setFogCleared(true)
      
      // AI分析成功通知
      setToast({ type: 'success', message: 'AI診断完了 ✅' })
      setTimeout(() => setToast(null), 5000)
      
      // 息子のメッセージを自動再生（テキスト読み上げ）
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(result.analysis.advice || '今日もよく頑張りました！')
        utterance.lang = 'ja-JP'
        utterance.rate = 0.9
        utterance.pitch = 1.0
        utterance.volume = 1.0
        speechSynthesis.speak(utterance)
      }
      
      if (docId && result.analysis) {
        try {
          await updateDoc(doc(db, 'shugyo', docId), {
            analysisResult: {
              transcription: result.transcription,
              riskManagement: result.analysis.riskManagement,
              mikeTysonIndex: result.analysis.mikeTysonIndex,
              energyLevel: result.analysis.energyLevel,
              advice: result.analysis.advice,
              analyzedAt: new Date(),
              analysisDuration: analysisDuration, // 解析時間（秒）を保存
            },
          })
          
          // 管理者への即時通知を送信（非同期、失敗しても続行）
          // 前回の平均スコアを取得して異常検知判定に使用
          try {
            const q = query(
              collection(db, 'shugyo'),
              orderBy('timestamp', 'desc'),
              limit(2)
            )
            const querySnapshot = await getDocs(q)
            let previousAvgScore = undefined
            
            if (querySnapshot.docs.length >= 2) {
              const previousDoc = querySnapshot.docs[1].data()
              if (previousDoc.analysisResult) {
                const prevEnergy = previousDoc.analysisResult.energyLevel?.score || previousDoc.analysisResult.energyLevel || 0
                const prevMike = previousDoc.analysisResult.mikeTysonIndex?.score || previousDoc.analysisResult.mikeTysonIndex || 0
                const prevRisk = previousDoc.analysisResult.riskManagement?.score || previousDoc.analysisResult.riskManagement || 0
                previousAvgScore = (prevEnergy + prevMike + prevRisk) / 3
              }
            }
            
            const adminUrl = `${window.location.origin}/admin`
            await fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                analysisResult: result.analysis,
                userName: userName,
                streakCount: streak,
                adminUrl: adminUrl,
                previousAvgScore: previousAvgScore,
              }),
            }).catch(() => {
              // 通知失敗は無視（ログのみ、リトライはサーバー側で実施）
              if (import.meta.env.DEV) {
                console.warn('管理者通知の送信に失敗しました')
              }
            })
          } catch (notifyError) {
            // 通知エラーは無視
            if (import.meta.env.DEV) {
              console.warn('管理者通知エラー:', notifyError)
            }
          }
        } catch (firestoreError) {
          console.error('❌ AI分析結果の保存に失敗:', firestoreError)
          // 分析結果の保存失敗は無視（基本データは既に保存済み）
        }
      }

      return result
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('AI分析に失敗しました:', error)
      }
      throw error
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ボリュームビジュアライザーのアニメーション
  useEffect(() => {
    if (isRecording && analyserRef.current) {
      const analyser = analyserRef.current
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      
      const updateVisualizer = () => {
        if (!isRecording) return
        
        analyser.getByteFrequencyData(dataArray)
        
        // 60個のバーにデータを変換
        const barCount = 60
        const step = Math.floor(dataArray.length / barCount)
        const newAudioData = []
        
        for (let i = 0; i < barCount; i++) {
          const index = i * step
          const value = dataArray[index] || 0
          newAudioData.push(value / 255) // 0-1に正規化
        }
        
        setAudioData(newAudioData)
        animationFrameRef.current = requestAnimationFrame(updateVisualizer)
      }
      
      updateVisualizer()
      
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
      }
    } else {
      // 録音停止時はデータをリセット
      setAudioData(new Array(60).fill(0))
    }
  }, [isRecording])

  // 録音開始
  const startRecording = async () => {
    // マイク権限の事前チェック
    const hasPermission = await checkMicrophonePermission()
    if (!hasPermission) {
      return
    }
    
    try {
      // Wake Lock を有効化
      await requestWakeLock()
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      recordingStartTimeRef.current = Date.now()
      setRecordingDuration(0)
      
      // Web Audio APIでAnalyserNodeをセットアップ
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext
      
      // iOS Safari対応: AudioContextを確実に再開
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)
      analyserRef.current = analyser
      
      // iOS Safari対応: 再度resumeを確認（確実に動作させるため）
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      
      let mimeType = 'audio/webm'
      let fileExtension = 'webm'
      
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4'
        fileExtension = 'mp4'
      } else if (MediaRecorder.isTypeSupported('audio/m4a')) {
        mimeType = 'audio/m4a'
        fileExtension = 'm4a'
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm'
        fileExtension = 'webm'
      }
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      mediaRecorderRef.current.recordedMimeType = mimeType
      mediaRecorderRef.current.recordedExtension = fileExtension

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      let isProcessing = false
      
      mediaRecorder.onstop = async () => {
        if (isProcessing || isUploading) {
          return
        }
        
        isProcessing = true
        setIsUploading(true)
        
        try {
          const actualMimeType = mediaRecorderRef.current?.recordedMimeType || mimeType
          const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType })
          
          // 録音時間の計算
          const recordingTime = recordingStartTimeRef.current ? (Date.now() - recordingStartTimeRef.current) / 1000 : 0
          setRecordingDuration(recordingTime)
          
          // サイレント・セーフガード: 録音時間が1秒未満の場合は保存しない
          if (recordingTime < 1) {
            setToast({ type: 'warning', message: 'もう少し長く話してね 🎙️' })
            setTimeout(() => setToast(null), 3000)
            isProcessing = false
            setIsUploading(false)
            setIsRecording(false)
            audioChunksRef.current = []
            await releaseWakeLock()
            return
          }
          
          // 無音チェック（簡易版: データサイズが極端に小さい場合）
          if (audioBlob.size < 1000) { // 1KB未満は無音とみなす
            setToast({ type: 'warning', message: 'もう少し長く話してね 🎙️' })
            setTimeout(() => setToast(null), 3000)
            isProcessing = false
            setIsUploading(false)
            setIsRecording(false)
            audioChunksRef.current = []
            await releaseWakeLock()
            return
          }
          
          if (audioBlob.size === 0) {
            throw new Error('録音データが空です。もう一度お試しください。')
          }
          
          const calculated = calculateStreak()
          let newStreak = 1
          
          if (calculated.canIncrement && calculated.streak > 0) {
            newStreak = calculated.streak + 1
          } else if (calculated.reset) {
            newStreak = 1
          } else if (calculated.streak === 0) {
            newStreak = 1
          } else {
            newStreak = calculated.streak
          }
          
          const today = getJSTDate()
          const actualExtension = mediaRecorderRef.current?.recordedExtension || fileExtension
          const year = today.getFullYear()
          const month = String(today.getMonth() + 1).padStart(2, '0')
          const day = String(today.getDate()).padStart(2, '0')
          const dateString = `${year}-${month}-${day}`
          const userId = getOrCreateUserId()

          // まずはローカル（IndexedDB）に即時保存してから、非同期でAPI送信
          let localId = null
          try {
            localId = await saveAudioToIndexedDB(audioBlob, {
              userName: userName,
              streakCount: newStreak,
              date: dateString,
              synced: false
            })
            setHasBackupData(true)
          } catch (e) {
            console.error('❌ IndexedDB保存エラー:', e)
            // IndexedDB保存に失敗しても、後続処理は継続
          }

          // 連続日数はローカルで即時反映
          setStreak(newStreak)
          // JST 日付を YYYY-MM-DD 文字列で保存（ISO ではなく）
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
          localStorage.setItem('tyson_streak', newStreak.toString())
          localStorage.setItem('tyson_lastDate', todayStr)
          setLastRecordDate(today)

          audioChunksRef.current = []
          setDebugInfo(null)

          // 防弾: Firestore書き込み成功まで「保存完了」を出さない。送信中は明確に表示
          setToast({ type: 'info', message: 'Firestoreへ送信中...' })
          // isUploading は true のまま（API成功まで維持）

          // コスト・セーフガード: 1日3回まで解析制限
          const todayKey = `tyson_analysis_count_${today.toISOString().split('T')[0]}`
          const analysisCount = parseInt(localStorage.getItem(todayKey) || '0', 10)
          const canAnalyze = analysisCount < 3 && isOpenAIConfigured

          // 非同期でAPIに送信（防弾: 成功時のみ「保存完了」を表示）
          ;(async () => {
            try {
              const result = await uploadRecordViaApi(audioBlob, {
                userId,
                userName,
                date: dateString,
                extension: actualExtension,
                streakCount: newStreak
              })

              // 防弾: Firestore書き込み成功を確認してから完了表示
              if (!result?.shugyoId) {
                throw new Error('API応答にshugyoIdが含まれていません。Firestoreへの書き込みが失敗した可能性があります。')
              }

              // 防弾: Storage+Firestore 成功時点で「送信完了」、画面を即遷移（霧を晴らす）
              isProcessing = false
              setIsComplete(true)
              setFogCleared(true)
              setIsUploading(false)
              setToast({ type: 'success', message: '送信完了 ✅ 親は管理画面で再生できます' })
              setTimeout(() => setToast(null), 4000)

              if (localId != null) {
                await markAsSynced(localId)
                await deleteAudioFromIndexedDB(localId)
                const remaining = await getSavedAudioCount()
                setHasBackupData(remaining > 0)
              }

              await releaseWakeLock()

              // AI解析は裏側で非同期実行。失敗しても音声は死守、ポップアップ禁止
              if (canAnalyze && result?.audioURL && result?.shugyoId) {
                const todayForLimit = getJSTDate()
                const limitKey = `tyson_analysis_count_${todayForLimit.toISOString().split('T')[0]}`
                const current = parseInt(localStorage.getItem(limitKey) || '0', 10)
                localStorage.setItem(limitKey, String(current + 1))

                void (async () => {
                  try {
                    await analyzeAudio(result.audioURL, result.shugyoId)
                    setToast({ type: 'success', message: 'AI診断完了 ✅' })
                    setTimeout(() => setToast(null), 5000)
                  } catch (error) {
                    if (import.meta.env.DEV) console.error('AI分析（裏側）失敗:', error)
                    try {
                      await addPendingDiagnosis({ audioURL: result.audioURL, docId: result.shugyoId })
                      await refreshPendingDiagnosis()
                    } catch (e) {
                      if (import.meta.env.DEV) console.error('addPendingDiagnosis:', e)
                    }
                  }
                })()
              }
            } catch (error) {
              isProcessing = false
              setIsUploading(false)
              setHasBackupData(true)
              const raw = error?.detail ? `${error?.message ?? ''}\n${error.detail}` : (error?.message ?? String(error))
              console.error('❌ /api/upload 送信エラー:', error)
              showRawErrorOverlay(
                error?.code ?? 'UPLOAD_FAILED',
                `Firestoreへの保存に失敗しました。音声はIndexedDBに退避済み。\n\n${raw}`,
                'Firestore保存失敗'
              )
              showApiError(raw)
              if (error?.code && error?.vercelHint) {
                setEnvParseError({ vercelHint: error.vercelHint })
                setToast({ type: 'error', message: '環境変数エラー。Vercelの設定を確認し、再試行してください。' })
                setTimeout(() => setToast(null), 8000)
              } else {
                setToast({
                  type: 'error',
                  message: 'Firestore保存失敗。音声はローカルに退避済み。あとで自動再送を試みます。'
                })
                setTimeout(() => setToast(null), 8000)
              }
              await releaseWakeLock()
            }
          })()
        } catch (error) {
          isProcessing = false
          setIsUploading(false)
          setIsRecording(false)
          
          // Wake Lock を無効化
          await releaseWakeLock()
          
          // デバッグ情報を更新
          setDebugInfo({ step: 'エラー', status: '失敗', error: error.message })
          
          let errorMessage = '音声の保存に失敗しました。'
          if (error.message && error.message.includes('録音データが空')) {
            errorMessage = '録音データが保存できませんでした。もう一度録音してください。'
          } else if (error.message) {
            errorMessage = error.message
          }

          setToast({ type: 'error', message: errorMessage })
          setTimeout(() => setToast(null), 5000)

          audioChunksRef.current = []
          
          if (import.meta.env.DEV) {
            console.error('保存処理に失敗しました:', error)
          }
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
        
        // AnalyserNodeをクリーンアップ
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {})
        }
        analyserRef.current = null
        audioContextRef.current = null
      }

      mediaRecorder.start()
      setIsRecording(true)
      setIsComplete(false)
      setFogCleared(false)
      setAnalysisResult(null)
      setSonMessage('')
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('録音の開始に失敗しました:', error)
      }
      alert('マイクへのアクセスが許可されていません。')
    }
  }

  // 録音完了音を再生（ピコン！）
  const playCompletionSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      // ピコン音（高音→低音）
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1)
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)
      
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.1)
      
      // クリーンアップ
      setTimeout(() => {
        audioContext.close().catch(() => {})
      }, 200)
    } catch (error) {
      // 音声再生エラーは無視（無音でも動作は継続）
      if (import.meta.env.DEV) {
        console.log('録音完了音の再生に失敗:', error)
      }
    }
  }

  const stopRecording = () => {
    if (!isRecording || isUploading) {
      return
    }
    
    if (mediaRecorderRef.current && isRecording) {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
        setIsRecording(false)
        
        // 録音完了音を再生
        playCompletionSound()
        
        // AnalyserNodeをクリーンアップ
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {})
        }
        analyserRef.current = null
        audioContextRef.current = null
        setAudioData(new Array(60).fill(0))
      } catch (error) {
        setIsRecording(false)
        if (import.meta.env.DEV) {
          console.error('録音の停止に失敗しました:', error)
        }
      }
    }
  }

  const handleRecordClick = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const handlePaywallClose = () => {
    setShowPaywall(false)
  }

  const fetchEnvCheck = async () => {
    setEnvCheckLoading(true)
    try {
      const res = await fetch('/api/env-check')
      const data = await res.json().catch(() => ({}))
      setEnvCheckOk(data?.ok === true)
      return data?.ok === true
    } catch (e) {
      console.error('❌ 環境変数予備チェック失敗:', e)
      setToast({ type: 'error', message: `環境変数チェック失敗: ${e?.message ?? String(e)}` })
      setTimeout(() => setToast(null), 5000)
      setEnvCheckOk(false)
      return false
    } finally {
      setEnvCheckLoading(false)
    }
  }

  const handleRetryEnv = async () => {
    try {
      const ok = await fetchEnvCheck()
      if (!ok) return
      setEnvParseError(null)
      await syncIndexedDBToFirebase()
    } catch (e) {
      console.error('❌ 再試行（環境変数）失敗:', e)
      setToast({ type: 'error', message: `再試行失敗: ${e?.message ?? String(e)}` })
      setTimeout(() => setToast(null), 6000)
    }
  }

  const handleRetryDiagnosis = async () => {
    if (isRetryingDiagnosis || pendingDiagnosisList.length === 0) return
    setIsRetryingDiagnosis(true)
    try {
      let failed = 0
      for (const item of [...pendingDiagnosisList]) {
        try {
          await analyzeAudio(item.audioURL, item.docId)
          await removePendingDiagnosis(item.id)
        } catch (e) {
          const raw = e?.detail ? `${e?.message ?? ''}\n${e.detail}` : (e?.message ?? String(e))
          showApiError(raw)
          console.error('❌ 診断再試行失敗:', item.id, e)
          setToast({ type: 'error', message: `診断再試行失敗: ${e?.message ?? String(e)}` })
          setTimeout(() => setToast(null), 5000)
          failed += 1
        }
      }
      await refreshPendingDiagnosis()
      if (failed > 0) {
        setToast({ type: 'error', message: `${failed}件の診断再試行に失敗しました。` })
        setTimeout(() => setToast(null), 5000)
      }
    } catch (e) {
      console.error('❌ 診断再試行エラー:', e)
      setToast({ type: 'error', message: `診断再試行エラー: ${e?.message ?? String(e)}` })
      setTimeout(() => setToast(null), 6000)
    } finally {
      setIsRetryingDiagnosis(false)
    }
  }

  const handleClearAllPendingDiagnosis = async () => {
    if (!window.confirm('全ての診断待ちデータを削除しますか？この操作は取り消せません。')) {
      return
    }
    try {
      await clearAllPendingDiagnosis()
      setPendingDiagnosisList([])
      window.location.reload()
    } catch (e) {
      console.error('❌ 全件削除失敗:', e)
      setToast({ type: 'error', message: `全件削除失敗: ${e?.message ?? String(e)}` })
      setTimeout(() => setToast(null), 6000)
    }
  }

  const checkEnvAndShowResult = async () => {
    try {
      const res = await fetch('/api/env-check')
      const data = await res.json().catch(() => ({}))
      const isOk = data?.ok === true
      const message = isOk ? 'OK' : `ERROR: ${data?.code || 'Unknown'}`
      setEnvCheckResult({ ok: isOk, message })
      setTimeout(() => setEnvCheckResult(null), 10000)
    } catch (e) {
      setEnvCheckResult({ ok: false, message: `ERROR: ${e?.message ?? String(e)}` })
      setTimeout(() => setEnvCheckResult(null), 10000)
    }
  }

  return (
    <div className="app">
      {/* 環境変数の生存証明: /api/env-check 結果を画面最上部に10秒間表示 */}
      {envCheckResult && (
        <div
          style={{
            position: 'fixed',
            top: apiErrorBanner ? 60 : 0,
            left: 0,
            right: 0,
            zIndex: 999997,
            background: envCheckResult.ok ? '#2e7d32' : '#b71c1c',
            color: '#fff',
            padding: '12px 16px',
            fontSize: 'clamp(14px, 3vw, 16px)',
            fontFamily: 'monospace',
            textAlign: 'center',
            fontWeight: 700,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          /api/env-check: {envCheckResult.message}
        </div>
      )}
      {/* API 失敗時: サーバーから返った生エラーを画面上部に赤文字で表示（ログを見に行かせない） */}
      {apiErrorBanner && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 999998,
            background: '#b71c1c',
            color: '#fff',
            padding: '12px 16px',
            fontSize: 'clamp(14px, 3vw, 16px)',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>{apiErrorBanner}</div>
          <button
            type="button"
            onClick={() => setApiErrorBanner(null)}
            style={{
              flexShrink: 0,
              padding: '6px 12px',
              fontSize: 14,
              cursor: 'pointer',
              background: '#fff',
              color: '#b71c1c',
              border: 'none',
              borderRadius: 6,
              fontWeight: 700,
            }}
          >
            閉じる
          </button>
        </div>
      )}
      {/* 環境変数パース失敗（Vercel貼り直し案内＋再試行） */}
      {envParseError && (
        <div className="mic-permission-warning" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
          <div className="mic-warning-content">
            <h2>⚠️ 環境変数の設定に問題があります</h2>
            <p className="mic-warning-instruction" style={{ marginBottom: 16 }}>
              <strong>解決策:</strong>
            </p>
            <p style={{ textAlign: 'left', maxWidth: 480, margin: '0 auto 24px', lineHeight: 1.6, color: '#ccc' }}>
              {envParseError.vercelHint}
            </p>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>
              Vercel の <strong>Settings → Environment Variables</strong> で FIREBASE_SERVICE_ACCOUNT の値を貼り付け直してください。
            </p>
            {envCheckOk === false && !envCheckLoading && (
              <p style={{ fontSize: 14, color: '#ffaa00', marginBottom: 16 }}>
                環境変数を修正したら「再確認」を押してから「再試行」してください。
              </p>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                className="mic-warning-retry-button"
                onClick={handleRetryEnv}
                disabled={envCheckLoading || envCheckOk === false}
              >
                {envCheckLoading ? '確認中…' : '再試行'}
              </button>
              <button
                type="button"
                className="mic-warning-retry-button"
                style={{ background: '#444' }}
                onClick={fetchEnvCheck}
                disabled={envCheckLoading}
              >
                再確認
              </button>
              <button
                type="button"
                style={{ padding: '12px 24px', fontSize: 16, cursor: 'pointer', background: '#444', color: '#fff', border: 'none', borderRadius: 8 }}
                onClick={() => setEnvParseError(null)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
      {/* マイク権限拒否の警告（画面全体を覆う） */}
      {micPermissionDenied && (
        <div className="mic-permission-warning">
          <div className="mic-warning-content">
            <h2>⚠️ マイクの使用が許可されていません</h2>
            <p className="mic-warning-instruction">
              <strong>ブラウザの設定でマイクを許可してください</strong>
            </p>
            <div className="mic-warning-steps">
              <div className="mic-step">
                <strong>iPhone Safari の場合:</strong>
                <ol>
                  <li>設定アプリを開く</li>
                  <li>「Safari」をタップ</li>
                  <li>「マイク」を「許可」に変更</li>
                  <li>このアプリを再読み込み</li>
                </ol>
              </div>
              <div className="mic-step">
                <strong>Android Chrome の場合:</strong>
                <ol>
                  <li>ブラウザのアドレスバー左の🔒アイコンをタップ</li>
                  <li>「サイトの設定」をタップ</li>
                  <li>「マイク」を「許可」に変更</li>
                  <li>このページを再読み込み</li>
                </ol>
              </div>
              <div className="mic-step">
                <strong>PC Chrome/Edge の場合:</strong>
                <ol>
                  <li>ブラウザのアドレスバー左の🔒アイコンをクリック</li>
                  <li>「サイトの設定」をクリック</li>
                  <li>「マイク」を「許可」に変更</li>
                  <li>このページを再読み込み</li>
                </ol>
              </div>
            </div>
            <button
              type="button"
              className="mic-warning-retry-button"
              onClick={async () => {
                try {
                  const hasPermission = await checkMicrophonePermission()
                  if (hasPermission) setMicPermissionDenied(false)
                } catch (e) {
                  console.error('❌ マイク再試行エラー:', e)
                  setToast({ type: 'error', message: `マイク確認エラー: ${e?.message ?? String(e)}` })
                  setTimeout(() => setToast(null), 5000)
                }
              }}
            >
              再試行
            </button>
          </div>
        </div>
      )}
      {/* トースト通知 */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && '✓ '}
          {toast.type === 'error' && '✗ '}
          {toast.type === 'info' && 'ℹ '}
          {toast.message}
        </div>
      )}
      
      {/* バックアップデータ警告 */}
      {hasBackupData && (
        <div className="backup-warning">
          <div className="backup-warning-content">
            <strong>⚠️ ローカルに保存済みデータがあります</strong>
            <p>ネット環境が改善したら、自動的にアップロードを再試行します。</p>
          </div>
        </div>
      )}
      {/* 診断待ち（AI解析失敗時の再試行） */}
      {pendingDiagnosisList.length > 0 && (
        <div className="backup-warning" style={{ background: 'linear-gradient(135deg, #2d1f4e 0%, #1a1a2e 100%)', borderColor: '#7c3aed' }}>
          <div className="backup-warning-content">
            <strong>🩺 AI診断が完了していません</strong>
            <p>音声は保存済みです。環境変数修正後や再接続後に再試行できます。</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="mic-warning-retry-button"
                onClick={handleRetryDiagnosis}
                disabled={isRetryingDiagnosis}
              >
                {isRetryingDiagnosis ? '再試行中…' : '再試行'}
              </button>
              <button
                type="button"
                className="mic-warning-retry-button"
                onClick={checkEnvAndShowResult}
                style={{ background: '#4a5568', borderColor: '#4a5568' }}
              >
                環境変数チェック
              </button>
              <button
                type="button"
                className="mic-warning-retry-button"
                onClick={handleClearAllPendingDiagnosis}
                style={{ background: '#dc2626', borderColor: '#dc2626' }}
              >
                Clear All Pending Diagnoses
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 報酬写真の背景（初期は強烈なBlur、録音完了後に2秒で晴れる） */}
      <div className={`reward-photo-background ${fogCleared ? 'cleared' : ''}`}></div>
      
      <div className={`streak-display ${isRecording ? 'recording-mode' : ''}`}>
        連続 {streak} 日目！🔥
        {!isRecording && (
          <>
            <Link to="/admin" className="admin-link">管理画面</Link>
            <button
              type="button"
              className="admin-link force-reload-btn"
              onClick={forceReload}
            >
              最新版に強制更新
            </button>
          </>
        )}
      </div>
      
      {showPaywall && (
        <div className="paywall-overlay">
          <div className="paywall-content">
            <button className="paywall-close" onClick={handlePaywallClose}>×</button>
            <h2>1週間お疲れさん！🎉</h2>
            <p>詳しい分析と、Weehawkenでの俺の最新日常写真を見たい？コーヒー1杯分（500円）のご祝儀払う？</p>
            <div className="paywall-blur">
              <p>[プレミアムコンテンツはここに表示されます]</p>
            </div>
          </div>
        </div>
      )}
      
      {/* 今日の修行テーマ - 必ず表示 */}
      <div className={`daily-theme ${isRecording ? 'recording-mode' : ''}`}>
        <div className="theme-label">今日の修行テーマ</div>
        <div className="theme-text">{dailyTheme}</div>
      </div>
      
      {/* 録音中の停止ボタン（画面中央、180px x 180pxの正円） */}
      {isRecording && (
        <button 
          className="stop-recording-button"
          onClick={stopRecording}
          aria-label="録音を完了"
        >
          <span>録音完了</span>
          <span style={{ fontSize: 'clamp(20px, 4vw, 28px)' }}>（停止）</span>
        </button>
      )}
      
      <div className="content-wrapper">
        
        {/* ボリュームビジュアライザー */}
        {isRecording && (
          <div className="volume-visualizer">
            <div className="visualizer-bars">
              {audioData.map((value, index) => {
                const barHeight = Math.max(value * 120, 4) // 最小4px、最大120px
                return (
                  <div
                    key={index}
                    className="visualizer-bar"
                    style={{
                      height: `${barHeight}px`,
                      minHeight: '4px',
                      opacity: value > 0.01 ? 1 : 0.3
                    }}
                  />
                )
              })}
            </div>
            <div className="visualizer-label">録音中</div>
          </div>
        )}
        
        {/* 霧の演出：録音完了まで画面全体をBlur */}
        <div className={`fog-overlay ${fogCleared ? 'cleared' : ''}`}>
          <div className={`reward-content ${isComplete && fogCleared ? 'revealed' : 'hidden'}`}>
            {analysisResult ? (
              <>
                <h1 className="completion-title">修行完了！</h1>
                <div className="analysis-results">
                  <div className="score-item">
                    <div className="score-label">リスク管理能力</div>
                    <div className="score-value">{analysisResult.riskManagement?.score || 0}点</div>
                    <div className="score-reason">{analysisResult.riskManagement?.reason || ''}</div>
                  </div>
                  <div className="score-item">
                    <div className="score-label">マイク・タイソン指数</div>
                    <div className="score-value">{analysisResult.mikeTysonIndex?.score || 0}点</div>
                    <div className="score-reason">{analysisResult.mikeTysonIndex?.reason || ''}</div>
                  </div>
                  <div className="score-item">
                    <div className="score-label">今日の元気度</div>
                    <div className="score-value">{analysisResult.energyLevel?.score || 0}点</div>
                    <div className="score-reason">{analysisResult.energyLevel?.reason || ''}</div>
                  </div>
                </div>
                {sonMessage && (
                  <div className="son-message">
                    <div className="son-message-label">息子からのメッセージ</div>
                    <div className="son-message-text">{sonMessage}</div>
                  </div>
                )}
              </>
            ) : (
              <>
                <h1 className="completion-title">送信完了！</h1>
                <p className="completion-sub">親は管理画面で再生できます。AI解析は裏側で進んでいます。</p>
              </>
            )}
            {isAnalyzing && (
              <div className="analyzing-indicator">
                <div className="analyzing-spinner"></div>
                <p className="analyzing-message">AIが分析中です<br/>しばらくお待ちください</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* 録音ボタン - 完全な円 */}
      <div className="record-button-wrapper">
        <button
          className={`record-button ${isRecording ? 'recording' : ''}`}
          onClick={handleRecordClick}
          aria-label={isRecording ? '録音を停止' : '録音を開始'}
        >
          <span className="button-icon">{isRecording ? '⏸' : '🎤'}</span>
          {isRecording && <div className="ripple"></div>}
          {isRecording && <div className="ripple ripple-delay-1"></div>}
          {isRecording && <div className="ripple ripple-delay-2"></div>}
        </button>
      </div>

      {/* デバッグ情報の表示（開発環境または特定のフラグが有効な場合） */}
      {(import.meta.env.DEV || localStorage.getItem('tyson_debug') === 'true') && debugInfo && (
        <div className="debug-info">
          <div className="debug-header">🔍 デバッグ情報</div>
          <div className="debug-content">
            <div><strong>ステップ:</strong> {debugInfo.step}</div>
            <div><strong>ステータス:</strong> {debugInfo.status}</div>
            {debugInfo.progress !== undefined && (
              <div><strong>進捗:</strong> {debugInfo.progress}%</div>
            )}
            {debugInfo.bytesTransferred !== undefined && debugInfo.totalBytes !== undefined && (
              <div><strong>データ:</strong> {debugInfo.bytesTransferred} / {debugInfo.totalBytes} bytes</div>
            )}
            {debugInfo.error && (
              <div className="debug-error"><strong>エラー:</strong> {debugInfo.error}</div>
            )}
            {debugInfo.docId && (
              <div><strong>DocID:</strong> {debugInfo.docId}</div>
            )}
            {debugInfo.audioURL && (
              <div><strong>AudioURL:</strong> {debugInfo.audioURL.substring(0, 50)}...</div>
            )}
          </div>
        </div>
      )}

      {/* 右下: 今日の日付（new Date() でデバイス時刻、環境変数に非依存） */}
      <div className="build-info">
        <span className="today-jst">今日: {formatTodayJST()}</span>
        {getBuildHash() && <span className="git-commit"> | {getBuildHash()}</span>}
      </div>
    </div>
  )
}

export default HomePage
