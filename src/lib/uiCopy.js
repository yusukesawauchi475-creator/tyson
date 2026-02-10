/**
 * UI文言の共通化
 * 2秒以内に出る/短い/感謝ベース/決めつけない
 */

/**
 * 送信成功後のfinal一言（300ms後）
 * @param {string | null} topic - DailyPromptCardの話題
 * @param {string} role - 'parent' | 'child'
 * @returns {string}
 */
export function getFinalOneLiner(topic, role) {
  if (!topic) {
    return 'いいですね！今日のいちばんはどれでした？'
  }

  if (topic.includes('何食べた')) {
    return 'いいですね！いちばんおいしかったのはどれでした？'
  }
  if (topic.includes('天気')) {
    return 'いいね！今日の空で印象に残ったのはどんな感じ？'
  }
  if (topic.includes('一番楽しかった') || topic.includes('ハイライト')) {
    return '最高。いちばん嬉しかったのはどれ？'
  }
  if (topic.includes('誰に会った')) {
    return 'いいね！その人と何話した？'
  }
  if (topic.includes('気分') || topic.includes('色')) {
    return 'いいね。今の気分、もう少し言葉にすると？'
  }

  return 'いいですね！今日のいちばんはどれでした？'
}

/**
 * 解析コメントのプレースホルダー（1000ms後）
 * @param {string | null} topic - DailyPromptCardの話題
 * @param {string} role - 'parent' | 'child'
 * @returns {string}
 */
export function getAnalysisPlaceholder(topic, role) {
  if (!topic) {
    return '今日の記録、ありがとうございます'
  }

  if (topic.includes('何食べた')) {
    return '食事の記録、ありがとうございます'
  }
  if (topic.includes('天気')) {
    return '今日の空の様子、ありがとうございます'
  }
  if (topic.includes('一番楽しかった') || topic.includes('ハイライト')) {
    return '今日のハイライト、ありがとうございます'
  }
  if (topic.includes('誰に会った')) {
    return '今日の出会い、ありがとうございます'
  }
  if (topic.includes('気分') || topic.includes('色')) {
    return '今日の気持ち、ありがとうございます'
  }

  return '今日の記録、ありがとうございます'
}

/**
 * 解析コメントのtext（API保存用、最大2行・60文字程度）
 * 説教/一般論なし、断定なし、「感謝 + 残せました」の事実ベースのみ
 * @param {string | null} topic - DailyPromptCardの話題
 * @param {string} role - 'parent' | 'child'
 * @returns {string}
 */
export function getAnalysisComment(topic, role) {
  const thanks = role === 'parent' ? 'ありがとうございます' : 'ありがとう'
  
  // 汎用フォールバック（topicがnullの場合）
  const defaultText = `今日の記録、${thanks}。\n残せました。`

  if (!topic) {
    return defaultText
  }

  // topic別のコメント（事実ベースのみ、role差は語尾だけ）
  if (topic.includes('何食べた')) {
    return `食事の記録、${thanks}。\n残せました。`
  }
  if (topic.includes('天気')) {
    return `今日の空の様子、${thanks}。\n残せました。`
  }
  if (topic.includes('一番楽しかった') || topic.includes('ハイライト')) {
    return `今日のハイライト、${thanks}。\n残せました。`
  }
  if (topic.includes('誰に会った')) {
    return `今日の出会い、${thanks}。\n残せました。`
  }
  if (topic.includes('気分') || topic.includes('色')) {
    return `今日の気持ち、${thanks}。\n残せました。`
  }

  return defaultText
}
