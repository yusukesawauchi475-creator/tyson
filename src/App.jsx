import { useState } from 'react'
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
import { getUserRole, setUserRole, clearUserRole } from './lib/pairDaily'
import PwaInstallBanner, { BANNER_HEIGHT } from './components/PwaInstallBanner'

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
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/landing" element={<LandingPage />} />
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
