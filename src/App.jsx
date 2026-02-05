import { HashRouter, Routes, Route } from 'react-router-dom'
import PairDailyPage from './pages/PairDailyPage'
import HistoryPage from './pages/HistoryPage'
import HomePage from './pages/HomePage'
import AdminPage from './pages/AdminPage'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<PairDailyPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/tyson" element={<HomePage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </HashRouter>
  )
}

export default App
