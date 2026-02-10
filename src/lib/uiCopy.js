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
