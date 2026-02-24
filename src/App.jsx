import { HashRouter, Routes, Route } from 'react-router-dom'
import PairDailyPage from './pages/PairDailyPage'
import HomePage from './pages/HomePage'

function App() {
  return (
    <>
      <div className="mobile-white-overlay" aria-hidden="true" />
      <div className="app-foreground app-root">
        <HashRouter>
          <Routes>
            {/* 固定パス先・可変パス後。v6 では /tyson が /tyson/eng にもマッチするため、/tyson/eng を /tyson より前に定義 */}
            <Route path="/" element={<HomePage />} />
            <Route path="/eng" element={<HomePage lang="en" />} />
            <Route path="/tyson/eng" element={<PairDailyPage lang="en" />} />
            <Route path="/tyson" element={<PairDailyPage />} />
          </Routes>
        </HashRouter>
      </div>
    </>
  )
}

export default App
