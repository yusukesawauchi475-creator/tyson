import { useState, useEffect, useRef } from 'react'
import { markSeen } from '../lib/pairDaily'
import { getIdTokenForApi } from '../lib/firebase'
import { getEffectiveRole, isCorrected } from '../lib/voiceRole'

export default function VoiceLibrary({ lang = 'ja', role = 'parent', pairId: pairIdProp, onDataLoaded, adminMode = false, onCorrect }) {
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
      // Mark as seen when playing partner's recording（段階10-a: admin mode では markSeen 発火せず）
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
    const hh = parseInt(hhmm.slice(0, 2), 10)
    if (isNaN(hh)) return ''
    const mm = hhmm.slice(2, 4)
    const period = hh < 12 ? 'am' : 'pm'
    const displayHour = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
    return `${displayHour}:${mm}${period}`
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

  // 段階10-a: effectiveRole (correctedRole ?? roleAtUpload ?? fallback) で audioPath[] item を再分類。
  // 訂正された item は原始位置 (parent/child 配列) を離れて、訂正後の列に render される。
  const reclassifyDay = (day) => {
    const dayParentItems = []
    const dayChildItems = []
    const collectOrigin = (origin) => {
      const od = day[origin]
      const rawItems = od?.items ? od.items : (od?.url ? [{ url: od.url, hhmm: null }] : [])
      for (const item of rawItems) {
        const eff = getEffectiveRole(item, origin)
        // _originRole は訂正処理で「どの配列から来たか」を保持（correction API 呼び出し時 hhmm で特定するが debug 用）
        const tagged = { ...item, _originRole: origin }
        if (eff === 'parent') dayParentItems.push(tagged)
        else if (eff === 'child') dayChildItems.push(tagged)
      }
    }
    collectOrigin('parent')
    collectOrigin('child')
    return {
      parent: dayParentItems.length > 0 ? { ...day.parent, items: dayParentItems, isUnseen: day.parent?.isUnseen } : null,
      child: dayChildItems.length > 0 ? { ...day.child, items: dayChildItems, isUnseen: day.child?.isUnseen } : null,
    }
  }

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
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* 段階10-b: 緑ボックス tap で再生 + 右端に DL アイコンのみ + admin 訂正ボタン / 訂正済マーク */}
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => handlePlay(dateKey, r, item.url)}
                  style={{
                    flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 600,
                    color: '#555', background: isPlaying ? '#E8E0FF' : '#fff',
                    border: `2px solid ${borderColor}`,
                    borderRadius: 10, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                    whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0,
                  }}
                >
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{showUnseen ? '🔴' : '✅'}</span>
                  <span style={{ flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{r === 'parent' ? '👴🏻👵🏻' : '👦👧'}</span>
                  {item.hhmm && (
                    <span style={{ fontSize: 11, color: '#8070A0', marginLeft: 'auto', flexShrink: 0, fontFamily: 'Nunito, sans-serif', fontWeight: 500 }}>
                      {formatTime(item.hhmm)}
                    </span>
                  )}
                  {isPlaying && (
                    <span style={{ fontSize: 11, marginLeft: item.hhmm ? 4 : 'auto' }}>▶</span>
                  )}
                  {/* 段階10-b: 非 admin でも訂正済 item には ✏️ マーク（緑ボックス内右側に表示） */}
                  {!adminMode && isCorrected(item) && (
                    <span
                      title={lang === 'en' ? 'Corrected' : '訂正済'}
                      style={{ fontSize: 11, color: '#C08040', marginLeft: 4 }}
                    >✏️</span>
                  )}
                </button>
                <a
                  href={item.url}
                  download={filename}
                  onClick={(e) => e.stopPropagation()}
                  title={lang === 'en' ? 'Download' : 'ダウンロード'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 8px', fontSize: 16, color: '#8070A0',
                    textDecoration: 'none', flexShrink: 0, borderRadius: 8,
                  }}
                  aria-label={lang === 'en' ? 'Download voice' : '音声を保存'}
                >⬇</a>
                {/* 段階10-a: admin mode で反対 role への訂正ボタン（immutable 追記） */}
                {adminMode && onCorrect && (
                  <button
                    type="button"
                    onClick={() => onCorrect(dateKey, item.hhmm, r)}
                    style={{
                      padding: '0 10px', fontSize: 11, fontWeight: 600,
                      color: '#fff', background: '#C080FF', borderRadius: 8,
                      border: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                    }}
                  >
                    訂正
                  </button>
                )}
              </div>
              {/* 段階10-a: admin mode で item metadata 表示（uid / deviceHint / 訂正履歴） */}
              {adminMode && (item.uploadedBy || item.deviceHint || isCorrected(item)) && (
                <div style={{ fontSize: 10, color: '#999', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.uploadedBy && <span>uid ...{item.uploadedBy.slice(-6)}</span>}
                  {item.deviceHint && <span>[{item.deviceHint}]</span>}
                  {isCorrected(item) && (
                    <span style={{ color: '#C08040' }}>
                      ✏️ 訂正済 ({item.roleAtUpload || '?'}→{item.correctedRole}
                      {item.correctionReason ? `, ${item.correctionReason}` : ''}
                      {item.correctionReasonDetail ? `: ${item.correctionReasonDetail}` : ''})
                    </span>
                  )}
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
        {days.map((day) => {
          // 段階10-a: effectiveRole で再分類（訂正済 item は訂正後の列に移動して render）
          const { parent, child } = reclassifyDay(day)
          return (
            <div key={day.dateKey} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid #EEE8FF' }}>
              <span style={{ fontSize: 12, color: '#8070A0', fontWeight: 600, minWidth: 50, paddingTop: 8 }}>{formatDate(day.dateKey)}</span>
              {renderRoleColumn(day.dateKey, 'parent', parent, lang === 'en' ? 'Parent' : '親')}
              {renderRoleColumn(day.dateKey, 'child', child, lang === 'en' ? 'Child' : '子')}
            </div>
          )
        })}
      </div>

      <audio ref={audioRef} onEnded={handleEnded} onPause={() => setPlayingKey(null)} style={{ display: 'none' }} />
    </section>
  )
}
