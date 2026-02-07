// キャッシュ完全破壊: ファイル最上位で即時実行。try-catch で囲み、失敗しても root.render は止めない [cite: 2026-01-25]
const VERSION = '2026-01-28-V_FINAL_FORCE_RELOAD'
let skipReload = false
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('APP_VERSION') !== VERSION) {
    if (typeof indexedDB !== 'undefined') {
      indexedDB.deleteDatabase('tyson-db')
      indexedDB.deleteDatabase('TysonAudioBackup')
    }
    localStorage.clear()
    localStorage.setItem('APP_VERSION', VERSION)
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload()
    }
    skipReload = true
  }
} catch (e) {
  const msg = e?.message ?? String(e)
  try {
    window.alert('リセット失敗：' + msg)
  } catch (_) {}
}

// 起動後 5 秒間はサーバー同期をブロック [cite: 2026-01-28]
if (typeof window !== 'undefined' && !skipReload) {
  window.__SYNC_BLOCKED_UNTIL = Date.now() + 5000
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

console.log("ENV CHECK", {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
});


if (!skipReload) {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
