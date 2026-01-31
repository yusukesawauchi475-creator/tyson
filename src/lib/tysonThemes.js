/**
 * タイソン・アイデンティティ: APIが落ちていても必ず重厚なプロンプトを出すハードコード
 */
export const TYSON_FALLBACK_THEMES = [
  '今日の体調とメンタルの状態はどうだ？声のトーン、話すスピード、言葉選びから、俺がお前のリスクを見抜いてやる。',
  '昨日と比べて、今日のエネルギーレベルはどうだ？規律を守れているか？睡眠、食事、運動の3つを具体的に話せ。',
  '今日、何か困難に直面したか？それにどう立ち向かった？お前のメンタルの強さを俺に証明してみろ。',
  '今朝起きた瞬間の気分を思い出せ。ポジティブだったか？ネガティブだったか？その理由を掘り下げて話せ。',
  '今日の最大の勝利は何だ？小さなことでもいい。規律を守り続けることが、最強のリスク管理だ。'
]

export const TYSON_DEFAULT_THEME = TYSON_FALLBACK_THEMES[0]

/** 平凡なテーマ（短い・タイソンらしくない）を検出 */
export function isTysonTheme(theme) {
  if (!theme || typeof theme !== 'string') return false
  const t = theme.trim()
  if (t.length < 40) return false
  if (/今日の体調はどうですか\?/.test(t)) return false
  if (/今日の気分は/.test(t) && t.length < 60) return false
  return true
}
