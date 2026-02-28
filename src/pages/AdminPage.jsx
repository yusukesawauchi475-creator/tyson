/**
 * Demo Reset / Restore admin page.
 * Unlock via secret input (saved to localStorage).
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getIdTokenForApi } from '../lib/firebase.js'
import { getPairId, getDateKey, genRequestId } from '../lib/pairDaily.js'

const STORAGE_KEY = 'tyson_admin_secret'

export default function AdminPage({ lang = 'ja' }) {
  const [secretInput, setSecretInput] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [resetResult, setResetResult] = useState(null)
  const [restoreResult, setRestoreResult] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && typeof saved === 'string') {
        setSecretInput(saved)
        const secret = import.meta.env.VITE_RESET_SECRET || ''
        if (saved.trim() === secret) setIsUnlocked(true)
      }
    } catch (_) {}
  }, [])

  const handleUnlock = () => {
    const secret = import.meta.env.VITE_RESET_SECRET || ''
    if (secretInput.trim() === secret) {
      setIsUnlocked(true)
      try {
        localStorage.setItem(STORAGE_KEY, secretInput.trim())
      } catch (_) {}
    }
  }

  const pairId = getPairId()
  const dateKey = getDateKey()

  const handleReset = async () => {
    setLoading(true)
    setResetResult(null)
    setRestoreResult(null)
    const reqId = genRequestId()
    try {
      const idToken = await getIdTokenForApi()
      if (!idToken) {
        setResetResult({ success: false, error: 'Not authenticated', requestId: reqId })
        return
      }
      const res = await fetch('/api/admin-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'X-Request-Id': reqId,
        },
        body: JSON.stringify({ pairId, dateKey }),
      })
      const data = await res.json().catch(() => ({}))
      setResetResult({
        success: data.success === true,
        message: data.message || data.error || 'Unknown',
        requestId: data.requestId || reqId,
        snapshotId: data.snapshotId,
      })
    } catch (e) {
      setResetResult({
        success: false,
        error: e?.message || String(e),
        requestId: reqId,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async () => {
    setLoading(true)
    setResetResult(null)
    setRestoreResult(null)
    const reqId = genRequestId()
    try {
      const idToken = await getIdTokenForApi()
      if (!idToken) {
        setRestoreResult({ success: false, error: 'Not authenticated', requestId: reqId })
        return
      }
      const res = await fetch('/api/admin-restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'X-Request-Id': reqId,
        },
        body: JSON.stringify({ pairId, dateKey }),
      })
      const data = await res.json().catch(() => ({}))
      setRestoreResult({
        success: data.success === true,
        message: data.message || data.error || 'Unknown',
        requestId: data.requestId || reqId,
        snapshotId: data.snapshotId,
      })
    } catch (e) {
      setRestoreResult({
        success: false,
        error: e?.message || String(e),
        requestId: reqId,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      background: '#f5f5f5',
      color: '#333',
    }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Admin</h1>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: '#666' }}>
        pairId: {pairId} · dateKey: {dateKey}
      </p>
      <Link to="/" style={{ fontSize: 14, color: '#4a90d9', textDecoration: 'none' }}>← Home</Link>

      {!isUnlocked ? (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="password"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              placeholder="Secret"
              style={{
                padding: '8px 12px',
                fontSize: 14,
                border: '1px solid #ccc',
                borderRadius: 6,
                minWidth: 120,
              }}
            />
            <button
              type="button"
              onClick={handleUnlock}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                background: '#4a90d9',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Unlock
            </button>
          </div>
          <p style={{ marginTop: 12, fontSize: 14, color: '#999' }}>
            Enter secret to unlock
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              style={{
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 500,
                background: loading ? '#ccc' : '#e65100',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Reset (snapshot作成)
            </button>
            <button
              type="button"
              onClick={handleRestore}
              disabled={loading}
              style={{
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 500,
                background: loading ? '#ccc' : '#2e7d32',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Restore (最新snapshot)
            </button>
          </div>

          {resetResult && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: resetResult.success ? '#e8f5e9' : '#ffebee',
              borderRadius: 8,
              fontSize: 13,
            }}>
              <strong>{resetResult.success ? 'Reset OK' : 'Reset Failed'}:</strong>{' '}
              {resetResult.message || resetResult.error}
              {resetResult.snapshotId && ` · snapshot: ${resetResult.snapshotId}`}
              <br />
              <span style={{ color: '#666' }}>REQ: {resetResult.requestId}</span>
            </div>
          )}

          {restoreResult && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: restoreResult.success ? '#e8f5e9' : '#ffebee',
              borderRadius: 8,
              fontSize: 13,
            }}>
              <strong>{restoreResult.success ? 'Restore OK' : 'Restore Failed'}:</strong>{' '}
              {restoreResult.message || restoreResult.error}
              {restoreResult.snapshotId && ` · snapshot: ${restoreResult.snapshotId}`}
              <br />
              <span style={{ color: '#666' }}>REQ: {restoreResult.requestId}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
