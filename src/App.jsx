import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import PairDailyPage from './pages/PairDailyPage'
import HomePage from './pages/HomePage'
import AdminPage from './pages/AdminPage'
import AlbumPage from './pages/AlbumPage'
import DemoPage from './pages/DemoPage'
import LandingPage from './pages/LandingPage'
import RoleSelectPage from './pages/RoleSelectPage'
import { getUserRole, clearUserRole, PAIR_ID_STORAGE_KEY } from './lib/pairDaily'
import { db } from './lib/firebase'
import { doc, getDoc } from 'firebase/firestore'

function NumberResolver({ lang = 'ja', number }) {
  const [status, setStatus] = useState(() => {
    // 即座にlocalStorageのpairIdをクリア（古いpairIdでAPIを叩くのを防ぐ）
    // roleはクリアしない（リフレッシュ時に再選択させない）
    localStorage.removeItem(PAIR_ID_STORAGE_KEY)
    return 'loading'
  })
  useEffect(() => {
    ;(async () => {
      try {
        const snap = await getDoc(doc(db, 'pair_numbers', String(number)))
        if (snap.exists()) {
          const pairId = snap.data()?.pairId
          if (pairId) {
            localStorage.setItem(PAIR_ID_STORAGE_KEY, pairId)
            setStatus('resolved')
            return
          }
        }
        localStorage.removeItem(PAIR_ID_STORAGE_KEY)
        clearUserRole()
        setStatus('error')
      } catch (err) {
        console.error('[NumberResolver] error:', err?.message, err)
        localStorage.removeItem(PAIR_ID_STORAGE_KEY)
        clearUserRole()
        setStatus('error')
      }
    })()
  }, [number])
  if (status === 'loading') return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8070A0', fontFamily: 'var(--font-sans)' }}>{lang === 'en' ? 'Loading...' : '読み込み中...'}</div>
  if (status === 'error') return <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8070A0', fontFamily: 'var(--font-sans)', gap: 12 }}><p style={{ fontSize: 16, fontWeight: 600 }}>{lang === 'en' ? 'This link is invalid.' : 'このリンクは無効です。'}</p><a href="/#/landing" style={{ fontSize: 14, color: '#7050C0' }}>{lang === 'en' ? 'Go to Home' : 'ホームへ'}</a></div>
  return <RootRoute lang={lang} />
}

function RootOrLanding({ lang = 'ja' }) {
  try {
    const hash = window.location.hash || ''
    const qIndex = hash.indexOf('?')
    const qs = qIndex >= 0 ? hash.slice(qIndex + 1) : ''
    const params = new URLSearchParams(qs)
    const pairIdFromUrl = params.get('pairId')?.trim()
    if (pairIdFromUrl) return <RootRoute lang={lang} />
    const numberFromUrl = params.get('number')?.trim()
    if (numberFromUrl) return <NumberResolver number={numberFromUrl} lang={lang} />
  } catch (_) {}
  return <LandingPage lang={lang} />
}

function RootRoute({ lang = 'ja' }) {
  const [role, setRole] = useState(() => {
    // URLに?pairId=がある場合は古いroleをクリアして役割選択を強制表示
    try {
      const hash = window.location.hash || '';
      const qIndex = hash.indexOf('?');
      const qs = qIndex >= 0 ? hash.slice(qIndex + 1) : '';
      const pairIdFromUrl = new URLSearchParams(qs).get('pairId')?.trim();
      const storedPairId = localStorage.getItem('tyson_pairId')?.trim();
      // URLのpairIdが既存のlocalStorageと違う場合 → 新規ユーザー → roleクリア
      if (pairIdFromUrl && pairIdFromUrl !== storedPairId) {
        clearUserRole();
        return null;
      }
    } catch (_) {}
    return getUserRole();
  })

  const handleSelect = (selectedRole) => setRole(selectedRole)
  const handleChangeRole = () => { clearUserRole(); setRole(null) }

  if (!role) return <RoleSelectPage onSelect={handleSelect} lang={lang} />
  if (role === 'parent') return <HomePage lang={lang} onChangeRole={handleChangeRole} />
  return <PairDailyPage lang={lang} onChangeRole={handleChangeRole} role={role} />
}

function App() {
  return (
    <>
      <div className="mobile-white-overlay" aria-hidden="true" />
      <div className="app-foreground app-root">
        <HashRouter>
          <Routes>
            <Route path="/" element={<RootOrLanding />} />
            <Route path="/eng" element={<RootOrLanding lang="en" />} />
            <Route path="/home" element={<RootRoute />} />
            <Route path="/home/eng" element={<RootRoute lang="en" />} />
            <Route path="/tyson/eng" element={<PairDailyPage lang="en" />} />
            <Route path="/tyson" element={<PairDailyPage />} />
            <Route path="/admin/eng" element={<AdminPage lang="en" />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/album/eng" element={<AlbumPage lang="en" />} />
            <Route path="/album" element={<AlbumPage />} />
            <Route path="/demo/eng" element={<DemoPage lang="en" />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/landing/eng" element={<LandingPage lang="en" />} />
          </Routes>
        </HashRouter>
      </div>
    </>
  )
}

export default App
