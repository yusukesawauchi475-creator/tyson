import { useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import PairDailyPage from './pages/PairDailyPage'
import HomePage from './pages/HomePage'
import AdminPage from './pages/AdminPage'
import AlbumPage from './pages/AlbumPage'
import RoleSelectPage from './pages/RoleSelectPage'
import { getUserRole, clearUserRole } from './lib/pairDaily'

function RootRoute({ lang = 'ja' }) {
  const [role, setRole] = useState(() => getUserRole())

  const handleSelect = (selectedRole) => setRole(selectedRole)
  const handleChangeRole = () => { clearUserRole(); setRole(null) }

  if (!role) return <RoleSelectPage onSelect={handleSelect} lang={lang} />
  if (role === 'parent') return <HomePage lang={lang} onChangeRole={handleChangeRole} />
  return <PairDailyPage lang={lang} onChangeRole={handleChangeRole} />
}

function App() {
  return (
    <>
      <div className="mobile-white-overlay" aria-hidden="true" />
      <div className="app-foreground app-root">
        <HashRouter>
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/eng" element={<RootRoute lang="en" />} />
            <Route path="/tyson/eng" element={<PairDailyPage lang="en" />} />
            <Route path="/tyson" element={<PairDailyPage />} />
            <Route path="/admin/eng" element={<AdminPage lang="en" />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/album/eng" element={<AlbumPage lang="en" />} />
            <Route path="/album" element={<AlbumPage />} />
          </Routes>
        </HashRouter>
      </div>
    </>
  )
}

export default App
