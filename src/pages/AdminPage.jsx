import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getIdTokenForApi, db } from '../lib/firebase.js'
import { getDateKey, genRequestId } from '../lib/pairDaily.js'
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import VoiceLibrary from '../components/VoiceLibrary'

const STORAGE_KEY = 'tyson_admin_secret'

/** pairIds hidden from admin dashboard (isolated to tyson-two.vercel.app) */
const HIDDEN_PAIR_IDS = []

function daysAgo(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr)
  if (isNaN(d.getTime())) return dateStr.slice(0, 10)
  const now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return '今日'
  if (diff === 1) return '昨日'
  if (diff < 0) return dateStr.slice(0, 10)
  return `${diff}日前`
}

function PairCard({ pair, secret, numberMap }) {
  const [open, setOpen] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(null)
  const [ocrResult, setOcrResult] = useState(null)
  // 段階10-a: 訂正後の VoiceLibrary 再マウント + 通知
  const [voiceRefreshKey, setVoiceRefreshKey] = useState(0)
  const [correctResult, setCorrectResult] = useState(null)
  const today = pair.calendar[pair.calendar.length - 1]
  const todayParent = today?.parent
  const todayChild = today?.child
  const t = pair.totals || {}
  const entry = numberMap[pair.pairId] || {}
  const num = entry.slug
  const memo = entry.memo

  // 段階10-a: admin による voice role 訂正（immutable 追記）
  const handleCorrect = async (dateKey, hhmm, currentEffectiveRole) => {
    const newRole = currentEffectiveRole === 'parent' ? 'child' : 'parent'
    const reasons = ['role誤タップ', '誤録音', 'その他']
    const reasonIdx = window.prompt(
      `訂正理由を選択してください (1-3):\n1. role 誤タップ\n2. 誤録音\n3. その他`,
      '1'
    )
    if (!reasonIdx || !['1','2','3'].includes(reasonIdx)) return
    const reason = reasons[parseInt(reasonIdx, 10) - 1]
    let detail = ''
    if (reason === 'その他') {
      detail = window.prompt('訂正理由の詳細 (100字以内):', '') || ''
      if (detail.length > 100) {
        alert('100字以内で入力してください')
        return
      }
    }
    const roleLabel = r => r === 'parent' ? '親' : '子'
    const confirmMsg = `${dateKey} ${hhmm} の音声を ${roleLabel(currentEffectiveRole)}側 → ${roleLabel(newRole)}側 に訂正します。\n理由: ${reason}${detail ? ` (${detail})` : ''}\n\n元 data は書き換えず、訂正履歴として追記されます。`
    if (!window.confirm(confirmMsg)) return
    setCorrectResult(null)
    try {
      const res = await fetch('/api/pair-media?action=correct', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': secret },
        body: JSON.stringify({
          pairId: pair.pairId,
          dateKey,
          hhmm,
          correctedRole: newRole,
          correctionReason: reason,
          correctionReasonDetail: detail || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setCorrectResult({ ok: true, msg: `${dateKey} ${hhmm}: ${roleLabel(currentEffectiveRole)}→${roleLabel(newRole)} 訂正追記完了` })
        setVoiceRefreshKey(k => k + 1)
      } else {
        setCorrectResult({ ok: false, msg: data.error || `訂正失敗 (status=${res.status})` })
      }
    } catch (e) {
      setCorrectResult({ ok: false, msg: e?.message || String(e) })
    }
  }

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
      <div
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, cursor: 'pointer', gap: 8 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          {/* Phase II-pre: slug / pairId tap で /pair/<slug> 新 tab、Admin 維持しつつ pair 確認 */}
          {num && (
            <a
              href={`/pair/${num}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', textDecoration: 'underline', cursor: 'pointer' }}
            >
              #{num}
            </a>
          )}
          {num ? (
            <a
              href={`/pair/${num}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', textDecoration: 'underline', cursor: 'pointer' }}
            >
              {pair.pairId}
            </a>
          ) : (
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{pair.pairId}</span>
          )}
          {memo && (
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{memo}</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {daysAgo(pair.lastActivity)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {pair.streak > 0 && (
            <span style={{ fontSize: 14, fontWeight: 600 }}>🔥 {pair.streak}</span>
          )}
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 4, fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>👴親</span>
          {t.parentVoice > 0 && <span>🎙️{t.parentVoice}</span>}
          {t.parentGeneric > 0 && <span>📷{t.parentGeneric}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🧑子</span>
          {t.childVoice > 0 && <span>🎙️{t.childVoice}</span>}
          {t.childGeneric > 0 && <span>📷{t.childGeneric}</span>}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
          {[...pair.calendar].reverse().map(day => {
            if (!day.parent && !day.child) return null
            const p = day.parent
            const c = day.child
            return (
              <div key={day.date} style={{ display: 'flex', gap: 12, fontSize: 12, padding: '3px 0', color: 'var(--color-text-sub)' }}>
                <span style={{ fontWeight: 600, minWidth: 42 }}>{day.date.slice(5)}</span>
                <span>👴{p ? ` 声${p.voice?'○':'×'} 📷${p.genericImage||0}` : ' -'}</span>
                <span>🧑{c ? ` 声${c.voice?'○':'×'} 📷${c.genericImage||0}` : ' -'}</span>
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

          {/* 段階10-a: admin voice 管理（訂正のみ、削除機能なし、immutable 追記モデル）
              段階10-b: 通常使わない section のため <details> で折り畳み化、デフォルト閉 */}
          <details style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--color-border)' }}>
            <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', margin: '0 0 6px', letterSpacing: '0.06em', userSelect: 'none' }}>
              🎧 VOICE ADMIN（タップで展開）
            </summary>
            {correctResult && (
              <div style={{ marginTop: 6, marginBottom: 8, padding: '6px 10px', fontSize: 11, borderRadius: 6,
                background: correctResult.ok ? 'var(--color-success-bg, #f0fff0)' : 'var(--color-danger-bg, #fff0f0)',
                color: correctResult.ok ? 'var(--color-text)' : 'var(--color-danger)',
              }}>
                {correctResult.msg}
              </div>
            )}
            <div style={{ marginTop: 6 }}>
              <VoiceLibrary
                key={voiceRefreshKey}
                lang="ja"
                role="admin"
                pairId={pair.pairId}
                adminMode={true}
                onCorrect={handleCorrect}
              />
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

export default function AdminPage({ lang = 'ja' }) {
  // Phase 2 final: pair context は URL クエリ ?pair=PAIR-X から取得（localStorage 廃止）
  const [searchParams] = useSearchParams()
  const targetPairId = searchParams.get('pair')?.trim() || null
  const [secret, setSecret] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [pairs, setPairs] = useState(null)
  const [dashError, setDashError] = useState(null)
  const [dashLoading, setDashLoading] = useState(false)
  const [actionResult, setActionResult] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [numberMap, setNumberMap] = useState({}) // pairId → number
  const [adminTab, setAdminTab] = useState('activity') // 'activity' | 'pairs' | 'stats'

  // Fetch pair_numbers mapping
  useEffect(() => {
    ;(async () => {
      try {
        const snap = await getDocs(collection(db, 'pair_numbers'))
        const map = {}
        snap.forEach(doc => {
          const data = doc.data() || {}
          const pid = data.pairId
          if (pid) map[pid] = { slug: doc.id, memo: data.memo || '' }
        })
        setNumberMap(map)
      } catch (_) {}
    })()
  }, [])

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
        body: JSON.stringify({ pairId: targetPairId, dateKey: getDateKey() }),
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
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>{targetPairId || '（?pair=PAIR-XXXXXX を指定）'} · {getDateKey()}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => handleAction('reset')} disabled={actionLoading || !targetPairId} style={{
            flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600,
            background: (actionLoading || !targetPairId) ? 'var(--color-border)' : 'var(--color-danger)',
            color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
          }}>リセット</button>
          <button type="button" onClick={() => handleAction('restore')} disabled={actionLoading || !targetPairId} style={{
            flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600,
            background: (actionLoading || !targetPairId) ? 'var(--color-border)' : 'var(--color-success)',
            color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
          }}>復元</button>
        </div>
        {actionResult && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: actionResult.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{actionResult.msg}</p>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
        {[['activity', '活動'], ['pairs', '発行'], ['stats', 'Stats']].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setAdminTab(key)} style={{ flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 700, color: adminTab === key ? '#fff' : '#999', background: adminTab === key ? 'linear-gradient(135deg, #FF80C0, #A060FF)' : 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 16, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab: 活動状況 */}
      {adminTab === 'activity' && (
        <>
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
          {pairs && pairs.filter(pair => !HIDDEN_PAIR_IDS.includes(pair.pairId)).map(pair => <PairCard key={pair.pairId} pair={pair} secret={secret} numberMap={numberMap} />)}
          {pairs && pairs.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>データなし</p>}
        </>
      )}

      {/* Tab: 発行済み */}
      {adminTab === 'pairs' && (
        <PairNumberManager secret={secret} numberMap={numberMap} />
      )}

      {/* Tab: Stats */}
      {adminTab === 'stats' && pairs && (
        <StatsPanel pairs={pairs} numberMap={numberMap} />
      )}
      {adminTab === 'stats' && !pairs && (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 20 }}>活動状況を先に読み込んでください</p>
      )}
    </div>
  )
}

function PairNumberManager({ secret, numberMap }) {
  const [memo, setMemo] = useState('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState(null)
  const [numbers, setNumbers] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [copied, setCopied] = useState(null)

  const fetchNumbers = useCallback(async () => {
    setListLoading(true)
    try {
      const q = query(collection(db, 'pair_numbers'), orderBy('createdAt', 'desc'), limit(20))
      const snap = await getDocs(q)
      const list = []
      snap.forEach(doc => {
        const d = doc.data()
        list.push({ number: doc.id, pairId: d.pairId, memo: d.memo || '', createdAt: d.createdAt?.toDate?.()?.toLocaleDateString('ja-JP') || '' })
      })
      // Sort by number ascending
      list.sort((a, b) => parseInt(a.number) - parseInt(b.number))
      setNumbers(list)
    } catch (e) {
      console.error('[PairNumberManager] fetch error:', e)
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => { fetchNumbers() }, [fetchNumbers])

  const handleCreate = async () => {
    setCreating(true)
    setCreated(null)
    try {
      const idToken = await getIdTokenForApi()
      if (!idToken) { setCreating(false); return }
      const res = await fetch('/api/invite?action=create-numbered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ memo: memo.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.success) {
        setCreated(data)
        setMemo('')
        fetchNumbers()
      } else {
        alert(data.error || 'Failed')
      }
    } catch (e) {
      alert(e?.message || String(e))
    } finally {
      setCreating(false)
    }
  }

  const copyUrl = (num) => {
    const url = `https://www.humfamily.com/pair/${num}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(num)
      setTimeout(() => setCopied(null), 1500)
    }).catch(() => {})
  }

  return (
    <>
      <h2 style={{ margin: '24px 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>ペア発行</h2>

      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="メモ（例: 田中家）"
            style={{ flex: 1, padding: '8px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', outline: 'none', fontFamily: 'var(--font-sans)' }}
          />
          <button type="button" onClick={handleCreate} disabled={creating} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: creating ? 'var(--color-border)' : 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: creating ? 'wait' : 'pointer' }}>
            {creating ? '...' : '発行'}
          </button>
        </div>
        {created && (
          <div style={{ padding: '8px 10px', background: 'var(--color-success-bg, #f0fff0)', borderRadius: 6, fontSize: 12 }}>
            <div><strong>#{created.number}</strong> {created.pairId}</div>
            <div style={{ marginTop: 4 }}>
              <button type="button" onClick={() => copyUrl(created.number)} style={{ padding: '2px 8px', fontSize: 11, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}>URLコピー</button>
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>{created.url}</span>
            </div>
          </div>
        )}
      </div>

      <h2 style={{ margin: '16px 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>発行済みペア</h2>

      {listLoading && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>読み込み中...</p>}

      {!listLoading && numbers.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>まだ発行されていません</p>}

      {!listLoading && numbers.filter(n => !HIDDEN_PAIR_IDS.includes(n.pairId)).map(n => (
        <div key={n.number} className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Phase II-pre: slug / pairId tap で /pair/<slug> 新 tab */}
          <a href={`/pair/${n.number}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)', minWidth: 30, textDecoration: 'underline', cursor: 'pointer' }}>#{n.number}</a>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>{n.memo || '-'}</span>
          <a href={`/pair/${n.number}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 70, textDecoration: 'underline', cursor: 'pointer' }}>{n.pairId}</a>
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', minWidth: 60 }}>{n.createdAt}</span>
          <button type="button" onClick={() => copyUrl(n.number)} style={{ padding: '3px 10px', fontSize: 11, background: copied === n.number ? 'var(--color-success)' : 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
            {copied === n.number ? '✓' : 'コピー'}
          </button>
        </div>
      ))}
    </>
  )
}

function StatsPanel({ pairs, numberMap }) {
  const totalPairs = pairs.length
  const today = new Date()
  const sevenDaysAgo = new Date(today - 7 * 86400000)
  const activePairs = pairs.filter(p => {
    if (!p.lastActivity) return false
    const d = new Date(p.lastActivity.length === 10 ? p.lastActivity + 'T00:00:00' : p.lastActivity)
    return !isNaN(d.getTime()) && d >= sevenDaysAgo
  }).length
  const totalVoice = pairs.reduce((s, p) => s + (p.totals?.parentVoice || 0) + (p.totals?.childVoice || 0), 0)
  const totalPhotos = pairs.reduce((s, p) => s + (p.totals?.parentGeneric || 0) + (p.totals?.childGeneric || 0) + (p.totals?.parentJournal || 0) + (p.totals?.childJournal || 0), 0)
  const avgStreak = pairs.length > 0 ? (pairs.reduce((s, p) => s + (p.streak || 0), 0) / pairs.length).toFixed(1) : '0'
  const numberedPairs = Object.keys(numberMap).length

  const stats = [
    { label: '総ペア数', value: totalPairs, icon: '👥' },
    { label: '番号発行済み', value: numberedPairs, icon: '#️⃣' },
    { label: 'アクティブ（7日以内）', value: activePairs, icon: '🟢' },
    { label: '総音声回数', value: totalVoice, icon: '🎙' },
    { label: '総写真枚数', value: totalPhotos, icon: '📷' },
    { label: '平均連続日数', value: avgStreak, icon: '🔥' },
  ]

  return (
    <>
      <h2 style={{ margin: '8px 0', fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Stats</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {stats.map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </>
  )
}
