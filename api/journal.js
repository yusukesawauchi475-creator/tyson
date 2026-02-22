import admin from 'firebase-admin';
import {
  parseFirebaseServiceAccount,
} from './lib/parseFirebaseServiceAccount.js';

let adminApp;
let firestore;
let storageBucket;
let adminInitError = null;

function initFirebaseAdmin() {
  if (adminInitError) throw adminInitError;
  if (adminApp) return;

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
      const err = new Error(e.message);
      err.code = e.code;
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
    storageBucket = admin.storage().bucket();
  } catch (e) {
    adminInitError = e;
    throw e;
  }
}

function genRequestId() {
  return 'REQ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getDateKeyNY() {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const get = (t) => parts.find((p) => p.type === t)?.value;
    const y = get('year'), m = get('month'), d = get('day');
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {}
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function logObserve(obj) {
  console.log('[OBSERVE]', JSON.stringify(obj));
}

async function verifyIdToken(idToken) {
  initFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(idToken);
  return { uid: decoded.uid };
}

function isPairAllowed(uid, pairId) {
  if (pairId === 'demo') return true;
  return true;
}

/** Vercel serverless 用: JSON body を読み取り */
async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/** dataURL (data:image/xxx;base64,...) から buffer と mime を取得 */
function parseDataUrl(imageDataUrl) {
  if (!imageDataUrl || typeof imageDataUrl !== 'string') return null;
  const m = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1].trim().toLowerCase();
  const base64 = m[2].replace(/\s/g, '');
  try {
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) return null;
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    return { buffer, mimeType: mime, ext };
  } catch (_) {
    return null;
  }
}

/** GET: 当日メタ（hasImage, requestId, dateKey=serverDateKey, storagePath, updatedAt） */
async function handleGet(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();
  const pairId = req.query?.pairId || req.query?.pair_id;
  const clientDateKey = req.query?.clientDateKey || req.query?.dateKey || null;
  const serverDateKey = getDateKeyNY();
  const dateKey = serverDateKey;
  const role = req.query?.role || 'parent';
  const monthKey = serverDateKey.slice(0, 7);
  const firestoreDocPath = pairId ? `journal/${pairId}/months/${monthKey}/days/${dateKey}` : null;

  if (!pairId) {
    logObserve({ requestId: reqId, stage: 'journal_get', status: 'error', pairId: null, role, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath: null, httpStatus: 400, errorCode: 'missing_params', errorMessage: 'pairId required' });
    return res.status(400).json({ success: false, error: 'pairId is required', requestId: reqId });
  }

  if (role !== 'parent' && role !== 'child') {
    logObserve({ requestId: reqId, stage: 'journal_get', status: 'error', pairId, role, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 400, errorCode: 'invalid_role', errorMessage: 'role must be parent or child' });
    return res.status(400).json({ success: false, error: 'role must be parent or child', requestId: reqId });
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    logObserve({ requestId: reqId, stage: 'journal_get', status: 'error', pairId, role, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 401, errorCode: 'unauthorized', errorMessage: 'idToken required' });
    return res.status(401).json({ success: false, error: 'Authorization: Bearer <idToken> required', requestId: reqId });
  }

  try {
    const { uid } = await verifyIdToken(idToken);
    if (!isPairAllowed(uid, pairId)) {
      return res.status(403).json({ success: false, error: 'Not a pair member', requestId: reqId });
    }

    initFirebaseAdmin();

    const docRef = firestore.collection('journal').doc(pairId).collection('months').doc(monthKey).collection('days').doc(dateKey);
    const snap = await docRef.get();

    if (!snap.exists) {
      logObserve({ requestId: reqId, stage: 'journal_get', status: 'ok', pairId, role, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
      return res.status(200).json({
        success: true,
        hasImage: false,
        requestId: null,
        dateKey,
        storagePath: null,
        updatedAt: null,
      });
    }

    const data = snap.data();
    const roleDataRaw = data?.roleData?.[role];
    const roleData = roleDataRaw && typeof roleDataRaw.storagePath === 'string'
      ? roleDataRaw
      : roleDataRaw?.journal_image ?? null;
    const hasImage = !!(roleData?.storagePath);
    const updatedAt = roleData?.updatedAt?.toMillis?.() ?? roleData?.updatedAt ?? null;

    let signedUrl = null;
    if (hasImage && roleData?.storagePath) {
      try {
        const fileRef = storageBucket.file(roleData.storagePath);
        const [url] = await fileRef.getSignedUrl({
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000,
        });
        signedUrl = url || null;
      } catch (urlErr) {
        // signed URL 失敗時は url なしで返す
      }
    }

    logObserve({ requestId: reqId, stage: 'journal_get', status: 'ok', pairId, role, clientDateKey, serverDateKey, storagePath: roleData?.storagePath ?? null, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
    return res.status(200).json({
      success: true,
      hasImage,
      requestId: data?.requestId ?? roleData?.uploadId ?? null,
      dateKey,
      storagePath: roleData?.storagePath ?? null,
      updatedAt,
      url: signedUrl,
      signedUrl: signedUrl,
    });
  } catch (e) {
    const code = e?.code || 'unknown';
    const msg = (e?.message || String(e)).substring(0, 100);
    logObserve({ requestId: reqId, stage: 'journal_get', status: 'error', pairId, role, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 500, errorCode: code, errorMessage: msg });
    return res.status(500).json({ success: false, error: 'Failed to fetch journal meta', requestId: reqId, errorCode: code });
  }
}

/** POST: JSON body { pairId, role, requestId, imageDataUrl } → Storage + Firestore。Vercel Function 用。 */
async function handlePost(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();
  const serverDateKey = getDateKeyNY();
  const dateKey = serverDateKey;
  const monthKey = serverDateKey.slice(0, 7);

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    logObserve({ requestId: reqId, stage: 'journal_post_validate', status: 'error', pairId: null, role: null, clientDateKey: null, serverDateKey, storagePath: null, firestoreDocPath: null, httpStatus: 401, errorCode: 'unauthorized', errorMessage: 'idToken required' });
    return res.status(401).json({ success: false, error: 'Authorization: Bearer <idToken> required', requestId: reqId });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    logObserve({ requestId: reqId, stage: 'journal_post_validate', status: 'error', pairId: null, role: null, clientDateKey: null, serverDateKey, storagePath: null, firestoreDocPath: null, httpStatus: 400, errorCode: 'invalid_content_type', errorMessage: 'Content-Type must be application/json' });
    return res.status(400).json({ success: false, error: 'Content-Type must be application/json', requestId: reqId });
  }

  try {
    const { uid } = await verifyIdToken(idToken);
    let body;
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      body = req.body;
    } else {
      try {
        body = await readJsonBody(req);
      } catch (parseErr) {
        const msg = (parseErr?.message || String(parseErr)).substring(0, 100);
        logObserve({ requestId: reqId, stage: 'journal_post_validate', status: 'error', pairId: null, role: null, clientDateKey: null, serverDateKey, storagePath: null, firestoreDocPath: null, httpStatus: 400, errorCode: 'parse_failed', errorMessage: msg });
        return res.status(400).json({ success: false, error: 'Invalid JSON body', requestId: reqId });
      }
    }

    const pairId = body.pairId || body.pair_id || 'demo';
    const role = body.role || 'parent';
    const kind = (body.kind || 'journal_image') === 'generic_image' ? 'generic_image' : 'journal_image';
    const requestIdFromBody = (body.requestId || body.request_id || '').trim() || reqId;
    const clientDateKey = body.dateKey || body.clientDateKey || null;

    if (!pairId) {
      logObserve({ requestId: reqId, stage: 'journal_post_validate', status: 'error', pairId: null, role, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath: null, httpStatus: 400, errorCode: 'missing_params', errorMessage: 'pairId required' });
      return res.status(400).json({ success: false, error: 'pairId is required', requestId: reqId });
    }
    if (role !== 'parent' && role !== 'child') {
      logObserve({ requestId: reqId, stage: 'journal_post_validate', status: 'error', pairId, role, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath: null, httpStatus: 400, errorCode: 'invalid_role', errorMessage: 'role must be parent or child' });
      return res.status(400).json({ success: false, error: 'role must be parent or child', requestId: reqId });
    }
    if (!isPairAllowed(uid, pairId)) {
      return res.status(403).json({ success: false, error: 'Not a pair member', requestId: reqId });
    }

    const imageDataUrl = body.imageDataUrl || body.image;
    const parsed = parseDataUrl(imageDataUrl);
    if (!parsed || !parsed.buffer?.length) {
      logObserve({ requestId: reqId, stage: 'journal_post_validate', status: 'error', pairId, role, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath: null, httpStatus: 400, errorCode: 'missing_image', errorMessage: 'imageDataUrl (data URL) required' });
      return res.status(400).json({ success: false, error: 'imageDataUrl (data URL) is required', requestId: reqId });
    }

    const firestoreDocPath = `journal/${pairId}/months/${monthKey}/days/${dateKey}`;
    const storagePath = `journal/${pairId}/${monthKey}/${dateKey}/${role}/${kind}/page-01.${parsed.ext}`;

    initFirebaseAdmin();

    try {
      const fileRef = storageBucket.file(storagePath);
      await fileRef.save(parsed.buffer, {
        contentType: parsed.mimeType || 'image/jpeg',
        resumable: false,
      });
      logObserve({ requestId: requestIdFromBody, stage: 'journal_post_storage', status: 'ok', pairId, role, clientDateKey, serverDateKey, storagePath, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
    } catch (uploadErr) {
      const code = uploadErr?.code || 'unknown';
      const msg = (uploadErr?.message || String(uploadErr)).substring(0, 100);
      logObserve({ requestId: requestIdFromBody, stage: 'journal_post_storage', status: 'error', pairId, role, clientDateKey, serverDateKey, storagePath, firestoreDocPath, httpStatus: 500, errorCode: code, errorMessage: msg });
      throw uploadErr;
    }

    const bytes = parsed.buffer.length;
    const roleDataPayload = {
      storagePath,
      kind,
      uploadId: requestIdFromBody,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      bytes,
      contentType: parsed.mimeType || 'image/jpeg',
      width: 0,
      height: 0,
    };

    try {
      const docRef = firestore.collection('journal').doc(pairId).collection('months').doc(monthKey).collection('days').doc(dateKey);
      const snap = await docRef.get();
      const existingRole = (snap.exists && snap.data()?.roleData?.[role]) ? snap.data().roleData[role] : {};
      let updatedRole = {};
      if (existingRole && typeof existingRole === 'object' && existingRole !== null) {
        if (typeof existingRole.storagePath === 'string') {
          updatedRole = { journal_image: existingRole };
        } else {
          updatedRole = { ...existingRole };
        }
      }
      updatedRole[kind] = roleDataPayload;
      await docRef.set({
        requestId: requestIdFromBody,
        dateKey,
        monthKey,
        roleData: {
          [role]: updatedRole,
        },
      }, { merge: true });
      logObserve({ requestId: requestIdFromBody, stage: 'journal_post_firestore', status: 'ok', pairId, role, clientDateKey, serverDateKey, storagePath, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
    } catch (firestoreErr) {
      const code = firestoreErr?.code || 'unknown';
      const msg = (firestoreErr?.message || String(firestoreErr)).substring(0, 100);
      logObserve({ requestId: requestIdFromBody, stage: 'journal_post_firestore', status: 'error', pairId, role, clientDateKey, serverDateKey, storagePath, firestoreDocPath, httpStatus: 500, errorCode: code, errorMessage: msg });
      throw firestoreErr;
    }

    return res.status(200).json({
      success: true,
      requestId: requestIdFromBody,
      dateKey,
      storagePath,
    });
  } catch (e) {
    const code = e?.code || 'unknown';
    const msg = (e?.message || String(e)).substring(0, 100);
    logObserve({ requestId: reqId, stage: 'journal_post_firestore', status: 'error', pairId: null, role: null, clientDateKey: null, serverDateKey: getDateKeyNY(), storagePath: null, firestoreDocPath: null, httpStatus: 500, errorCode: code, errorMessage: msg });
    return res.status(500).json({ success: false, error: 'Upload failed', requestId: reqId, errorCode: code });
  }
}

export default async function handler(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
