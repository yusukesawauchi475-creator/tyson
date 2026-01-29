// IndexedDBへの音声データ保存・取得ユーティリティ

const DB_NAME = 'TysonAudioBackup'
const STORE_NAME = 'audioRecords'
const PENDING_DIAGNOSIS_STORE = 'pendingDiagnosis'
const DB_VERSION = 2

// IndexedDBを開く
const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
        objectStore.createIndex('timestamp', 'timestamp', { unique: false })
        objectStore.createIndex('userName', 'userName', { unique: false })
      }
      if (!db.objectStoreNames.contains(PENDING_DIAGNOSIS_STORE)) {
        const store = db.createObjectStore(PENDING_DIAGNOSIS_STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
  })
}

// 音声データをIndexedDBに保存
export const saveAudioToIndexedDB = async (audioBlob, metadata = {}) => {
  try {
    const db = await openDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    
    // BlobをArrayBufferに変換
    const arrayBuffer = await audioBlob.arrayBuffer()
    
    const record = {
      audioData: arrayBuffer,
      mimeType: audioBlob.type || 'audio/webm',
      timestamp: new Date().toISOString(),
      userName: metadata.userName || '',
      streakCount: metadata.streakCount || 0,
      date: metadata.date || new Date().toISOString().split('T')[0],
      savedAt: new Date().toISOString(),
      // API経由の同期状態（デフォルトは未同期）
      synced: metadata.synced === true,
      syncedAt: metadata.synced === true ? new Date().toISOString() : null,
      remoteId: metadata.remoteId || null
    }
    
    const request = store.add(record)
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('✅ IndexedDB保存成功:', { id: request.result, timestamp: record.timestamp })
        resolve(request.result)
      }
      request.onerror = () => {
        console.error('❌ IndexedDB保存失敗:', request.error)
        reject(request.error)
      }
    })
  } catch (error) {
    console.error('❌ IndexedDB保存エラー:', error)
    throw error
  }
}

// IndexedDBからすべての保存済みデータを取得
export const getAllSavedAudio = async () => {
  try {
    const db = await openDB()
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const records = request.result.map(record => ({
          ...record,
          audioBlob: new Blob([record.audioData], { type: record.mimeType })
        }))
        console.log('✅ IndexedDB取得成功:', { count: records.length })
        resolve(records)
      }
      request.onerror = () => {
        console.error('❌ IndexedDB取得失敗:', request.error)
        reject(request.error)
      }
    })
  } catch (error) {
    console.error('❌ IndexedDB取得エラー:', error)
    throw error
  }
}

// IndexedDBから特定のIDのデータを削除
export const deleteAudioFromIndexedDB = async (id) => {
  try {
    const db = await openDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('✅ IndexedDB削除成功:', { id })
        resolve()
      }
      request.onerror = () => {
        console.error('❌ IndexedDB削除失敗:', request.error)
        reject(request.error)
      }
    })
  } catch (error) {
    console.error('❌ IndexedDB削除エラー:', error)
    throw error
  }
}

// IndexedDBに保存されているデータの数を取得
export const getSavedAudioCount = async () => {
  try {
    const db = await openDB()
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.count()
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result)
      }
      request.onerror = () => {
        reject(request.error)
      }
    })
  } catch (error) {
    console.error('❌ IndexedDBカウントエラー:', error)
    return 0
  }
}

// 送信済みフラグを追加（同期エンジン用）
// 1トランザクション内で get → put を同期的に実行し、transaction inactive を防ぐ
export const markAsSynced = async (id) => {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const rec = getReq.result
        if (!rec) {
          resolve()
          return
        }
        rec.synced = true
        rec.syncedAt = new Date().toISOString()
        store.put(rec)
      }
      getReq.onerror = () => {
        console.error('❌ markAsSynced get失敗:', getReq.error)
        reject(getReq.error)
      }
      tx.oncomplete = () => {
        console.log('✅ 送信済みフラグ設定成功:', { id })
        resolve()
      }
      tx.onerror = () => {
        console.error('❌ markAsSynced トランザクションエラー:', tx.error)
        reject(tx.error)
      }
    })
  } catch (error) {
    console.error('❌ 送信済みフラグ設定エラー:', error)
  }
}

// --- 診断待ち（AI解析失敗時・再試行用） ---

export const addPendingDiagnosis = async ({ audioURL, docId }) => {
  try {
    const db = await openDB()
    const tx = db.transaction([PENDING_DIAGNOSIS_STORE], 'readwrite')
    const store = tx.objectStore(PENDING_DIAGNOSIS_STORE)
    const record = { audioURL, docId, createdAt: new Date().toISOString() }
    return new Promise((resolve, reject) => {
      const req = store.add(record)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.error('❌ addPendingDiagnosis:', e)
    throw e
  }
}

export const getAllPendingDiagnosis = async () => {
  try {
    const db = await openDB()
    const tx = db.transaction([PENDING_DIAGNOSIS_STORE], 'readonly')
    const store = tx.objectStore(PENDING_DIAGNOSIS_STORE)
    return new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.error('❌ getAllPendingDiagnosis:', e)
    return []
  }
}

export const removePendingDiagnosis = async (id) => {
  try {
    const db = await openDB()
    const tx = db.transaction([PENDING_DIAGNOSIS_STORE], 'readwrite')
    const store = tx.objectStore(PENDING_DIAGNOSIS_STORE)
    return new Promise((resolve, reject) => {
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.error('❌ removePendingDiagnosis:', e)
    throw e
  }
}

export const clearAllPendingDiagnosis = async () => {
  try {
    const db = await openDB()
    const tx = db.transaction([PENDING_DIAGNOSIS_STORE], 'readwrite')
    const store = tx.objectStore(PENDING_DIAGNOSIS_STORE)
    return new Promise((resolve, reject) => {
      const req = store.clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.error('❌ clearAllPendingDiagnosis:', e)
    throw e
  }
}
