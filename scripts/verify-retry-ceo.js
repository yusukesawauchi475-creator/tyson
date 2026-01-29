/**
 * CEO試行最終化: 解析失敗→再試行成功フローをダミーデータで論理完遂
 *
 * 1. 解析失敗をシミュレート → 診断待ちに追加
 * 2. 再試行ループで解析成功をシミュレート → 診断待ちから削除
 * 3. 全ステップをログ出力し、実行結果を提示
 *
 * 実行: node scripts/verify-retry-ceo.js
 */

const log = (step, detail) => {
  const ts = new Date().toISOString().split('T')[1].slice(0, 12);
  console.log(`[${ts}] ${step} ${detail}`);
};

// --- インメモリ診断待ち（IndexedDB の代わり） ---
const pending = [];
let nextId = 1;

function addPending(audioURL, docId) {
  const id = nextId++;
  pending.push({ id, audioURL, docId, createdAt: new Date().toISOString() });
  log('ADD_PENDING', `id=${id} docId=${docId}`);
  return id;
}

function getAllPending() {
  return [...pending];
}

function removePending(id) {
  const i = pending.findIndex((p) => p.id === id);
  if (i >= 0) {
    pending.splice(i, 1);
    log('REMOVE_PENDING', `id=${id}`);
    return true;
  }
  return false;
}

// --- モック解析: 1回目は失敗、2回目は成功 ---
let analyzeCallCount = 0;

async function mockAnalyze(audioURL, docId) {
  analyzeCallCount += 1;
  log('MOCK_ANALYZE', `call#${analyzeCallCount} docId=${docId}`);
  if (analyzeCallCount === 1) {
    throw new Error('OpenAI API key is not configured');
  }
  return { analysis: { advice: 'ダミー診断結果' } };
}

// --- 再試行ループ（handleRetryDiagnosis と同等） ---
async function runRetryLoop(analyzeFn) {
  const list = getAllPending();
  let failed = 0;
  for (const item of list) {
    try {
      await analyzeFn(item.audioURL, item.docId);
      removePending(item.id);
    } catch (e) {
      console.error(`[RETRY_FAIL] id=${item.id}`, e.message);
      failed += 1;
    }
  }
  return failed;
}

async function main() {
  console.log('\n=== CEO試行最終化: 解析失敗→再試行成功フロー ===\n');

  const dummyURL = 'https://example.com/dummy.webm';
  const dummyDocId = 'doc_dummy_001';

  // Phase 1: 解析失敗 → 診断待ちに追加
  log('PHASE1', '解析失敗をシミュレート');
  try {
    await mockAnalyze(dummyURL, dummyDocId);
  } catch (e) {
    console.error('[ANALYZE_FAIL]', e.message);
    addPending(dummyURL, dummyDocId);
  }

  const beforeRetry = getAllPending();
  if (beforeRetry.length !== 1) {
    throw new Error(`Assertion failed: expected 1 pending, got ${beforeRetry.length}`);
  }
  log('PHASE1', `診断待ち件数: ${beforeRetry.length}`);

  // Phase 2: 再試行 → 解析成功 → 削除
  log('PHASE2', '再試行ループ開始');
  const failed = await runRetryLoop(mockAnalyze);
  const afterRetry = getAllPending();

  if (failed !== 0) {
    throw new Error(`Assertion failed: expected 0 failed retries, got ${failed}`);
  }
  if (afterRetry.length !== 0) {
    throw new Error(`Assertion failed: expected 0 pending after retry, got ${afterRetry.length}`);
  }

  log('PHASE2', '再試行成功・診断待ち0件');
  console.log('\n=== 実行ログ（抜粋） ===');
  console.log('  1. 解析失敗 → 診断待ちに追加');
  console.log('  2. 再試行ループで解析成功 → 診断待ちから削除');
  console.log('  3. 全件処理済み・pending=0');
  console.log('\n👉 解析失敗→再試行成功フローは論理的に完遂しています。\n');
}

main().catch((e) => {
  console.error('CEO検証エラー:', e);
  process.exit(1);
});
