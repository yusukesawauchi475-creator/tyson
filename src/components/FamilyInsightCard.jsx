import { useState, useEffect } from 'react'
import { getIdTokenForApi } from '../lib/firebase'
import { getPairId, getDateKeyNY } from '../lib/pairDaily'

const CACHE_KEY_PREFIX = 'hum_insight_'

export default function FamilyInsightCard({ lang = 'ja' }) {
  const [comment, setComment] = useState(null)

  useEffect(() => {
    ;(async () => {
      try {
        const dateKey = getDateKeyNY()
        const cacheKey = `${CACHE_KEY_PREFIX}${dateKey}`

        // Check cache first
        const cached = localStorage.getItem(cacheKey)
        if (cached) { setComment(cached); return }

        const idToken = await getIdTokenForApi()
        if (!idToken) return

        const pairId = getPairId()
        const res = await fetch(
          `/api/family-insight?pairId=${encodeURIComponent(pairId)}&lang=${lang}`,
          { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
        )
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        if (data.success && data.comment) {
          setComment(data.comment)
          try { localStorage.setItem(cacheKey, data.comment) } catch {}
        }
      } catch {}
    })()
  }, [lang])

  if (!comment) return null

  return (
    <p style={{
      margin: '0 0 4px',
      fontSize: 12,
      color: 'var(--color-text-sub)',
      lineHeight: 1.5,
      fontStyle: 'italic',
    }}>
      {comment}
    </p>
  )
}
