import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useSearchParams, useNavigate, useOutletContext } from 'react-router-dom'
import PairDailyPage from './pages/PairDailyPage'
import HomePage from './pages/HomePage'
import AdminPage from './pages/AdminPage'
import AlbumPage from './pages/AlbumPage'
import DemoPage from './pages/DemoPage'
import LandingPage from './pages/LandingPage'
import RoleSelectPage from './pages/RoleSelectPage'
import PairWorld from './components/PairWorld'
import InvitePage from './pages/InvitePage'
import WelcomePage from './pages/WelcomePage'
import { getUserRole, setUserRole, clearUserRole } from './lib/pairDaily'
import PwaInstallBanner, { BANNER_HEIGHT } from './components/PwaInstallBanner'

function RootOrLanding({ lang = 'ja' }) {
  const navigate = useNavigate()

  useEffect(() => {
    try {
      const stored = localStorage.getItem('hum_last_slug')
      if (stored && /^[A-Za-z0-9_-]{2,32}$/.test(stored)) {
        navigate(`/pair/${stored}`, { replace: true })
      }
    } catch (_) {
      // localStorage 例外（private mode 等）は無視し、LandingPage を表示
    }
  }, [navigate])

  return <LandingPage lang={lang} />
}

function RootRoute({ lang = 'ja' }) {
  const [searchParams] = useSearchParams()
  // 段階10-a-ext: PairWorld の outlet context から pairId を取得、role_history 記録に渡す
  const outletContext = useOutletContext()
  const pairId = outletContext?.pairId ?? null
  const ctxLang = outletContext?.lang ?? lang
  const [role, setRole] = useState(() => {
    const roleFromUrl = searchParams.get('role')?.trim()
    if (roleFromUrl === 'parent' || roleFromUrl === 'child') {
      setUserRole(roleFromUrl, 'url-param', pairId)
      return roleFromUrl
    }
    return getUserRole()
  })

  const handleSelect = (selectedRole) => setRole(selectedRole)
  const handleChangeRole = () => { clearUserRole('switch-button', pairId); setRole(null) }

  if (!role) return <RoleSelectPage onSelect={handleSelect} lang={ctxLang} pairId={pairId} />
  if (role === 'parent') return <HomePage lang={ctxLang} onChangeRole={handleChangeRole} />
  return <PairDailyPage lang={ctxLang} onChangeRole={handleChangeRole} role={role} />
}

function AppRoutes() {
  const [searchParams] = useSearchParams()
  const urlLang = searchParams.get('lang')
  const storedLang = (() => {
    try { return localStorage.getItem('hum_lang') } catch (_) { return null }
  })()
  const validLangs = ['ja', 'en', 'es']
  const lang = validLangs.includes(urlLang) ? urlLang
    : validLangs.includes(storedLang) ? storedLang
    : 'ja'

  const [bannerVisible, setBannerVisible] = useState(false)

  return (
    <>
      <PwaInstallBanner lang={lang} onVisibilityChange={setBannerVisible} />
      <div className="app-foreground app-root" style={bannerVisible ? { paddingTop: BANNER_HEIGHT } : undefined}>
        <Routes>
          <Route path="/" element={<RootOrLanding lang={lang} />} />
          <Route path="/admin" element={<AdminPage lang={lang} />} />
          <Route path="/demo" element={<DemoPage lang={lang} />} />
          <Route path="/landing" element={<LandingPage lang={lang} />} />
          <Route path="/welcome" element={<WelcomePage lang={lang} />} />
          <Route path="/pair/:slug" element={<PairWorld lang={lang} />}>
            <Route index element={<RootRoute lang={lang} />} />
            <Route path="album" element={<AlbumPage lang={lang} />} />
            <Route path="invite" element={<InvitePage lang={lang} />} />
          </Route>
        </Routes>
      </div>
    </>
  )
}

function App() {
  return (
    <>
      <div className="mobile-white-overlay" aria-hidden="true" />
      <Router>
        <AppRoutes />
      </Router>
    </>
  )
}

export default App
