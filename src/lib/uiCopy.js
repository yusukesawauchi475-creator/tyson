/**
 * UI文言の共通化
 * 2秒以内に出る/短い/感謝ベース/決めつけない
 * i18n経由で lang に応じた文言を返す
 */

import { t } from './i18n.js'

/** topic から種別を判定（JA/ENどちらのtopicでもOK） */
function getTopicType(topic) {
  if (!topic || typeof topic !== 'string') return null
  const lower = topic.toLowerCase()
  if (topic.includes('何食べた') || lower.includes('eat') || lower.includes('ate')) return 'eat'
  if (topic.includes('天気') || lower.includes('weather')) return 'weather'
  if (topic.includes('一番楽しかった') || topic.includes('ハイライト') || lower.includes('fun') || lower.includes('highlight')) return 'fun'
  if (topic.includes('誰に会った') || lower.includes('meet') || lower.includes('met')) return 'meet'
  if (topic.includes('気分') || topic.includes('色') || lower.includes('mood') || lower.includes('color') || lower.includes('feel')) return 'mood'
  return null
}

/**
 * 送信成功後のfinal一言（300ms後）
 * @param {'ja'|'en'} lang
 * @param {string | null} topic - DailyPromptCardの話題
 * @param {string} role - 'parent' | 'child'
 * @returns {string}
 */
export function getFinalOneLiner(lang, topic, role) {
  const type = getTopicType(topic)
  if (type === 'eat') return t(lang, 'finalOneLiner_eat')
  if (type === 'weather') return t(lang, 'finalOneLiner_weather')
  if (type === 'fun') return t(lang, 'finalOneLiner_fun')
  if (type === 'meet') return t(lang, 'finalOneLiner_meet')
  if (type === 'mood') return t(lang, 'finalOneLiner_mood')
  if (topic && type === null) {
    const clean = String(topic).replace(/[？?]\s*$/, '').trim()
    return t(lang, 'finalOneLiner_topic', { topic: clean })
  }
  return t(lang, 'finalOneLiner_default')
}

/**
 * 解析コメントのプレースホルダー（1000ms後）
 * @param {'ja'|'en'} lang
 * @param {string | null} topic - DailyPromptCardの話題
 * @param {string} role - 'parent' | 'child'
 * @returns {string}
 */
export function getAnalysisPlaceholder(lang, topic, role) {
  const type = getTopicType(topic)
  if (type === 'eat') return t(lang, 'analysisPlaceholder_eat')
  if (type === 'weather') return t(lang, 'analysisPlaceholder_weather')
  if (type === 'fun') return t(lang, 'analysisPlaceholder_fun')
  if (type === 'meet') return t(lang, 'analysisPlaceholder_meet')
  if (type === 'mood') return t(lang, 'analysisPlaceholder_mood')
  return t(lang, 'analysisPlaceholder_default')
}

/**
 * 解析コメントのtext（API保存用、最大2行・60文字程度）
 * 説教/一般論なし、断定なし、「感謝 + XX秒、残せました」の事実ベースのみ
 * @param {string | null} topic - DailyPromptCardの話題
 * @param {string} role - 'parent' | 'child'
 * @param {number | null} durationSec - 録音秒数（1-6000の範囲、nullの場合は「残せました。」のみ）
 * @returns {string}
 */
export function getAnalysisComment(topic, role, durationSec = null) {
  const thanks = role === 'parent' ? 'ありがとうございます' : 'ありがとう'

  // 2行目：durationSecが有効なら「XX秒残せました。」、無効なら「残せました。」
  const secondLine = (typeof durationSec === 'number' && durationSec >= 5 && durationSec <= 6000)
    ? `${durationSec}秒残せました。`
    : '残せました。'

  // 汎用フォールバック（topicがnullの場合）
  const defaultText = `今日の記録、${thanks}。\n${secondLine}`

  if (!topic) {
    return defaultText
  }

  // topic別のコメント（事実ベースのみ、role差は語尾だけ）
  if (topic.includes('何食べた')) {
    return `食事の記録、${thanks}。\n${secondLine}`
  }
  if (topic.includes('天気')) {
    return `今日の空の様子、${thanks}。\n${secondLine}`
  }
  if (topic.includes('一番楽しかった') || topic.includes('ハイライト')) {
    return `今日のハイライト、${thanks}。\n${secondLine}`
  }
  if (topic.includes('誰に会った')) {
    return `今日の出会い、${thanks}。\n${secondLine}`
  }
  if (topic.includes('気分') || topic.includes('色')) {
    return `今日の気持ち、${thanks}。\n${secondLine}`
  }

  return defaultText
}
