import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import PairDailyPage from './pages/PairDailyPage'
import HomePage from './pages/HomePage'
import AdminPage from './pages/AdminPage'
import AlbumPage from './pages/AlbumPage'
import { initPairId } from './lib/pairDaily'

function App() {
  useEffect(() => {
    initPairId()
  }, [])

  return (
    <>
      <div className="mobile-white-overlay" aria-hidden="true" />
      <div className="app-foreground app-root">
        <HashRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/eng" element={<HomePage lang="en" />} />
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
