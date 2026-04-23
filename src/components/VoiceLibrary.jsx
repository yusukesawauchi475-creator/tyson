import { useState, useEffect, useRef } from 'react'
import { markSeen } from '../lib/pairDaily'
import { getIdTokenForApi } from '../lib/firebase'

export default function VoiceLibrary({ lang = 'ja', role = 'parent', pairId: pairIdProp, onDataLoaded, adminMode = false, onMove }) {
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [playingKey, setPlayingKey] = useState(null) // url
  const audioRef = useRef(null)

  const effectivePairId = pairIdProp

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const idToken = await getIdTokenForApi()
      if (!idToken || cancelled) { setLoading(false); return }
      try {
        const res = await fetch(`/api/pair-media?action=voice-history&pairId=${encodeURIComponent(effectivePairId)}&limit=7&v=${Date.now()}`, {
          headers: { Authorization: `Bearer ${idToken}`, Pragma: 'no-cache' },
          cache: 'no-store',
        })
        if (!res.ok) { setLoading(false); return }
        const data = await res.json()
        if (!cancelled && data.days) {
          setDays(data.days)
          if (onDataLoaded) onDataLoaded(data.days.length > 0)
        }
      } catch (_) {}
      if (!cancelled) { setLoading(false); if (onDataLoaded) onDataLoaded(false) }
    })()
    return () => { cancelled = true }
  }, [effectivePairId])

  const handlePlay = (dateKey, r, url) => {
    const key = url
    const el = audioRef.current
    if (!el || !url) return

    if (playingKey === key) {
      el.pause()
      el.currentTime = 0
      setPlayingKey(null)
      return
    }

    el.pause()
    el.src = url
    el.currentTime = 0
    el.play().then(() => {
      setPlayingKey(key)
      // Mark as seen when playing partner's recording（段階10-a: admin mode では markSeen 発火させない）
      const partnerRole = role === 'parent' ? 'child' : 'parent'
      if (!adminMode && r === partnerRole) {
        markSeen(r, effectivePairId, dateKey)
        setDays(prev => prev.map(d => {
          if (d.dateKey !== dateKey) return d
          return { ...d, [r]: d[r] ? { ...d[r], isUnseen: false } : d[r] }
        }))
      }
    }).catch(() => setPlayingKey(null))
  }

  const handleEnded = () => setPlayingKey(null)

  const formatDate = (dateKey) => {
    if (!dateKey) return ''
    const [, m, d] = dateKey.split('-').map(Number)
    return lang === 'en' ? `${m}/${d}` : `${m}月${d}日`
  }

  const formatTime = (hhmm) => {
    if (!hhmm || hhmm.length !== 4) return ''
    return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`
  }

  // 配列 items から時刻昇順（古い→新しい）にソート。hhmm が null の場合は最後尾
  const sortItemsAsc = (items) => {
    if (!items || items.length === 0) return []
    return [...items].sort((a, b) => {
      const aT = a.hhmm || 'zzzz'
      const bT = b.hhmm || 'zzzz'
      return aT.localeCompare(bT)
    })
  }

  if (loading) return null
  if (days.length === 0) return (
    <section style={{ width: '100%', background: '#F8F6FF', borderRadius: 18, padding: 14, overflow: 'hidden' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {lang === 'en' ? '🎧 Voice History' : '🎧 過去の声'}
      </p>
      <p style={{ fontSize: 13, color: '#8070A0', textAlign: 'center', margin: 0 }}>
        {lang === 'en' ? 'No voice messages yet.' : 'まだ音声がありません'}
      </p>
    </section>
  )

  const renderRoleColumn = (dateKey, r, roleData, label) => {
    // items 配列を優先、なければ url から1件作成
    const rawItems = roleData?.items
      ? roleData.items
      : (roleData?.url ? [{ url: roleData.url, hhmm: null }] : [])
    const items = sortItemsAsc(rawItems)

    if (items.length === 0) {
      return (
        <div style={{ flex: 1 }}>
          <button type="button" disabled style={{
            width: '100%', padding: '8px 10px', fontSize: 12, fontWeight: 600,
            color: '#CCC', background: '#fff', border: '1px solid #E8E0FF',
            borderRadius: 10, cursor: 'default', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{ fontSize: 13 }}>—</span>
            <span>{label}</span>
          </button>
        </div>
      )
    }

    const isMyRole = role === r
    const dayUnseen = !!(roleData?.isUnseen && !isMyRole)
    const latestIdx = items.length - 1 // 昇順なので最新は末尾

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item, idx) => {
          const key = item.url
          const isPlaying = playingKey === key
          // 未再生マークは最新の1件にのみ表示
          const showUnseen = dayUnseen && idx === latestIdx
          const borderColor = showUnseen ? '#E04040' : '#30A870'
          // 段階9: 保存用ファイル名 hum_{pairId}_{dateKey}_{role}[_{hhmm}].mp3
          const filename = `hum_${effectivePairId || 'pair'}_${dateKey}_${r}${item.hhmm ? `_${item.hhmm}` : ''}.mp3`
          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button
                type="button"
                onClick={() => handlePlay(dateKey, r, item.url)}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 12, fontWeight: 600,
                  color: '#555', background: isPlaying ? '#E8E0FF' : '#fff',
                  border: `2px solid ${borderColor}`,
                  borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <span style={{ fontSize: 13 }}>{showUnseen ? '🔴' : '✅'}</span>
                <span>{label}</span>
                {item.hhmm && (
                  <span style={{ fontSize: 10, color: '#8070A0', marginLeft: 'auto' }}>
                    {formatTime(item.hhmm)}
                  </span>
                )}
                {isPlaying && (
                  <span style={{ fontSize: 11, marginLeft: item.hhmm ? 4 : 'auto' }}>▶</span>
                )}
              </button>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <audio controls preload="none" src={item.url} style={{ flex: 1, height: 28 }} />
                <a
                  href={item.url}
                  download={filename}
                  style={{
                    display: 'inline-block', padding: '4px 8px', fontSize: 11, fontWeight: 600,
                    color: '#8070A0', background: '#F5F0FF', borderRadius: 6,
                    textDecoration: 'none', flexShrink: 0,
                  }}
                  aria-label={lang === 'en' ? 'Download voice' : '音声を保存'}
                >⬇</a>
                {/* 段階10-a: admin mode で反対 role への移動ボタン */}
                {adminMode && onMove && (
                  <button
                    type="button"
                    onClick={() => onMove(dateKey, item.hhmm, r, r === 'parent' ? 'child' : 'parent')}
                    style={{
                      padding: '4px 8px', fontSize: 10, fontWeight: 600,
                      color: '#fff', background: '#C080FF', borderRadius: 6,
                      border: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                    }}
                  >
                    {r === 'parent' ? '→子' : '→親'}
                  </button>
                )}
              </div>
              {/* 段階10-a: admin mode で uploader UID / device hint / movedFrom 履歴を表示 */}
              {adminMode && (item.uploadedBy || item.deviceHint || item.movedFrom) && (
                <div style={{ fontSize: 10, color: '#999', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.uploadedBy && <span>uid ...{item.uploadedBy.slice(-6)}</span>}
                  {item.deviceHint && <span>[{item.deviceHint}]</span>}
                  {item.movedFrom && <span style={{ color: '#C08040' }}>(moved from {item.movedFrom})</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <section style={{ width: '100%', background: '#F8F6FF', borderRadius: 18, padding: 14, overflow: 'hidden' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#7050C0', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {lang === 'en' ? '🎧 Voice History' : '🎧 過去の声'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {days.map(({ dateKey, parent, child }) => (
          <div key={dateKey} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid #EEE8FF' }}>
            <span style={{ fontSize: 12, color: '#8070A0', fontWeight: 600, minWidth: 50, paddingTop: 8 }}>{formatDate(dateKey)}</span>
            {renderRoleColumn(dateKey, 'parent', parent, lang === 'en' ? 'Parent' : '親')}
            {renderRoleColumn(dateKey, 'child', child, lang === 'en' ? 'Child' : '子')}
          </div>
        ))}
      </div>

      <audio ref={audioRef} onEnded={handleEnded} onPause={() => setPlayingKey(null)} style={{ display: 'none' }} />
    </section>
  )
}
