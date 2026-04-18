import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useSearchParams } from 'react-router-dom'
import PairDailyPage from './pages/PairDailyPage'
import HomePage from './pages/HomePage'
import AdminPage from './pages/AdminPage'
import AlbumPage from './pages/AlbumPage'
import DemoPage from './pages/DemoPage'
import LandingPage from './pages/LandingPage'
import RoleSelectPage from './pages/RoleSelectPage'
import PairWorld from './components/PairWorld'
import InvitePage from './pages/InvitePage'
import { getUserRole, setUserRole, clearUserRole, getPairId, PAIR_ID_STORAGE_KEY } from './lib/pairDaily'
import PwaInstallBanner, { BANNER_HEIGHT } from './components/PwaInstallBanner'
import { db, getIdTokenForApi } from './lib/firebase'
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
        // Firebase Security Rules で認証必須のため、先に匿名認証を完了させる
        await getIdTokenForApi()
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
  return <LandingPage lang={lang} />
}

function RootRoute({ lang = 'ja' }) {
  const [searchParams] = useSearchParams()
  const [role, setRole] = useState(() => {
    const roleFromUrl = searchParams.get('role')?.trim()
    if (roleFromUrl === 'parent' || roleFromUrl === 'child') {
      setUserRole(roleFromUrl)
      return roleFromUrl
    }
    return getUserRole()
  })

  const handleSelect = (selectedRole) => setRole(selectedRole)
  const handleChangeRole = () => { clearUserRole(); setRole(null) }

  if (!role) return <RoleSelectPage onSelect={handleSelect} lang={lang} />
  if (role === 'parent') return <HomePage lang={lang} onChangeRole={handleChangeRole} />
  return <PairDailyPage lang={lang} onChangeRole={handleChangeRole} role={role} />
}

function App() {
  const [bannerVisible, setBannerVisible] = useState(false)
  return (
    <>
      <div className="mobile-white-overlay" aria-hidden="true" />
      <PwaInstallBanner lang="ja" onVisibilityChange={setBannerVisible} />
      <div className="app-foreground app-root" style={bannerVisible ? { paddingTop: BANNER_HEIGHT } : undefined}>
        <Router>
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
            <Route path="/pair/:slug" element={<PairWorld />}>
              <Route index element={<RootRoute />} />
              <Route path="album" element={<AlbumPage />} />
              <Route path="invite" element={<InvitePage />} />
            </Route>
          </Routes>
        </Router>
      </div>
    </>
  )
}

export default App
