import { useState, useEffect } from 'react'
import { getIdTokenForApi } from '../lib/firebase'

/**
 * Weekly summary bar - shown only on Sundays.
 * Shows combined voice and photo counts for the week.
 */
export default function WeeklySummary({ lang = 'ja', pairId }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    const today = new Date()
    // Only show on Sundays (0 = Sunday)
    if (today.getDay() !== 0) return
    if (!pairId) return

    ;(async () => {
      try {
        const idToken = await getIdTokenForApi()
        if (!idToken) return

        // Get this week's dates (Mon-Sun)
        const dates = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today.getTime() - i * 86400000)
          const y = d.getFullYear()
          const m = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')
          dates.push(`${y}-${m}-${dd}`)
        }

        // Fetch voice data for each day
        let parentVoice = 0, childVoice = 0, parentPhoto = 0, childPhoto = 0
        const promises = dates.map(async (dateKey) => {
          try {
            const res = await fetch(
              `/api/pair-media?pairId=${encodeURIComponent(pairId)}&listenRole=parent&mode=signed&v=${Date.now()}`,
              { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
            )
            if (res.ok) {
              const d = await res.json().catch(() => ({}))
              if (d?.url) parentVoice++
            }
          } catch {}
          try {
            const res = await fetch(
              `/api/pair-media?pairId=${encodeURIComponent(pairId)}&listenRole=child&mode=signed&v=${Date.now()}`,
              { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
            )
            if (res.ok) {
              const d = await res.json().catch(() => ({}))
              if (d?.url) childVoice++
            }
          } catch {}
        })

        // Fetch photo count from journal meta
        try {
          const res = await fetch(
            `/api/journal?pairId=${encodeURIComponent(pairId)}&role=parent&v=${Date.now()}`,
            { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
          )
          if (res.ok) {
            const d = await res.json().catch(() => ({}))
            parentPhoto = (d?.photos || []).filter(p => p.role === 'parent').length
            childPhoto = (d?.photos || []).filter(p => p.role === 'child').length
          }
        } catch {}

        await Promise.all(promises)
        setData({ parentVoice, childVoice, parentPhoto, childPhoto })
      } catch {}
    })()
  }, [pairId])

  if (!data) return null

  const totalVoice = data.parentVoice + data.childVoice
  const totalPhoto = data.parentPhoto + data.childPhoto

  return (
    <div style={{ background: 'rgba(192,128,255,0.12)', borderRadius: 10, padding: '8px 14px', fontSize: 12, color: '#8060B0', fontWeight: 600 }}>
      {lang === 'en' ? 'This week' : '今週'} 🎙{totalVoice}{lang === 'en' ? '' : '回'} 📷{totalPhoto}{lang === 'en' ? '' : '枚'}
    </div>
  )
}
