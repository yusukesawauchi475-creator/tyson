/**
 * uiCopy.js のロジックチェック（smoke test）
 * DailyPromptCard の TOPICS 全件と、durationSec の分岐を検証
 */

// DailyPromptCard.jsx の TOPICS（30個）
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

const OLD_FALLBACK = 'いいですね！今日のいちばんはどれでした？'

async function main() {
  // uiCopy.js を dynamic import
  const uiCopy = await import('../src/lib/uiCopy.js')
  const { getFinalOneLiner, getAnalysisComment } = uiCopy

  let passCount = 0
  let failCount = 0
  const failures = []

  console.log('=== uiCopy.js Smoke Test ===\n')

  // 1) getFinalOneLiner の検証（全 topic）
  console.log('1) getFinalOneLiner(topic, "child") 検証:')
  for (const topic of TOPICS) {
    try {
      const result = getFinalOneLiner(topic, 'child')
      if (!result || result.trim() === '') {
        failures.push({ test: 'getFinalOneLiner', topic, error: '空文字' })
        failCount++
        console.log(`  FAIL: topic="${topic}" → 空文字`)
      } else if (result === OLD_FALLBACK) {
        failures.push({ test: 'getFinalOneLiner', topic, error: '旧汎用フォールバック', result })
        failCount++
        console.log(`  FAIL: topic="${topic}" → 旧汎用フォールバック: "${result}"`)
      } else {
        passCount++
      }
    } catch (e) {
      failures.push({ test: 'getFinalOneLiner', topic, error: e.message })
      failCount++
      console.log(`  FAIL: topic="${topic}" → エラー: ${e.message}`)
    }
  }

  // 2) getFinalOneLiner(topic=null) の検証
  console.log('\n2) getFinalOneLiner(null, "child") 検証:')
  try {
    const result = getFinalOneLiner(null, 'child')
    if (!result || result.trim() === '') {
      failures.push({ test: 'getFinalOneLiner(null)', error: '空文字' })
      failCount++
      console.log(`  FAIL: null → 空文字`)
    } else {
      passCount++
      console.log(`  PASS: null → "${result}"`)
    }
  } catch (e) {
    failures.push({ test: 'getFinalOneLiner(null)', error: e.message })
    failCount++
    console.log(`  FAIL: null → エラー: ${e.message}`)
  }

  // 3) getAnalysisComment の durationSec 分岐検証
  console.log('\n3) getAnalysisComment(topic, "child", durationSec) 検証:')
  const testCases = [
    { topic: '今日は何食べた？', durationSec: 3, expectedSecondLine: '残せました。' },
    { topic: '今日は何食べた？', durationSec: 5, expectedSecondLine: '5秒残せました。' },
    { topic: '今日は何食べた？', durationSec: 12, expectedSecondLine: '12秒残せました。' },
    { topic: null, durationSec: 3, expectedSecondLine: '残せました。' },
    { topic: null, durationSec: 5, expectedSecondLine: '5秒残せました。' },
    { topic: null, durationSec: 12, expectedSecondLine: '12秒残せました。' },
  ]

  for (const { topic, durationSec, expectedSecondLine } of testCases) {
    try {
      const result = getAnalysisComment(topic, 'child', durationSec)
      const lines = result.split('\n')
      const secondLine = lines[1] || ''
      if (secondLine !== expectedSecondLine) {
        failures.push({ test: 'getAnalysisComment', topic, durationSec, expectedSecondLine, actualSecondLine: secondLine })
        failCount++
        console.log(`  FAIL: topic=${topic}, durationSec=${durationSec} → 2行目="${secondLine}" (期待: "${expectedSecondLine}")`)
      } else {
        passCount++
        console.log(`  PASS: topic=${topic}, durationSec=${durationSec} → 2行目="${secondLine}"`)
      }
    } catch (e) {
      failures.push({ test: 'getAnalysisComment', topic, durationSec, error: e.message })
      failCount++
      console.log(`  FAIL: topic=${topic}, durationSec=${durationSec} → エラー: ${e.message}`)
    }
  }

  // 4) getAnalysisComment(topic=null) の検証
  console.log('\n4) getAnalysisComment(null, "child", null) 検証:')
  try {
    const result = getAnalysisComment(null, 'child', null)
    if (!result || result.trim() === '') {
      failures.push({ test: 'getAnalysisComment(null)', error: '空文字' })
      failCount++
      console.log(`  FAIL: null → 空文字`)
    } else {
      passCount++
      console.log(`  PASS: null → "${result}"`)
    }
  } catch (e) {
    failures.push({ test: 'getAnalysisComment(null)', error: e.message })
    failCount++
    console.log(`  FAIL: null → エラー: ${e.message}`)
  }

  // 結果サマリー
  console.log('\n=== 結果 ===')
  console.log(`PASS: ${passCount}`)
  console.log(`FAIL: ${failCount}`)

  if (failCount > 0) {
    console.log('\n失敗詳細:')
    for (const f of failures) {
      console.log(`  - ${JSON.stringify(f)}`)
    }
    process.exit(1)
  } else {
    console.log('\nすべてのテストが成功しました。')
    process.exit(0)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
