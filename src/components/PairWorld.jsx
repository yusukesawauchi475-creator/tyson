import { useEffect, useState } from 'react'
import { useParams, Outlet, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db, getIdTokenForApi } from '../lib/firebase'
import { PAIR_ID_STORAGE_KEY } from '../lib/pairDaily'

/**
 * PairWorld — /pair/:slug route のコンテキストプロバイダ。
 * slug を Firestore pair_numbers から pairId に解決し、子ルートへ Outlet context として渡す。
 * Phase 1 では既存ページ互換のため localStorage にも書き込む（Phase 2 で削除予定）。
 */
export default function PairWorld() {
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
        const resolvedPairId = snap.data()?.pairId
        if (!resolvedPairId) {
          setError('Pair not found')
          setLoading(false)
          return
        }
        // TODO Phase 2 cleanup: remove this localStorage write (公理1一時妥協)
        localStorage.setItem(PAIR_ID_STORAGE_KEY, resolvedPairId)
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
  return <Outlet context={{ pairId, slug }} />
}
