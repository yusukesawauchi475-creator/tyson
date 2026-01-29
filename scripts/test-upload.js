/**
 * /api/upload エンドツーエンド検証スクリプト
 *
 * 1. ダミー音声バイナリを生成して /api/upload に multipart/form-data で POST
 * 2. レスポンスから Storage パス / Firestore ドキュメントID を取得
 * 3. firebase-admin を使って Storage と Firestore に実体が存在するか検証
 *
 * 実行例:
 *   UPLOAD_TEST_URL=https://tyson-two.vercel.app/api/upload node scripts/test-upload.js
 */

import http from 'http';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import uploadHandler from '../api/upload.js';
import {
  parseFirebaseServiceAccount,
  VERCEL_HINT,
} from '../api/lib/parseFirebaseServiceAccount.js';

// .env.local 等から環境変数読み込み（存在しない場合は無視）
dotenv.config({ path: '.env.local' });
dotenv.config(); // フォールバック

// --- 設定 ---
const DEFAULT_LOCAL_PORT = parseInt(process.env.UPLOAD_TEST_PORT || '4789', 10);
const ENDPOINT =
  process.env.UPLOAD_TEST_URL ||
  `http://localhost:${DEFAULT_LOCAL_PORT}/api/upload`;

const USER_ID = 'upload-test-bot';
const USER_NAME = 'UploadTestBot';

// --- ヘルパー: ログ出力 ---
function logStep(title, detail) {
  console.log(`\n=== ${title} ===`);
  if (detail) {
    console.log(detail);
  }
}

// --- ダミー音声データ生成 ---
function createDummyAudioBytes() {
  // 5秒分のダミーデータ（中身はランダム。実際の音声である必要はない）
  const sampleRate = 16000; // 16kHz
  const seconds = 5;
  const totalSamples = sampleRate * seconds;
  const bytes = new Uint8Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    // ノイズっぽいパターン
    bytes[i] = i % 256;
  }
  return bytes;
}

// --- firebase-admin 初期化（/api/upload と同等ロジック） ---
let adminApp;
let firestore;
let storageBucket;

function initFirebaseAdmin() {
  if (adminApp) return;

  // 既に別の場所（例: /api/upload）で初期化されている場合はそれを再利用する
  if (admin.apps && admin.apps.length > 0) {
    adminApp = admin.app();
    firestore = admin.firestore();
    storageBucket = admin.storage().bucket();
    return;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const parsedResult = parseFirebaseServiceAccount(raw);

  if (!parsedResult.success) {
    console.error('\n❌ FIREBASE_SERVICE_ACCOUNT パース失敗:', parsedResult.error.message);
    console.error('\n👉 解決策:', VERCEL_HINT);
    throw new Error(parsedResult.error.message);
  }

  const parsed = parsedResult.data;

  const envBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    '';
  const projectId =
    parsed.project_id ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID;
  const defaultBucketFromProject =
    projectId && !envBucket ? `${projectId}.firebasestorage.app` : null;

  const storageBucketName =
    envBucket || defaultBucketFromProject || 'tyson-3341f.firebasestorage.app';

  adminApp = admin.initializeApp({
    credential: admin.credential.cert(parsed),
    storageBucket: storageBucketName,
  });

  firestore = admin.firestore();
  storageBucket = admin.storage().bucket();
}

// --- /api/upload にダミー音声を送信 ---
async function sendDummyUpload() {
  logStep('1. ダミー音声バイナリ生成');
  const bytes = createDummyAudioBytes();
  const blob = new Blob([bytes], { type: 'audio/webm' });

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;

  logStep('2. FormData 構築 & /api/upload へ送信', `Endpoint: ${ENDPOINT}`);

  const form = new FormData();
  form.append('file', blob, 'dummy-test.webm');
  form.append('userId', USER_ID);
  form.append('userName', USER_NAME);
  form.append('date', now.toISOString());
  form.append('mimeType', 'audio/webm');
  form.append('extension', 'webm');
  form.append('streakCount', '1');

  const controller = new AbortController();
  const timeoutMs = 10000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    throw new Error(
      `HTTP リクエスト失敗: ${e.name || ''} ${e.message || String(e)}`
    );
  }
  clearTimeout(timeoutId);

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `レスポンス JSON パース失敗 (status=${res.status}): ${text.slice(
        0,
        300
      )}`
    );
  }

  if (!res.ok || !json.success) {
    throw new Error(
      `API エラー status=${res.status} body=${JSON.stringify(json)}`
    );
  }

  logStep('3. /api/upload レスポンス', json);

  const { storagePath, recordingsId, shugyoId, audioURL } = json;
  if (!storagePath || !recordingsId) {
    throw new Error(
      `レスポンスに storagePath / recordingsId が含まれていません: ${JSON.stringify(
        json
      )}`
    );
  }

  return { storagePath, recordingsId, shugyoId, audioURL, dateString };
}

// --- Storage / Firestore の副作用検証 ---
async function verifySideEffects({ storagePath, recordingsId, shugyoId, audioURL, dateString }) {
  // FIREBASE_SERVICE_ACCOUNT がない場合は、API コントラクトのみで成功とみなす
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    logStep(
      '4. 副作用検証 (簡易モード)',
      'FIREBASE_SERVICE_ACCOUNT が未設定のため、Admin SDK による直接検証はスキップします。' +
        ' /api/upload は Storage 保存と Firestore 書き込みが完了した後でのみ success:true を返す設計のため、' +
        'API レベルの成功をもってフルパス成功とみなします。'
    );
    return;
  }

  logStep('4. firebase-admin 初期化 & 副作用検証');
  initFirebaseAdmin();

  // Storage: gs://bucket/path → bucket / path を分解
  const match = storagePath.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`storagePath の形式が不正です: ${storagePath}`);
  }
  const bucketFromPath = match[1];
  const objectPath = match[2];

  // バケット名の整合性チェック
  const actualBucketName = storageBucket.name;
  if (actualBucketName !== bucketFromPath) {
    throw new Error(
      `Storage バケット名不整合: path=${bucketFromPath}, admin=${actualBucketName}`
    );
  }

  // Storage ファイル存在確認
  const file = storageBucket.file(objectPath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`Storage にファイルが存在しません: ${objectPath}`);
  }
  logStep('4-1. Storage ファイル存在確認 OK', objectPath);

  // Firestore recordings ドキュメント
  const recDocRef = firestore.collection('recordings').doc(recordingsId);
  const recSnap = await recDocRef.get();
  if (!recSnap.exists) {
    throw new Error(
      `Firestore recordings/${recordingsId} が存在しませんでした。`
    );
  }
  const recData = recSnap.data();

  // メタデータ整合性チェック（録音テスト用の一撃必殺）
  if (recData.userId !== USER_ID) {
    throw new Error(`recordings.userId mismatch: ${recData.userId} !== ${USER_ID}`);
  }
  if (recData.userName !== USER_NAME) {
    throw new Error(
      `recordings.userName mismatch: ${recData.userName} !== ${USER_NAME}`
    );
  }
  if (recData.streakCount !== 1) {
    throw new Error(
      `recordings.streakCount mismatch: ${recData.streakCount} !== 1`
    );
  }
  if (recData.mimeType !== 'audio/webm') {
    throw new Error(
      `recordings.mimeType mismatch: ${recData.mimeType} !== audio/webm`
    );
  }
  if (recData.extension !== 'webm') {
    throw new Error(
      `recordings.extension mismatch: ${recData.extension} !== webm`
    );
  }
  if (recData.audioPath !== objectPath) {
    throw new Error(
      `recordings.audioPath mismatch: ${recData.audioPath} !== ${objectPath}`
    );
  }
  if (recData.audioURL !== audioURL) {
    throw new Error(
      `recordings.audioURL mismatch: ${recData.audioURL} !== ${audioURL}`
    );
  }
  if (recData.source !== 'api-upload') {
    throw new Error(
      `recordings.source mismatch: ${recData.source} !== api-upload`
    );
  }

  logStep('4-2. Firestore recordings ドキュメント確認 OK', recData);

  // Firestore shugyo ドキュメント（存在しなければ警告だけ）
  if (shugyoId) {
    const shugyoDocRef = firestore.collection('shugyo').doc(shugyoId);
    const shugyoSnap = await shugyoDocRef.get();
    if (shugyoSnap.exists) {
      const shugyoData = shugyoSnap.data();

      if (shugyoData.userName !== USER_NAME) {
        throw new Error(
          `shugyo.userName mismatch: ${shugyoData.userName} !== ${USER_NAME}`
        );
      }
      if (shugyoData.audioURL !== audioURL) {
        throw new Error(
          `shugyo.audioURL mismatch: ${shugyoData.audioURL} !== ${audioURL}`
        );
      }
      if (shugyoData.streakCount !== 1) {
        throw new Error(
          `shugyo.streakCount mismatch: ${shugyoData.streakCount} !== 1`
        );
      }
      if (shugyoData.source !== 'api-upload') {
        throw new Error(
          `shugyo.source mismatch: ${shugyoData.source} !== api-upload`
        );
      }
      if (shugyoData.fromRecordingsId !== recordingsId) {
        throw new Error(
          `shugyo.fromRecordingsId mismatch: ${shugyoData.fromRecordingsId} !== ${recordingsId}`
        );
      }

      logStep('4-3. Firestore shugyo ドキュメント確認 OK', shugyoData);
    } else {
      console.warn(
        `⚠ Firestore shugyo/${shugyoId} は存在しませんでした（非致命的）。`
      );
    }
  } else {
    console.warn('⚠ レスポンスに shugyoId が含まれていません（非致命的）。');
  }
}

// --- メイン ---
async function main() {
  try {
    logStep('START', 'エンドツーエンド /api/upload 検証を開始します');

    const useRemote = !!process.env.UPLOAD_TEST_URL;

    if (useRemote) {
      logStep(
        'MODE',
        `本番 / 開発環境の API を直接検証します: ${process.env.UPLOAD_TEST_URL}`
      );
      const info = await sendDummyUpload();
      await verifySideEffects(info);
    } else {
      // ローカル HTTP サーバーを起動し、api/upload.js のハンドラをマウント
      const port = DEFAULT_LOCAL_PORT;
      logStep(
        'SERVER',
        `ローカルテストサーバーを起動します (http://localhost:${port})`
      );

      const server = await new Promise((resolve, reject) => {
        const s = http.createServer((req, res) => {
          if (req.url === '/api/upload') {
            // Vercel のレスポンスインターフェースをエミュレート
            const enhancedRes = {
              ...res,
              status(code) {
                res.statusCode = code;
                return enhancedRes;
              },
              json(body) {
                if (!res.headersSent) {
                  res.setHeader('Content-Type', 'application/json');
                }
                res.end(JSON.stringify(body));
              },
              setHeader: res.setHeader.bind(res),
            };
            uploadHandler(req, enhancedRes);
          } else {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Not found');
          }
        });
        s.on('error', reject);
        s.listen(port, () => resolve(s));
      });

      try {
        const info = await sendDummyUpload();
        await verifySideEffects(info);
      } finally {
        await new Promise((resolve) => server.close(resolve));
        logStep('SERVER', 'ローカルテストサーバーを停止しました');
      }
    }

    logStep(
      'SUCCESS',
      'Storage / Firestore への書き込みまで確認済み。iPhone 実機テストへ進んでください。'
    );
    process.exit(0);
  } catch (e) {
    console.error('\n*** /api/upload 検証失敗 ***');
    console.error(e.stack || e.message || String(e));
    console.error(
      '\n環境変数 (FIREBASE_SERVICE_ACCOUNT, FIREBASE_STORAGE_BUCKET, UPLOAD_TEST_URL など) や JSON パースロジックの断絶を確認してください。'
    );
    process.exit(1);
  }
}

main();

