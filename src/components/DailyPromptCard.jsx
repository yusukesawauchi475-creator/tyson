import { useState, useEffect } from 'react'
import { getDateKey, PAIR_ID_DEMO } from '../lib/pairDaily'
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

// 簡単なハッシュ関数（文字列→数値）
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

export default function DailyPromptCard({ pairId = PAIR_ID_DEMO, role, onTopicChange, lang = 'ja' }) {
  const [topicIndex, setTopicIndex] = useState(0)
  const [isSkipped, setIsSkipped] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    try {
      const dateKey = getDateKey()
      const skipKey = getSkipKey(pairId, role, dateKey)
      const skipped = localStorage.getItem(skipKey) === 'true'
      if (skipped) {
        setIsSkipped(true)
        setIsVisible(false)
        return
      }

      const seed = `${pairId}|${role}|${dateKey}`
      const baseIndex = simpleHash(seed) % TOPICS.length
      
      const storageKey = getStorageKey(pairId, role, dateKey)
      const savedOffset = parseInt(localStorage.getItem(storageKey) || '0', 10)
      const offset = Math.min(savedOffset, 2) // 最大3回（0,1,2）
      
      const finalIndex = (baseIndex + offset) % TOPICS.length
      setTopicIndex(finalIndex)
      setIsVisible(true)
      // 初期表示でtopic確定時にコールバック
      if (onTopicChange) {
        try {
          onTopicChange(TOPICS[finalIndex] || null)
        } catch (e) {
          // コールバックエラーは無視
        }
      }
    } catch (e) {
      // エラー時は非表示（赤画面にしない）
      setIsVisible(false)
      if (onTopicChange) {
        try {
          onTopicChange(null)
        } catch (e) {
          // コールバックエラーは無視
        }
      }
    }
  }, [pairId, role, onTopicChange])

  const handleNextTopic = () => {
    try {
      const dateKey = getDateKey()
      const storageKey = getStorageKey(pairId, role, dateKey)
      const currentOffset = parseInt(localStorage.getItem(storageKey) || '0', 10)
      const newOffset = (currentOffset + 1) % 3 // 0→1→2→0 でループ
      localStorage.setItem(storageKey, String(newOffset))
      
      const seed = `${pairId}|${role}|${dateKey}`
      const baseIndex = simpleHash(seed) % TOPICS.length
      const finalIndex = (baseIndex + newOffset) % TOPICS.length
      setTopicIndex(finalIndex)
      // 「別の話題」で変わった時にコールバック
      if (onTopicChange) {
        try {
          onTopicChange(TOPICS[finalIndex] || null)
        } catch (e) {
          // コールバックエラーは無視
        }
      }
    } catch (e) {
      // エラー時は何もしない
    }
  }

  const handleSkip = () => {
    try {
      const dateKey = getDateKey()
      const skipKey = getSkipKey(pairId, role, dateKey)
      localStorage.setItem(skipKey, 'true')
      setIsSkipped(true)
      setIsVisible(false)
      // スキップ時にnullをコールバック
      if (onTopicChange) {
        try {
          onTopicChange(null)
        } catch (e) {
          // コールバックエラーは無視
        }
      }
    } catch (e) {
      // エラー時は何もしない
    }
  }

  if (!isVisible || isSkipped) {
    return null
  }

  const topic = TOPICS[topicIndex] || TOPICS[0]

  return (
    <div style={{
      width: '100%',
      marginTop: 16,
      padding: '12px 16px',
      background: '#f8f9fa',
      border: '1px solid #e0e0e0',
      borderRadius: 8,
      fontSize: 14,
    }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#666', fontWeight: 500 }}>
        {t(lang, 'todayTopic')}
      </p>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: '#333', lineHeight: 1.5 }}>
        {topic}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={handleNextTopic}
          style={{
            flex: 1,
            padding: '6px 12px',
            fontSize: 12,
            color: '#4a90d9',
            background: 'transparent',
            border: '1px solid #4a90d9',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          {t(lang, 'anotherTopic')}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          style={{
            flex: 1,
            padding: '6px 12px',
            fontSize: 12,
            color: '#888',
            background: 'transparent',
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          {t(lang, 'skip')}
        </button>
      </div>
    </div>
  )
}
