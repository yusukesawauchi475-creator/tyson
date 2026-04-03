import { useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import PairDailyPage from './pages/PairDailyPage'
import HomePage from './pages/HomePage'
import AdminPage from './pages/AdminPage'
import AlbumPage from './pages/AlbumPage'
import DemoPage from './pages/DemoPage'
import LandingPage from './pages/LandingPage'
import RoleSelectPage from './pages/RoleSelectPage'
import { getUserRole, clearUserRole, hasPairId } from './lib/pairDaily'

function RootOrLanding({ lang = 'ja' }) {
  // pairIdがURL or localStorageにある → 既存ユーザー → RootRoute
  // なければランディングページ
  if (hasPairId()) return <RootRoute lang={lang} />
  const stored = getUserRole()
  if (stored) return <RootRoute lang={lang} />
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
          </Routes>
        </HashRouter>
      </div>
    </>
  )
}

export default App
