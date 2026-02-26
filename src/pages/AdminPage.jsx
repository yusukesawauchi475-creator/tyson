/**
 * Demo Reset / Restore admin page.
 * Only visible when ?admin=RESET_SECRET matches VITE_RESET_SECRET.
 */
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getIdTokenForApi } from '../lib/firebase.js'
import { getPairId, getDateKey, genRequestId } from '../lib/pairDaily.js'

function getAdminParam() {
  try {
    const hash = window.location.hash || ''
    const qIndex = hash.indexOf('?')
    const query = qIndex >= 0 ? hash.slice(qIndex + 1) : ''
    return new URLSearchParams(query).get('admin') || ''
  } catch (_) {
    return ''
  }
}

export default function AdminPage({ lang = 'ja' }) {
  const [resetResult, setResetResult] = useState(null)
  const [restoreResult, setRestoreResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const isAuthorized = useMemo(() => {
    const secret = import.meta.env.VITE_RESET_SECRET || ''
    const param = getAdminParam()
    return !!secret && secret === param
  }, [])

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

      {!isAuthorized ? (
        <p style={{ marginTop: 24, fontSize: 14, color: '#999' }}>
          Add ?admin=RESET_SECRET to the URL. (Secret must match VITE_RESET_SECRET)
        </p>
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
