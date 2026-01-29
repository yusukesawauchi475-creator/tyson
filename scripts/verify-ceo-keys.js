/**
 * CEO試行最終化: 全鍵の物理的通信可能性を論理完遂・確認
 *
 * 1. parseFirebaseServiceAccount で FIREBASE_SERVICE_ACCOUNT の整合性を確認
 * 2. BASE_URL 指定時は /api/env-check, /api/health-check に GET して全鍵が通信可能であることを確認
 *
 * 実行例:
 *   node scripts/verify-ceo-keys.js
 *   BASE_URL=https://xxx.vercel.app node scripts/verify-ceo-keys.js
 */

import { parseFirebaseServiceAccount } from '../api/lib/parseFirebaseServiceAccount.js';

const BASE_URL = process.env.BASE_URL || '';

function log(step, detail) {
  const ts = new Date().toISOString().split('T')[1].slice(0, 12);
  console.log(`[${ts}] ${step} ${detail}`);
}

async function main() {
  console.log('\n=== CEO試行最終化: 全鍵の物理的通信可能性 ===\n');

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw != null && String(raw).trim()) {
    const parseResult = parseFirebaseServiceAccount(raw);
    if (!parseResult.success) {
      log('PARSE', `FAIL: ${parseResult.error.message}`);
      if (parseResult.error.brokenFields?.length) {
        log('BROKEN', `項目: ${parseResult.error.brokenFields.join(', ')}`);
      }
      throw new Error('FIREBASE_SERVICE_ACCOUNT パース失敗。全鍵の通信可能性を確認できません。');
    }
    log('PARSE', 'OK (project_id, client_email, private_key 検証済み)');
  } else {
    log('PARSE', 'SKIP (FIREBASE_SERVICE_ACCOUNT 未設定。BASE_URL 指定時は API 疎通のみ確認)');
  }

  if (!BASE_URL) {
    console.log('\nBASE_URL 未指定のため、/api/env-check ・ /api/health-check の疎通はスキップします。');
    console.log('  → 実機確認: BASE_URL=https://your-app.vercel.app node scripts/verify-ceo-keys.js\n');
    return;
  }

  let res;
  let data;

  res = await fetch(`${BASE_URL.replace(/\/$/, '')}/api/env-check`);
  data = await res.json().catch(() => ({}));
  if (!data || data.ok !== true) {
    log('ENV_CHECK', `FAIL: ok=${data?.ok} code=${data?.code ?? 'N/A'}`);
    throw new Error('環境変数チェック失敗。Vercel の FIREBASE_SERVICE_ACCOUNT を確認してください。');
  }
  log('ENV_CHECK', 'OK');

  res = await fetch(`${BASE_URL.replace(/\/$/, '')}/api/health-check`);
  data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.overall !== 'healthy') {
    log('HEALTH_CHECK', `FAIL: status=${res.status} overall=${data?.overall ?? 'N/A'}`);
    throw new Error('健全性チェック失敗。OpenAI / Firestore / Storage の設定を確認してください。');
  }
  log('HEALTH_CHECK', 'OK (overall=healthy)');

  console.log('\n=== 全ての鍵が物理的に通信可能であることを論理的に完遂・確認しました ===\n');
}

main().catch((e) => {
  console.error('CEO検証エラー:', e);
  process.exit(1);
});
