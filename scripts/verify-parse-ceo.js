/* global Buffer */
/**
 * CEO試行最終化: ダミー FIREBASE_SERVICE_ACCOUNT JSON でパース検証
 *
 * 論理的なダミーJSONを生成し、parseFirebaseServiceAccount が正常完了することを
 * 仮想環境で確認する。実機テストはこの検証通過後に実施。
 *
 * 実行: node scripts/verify-parse-ceo.js
 */

import { parseFirebaseServiceAccount } from '../api/lib/parseFirebaseServiceAccount.js';

const DUMMY_KEY =
  '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\n-----END PRIVATE KEY-----\n';

const dummyServiceAccount = {
  type: 'service_account',
  project_id: 'dummy-project',
  private_key_id: 'dummy-key-id',
  private_key: DUMMY_KEY,
  client_email: 'dummy@dummy-project.iam.gserviceaccount.com',
  client_id: '123456789',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
};

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function runTestCase(name, raw, expectSuccess = true) {
  const result = parseFirebaseServiceAccount(raw);
  assert(
    result.success === expectSuccess,
    `${name}: expected success=${expectSuccess}, got success=${result.success}` + (result.error ? ` | ${result.error.message}` : '')
  );
  if (expectSuccess) {
    assert(result.data && result.data.project_id, `${name}: missing data.project_id`);
    assert(typeof result.data.private_key === 'string', `${name}: private_key must be string`);
  }
  console.log(`  ✅ ${name}`);
}

console.log('\n=== CEO試行最終化: FIREBASE_SERVICE_ACCOUNT パース検証 ===\n');

// 1) 直接JSON（private_key 内は \n エスケープ）
const directJson = JSON.stringify(dummyServiceAccount);
runTestCase('1. direct JSON (escaped \\n in private_key)', directJson);

// 2) 制御文字正規化対象: 生改行が private_key 内に混入した不正JSON → 正規化で救済
const keyValMatch = directJson.match(/"private_key"\s*:\s*"([^"]*)"/);
const keyValEscaped = keyValMatch ? keyValMatch[1] : '';
const keyValWithRealNewlines = keyValEscaped.replace(/\\n/g, '\n');
const brokenJson = keyValMatch
  ? directJson.replace(/"private_key"\s*:\s*"([^"]*)"/, `"private_key":"${keyValWithRealNewlines.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
  : directJson;
runTestCase('2. JSON with literal newlines in private_key (normalizeJsonControlChars)', brokenJson);

// 3) Base64
const base64 = Buffer.from(directJson, 'utf8').toString('base64');
runTestCase('3. base64-encoded JSON', base64);

// 4) 空文字 → 失敗
const emptyResult = parseFirebaseServiceAccount('');
assert(!emptyResult.success && emptyResult.error?.code === 'FIREBASE_SERVICE_ACCOUNT_EMPTY', '4. empty → must fail with EMPTY');
console.log('  ✅ 4. empty string → fail with EMPTY (expected)');

// 5) 不正JSON → 失敗
const invalidResult = parseFirebaseServiceAccount('{ invalid }');
assert(!invalidResult.success && invalidResult.error?.code === 'FIREBASE_SERVICE_ACCOUNT_PARSE_ERROR', '5. invalid JSON → must fail with PARSE_ERROR');
console.log('  ✅ 5. invalid JSON → fail with PARSE_ERROR (expected)');

console.log('\n=== 全ケース通過: パース処理は論理的に完遂しています ===\n');
console.log('👉 実機テスト（FIREBASE_SERVICE_ACCOUNT 実値での /api/upload, test-upload）はこの後に実施してください。\n');
