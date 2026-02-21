import admin from 'firebase-admin';
import {
  parseFirebaseServiceAccount,
  CODE_PARSE_ERROR,
  CODE_EMPTY,
} from './lib/parseFirebaseServiceAccount.js';

// --- Firebase Admin 初期化（サービスアカウント JSON / バケット名の防弾化） ---
let adminApp;
let firestore;
let storageBucket;
let adminInitError = null;

function initFirebaseAdmin() {
  if (adminInitError) throw adminInitError;
  if (adminApp) return;

  // 二重初期化防止: 他モジュールが既に初期化済みなら再利用
  if (admin.apps && admin.apps.length > 0) {
    adminApp = admin.app();
    firestore = admin.firestore();
    storageBucket = admin.storage().bucket();
    return;
  }

  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    const parsedResult = parseFirebaseServiceAccount(raw);

    if (!parsedResult.success) {
      const e = parsedResult.error;
      const broken = e.brokenFields ? ` [壊れている項目: ${e.brokenFields.join(', ')}]` : '';
      console.error(`FIREBASE_SERVICE_ACCOUNT パース失敗: ${e.message}${broken}`);
      const err = new Error(e.message + broken);
      err.code = e.code;
      err.vercelHint = e.vercelHint;
      err.brokenFields = e.brokenFields;
      throw err;
    }

    const parsed = parsedResult.data;

    // initializeApp 直前に全フィールド typeof string 検証（Metadata string value 排除）
    const projectId = parsed.project_id ?? process.env.FIREBASE_PROJECT_ID ?? process.env.VITE_FIREBASE_PROJECT_ID;
    const clientEmail = parsed.client_email;
    const privateKey = parsed.private_key;
    const invalid = [];
    if (typeof projectId !== 'string' || !projectId.trim()) invalid.push('project_id');
    if (typeof clientEmail !== 'string' || !clientEmail.trim()) invalid.push('client_email');
    if (typeof privateKey !== 'string' || !privateKey.trim()) invalid.push('private_key');
    if (invalid.length) {
      const msg = `FIREBASE_SERVICE_ACCOUNT 必須項目が不正です（typeof string で検証）。壊れている項目: ${invalid.join(', ')}`;
      console.error(msg);
      throw new Error(msg);
    }

    // バケット名の自動整合性チェック:
    // - 優先順位: 明示的な環境変数 > サービスアカウント由来の project_id からの既定値
    const envBucket =
      process.env.FIREBASE_STORAGE_BUCKET ||
      process.env.VITE_FIREBASE_STORAGE_BUCKET ||
      '';

    const defaultBucketFromProject =
      projectId && !envBucket ? `${projectId}.firebasestorage.app` : null;

    let storageBucketName =
      envBucket ||
      defaultBucketFromProject ||
      'tyson-3341f.firebasestorage.app';
    if (typeof storageBucketName !== 'string' || !storageBucketName.trim()) {
      storageBucketName = 'tyson-3341f.firebasestorage.app';
    }

    adminApp = admin.initializeApp({
      credential: admin.credential.cert(parsed),
      storageBucket: storageBucketName,
    });

    firestore = admin.firestore();
    storageBucket = admin.storage().bucket();

    // 実際に初期化された App のバケット名と環境変数の不整合を検出し、自律的に解消
    const appBucket = adminApp.options.storageBucket || storageBucket.name;
    if (envBucket && appBucket && envBucket !== appBucket) {
      console.warn(
        `⚠ FIREBASE_STORAGE_BUCKET mismatch. env=${envBucket}, app=${appBucket}. ` +
          'Using app bucket (admin.options.storageBucket) for all operations.'
      );
    }

    // storageBucket は常に App が保持している実バケットに揃える
    storageBucket = admin.storage().bucket(appBucket || storageBucketName);
  } catch (e) {
    // 初期化失敗もキャッシュしておき、各リクエストで無駄な再試行をしない
    adminInitError = e;
    throw e;
  }
}

// --- マルチパート(FormData)の簡易パーサー ---
async function parseMultipartFormData(req) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!boundaryMatch) {
    throw new Error('Invalid multipart/form-data: boundary not found');
  }

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const boundaryString = `--${boundary}`;
  const parts = buffer.toString('binary').split(boundaryString);

  const fields = {};
  let file = null;

  for (const part of parts) {
    if (!part || part === '--\r\n' || part === '--') continue;

    const [rawHeaders, rawBody] = part.split('\r\n\r\n');
    if (!rawBody) continue;

    const headerLines = rawHeaders.split('\r\n').filter(Boolean);
    const dispositionLine = headerLines.find((l) =>
      l.toLowerCase().startsWith('content-disposition')
    );
    if (!dispositionLine) continue;

    const nameMatch = dispositionLine.match(/name="([^"]+)"/i);
    const filenameMatch = dispositionLine.match(/filename="([^"]*)"/i);
    const name = nameMatch && nameMatch[1];

    // パート末尾のCRLFを除去
    const bodyContent = rawBody.slice(0, rawBody.lastIndexOf('\r\n'));

    if (filenameMatch && filenameMatch[1]) {
      const contentTypeLine = headerLines.find((l) =>
        l.toLowerCase().startsWith('content-type')
      );
      const contentType = contentTypeLine
        ? contentTypeLine.split(':')[1].trim()
        : 'application/octet-stream';

      const fileBuffer = Buffer.from(bodyContent, 'binary');
      file = {
        fieldName: name,
        filename: filenameMatch[1] || 'audio',
        mimeType: contentType,
        buffer: fileBuffer,
      };
    } else if (name) {
      fields[name] = bodyContent.trim();
    }
  }

  if (!file) {
    throw new Error('No file part found in multipart/form-data');
  }

  return { fields, file };
}

// --- メインロジック（Vercel 10秒制限へのヘッジ付き） ---
async function handleUploadWithTimeout(req, res) {
  const VEREL_TIMEOUT_SAFE_MS = 9000; // Vercelの10秒制限に対する安全マージン

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `Upload handler timeout (${VEREL_TIMEOUT_SAFE_MS}ms). ` +
            'Aborting before Vercel hard limit (10s) to avoid hanging requests.'
        )
      );
    }, VEREL_TIMEOUT_SAFE_MS);
  });

  const workPromise = (async () => {
    initFirebaseAdmin();

    const { fields, file } = await parseMultipartFormData(req);

    const userId = fields.userId || 'anonymous';
    const date = fields.date || new Date().toISOString();
    const mimeTypeFromClient = fields.mimeType || file.mimeType || 'audio/webm';
    const extensionFromClient = (fields.extension || '').toLowerCase();
    const streakCount = parseInt(fields.streakCount || '0', 10) || 0;
    const userName = fields.userName || '';

    // iOS Safari の MIME と拡張子の整合性チェック
    // - audio/mp4 -> .mp4 もしくは .m4a
    // - audio/m4a -> .m4a
    // - audio/webm -> .webm
    let resolvedExtension = extensionFromClient;
    if (!resolvedExtension) {
      if (mimeTypeFromClient === 'audio/mp4') {
        resolvedExtension = 'mp4';
      } else if (mimeTypeFromClient === 'audio/m4a') {
        resolvedExtension = 'm4a';
      } else if (mimeTypeFromClient === 'audio/webm') {
        resolvedExtension = 'webm';
      } else {
        resolvedExtension = 'webm';
      }
    }

    const safeDate = new Date(date);
    const isoDate = isNaN(safeDate.getTime())
      ? new Date().toISOString()
      : safeDate.toISOString();

    const fileNameDate = isoDate.split('T')[0];
    const objectPath = `recordings/${userId}/${fileNameDate}_${Date.now()}.${resolvedExtension}`;

    // Storage に保存
    const fileRef = storageBucket.file(objectPath);
    await fileRef.save(file.buffer, {
      contentType: mimeTypeFromClient,
      resumable: false,
    });

    const [signedUrl] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24時間
    });

    // Firestore の recordings コレクションにメタデータを保存
    const recordingsRef = firestore.collection('recordings');
    const now = new Date();
    const recordingsDoc = await recordingsRef.add({
      userId,
      userName,
      date: fileNameDate,
      timestamp: now,
      audioPath: objectPath,
      audioURL: signedUrl,
      mimeType: mimeTypeFromClient,
      extension: resolvedExtension,
      streakCount,
      createdAt: now,
      source: 'api-upload',
    });

    // 既存フロントエンド（/api/analyze 等）との互換のため、shugyo コレクションにも書き込む
    const shugyoRef = firestore.collection('shugyo');
    const shugyoDoc = await shugyoRef.add({
      date: fileNameDate,
      timestamp: now,
      userName,
      audioURL: signedUrl,
      streakCount,
      createdAt: now,
      fromRecordingsId: recordingsDoc.id,
      source: 'api-upload',
    });

    // 実際に使用しているバケット名を動的に取得
    const bucketName = storageBucket.name;

    return {
      status: 200,
      body: {
        success: true,
        audioURL: signedUrl,
        storagePath: `gs://${bucketName}/${objectPath}`,
        userId,
        streakCount,
        recordingsId: recordingsDoc.id,
        shugyoId: shugyoDoc.id,
      },
    };
  })();

  try {
    const result = await Promise.race([workPromise, timeoutPromise]);
    return res.status(result.status).json(result.body);
  } catch (error) {
    const isEnvParse =
      error.code === CODE_PARSE_ERROR || error.code === CODE_EMPTY;
    const status = error.message && error.message.includes('timeout')
      ? 504
      : isEnvParse
        ? 503
        : 500;
    const body = {
      success: false,
      error: error.message || 'Upload failed',
    };
    if (error.code) body.code = error.code;
    if (error.vercelHint) body.vercelHint = error.vercelHint;
    if (error.brokenFields && error.brokenFields.length) {
      body.detail = `壊れている項目: ${error.brokenFields.join(', ')}`;
    }
    return res.status(status).json(body);
  }
}

// --- Vercel Serverless Function エントリーポイント ---
export default async function handler(req, res) {
  // CORS（将来のモバイルクライアントからの直接アクセスも許容）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return res.status(400).json({
      success: false,
      error: 'Content-Type must be multipart/form-data',
    });
  }

  try {
    await handleUploadWithTimeout(req, res);
  } catch (error) {
    const message =
      error && error.message ? error.message : 'Unexpected error';
    return res.status(500).json({ success: false, error: message });
  }
}

