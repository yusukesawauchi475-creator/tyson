import { useState, useEffect } from 'react'
import { getDateKey } from '../lib/pairDaily'
import { t } from '../lib/i18n'

const TOPICS = [
  '今日は何食べた？',
  '今日の天気はどうだった？',
  '今日一番楽しかったことは？',
  '今日の気分は？',
  '今日はどこに行った？',
  '今日の出来事で印象的だったことは？',
  '今日は誰に会った？',
  '今日は何をした？',
  '今日の気づきは？',
  '今日はどんな1日だった？',
  '今日のハイライトは？',
  '今日は何を学んだ？',
  '今日はどんな気持ちだった？',
  '今日の思い出は？',
  '今日は何を感じた？',
  '今日の小さな幸せは？',
  '今日はどんな時間を過ごした？',
  '今日の出来事で話したいことは？',
  '今日は何を考えていた？',
  '今日の1日を一言で表すと？',
  '今日はどんなことをした？',
  '今日の気分を色で表すと？',
  '今日は何が良かった？',
  '今日はどんなことを感じた？',
  '今日の1日を振り返ると？',
  '今日はどんな時間だった？',
  '今日の出来事で印象的だったことは？',
  '今日は何を楽しんだ？',
  '今日の気持ちを言葉にすると？',
  '今日はどんな1日だった？',
]

const TOPICS_EN = [
  "What did you eat today?",
  "How was the weather today?",
  "What was the most fun part of today?",
  "How do you feel today?",
  "Where did you go today?",
  "What left an impression on you today?",
  "Who did you meet today?",
  "What did you do today?",
  "What did you notice today?",
  "How was your day?",
  "What was today's highlight?",
  "What did you learn today?",
  "What did you feel today?",
  "What memory stands out from today?",
  "What did you feel today?",
  "What small happiness did you have today?",
  "What kind of time did you have today?",
  "What from today do you want to talk about?",
  "What were you thinking about today?",
  "If you put today in one word, what would it be?",
  "What did you do today?",
  "If your mood today was a color, what color would it be?",
  "What went well today?",
  "What did you feel today?",
  "Looking back on today, how was it?",
  "How was your day?",
  "What left an impression on you today?",
  "What did you enjoy today?",
  "If you put your feelings today into words, what would you say?",
  "How was your day?",
]

if (import.meta?.env?.DEV && TOPICS.length !== TOPICS_EN.length) {
  console.warn('[DailyPromptCard] TOPICS.length !== TOPICS_EN.length', TOPICS.length, TOPICS_EN.length)
}

const COUNTRY_KEY = 'hum_country'
const COUNTRIES = ['jp', 'us', 'other']

export function getCountry() {
  try { const v = localStorage.getItem(COUNTRY_KEY); return COUNTRIES.includes(v) ? v : 'jp' } catch { return 'jp' }
}
export function cycleCountry() {
  const cur = getCountry()
  const next = COUNTRIES[(COUNTRIES.indexOf(cur) + 1) % COUNTRIES.length]
  try { localStorage.setItem(COUNTRY_KEY, next) } catch {}
  return next
}

/** Collect recent AI topics from localStorage for personalization */
function getRecentAiTopics() {
  try {
    const topics = []
    for (let i = 1; i <= 14; i++) {
      const d = new Date(Date.now() - i * 86400000)
      const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      for (const lang of ['ja', 'en']) {
        const v = localStorage.getItem(`dailyPrompt_ai_${dk}_${lang}`)
        if (v && !topics.includes(v)) topics.push(v)
      }
    }
    return topics.slice(0, 10).join('、')
  } catch { return '' }
}

/** Get seasonal/event topic override for today */
function getEventTopic(dateKey, country, lang) {
  const [, m, d] = dateKey.split('-').map(Number)
  const date = new Date(dateKey + 'T12:00:00')
  const dow = date.getDay() // 0=Sun
  const isEn = lang === 'en'

  // Shared events
  if (m === 1 && d === 1) return isEn ? "What's your New Year's wish for our family?" : '家族への新年の願いは？'
  if (m === 12 && d === 25) return isEn ? 'Best Christmas memory with family?' : '家族との一番のクリスマスの思い出は？'

  // Mother's Day: 2nd Sunday of May
  if (m === 5 && dow === 0 && d >= 8 && d <= 14) return isEn ? 'What do you want to tell Mom today?' : 'お母さんに今日伝えたいことは？'
  // Father's Day: 3rd Sunday of June
  if (m === 6 && dow === 0 && d >= 15 && d <= 21) return isEn ? 'What do you want to tell Dad today?' : 'お父さんに今日伝えたいことは？'

  if (country === 'jp') {
    if (m === 8 && d === 15) return isEn ? 'Share a memory of Obon with family.' : 'お盆の家族の思い出を話そう'
    if (m === 12 && d === 31) return isEn ? 'Reflect on this year with family.' : '家族と今年を振り返ろう'
  }
  if (country === 'us') {
    // Thanksgiving: 4th Thursday of November
    if (m === 11 && dow === 4 && d >= 22 && d <= 28) return isEn ? "What are you thankful for about our family?" : '家族で感謝していることは？'
  }

  // Seasonal defaults for 'other'
  if (country === 'other' || !['jp', 'us'].includes(country)) {
    if (m >= 3 && m <= 5) return isEn ? 'What spring memory do you cherish?' : '春の思い出で大切なものは？'
    if (m >= 6 && m <= 8) return isEn ? 'What summer adventure do you remember?' : '夏の冒険で覚えていることは？'
    if (m >= 9 && m <= 11) return isEn ? 'What autumn tradition do you love?' : '秋の家族の習慣で好きなものは？'
    return isEn ? 'What winter memory warms your heart?' : '冬の思い出で心が温まるものは？'
  }

  return null // No event today
}

function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

function getStorageKey(pairId, role, dateKey) {
  return `dailyPrompt_${pairId}_${role}_${dateKey}`
}

function getSkipKey(pairId, role, dateKey) {
  return `dailyPrompt_skip_${pairId}_${role}_${dateKey}`
}

function getAiCacheKey(dateKey, lang) {
  return `dailyPrompt_ai_${dateKey}_${lang}`
}

/** Get fallback topic from hardcoded list */
function getFallbackTopic(pairId, role, dateKey, offset) {
  const seed = `${pairId}|${role}|${dateKey}`
  const baseIndex = simpleHash(seed) % TOPICS.length
  return (baseIndex + offset) % TOPICS.length
}

export default function DailyPromptCard({ pairId = null, role, onTopicChange, lang = 'ja' }) {
  const [topicIndex, setTopicIndex] = useState(0)
  const [aiTopic, setAiTopic] = useState(null)
  const [isSkipped, setIsSkipped] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    try {
      const dateKey = getDateKey()
      const skipKey = getSkipKey(pairId, role, dateKey)
      if (localStorage.getItem(skipKey) === 'true') {
        setIsSkipped(true)
        setIsVisible(false)
        return
      }

      const storageKey = getStorageKey(pairId, role, dateKey)
      const savedOffset = parseInt(localStorage.getItem(storageKey) || '0', 10)
      const offset = Math.min(savedOffset, 2)
      const finalIndex = getFallbackTopic(pairId, role, dateKey, offset)
      setTopicIndex(finalIndex)
      setIsVisible(true)

      // Check for event/seasonal topic first
      const country = getCountry()
      const eventTopic = getEventTopic(dateKey, country, lang)
      if (eventTopic) {
        setAiTopic(eventTopic)
        if (onTopicChange) try { onTopicChange(eventTopic) } catch {}
        return // Event topic takes priority, skip AI fetch
      }

      // Try AI topic (cached per day+lang)
      const aiCacheKey = getAiCacheKey(dateKey, lang)
      const cached = localStorage.getItem(aiCacheKey)
      if (cached) {
        setAiTopic(cached)
        if (onTopicChange) try { onTopicChange(cached) } catch {}
      } else {
        // Show fallback immediately, then try AI
        if (onTopicChange) try { onTopicChange(TOPICS[finalIndex] || null) } catch {}

        fetch(`/api/daily-theme?lang=${lang}&pairId=${encodeURIComponent(pairId ?? '')}&pastTopics=${encodeURIComponent(getRecentAiTopics())}`)
          .then(r => r.json())
          .then(data => {
            if (data.success && data.topic) {
              setAiTopic(data.topic)
              try { localStorage.setItem(aiCacheKey, data.topic) } catch {}
              if (onTopicChange) try { onTopicChange(data.topic) } catch {}
            }
          })
          .catch(() => {}) // Silent fallback to hardcoded
      }
    } catch {
      setIsVisible(false)
      if (onTopicChange) try { onTopicChange(null) } catch {}
    }
  }, [pairId, role, onTopicChange, lang])

  const handleNextTopic = () => {
    try {
      const dateKey = getDateKey()
      const storageKey = getStorageKey(pairId, role, dateKey)
      const currentOffset = parseInt(localStorage.getItem(storageKey) || '0', 10)
      const newOffset = (currentOffset + 1) % 3
      localStorage.setItem(storageKey, String(newOffset))

      // Clear AI topic, use fallback cycle
      setAiTopic(null)
      const finalIndex = getFallbackTopic(pairId, role, dateKey, newOffset)
      setTopicIndex(finalIndex)
      if (onTopicChange) try { onTopicChange(TOPICS[finalIndex] || null) } catch {}

      // Fetch new AI topic
      fetch(`/api/daily-theme?lang=${lang}&pairId=${encodeURIComponent(pairId ?? '')}&pastTopics=${encodeURIComponent(getRecentAiTopics())}`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.topic) {
            setAiTopic(data.topic)
            if (onTopicChange) try { onTopicChange(data.topic) } catch {}
          }
        })
        .catch(() => {})
    } catch {}
  }

  const handleSkip = () => {
    handleNextTopic()
  }

  if (!isVisible || isSkipped) return null

  const isEn = String(lang) === 'en'
  const topicDisplay = aiTopic || (isEn ? TOPICS_EN[topicIndex] : TOPICS[topicIndex]) || TOPICS[0]

  return (
    <div style={{
      width: '100%',
      marginTop: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}>
      <div style={{
        flex: 1,
        padding: '6px 12px',
        background: 'rgba(255,255,255,0.6)',
        borderRadius: 20,
        fontSize: 12,
        color: '#6b2a3a',
        lineHeight: 1.3,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontFamily: 'Nunito, sans-serif',
      }}>
        {topicDisplay}
      </div>
      <button
        type="button"
        onClick={handleNextTopic}
        style={{
          padding: '5px 10px',
          fontSize: 11,
          fontWeight: 700,
          color: '#6b2a3a',
          background: 'rgba(255,255,255,0.4)',
          border: 'none',
          borderRadius: 12,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          fontFamily: 'Nunito, sans-serif',
        }}
      >
        {t(lang, 'anotherTopic')}
      </button>
    </div>
  )
}
