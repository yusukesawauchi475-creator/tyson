/**
 * CEO試行最終化: analyze 論理疎通（ダミー env・Storage パスでシミュレーション）
 *
 * 1. FIREBASE_SERVICE_ACCOUNT ダミー JSON でパース成功
 * 2. ダミー fetch で Storage DL 403 / 404 / connection エラー → 構造化 JSON 検証
 * 3. ダミー fetch で 200 → ok: true, buffer 検証
 */

import { parseFirebaseServiceAccount } from '../api/lib/parseFirebaseServiceAccount.js';
import { downloadAudioFromStorage } from '../api/analyze.js';

const DUMMY_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\n-----END PRIVATE KEY-----\n';
const DUMMY_SA = {
  type: 'service_account',
  project_id: 'dummy',
  client_email: 'dummy@dummy.iam.gserviceaccount.com',
  private_key: DUMMY_KEY,
};

function ok(label, msg = '') {
  console.log('  ✅', label, msg);
}

function fail(label, msg) {
  console.error('  ❌', label, msg);
  process.exit(1);
}

async function main() {
  console.log('\n=== CEO試行最終化: analyze 論理疎通 ===\n');

  // 1. FIREBASE_SERVICE_ACCOUNT パース（ダミー）
  const raw = JSON.stringify(DUMMY_SA);
  const parseResult = parseFirebaseServiceAccount(raw);
  if (!parseResult.success) {
    fail('1. FIREBASE_SERVICE_ACCOUNT パース', parseResult.error?.message);
  }
  ok('1. FIREBASE_SERVICE_ACCOUNT パース', 'OK (private_key 含む)');

  // 2. Storage DL 403 → step/subStep/status/hint
  const fetch403 = () => Promise.resolve({ ok: false, status: 403, statusText: 'Forbidden' });
  const r403 = await downloadAudioFromStorage('https://example.com/audio', fetch403);
  if (r403.ok) fail('2a. Storage 403', 'expected ok: false');
  if (r403.step !== 'Storage download') fail('2a. step', r403.step);
  if (r403.subStep !== 'forbidden') fail('2a. subStep', r403.subStep);
  if (r403.status !== 403) fail('2a. status', String(r403.status));
  if (!(r403.hint && /403|Signed|CORS|Storage/i.test(r403.hint))) fail('2a. hint', r403.hint || 'missing');
  ok('2a. Storage 403', `step=${r403.step} subStep=${r403.subStep} status=${r403.status}`);

  // 2b. Storage 404 → existence
  const fetch404 = () => Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
  const r404 = await downloadAudioFromStorage('https://example.com/audio', fetch404);
  if (r404.ok) fail('2b. Storage 404', 'expected ok: false');
  if (r404.subStep !== 'existence') fail('2b. subStep', r404.subStep);
  ok('2b. Storage 404', `subStep=${r404.subStep}`);

  // 2c. connection エラー（fetch throw）
  const fetchThrow = () => Promise.reject(new Error('ECONNREFUSED'));
  const rConn = await downloadAudioFromStorage('https://example.com/audio', fetchThrow);
  if (rConn.ok) fail('2c. connection', 'expected ok: false');
  if (rConn.subStep !== 'connection') fail('2c. subStep', rConn.subStep);
  ok('2c. connection error', `subStep=${rConn.subStep}`);

  // 2d. 200 → ok: true, buffer
  const buf = new Uint8Array([1, 2, 3]);
  const fetch200 = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(buf.buffer),
    });
  const r200 = await downloadAudioFromStorage('https://example.com/audio', fetch200);
  if (!r200.ok) fail('2d. Storage 200', 'expected ok: true');
  if (!r200.buffer || !Buffer.isBuffer(r200.buffer)) fail('2d. buffer', 'missing or not Buffer');
  ok('2d. Storage 200', 'ok: true, buffer length=' + r200.buffer.length);

  console.log('\n=== 論理疎通完遂（CEO テスト前の AI 側確認済み） ===\n');
}

main().catch((e) => {
  console.error('verify-analyze-ceo:', e);
  process.exit(1);
});
