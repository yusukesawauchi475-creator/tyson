import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getIdTokenForApi } from '../lib/firebase.js'
import { getPairId, getDateKey, genRequestId } from '../lib/pairDaily.js'

const STORAGE_KEY = 'tyson_admin_secret'

function PairCard({ pair, secret }) {
  const [open, setOpen] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(null)
  const [ocrResult, setOcrResult] = useState(null)
  const today = pair.calendar[pair.calendar.length - 1]
  const todayParent = today?.parent
  const todayChild = today?.child
  const t = pair.totals || {}

  const handleOcr = async (dateKey) => {
    setOcrLoading(dateKey)
    setOcrResult(null)
    try {
      const res = await fetch('/api/journal-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': secret },
        body: JSON.stringify({ pairId: pair.pairId, dateKey }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.success) {
        const texts = (data.results || []).map(r => `[${r.role}] ${r.text?.slice(0, 100) || '-'}`).join('\n')
        setOcrResult({ ok: true, dateKey, msg: texts })
      } else {
        setOcrResult({ ok: false, dateKey, msg: data.error || 'Failed' })
      }
    } catch (e) {
      setOcrResult({ ok: false, dateKey, msg: e?.message || String(e) })
    } finally {
      setOcrLoading(null)
    }
  }

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      {/* Header: pairId + streak — tappable */}
      <div
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, cursor: 'pointer' }}
      >
        <div>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{pair.pairId}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 8 }}>
            {pair.lastActivity ? pair.lastActivity.slice(5, 10) : '-'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {pair.streak > 0 && (
            <span style={{ fontSize: 14, fontWeight: 600 }}>🔥 {pair.streak}</span>
          )}
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Today's status + totals */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 13 }}>
        <div>
          <span>👴 </span>
          <span style={{ color: todayParent?.voice ? 'var(--color-success)' : 'var(--color-text-muted)' }}>V{todayParent?.voice ? '○' : '×'}</span>
          <span style={{ color: todayParent?.photo ? 'var(--color-success)' : 'var(--color-text-muted)' }}> P{todayParent?.photo ? '○' : '×'}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>計V{t.parentVoice||0} 📷{t.parentGeneric||0} 📔{t.parentJournal||0}</span>
        </div>
        <div>
          <span>👶 </span>
          <span style={{ color: todayChild?.voice ? 'var(--color-success)' : 'var(--color-text-muted)' }}>V{todayChild?.voice ? '○' : '×'}</span>
          <span style={{ color: todayChild?.photo ? 'var(--color-success)' : 'var(--color-text-muted)' }}> P{todayChild?.photo ? '○' : '×'}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>計V{t.childVoice||0} 📷{t.childGeneric||0} 📔{t.childJournal||0}</span>
        </div>
      </div>

      {/* 14-day dots */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {pair.calendar.map(day => {
          const hasP = !!day.parent
          const hasC = !!day.child
          const color = (hasP && hasC)
            ? 'var(--color-success)'
            : (hasP || hasC)
              ? 'var(--color-primary)'
              : 'var(--color-border)'
          return (
            <span
              key={day.date}
              title={day.date}
              style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
            />
          )
        })}
      </div>

      {/* Expandable detail list */}
      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
          {[...pair.calendar].reverse().map(day => {
            if (!day.parent && !day.child) return null
            const p = day.parent
            const c = day.child
            return (
              <div key={day.date} style={{ display: 'flex', gap: 12, fontSize: 12, padding: '3px 0', color: 'var(--color-text-sub)' }}>
                <span style={{ fontWeight: 600, minWidth: 42 }}>{day.date.slice(5)}</span>
                <span>👴{p ? ` V${p.voice?'○':'×'} 📷${p.genericImage||0} 📔${p.journalImage||0}` : ' -'}</span>
                <span>👶{c ? ` V${c.voice?'○':'×'} 📷${c.genericImage||0} 📔${c.journalImage||0}` : ' -'}</span>
                {p?.voice && c?.voice && <span style={{ color: 'var(--color-success)' }}>✓</span>}
                {(p?.journalImage > 0 || c?.journalImage > 0) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleOcr(day.date) }}
                    disabled={ocrLoading === day.date}
                    style={{
                      padding: '1px 6px', fontSize: 10, marginLeft: 4,
                      background: ocrLoading === day.date ? 'var(--color-border)' : 'var(--color-primary)',
                      color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
                    }}
                  >{ocrLoading === day.date ? '...' : 'OCR'}</button>
                )}
              </div>
            )
          })}
          {ocrResult && (
            <div style={{ marginTop: 8, padding: '8px 10px', fontSize: 11, borderRadius: 6,
              background: ocrResult.ok ? 'var(--color-success-bg, #f0fff0)' : 'var(--color-danger-bg, #fff0f0)',
              color: ocrResult.ok ? 'var(--color-text)' : 'var(--color-danger)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              <strong>{ocrResult.dateKey}</strong>: {ocrResult.msg}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminPage({ lang = 'ja' }) {
  const [secret, setSecret] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [pairs, setPairs] = useState(null)
  const [dashError, setDashError] = useState(null)
  const [dashLoading, setDashLoading] = useState(false)
  const [actionResult, setActionResult] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setSecret(saved)
        fetch(`/api/admin-pairs?password=${encodeURIComponent(saved.trim())}`)
          .then(r => { if (r.ok) setUnlocked(true) })
          .catch(() => {})
      }
    } catch (_) {}
  }, [])

  const handleUnlock = async () => {
    try {
      const res = await fetch(`/api/admin-pairs?password=${encodeURIComponent(secret.trim())}`)
      if (res.ok) {
        setUnlocked(true)
        try { localStorage.setItem(STORAGE_KEY, secret.trim()) } catch (_) {}
      } else if (res.status === 401) {
        alert('パスワードが違います')
      } else {
        console.error('[AdminPage] unlock failed:', res.status)
        alert('エラー: HTTP ' + res.status)
      }
    } catch (e) {
      console.error('[AdminPage] unlock error:', e)
      alert('接続エラー')
    }
  }

  const fetchDashboard = useCallback(async () => {
    setDashLoading(true)
    setDashError(null)
    try {
      const res = await fetch(`/api/admin-pairs?password=${encodeURIComponent(secret.trim())}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) { setDashError(json.error || `HTTP ${res.status}`); return }

      const dates14 = json.dates.slice(-14)
      const transformed = json.pairs.map(pair => ({
        ...pair,
        calendar: pair.calendar.filter(d => dates14.includes(d.date)),
      }))
      setPairs(transformed)
    } catch (e) {
      setDashError(e?.message || String(e))
    } finally {
      setDashLoading(false)
    }
  }, [secret])

  useEffect(() => {
    if (unlocked) fetchDashboard()
  }, [unlocked, fetchDashboard])

  const handleAction = async (action) => {
    setActionLoading(true)
    setActionResult(null)
    const reqId = genRequestId()
    try {
      const idToken = await getIdTokenForApi()
      if (!idToken) { setActionResult({ ok: false, msg: '認証エラー' }); return }
      const res = await fetch(`/api/admin-${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'X-Request-Id': reqId },
        body: JSON.stringify({ pairId: getPairId(), dateKey: getDateKey() }),
      })
      const data = await res.json().catch(() => ({}))
      setActionResult({ ok: data.success, msg: data.message || data.error || (data.success ? 'OK' : 'Failed') })
    } catch (e) {
      setActionResult({ ok: false, msg: e?.message || String(e) })
    } finally {
      setActionLoading(false)
    }
  }

  if (!unlocked) {
    return (
      <div className="page" style={{ paddingTop: 60, alignItems: 'center' }}>
        <div className="card" style={{ width: '100%', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-sub)', margin: '0 0 12px' }}>管理画面</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              placeholder="パスワード"
              style={{
                flex: 1, padding: '10px 12px', fontSize: 14,
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                outline: 'none', fontFamily: 'var(--font-sans)',
              }}
            />
            <button type="button" onClick={handleUnlock} style={{
              padding: '10px 18px', fontSize: 14, fontWeight: 600,
              background: 'var(--color-primary)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)',
            }}>開く</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>管理画面</h1>
        <Link to="/" style={{ fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none' }}>← ホーム</Link>
      </div>

      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>{getPairId()} · {getDateKey()}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => handleAction('reset')} disabled={actionLoading} style={{
            flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600,
            background: actionLoading ? 'var(--color-border)' : 'var(--color-danger)',
            color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
          }}>リセット</button>
          <button type="button" onClick={() => handleAction('restore')} disabled={actionLoading} style={{
            flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600,
            background: actionLoading ? 'var(--color-border)' : 'var(--color-success)',
            color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
          }}>復元</button>
        </div>
        {actionResult && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: actionResult.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{actionResult.msg}</p>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>活動状況</h2>
        <button type="button" onClick={fetchDashboard} disabled={dashLoading} style={{
          padding: '4px 12px', fontSize: 12, color: 'var(--color-primary)',
          background: 'transparent', border: '1px solid var(--color-primary)',
          borderRadius: 'var(--radius-sm)', cursor: dashLoading ? 'wait' : 'pointer',
        }}>更新</button>
      </div>

      {dashLoading && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>読み込み中...</p>}
      {dashError && <p style={{ fontSize: 13, color: 'var(--color-danger)', textAlign: 'center' }}>{dashError}</p>}

      {pairs && pairs.map(pair => <PairCard key={pair.pairId} pair={pair} secret={secret} />)}
      {pairs && pairs.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>データなし</p>}
    </div>
  )
}
