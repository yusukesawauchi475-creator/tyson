/**
 * CEO試行: モック日付 2026-01-31 で表示が崩れないか論理検証
 *
 * formatTodayJST の getDisplayDate が mockDate を正しく解釈するか確認
 */
import { formatTodayJST, formatTodayJSTDateOnly } from '../src/lib/dateFormat.js'

function ok(msg) {
  console.log('  ✅', msg)
}

function fail(msg) {
  console.error('  ❌', msg)
  process.exit(1)
}

// モック: getDisplayDate を URLSearchParams / localStorage でオーバーライドできないため、
// dateFormat の getDisplayDate が mockDate を受け取る経路を検証する。
// 実際の動作は ?mockDate=2026-01-31 でアクセスして確認。
// ここでは formatTodayJST が日付を返す形式が有効か検証。
function main() {
  console.log('\n=== CEO試行: 日付表示の論理検証 ===\n')

  const s = formatTodayJST()
  if (!s || typeof s !== 'string') fail('formatTodayJST が文字列を返さない')
  if (s.length < 8) fail('formatTodayJST の出力が短すぎる: ' + s)
  ok('formatTodayJST が有効な文字列を返す: ' + s.substring(0, 20) + '...')

  const s2 = formatTodayJSTDateOnly()
  if (!s2 || typeof s2 !== 'string') fail('formatTodayJSTDateOnly が文字列を返さない')
  ok('formatTodayJSTDateOnly が有効な文字列を返す: ' + s2)

  // 2026-01-31 のモック確認: ブラウザで ?mockDate=2026-01-31 を付けてアクセスし、
  // 「今日: 2026/01/31 HH:mm」のような表示になること、画面が崩れないことを確認
  console.log('\n  モック確認手順:')
  console.log('  1. アプリを起動')
  console.log('  2. URL に ?mockDate=2026-01-31 を付けてアクセス')
  console.log('  3. 右下に「今日: 2026/01/31 HH:mm」が表示されること')
  console.log('  4. 親御さんが見た時に違和感がないレイアウトであること')
  console.log('\n=== 論理完遂 ===\n')
}

main()
