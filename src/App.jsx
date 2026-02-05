import { HashRouter, Routes, Route } from 'react-router-dom'
import PairDailyPage from './pages/PairDailyPage'
import HomePage from './pages/HomePage'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<PairDailyPage />} />
        <Route path="/tyson" element={<HomePage />} />
      </Routes>
    </HashRouter>
  )
}

export default App
