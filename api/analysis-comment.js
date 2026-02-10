import admin from 'firebase-admin';
import {
  parseFirebaseServiceAccount,
  CODE_PARSE_ERROR,
  CODE_EMPTY,
} from './lib/parseFirebaseServiceAccount.js';
import { getAnalysisComment } from '../src/lib/uiCopy.js';

let adminApp;
let firestore;
let adminInitError = null;

function initFirebaseAdmin() {
  if (adminInitError) throw adminInitError;
  if (adminApp) return;

  if (admin.apps && admin.apps.length > 0) {
    adminApp = admin.app();
    firestore = admin.firestore();
    return;
  }

  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    const parsedResult = parseFirebaseServiceAccount(raw);

    if (!parsedResult.success) {
      const e = parsedResult.error;
      const broken = e.brokenFields ? ` [壊れている項目: ${e.brokenFields.join(', ')}]` : '';
      const err = new Error(e.message + broken);
      err.code = e.code;
      err.vercelHint = e.vercelHint;
      adminInitError = err;
      throw err;
    }

    const parsed = parsedResult.data;
    const projectId = parsed.project_id ?? process.env.VITE_FIREBASE_PROJECT_ID;
    const envBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '';
    const storageBucketName = envBucket || `${projectId}.firebasestorage.app`;

    adminApp = admin.initializeApp({
      credential: admin.credential.cert(parsed),
      storageBucket: storageBucketName,
    });

    firestore = admin.firestore();
  } catch (e) {
    adminInitError = e;
    throw e;
  }
}

/** @returns {string} */
function genRequestId() {
  return 'REQ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Verify idToken. Returns { uid } or throws. */
async function verifyIdToken(idToken) {
  try {
    initFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    return { uid: decoded.uid };
  } catch (e) {
    return null; // 認証失敗時はnullを返す（UIを止めない）
  }
}

/** MVP: pairId=demo は誰でもアクセス可。後でinvite token方式に戻す */
function isPairAllowed(uid, pairId) {
  if (pairId === 'demo') return true;
  return true; // 暫定: 全許可
}

/**
 * POST: 解析コメントを保存
 */
async function handlePost(req, res) {
  const reqId = genRequestId();
  
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const authResult = await verifyIdToken(idToken);
    
    if (!authResult) {
      // 認証失敗でも200で返す（UIを止めない）
      console.log('[OBSERVE] analysis-comment POST: auth failed, but returning 200');
      return res.status(200).json({ success: false, requestId: reqId, error: 'auth_failed' });
    }

    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e) {
      console.error('[OBSERVE] analysis-comment POST: body parse error:', e);
      return res.status(200).json({ success: false, requestId: reqId, error: 'invalid_body' });
    }

    const { pairId, dateKey, role, topic } = body;

    if (!pairId || !dateKey || !role) {
      return res.status(200).json({ success: false, requestId: reqId, error: 'missing_params' });
    }

    if (role !== 'parent' && role !== 'child') {
      return res.status(200).json({ success: false, requestId: reqId, error: 'invalid_role' });
    }

    if (!isPairAllowed(authResult.uid, pairId)) {
      return res.status(200).json({ success: false, requestId: reqId, error: 'pair_not_allowed' });
    }

    initFirebaseAdmin();
    const docPath = `pair_media/${pairId}/days/${dateKey}/analysis/${role}`;
    const docRef = firestore.doc(docPath);

    // ルールベースの解析コメント（最大2行・60文字程度、断定禁止、role別）
    const text = getAnalysisComment(topic || null, role);

    const version = Date.now();
    await docRef.set({
      text,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      topic: topic || null,
      version,
    }, { merge: true });

    console.log('[OBSERVE] analysis-comment POST success:', { reqId, pairId, dateKey, role, docPath, version });

    return res.status(200).json({ success: true, requestId: reqId, version });
  } catch (e) {
    console.error('[OBSERVE] analysis-comment POST error:', e);
    // エラーでも200で返す（UIを止めない）
    return res.status(200).json({ success: false, requestId: reqId, error: 'server_error' });
  }
}

/**
 * GET: 解析コメントを取得
 */
async function handleGet(req, res) {
  const reqId = genRequestId();
  const pairId = req.query?.pairId || req.query?.pair_id;
  const dateKey = req.query?.dateKey || req.query?.date_key;
  const role = req.query?.role;

  try {
    if (!pairId || !dateKey || !role) {
      return res.status(404).json({ success: false, requestId: reqId, error: 'missing_params' });
    }

    if (role !== 'parent' && role !== 'child') {
      return res.status(404).json({ success: false, requestId: reqId, error: 'invalid_role' });
    }

    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const authResult = await verifyIdToken(idToken);
    
    if (!authResult) {
      return res.status(404).json({ success: false, requestId: reqId, error: 'auth_failed' });
    }

    if (!isPairAllowed(authResult.uid, pairId)) {
      return res.status(404).json({ success: false, requestId: reqId, error: 'pair_not_allowed' });
    }

    initFirebaseAdmin();
    const docPath = `pair_media/${pairId}/days/${dateKey}/analysis/${role}`;
    const docRef = firestore.doc(docPath);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ success: false, requestId: reqId, error: 'not_found' });
    }

    const data = docSnap.data();
    console.log('[OBSERVE] analysis-comment GET success:', { reqId, pairId, dateKey, role, docPath, hasText: !!data?.text });

    return res.status(200).json({ success: true, requestId: reqId, text: data?.text || '' });
  } catch (e) {
    console.error('[OBSERVE] analysis-comment GET error:', e);
    return res.status(404).json({ success: false, requestId: reqId, error: 'server_error' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
