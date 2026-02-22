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
            {/* 親=/#/ (HomePage), 子=/#/tyson (PairDailyPage) */}
            <Route path="/" element={<HomePage />} />
            <Route path="/tyson" element={<PairDailyPage />} />
          </Routes>
        </HashRouter>
      </div>
    </>
  )
}

export default App
