import { useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { resolveAndBuildInviteUrl, copyInviteLink } from '../lib/invite'

/**
 * InvitePage — /pair/:slug/invite route.
 * 段階5 で helper (src/lib/invite.js) に統一、navigator.share 撤去、clipboard + toast 一本化。
 * Phase 3 で URL 形式統一・lang 対応を行う予定。
 */
export default function InvitePage() {
  const { pairId, slug } = useOutletContext()
  const [toastMsg, setToastMsg] = useState(null)
  // TODO Phase 3: lang を context/URL 経由で受け取る。Phase 1 は ja 固定。
  const lang = 'ja'

  const handleShare = async () => {
    if (!pairId) {
      setToastMsg(lang === 'en' ? 'Pair ID not found' : 'ペアIDが見つかりません')
      setTimeout(() => setToastMsg(null), 2500)
      return
    }
    const url = await resolveAndBuildInviteUrl(pairId)
    const result = await copyInviteLink(url)
    setToastMsg(result.success
      ? (lang === 'en' ? 'Link copied' : 'リンクをコピーしました')
      : (lang === 'en' ? 'Failed to copy' : 'コピーに失敗しました'))
    setTimeout(() => setToastMsg(null), 2500)
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
      <Link to={`/pair/${slug}`} style={{ fontSize: 14, color: '#7050C0', textDecoration: 'none' }}>
        ← {lang === 'en' ? 'Back to Home' : 'ホームへ戻る'}
      </Link>

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 14, padding: '8px 20px', borderRadius: 20, zIndex: 20000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{toastMsg}</div>
      )}
    </div>
  )
}
