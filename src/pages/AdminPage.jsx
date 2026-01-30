import { useState, useEffect, useRef } from 'react'
import { db, storage } from '../lib/firebase'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { ref, uploadBytes, deleteObject } from 'firebase/storage'
import { Link, useSearchParams } from 'react-router-dom'
import AdminAuth from '../components/AdminAuth'
import { getAllSavedAudio, deleteAudioFromIndexedDB } from '../lib/indexedDB'
import { checkDeployHealth } from '../lib/deployHealthCheck'
import './AdminPage.css'

function AdminPage() {
  const [searchParams] = useSearchParams()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [playingAudioId, setPlayingAudioId] = useState(null)
  const [healthCheckResult, setHealthCheckResult] = useState(null)
  const [isCheckingHealth, setIsCheckingHealth] = useState(false)
  const [deployHealth, setDeployHealth] = useState(null)
  const [storageTestResult, setStorageTestResult] = useState(null)
  const [isTestingStorage, setIsTestingStorage] = useState(false)
  const [indexedDBSyncTestResult, setIndexedDBSyncTestResult] = useState(null)
  const [isTestingIndexedDBSync, setIsTestingIndexedDBSync] = useState(false)
  const [scoreHistory, setScoreHistory] = useState([])
  const [alertMessage, setAlertMessage] = useState(null)
  const [notificationError, setNotificationError] = useState(false)
  const audioRef = useRef(null)
  
  // デプロイ健全性チェック（起動時）
  useEffect(() => {
    const health = checkDeployHealth()
    setDeployHealth(health)
    if (!health.healthy) {
      console.warn('[DeployHealthCheck] warnings:', health.warnings)
    }
  }, [])

  // ディープリンク: 通知から来た場合、自動ログインして該当レコードを表示
  useEffect(() => {
    const recordId = searchParams.get('recordId')
    if (recordId && isAuthenticated) {
      // 該当レコードを自動スクロール・再生
      setTimeout(() => {
        const recordElement = document.getElementById(`record-${recordId}`)
        if (recordElement) {
          recordElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          recordElement.style.border = '3px solid #64ffda'
          setTimeout(() => {
            recordElement.style.border = ''
          }, 3000)
        }
      }, 500)
    }
  }, [searchParams, isAuthenticated])

  // キャッシュから即座にデータを読み込む（Stale-While-Revalidate）
  useEffect(() => {
    if (isAuthenticated) {
      // キャッシュから即座に表示
      const cachedRecords = localStorage.getItem('admin_records_cache')
      const cacheTimestamp = localStorage.getItem('admin_records_cache_timestamp')
      const now = Date.now()
      
      if (cachedRecords && cacheTimestamp && (now - parseInt(cacheTimestamp, 10)) < 60000) {
        // 1分以内のキャッシュがあれば即座に表示
        try {
          const parsed = JSON.parse(cachedRecords)
          setRecords(parsed)
        } catch (e) {
          console.error('❌ キャッシュパース失敗:', e)
        }
      }
      
      // バックグラウンドで最新データを取得
      loadRecords()
    }
  }, [isAuthenticated])

  const handleHealthCheck = async () => {
    setIsCheckingHealth(true)
    setHealthCheckResult(null)
    
    try {
      const response = await fetch('/api/health-check')
      const result = await response.json()
      setHealthCheckResult(result)
    } catch (error) {
      console.error('❌ システム健全性チェック失敗:', error)
      setHealthCheckResult({
        overall: 'error',
        error: `システム健全性チェックに失敗しました: ${error?.message ?? String(error)}`
      })
    } finally {
      setIsCheckingHealth(false)
    }
  }

  // Storage導通テスト（書き込み権限の検証）
  const testStorageConnection = async () => {
    setIsTestingStorage(true)
    setStorageTestResult(null)
    
    try {
      if (!storage) {
        throw new Error('Firebase Storageが初期化されていません。環境変数を確認してください。')
      }
      
      // ダミーファイルを作成
      const testFileName = `test_${Date.now()}.txt`
      const testContent = 'Storage導通テスト'
      const testBlob = new Blob([testContent], { type: 'text/plain' })
      
      // Storageにアップロードを試行
      const storageRef = ref(storage, `test/${testFileName}`)
      
        try {
          await uploadBytes(storageRef, testBlob)
          
          // アップロード成功後、必ずテストファイルを削除（サイレント・クリーンアップ）
          try {
            await deleteObject(storageRef)
            console.log('✅ テストファイル削除成功:', testFileName)
          } catch (deleteError) {
            console.error('❌ テストファイルの削除に失敗:', deleteError)
            // 削除に失敗してもエラーとして扱わない（警告のみ）
          }
        
        setStorageTestResult({
          success: true,
          message: '✅ Storage書き込み権限: 正常',
          solution: null
        })
      } catch (uploadError) {
        let solution = ''
        
              if (uploadError.code === 'storage/unauthorized') {
                solution = '❌ Firebase Storage Rules が書き込みを拒否しています。\n\n【解決方法】\n1. Firebase Console (https://console.firebase.google.com/) にアクセス\n2. プロジェクトを選択\n3. 「Storage」→「Rules」タブを開く\n4. 以下のルールを設定して「公開」をクリック:\n\nrules_version = \'2\';\nservice firebase.storage {\n  match /b/{bucket}/o {\n    match /{allPaths=**} {\n      allow read, write: if true;\n    }\n  }\n}\n\n⚠️ 注意: 本番環境ではより厳格なルールを推奨します。'
              } else if (uploadError.code === 'storage/quota-exceeded') {
                solution = '❌ Firebase Storage の容量が不足しています。\n\n【解決方法】\n1. Firebase Console → Storage → Usage で容量を確認\n2. 不要なファイルを削除するか、プランをアップグレード'
              } else if (uploadError.code === 'storage/unauthenticated') {
                solution = '❌ 認証が必要です。\n\n【解決方法】\n1. Firebase Console → Storage → Rules で認証ルールを確認\n2. 匿名アクセスを許可する場合は、Rules を `allow read, write: if true;` に変更'
              } else {
                solution = `❌ エラーコード: ${uploadError.code}\n詳細: ${uploadError.message}\n\n【解決方法】\n1. Firebase Console で Storage の状態を確認\n2. ネットワーク接続を確認\n3. Vercel の環境変数（VITE_FIREBASE_STORAGE_BUCKET等）を確認`
              }
        
        setStorageTestResult({
          success: false,
          message: `❌ Storage書き込み権限: エラー (${uploadError.code})`,
          solution: solution
        })
      }
    } catch (error) {
      setStorageTestResult({
        success: false,
        message: `❌ Storage導通テスト失敗: ${error.message}`,
        solution: 'Vercelの環境変数（VITE_FIREBASE_STORAGE_BUCKET等）を確認してください。'
      })
    } finally {
      setIsTestingStorage(false)
    }
  }

  // IndexedDB -> Storage 疑似同期テスト
  const testIndexedDBSync = async () => {
    setIsTestingIndexedDBSync(true)
    setIndexedDBSyncTestResult(null)
    
    try {
      // IndexedDBからデータを取得
      const savedAudios = await getAllSavedAudio()
      const unsyncedCount = savedAudios.filter(record => !record.synced).length
      
      if (unsyncedCount === 0) {
        setIndexedDBSyncTestResult({
          success: true,
          message: '✅ IndexedDB同期テスト: 未送信データなし',
          solution: null
        })
        return
      }
      
      // ダミーデータでStorageへのアップロードをテスト
      const testFileName = `sync_test_${Date.now()}.txt`
      const testContent = 'IndexedDB同期テスト'
      const testBlob = new Blob([testContent], { type: 'text/plain' })
      const storageRef = ref(storage, `test/${testFileName}`)
      
      try {
        await uploadBytes(storageRef, testBlob)
        
        // アップロード成功後、必ずテストファイルを削除
        await deleteObject(storageRef)
        
        setIndexedDBSyncTestResult({
          success: true,
          message: `✅ IndexedDB同期テスト: 正常（未送信データ ${unsyncedCount}件）`,
          solution: `IndexedDBに ${unsyncedCount}件の未送信データがあります。アプリ起動時に自動同期されます。`
        })
      } catch (uploadError) {
        setIndexedDBSyncTestResult({
          success: false,
          message: `❌ IndexedDB同期テスト: Storageアップロード失敗 (${uploadError.code})`,
          solution: `Storageへの書き込み権限を確認してください。Storage Rulesが \`allow write: if true;\` になっているか確認してください。`
        })
      }
    } catch (error) {
      setIndexedDBSyncTestResult({
        success: false,
        message: `❌ IndexedDB同期テスト失敗: ${error.message}`,
        solution: 'IndexedDBへのアクセス権限を確認してください。'
      })
    } finally {
      setIsTestingIndexedDBSync(false)
    }
  }

  // Firestore導通テスト（フロントエンド側）
  const testFirestoreConnection = async () => {
    try {
      if (!db) {
        throw new Error('Firebaseが初期化されていません。環境変数を確認してください。')
      }
      
      // limit関数がインポートされているか確認
      if (typeof limit !== 'function') {
        throw new Error('limit関数がインポートされていません')
      }
      
      // テストクエリを実行
      const testQuery = query(collection(db, 'shugyo'), limit(1))
      const testSnapshot = await getDocs(testQuery)
      
      console.log('✅ Firestore導通テスト成功:', {
        collection: 'shugyo',
        documentCount: testSnapshot.size,
        empty: testSnapshot.empty
      })
      
      return { success: true, message: 'Firestore接続正常' }
    } catch (error) {
      console.error('❌ Firestore導通テスト失敗:', {
        error: error.message,
        code: error.code,
        collection: 'shugyo',
        limitFunction: typeof limit
      })
      
      return { 
        success: false, 
        message: `Firestore接続エラー: ${error.message}`,
        code: error.code
      }
    }
  }

  const loadRecords = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Firebase接続確認
      if (!db) {
        throw new Error('Firebaseが初期化されていません。環境変数を確認してください。')
      }
      
      // Firestore導通テストを実行
      const connectionTest = await testFirestoreConnection()
      if (!connectionTest.success) {
        throw new Error(connectionTest.message)
      }
      
      const q = query(collection(db, 'shugyo'), orderBy('timestamp', 'desc'))
      const querySnapshot = await getDocs(q)
      
      const recordsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      
      // 通知エラーの確認（Firestoreから最新のエラーログを取得）
      try {
        const errorQuery = query(
          collection(db, 'notification_errors'),
          orderBy('timestamp', 'desc'),
          limit(1)
        )
        const errorSnapshot = await getDocs(errorQuery)
        
        if (!errorSnapshot.empty) {
          const latestError = errorSnapshot.docs[0].data()
          const errorTime = latestError.timestamp?.toDate ? latestError.timestamp.toDate() : new Date(latestError.timestamp)
          const hoursSinceError = (Date.now() - errorTime.getTime()) / (1000 * 60 * 60)
          
          // 24時間以内のエラーがある場合、CEOに表示
          if (hoursSinceError < 24) {
            setNotificationError(true)
          } else {
            setNotificationError(false)
          }
        } else {
          setNotificationError(false)
        }
      } catch (error) {
        // エラーチェックの失敗は無視
        setNotificationError(false)
      }
      
      // キャッシュに保存
      localStorage.setItem('admin_records_cache', JSON.stringify(recordsData))
      localStorage.setItem('admin_records_cache_timestamp', Date.now().toString())
      
      setRecords(recordsData)
    } catch (error) {
      // エラーメッセージを具体的に生成
      let errorMessage = '記録の取得に失敗しました'
      
      if (error.code === 'permission-denied') {
        errorMessage = '接続エラー：Firestoreへのアクセスが拒否されました。セキュリティルールを確認してください。'
      } else if (error.code === 'unavailable') {
        errorMessage = '接続エラー：Firestoreサービスが利用できません。しばらくしてから再度お試しください。'
      } else if (error.message && error.message.includes('network') || error.message.includes('Network')) {
        errorMessage = '接続エラー：ネットワークエラーが発生しました。インターネット接続を確認してください。'
      } else if (error.message) {
        errorMessage = `接続エラー：${error.message}`
      }
      
      setError(errorMessage)
      
      // エラーの詳細をログに出力（開発環境のみ）
      if (import.meta.env.DEV) {
        console.error('記録の取得エラー:', {
          message: error.message,
          code: error.code,
          stack: error.stack,
          firebaseConfig: {
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '未設定',
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY ? '設定済み' : '未設定'
          }
        })
      }
      
      // エラー時もキャッシュがあれば表示を維持
      const cachedRecords = localStorage.getItem('admin_records_cache')
      if (cachedRecords) {
        try {
          const parsed = JSON.parse(cachedRecords)
          setRecords(parsed)
          console.log('✅ キャッシュからデータを表示:', { count: parsed.length })
        } catch (e) {
          console.error('❌ キャッシュパース失敗（loadRecords）:', e)
          setRecords([])
        }
      } else {
        setRecords([])
      }
    } finally {
      setLoading(false)
    }
  }

  // 最新の音声を一撃で再生
  const playLatestAudio = () => {
    if (records.length > 0 && records[0].audioURL) {
      handlePlayAudio(records[0].audioURL, records[0].id)
    }
  }

  const handlePlayAudio = (audioURL, recordId) => {
    if (playingAudioId === recordId) {
      // 既に再生中の場合は停止
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayingAudioId(null)
      return
    }

    // 既存の音声を停止
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    const audio = new Audio(audioURL)
    audioRef.current = audio
    audio.play()
    setPlayingAudioId(recordId)

    audio.onended = () => {
      setPlayingAudioId(null)
      audioRef.current = null
    }

    audio.onerror = () => {
      if (import.meta.env.DEV) {
        console.error('音声の再生に失敗しました')
      }
      setPlayingAudioId(null)
      audioRef.current = null
    }
  }

  // コンポーネントのアンマウント時に音声を停止
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const formatDate = (timestamp) => {
    if (!timestamp) return '-'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatScore = (score) => {
    if (typeof score === 'object' && score.score !== undefined) {
      return score.score
    }
    return score || '-'
  }

  if (!isAuthenticated) {
    return <AdminAuth onAuthenticated={() => setIsAuthenticated(true)} />
  }

  return (
    <div className="admin-page">
      {/* Tyson専用環境隔離成功バナー */}
      <div className="isolation-success-banner">
        ✅ デプロイ完了。聖域構築成功（tyson-3341f）| 専用環境に完全隔離
      </div>
      
      <div className="admin-header">
        <h1>修行記録管理画面</h1>
        <div className="admin-header-actions">
          <Link to="/" className="back-link">← ホームに戻る</Link>
          <button onClick={loadRecords} className="refresh-button" disabled={loading}>
            {loading ? '更新中' : '更新'}
          </button>
          <button
            type="button"
            onClick={async () => {
              setError(null)
              try {
                const testResult = await testFirestoreConnection()
                if (!testResult.success) {
                  setError(`接続テスト失敗: ${testResult.message}`)
                  return
                }
                await loadRecords()
              } catch (e) {
                console.error('❌ 強制再試行エラー:', e)
                setError(`強制再試行失敗: ${e?.message ?? String(e)}`)
              }
            }}
            className="force-retry-button"
            disabled={loading}
          >
            {loading ? '再試行中' : '🔄 強制再試行'}
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const testResult = await testFirestoreConnection()
                if (testResult.success) {
                  alert('✅ Firestore接続テスト成功\n\nコレクション名: shugyo\n接続状態: 正常\n\n自動でリストを更新します...')
                  await loadRecords()
                } else {
                  alert(`❌ Firestore接続テスト失敗\n\n${testResult.message}\n\nエラーコード: ${testResult.code || 'N/A'}`)
                }
              } catch (e) {
                console.error('❌ Firestore導通テストエラー:', e)
                setError(`Firestore導通テスト失敗: ${e?.message ?? String(e)}`)
                alert(`❌ Firestore導通テスト失敗\n\n${e?.message ?? String(e)}`)
              }
            }}
            className="health-check-button"
          >
            🔍 Firestore導通テスト
          </button>
          <button 
            onClick={handleHealthCheck} 
            className="health-check-button"
            disabled={isCheckingHealth}
          >
            {isCheckingHealth ? 'チェック中' : 'システム健全性チェック'}
          </button>
          <button 
            onClick={testStorageConnection} 
            className="storage-test-button"
            disabled={isTestingStorage}
          >
            {isTestingStorage ? 'テスト中' : '📦 Storage導通テスト'}
          </button>
          <button 
            onClick={testIndexedDBSync} 
            className="indexeddb-sync-test-button"
            disabled={isTestingIndexedDBSync}
          >
            {isTestingIndexedDBSync ? 'テスト中' : '🔄 IndexedDB同期テスト'}
          </button>
          <a href="/docs/CORS_SETUP_CEO.md" target="_blank" rel="noopener" className="cors-setup-link" style={{ marginLeft: 8, fontSize: 14 }}>
            📋 CORS 開通手順
          </a>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="admin-error">
          <strong>エラー:</strong> {error}
          <br />
          <small>Firebase接続を確認してください。環境変数が正しく設定されているか確認してください。</small>
        </div>
      )}

      {/* 異常検知アラート */}
      {alertMessage && (
        <div className="alert-banner">
          <strong>🚨 {alertMessage}</strong>
        </div>
      )}

      {/* 通知エラー表示（CEOのみ見える） */}
      {notificationError && (
        <div className="notification-error-banner">
          <strong>⚠️ 通知エラーあり（24時間以内）</strong>
        </div>
      )}

      {/* 過去7日間のスコアグラフ */}
      {scoreHistory.length > 0 && (
        <div className="score-dashboard">
          <h3>過去7日間の活力指数</h3>
          <div className="score-chart">
            {scoreHistory.map((item, index) => {
              const dateStr = item.date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
              const height = Math.max(10, (item.avgScore / 100) * 200)
              return (
                <div key={index} className="chart-bar-container">
                  <div 
                    className="chart-bar" 
                    style={{ height: `${height}px` }}
                    title={`${dateStr}: ${item.avgScore.toFixed(1)}点`}
                  >
                    <span className="chart-value">{item.avgScore.toFixed(0)}</span>
                  </div>
                  <div className="chart-label">{dateStr}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 最新の修行を一撃で再生する浮遊ボタン */}
      {records.length > 0 && records[0].audioURL && (
        <button 
          className="floating-play-button"
          onClick={playLatestAudio}
          disabled={playingAudioId === records[0].id}
        >
          <span className="floating-icon">🎧</span>
          <span className="floating-text">
            {playingAudioId === records[0].id ? '再生中...' : '最新の修行を聴く'}
          </span>
        </button>
      )}

      {healthCheckResult && (
        <div className={`health-check-result ${healthCheckResult.overall === 'healthy' ? 'healthy' : 'degraded'}`}>
          <h3>システム健全性チェック結果</h3>
          <div className="health-check-services">
            {Object.entries(healthCheckResult.services || {}).map(([service, status]) => (
              <div key={service} className={`health-check-service ${status.status}`}>
                <strong>{service}:</strong> {status.message}
              </div>
            ))}
          </div>
          <div className="health-check-overall">
            全体ステータス: <strong>{healthCheckResult.overall === 'healthy' ? '正常' : '異常'}</strong>
          </div>
        </div>
      )}

      {loading && records.length === 0 ? (
        <div className="loading">データを取得中</div>
      ) : (
        <div className="admin-records-grid">
          {records.length === 0 ? (
            <div className="admin-empty">
              <p>記録がありません</p>
              <p style={{ fontSize: '18px', color: '#999', marginTop: '10px' }}>
                {error ? 'Firebase接続エラーの可能性があります。' : '録音データがまだ保存されていません。'}
              </p>
            </div>
          ) : (
            records.map((record) => (
              <div key={record.id} id={`record-${record.id}`} className="admin-record-card">
                <div className="record-header">
                  <h3>{formatDate(record.timestamp || record.createdAt)}</h3>
                  <div className="record-meta">
                    <span>{record.userName || '未設定'}</span>
                    <span className="streak-badge">{record.streakCount || 0} 日目</span>
                    {record.syncedFromIndexedDB && (
                      <span className="sync-source-badge indexeddb">IndexedDB</span>
                    )}
                    {!record.syncedFromIndexedDB && (
                      <span className="sync-source-badge realtime">Realtime</span>
                    )}
                  </div>
                </div>
                
                <div className="record-content-grid">
                  <div className="audio-player-section">
                    {record.audioURL && (
                      <button
                        className={`play-button ${playingAudioId === record.id ? 'playing' : ''}`}
                        onClick={() => handlePlayAudio(record.audioURL, record.id)}
                      >
                        {playingAudioId === record.id ? '⏸ 停止' : '▶ 再生'}
                      </button>
                    )}
                  </div>
                  
                  <div className="analysis-section">
                    {record.analysisResult ? (
                      <div className="analysis-results">
                        {record.analysisResult.analysisDuration && (
                          <div className="analysis-duration">
                            <strong>解析時間:</strong> {record.analysisResult.analysisDuration.toFixed(2)}秒
                          </div>
                        )}
                    <div className="score-item">
                      <div className="score-label">リスク管理能力</div>
                      <div className="score-value">{formatScore(record.analysisResult.riskManagement)}点</div>
                      {record.analysisResult.riskManagement?.reason && (
                        <div className="score-reason">{record.analysisResult.riskManagement.reason}</div>
                      )}
                    </div>
                    <div className="score-item">
                      <div className="score-label">マイク・タイソン指数</div>
                      <div className="score-value">{formatScore(record.analysisResult.mikeTysonIndex)}点</div>
                      {record.analysisResult.mikeTysonIndex?.reason && (
                        <div className="score-reason">{record.analysisResult.mikeTysonIndex.reason}</div>
                      )}
                    </div>
                    <div className="score-item">
                      <div className="score-label">今日の元気度</div>
                      <div className="score-value">{formatScore(record.analysisResult.energyLevel)}点</div>
                      {record.analysisResult.energyLevel?.reason && (
                        <div className="score-reason">{record.analysisResult.energyLevel.reason}</div>
                      )}
                    </div>
                    {record.analysisResult.advice && (
                      <div className="advice-item">
                        <div className="advice-label">アドバイス</div>
                        <div className="advice-text">{record.analysisResult.advice}</div>
                      </div>
                    )}
                    {record.analysisResult.transcription && (
                      <div className="transcription-item">
                        <div className="transcription-label">文字起こし</div>
                        <div className="transcription-text">{record.analysisResult.transcription}</div>
                      </div>
                    )}
                      </div>
                    ) : (
                      <div className="analysis-pending">分析待ち</div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* デプロイ健全性インジケーター */}
      <div className={`build-info ${deployHealth && !deployHealth.healthy ? 'unhealthy' : ''}`}>
        <span className="build-time">
          {deployHealth ? deployHealth.buildTime.split('T')[0] : '...'}
        </span>
        {deployHealth && deployHealth.gitCommit && deployHealth.gitCommit !== 'unknown' && (
          <span className="git-commit"> | {deployHealth.gitCommit.substring(0, 7)}</span>
        )}
        {deployHealth && !deployHealth.healthy && (
          <span className="deploy-warning" title={deployHealth.warnings.join('\n')}>
            ⚠️
          </span>
        )}
      </div>
      {deployHealth && !deployHealth.healthy && (
        <div className="deploy-alert">
          {deployHealth.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default AdminPage
