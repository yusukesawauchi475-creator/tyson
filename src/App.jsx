import { HashRouter, Routes, Route } from 'react-router-dom'
import PairDailyPage from './pages/PairDailyPage'
import HomePage from './pages/HomePage'
import AdminPage from './pages/AdminPage'

function App() {
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
          </Routes>
        </HashRouter>
      </div>
    </>
  )
}

export default App
