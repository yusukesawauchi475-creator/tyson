import { useEffect, useState } from 'react'
import { useParams, Outlet, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db, getIdTokenForApi } from '../lib/firebase'

/**
 * PairWorld — /pair/:slug route のコンテキストプロバイダ。
 * slug を Firestore pair_numbers から pairId に解決し、子ルートへ Outlet context として渡す。
 * Phase 2: localStorage 書き込みを削除（公理1: URL = Source of Truth に準拠）。
 */
export default function PairWorld({ lang = 'ja' }) {
  const { slug } = useParams()
  const [pairId, setPairId] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setPairId(null)
    ;(async () => {
      try {
        await getIdTokenForApi()
        const snap = await getDoc(doc(db, 'pair_numbers', String(slug)))
        if (cancelled) return
        if (!snap.exists()) {
          setError('Pair not found')
          setLoading(false)
          return
        }
        const data = snap.data() || {}
        // 段階15: deactivated slug は 404 扱い（migratedTo は UI 漏洩禁止）
        if (data.deactivated === true) {
          try { localStorage.removeItem('hum_last_slug') } catch (_) {}
          setError('Pair not found')
          setLoading(false)
          return
        }
        const resolvedPairId = data.pairId
        if (!resolvedPairId) {
          setError('Pair not found')
          setLoading(false)
          return
        }
        setPairId(resolvedPairId)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(e?.message || String(e))
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [slug])

  // 段階7: pair 解決成功時のみ slug を localStorage に保存
  // PWA install 後の / アクセスで App.jsx RootOrLanding が読み取り、/pair/:slug に復元する
  // slug（URL 公開値）のみ保存、pairId は保存しない（公理1: URL = Source of Truth 維持）
  useEffect(() => {
    if (!slug || !pairId) return
    try {
      if (/^[A-Za-z0-9_-]{2,32}$/.test(slug)) {
        localStorage.setItem('hum_last_slug', slug)
      }
    } catch (_) {
      // localStorage 書き込み失敗は無視
    }
  }, [slug, pairId])

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8070A0', fontFamily: 'var(--font-sans)' }}>
        Loading...
      </div>
    )
  }
  if (error || !pairId) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#8070A0', fontFamily: 'var(--font-sans)', padding: 24 }}>
        <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Pair not found</p>
        <p style={{ fontSize: 12, margin: 0, color: '#B0A0C0' }}>{error || 'unknown error'}</p>
        <Link to="/" style={{ fontSize: 14, color: '#7050C0', textDecoration: 'none' }}>← Go to Home</Link>
      </div>
    )
  }
  return <Outlet context={{ pairId, slug, lang }} />
}
