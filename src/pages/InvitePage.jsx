import { useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

/**
 * InvitePage — /pair/:slug/invite route.
 * HomePage.handleShare ロジックをコピー、pairId を Outlet context から受け取る（Phase 1 最小調整）。
 * Phase 3 で URL 形式統一・lang 対応を行う予定。
 */
export default function InvitePage() {
  const { pairId, slug } = useOutletContext()
  const [message, setMessage] = useState(null)
  // TODO Phase 3: lang を context/URL 経由で受け取る。Phase 1 は ja 固定。
  const lang = 'ja'

  const handleShare = async () => {
    if (!pairId) {
      alert(lang === 'en' ? 'Pair ID not found. Please open from your invite link.' : 'ペアIDが見つかりません。招待リンクからアクセスしてください。')
      return
    }
    let url = `https://www.humfamily.com/#/?pairId=${encodeURIComponent(pairId)}&role=child&openExternalBrowser=1`
    try {
      const snap = await getDoc(doc(db, 'pairs', pairId))
      const num = snap.data()?.number
      if (num) url = `https://www.humfamily.com/pair/${num}?role=child&openExternalBrowser=1`
    } catch (_) {}
    const text = lang === 'en'
      ? 'Connect with your family every day with Hum. Open this link to get started.'
      : '毎日1分、声でつながるアプリHumです。このリンクを開いて始めてください。'
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Hum', text, url })
        setMessage(lang === 'en' ? 'Shared!' : '共有を開始しました')
      } catch (_) {}
    } else {
      try {
        await navigator.clipboard.writeText(url)
        setMessage(lang === 'en' ? 'Link copied!' : 'リンクをコピーしました')
      } catch (_) {
        setMessage(lang === 'en' ? 'Copy failed' : 'コピーに失敗しました')
      }
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20, fontFamily: 'var(--font-sans)', background: '#FFF8FF' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#333' }}>
        👋 {lang === 'en' ? 'Invite' : '招待'}
      </h1>
      <button
        type="button"
        onClick={handleShare}
        style={{ padding: '14px 28px', fontSize: 15, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #FF80C0, #A060FF)', border: 'none', borderRadius: 14, cursor: 'pointer', boxShadow: '0 4px 16px rgba(192,128,255,0.3)' }}
      >
        {lang === 'en' ? 'Start sharing' : '共有を開始'}
      </button>
      {message && (
        <p style={{ fontSize: 13, color: '#7050C0', margin: 0, fontWeight: 600 }}>{message}</p>
      )}
      <Link to={`/pair/${slug}`} style={{ fontSize: 14, color: '#7050C0', textDecoration: 'none' }}>
        ← {lang === 'en' ? 'Back to Home' : 'ホームへ戻る'}
      </Link>
    </div>
  )
}
