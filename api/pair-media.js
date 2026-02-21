import admin from 'firebase-admin';
import {
  parseFirebaseServiceAccount,
  CODE_PARSE_ERROR,
  CODE_EMPTY,
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
      const broken = e.brokenFields ? ` [壊れている項目: ${e.brokenFields.join(', ')}]` : '';
      const err = new Error(e.message + broken);
      err.code = e.code;
      err.vercelHint = e.vercelHint;
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

/** @returns {string} */
function genRequestId() {
  return 'REQ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** NY時間（America/New_York）で YYYY-MM-DD。server側正規化用。 */
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

/** OBSERVEログ1行JSON（秘密情報は含めない） */
function logObserve(obj) {
  console.log('[OBSERVE]', JSON.stringify(obj));
}

/** Verify idToken. Returns { uid } or throws. */
async function verifyIdToken(idToken) {
  initFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(idToken);
  return { uid: decoded.uid };
}

/** MVP: pairId=demo は誰でもアクセス可。後でinvite token方式に戻す */
function isPairAllowed(uid, pairId) {
  if (pairId === 'demo') return true;
  return true; // 暫定: 全許可
}

/**
 * Parse multipart form-data (Vercel serverless compatible)
 */
async function parseMultipartFormData(req) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error('Invalid multipart/form-data: boundary not found');

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
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
    const name = nameMatch?.[1];
    const bodyContent = rawBody.slice(0, rawBody.lastIndexOf('\r\n'));

    if (filenameMatch && filenameMatch[1]) {
      const ctLine = headerLines.find((l) => l.toLowerCase().startsWith('content-type'));
      const mimeType = ctLine ? ctLine.split(':')[1].trim() : 'application/octet-stream';
      file = {
        fieldName: name,
        filename: filenameMatch[1] || 'audio',
        mimeType,
        buffer: Buffer.from(bodyContent, 'binary'),
      };
    } else if (name) {
      fields[name] = bodyContent.trim();
    }
  }
  return { fields, file };
}

/** 未再生ならPush送信。child送信→親へ、parent送信→子へ。ベストエフォート。 */
async function sendPushIfUnseen(reqId, pairId, role, dateKey) {
  const recipientRole = role === 'child' ? 'parent' : 'child';
  const devicesCollection = recipientRole === 'parent' ? 'parentDevices' : 'childDevices';

  try {
    initFirebaseAdmin();
    const devicesRef = firestore.collection('pair_users').doc(pairId).collection(devicesCollection);
    const devicesSnap = await devicesRef.get();
    const tokens = [];
    const docIds = [];
    devicesSnap.docs.forEach((d) => {
      const t = d.data()?.token;
      if (t && typeof t === 'string') {
        tokens.push(t);
        docIds.push(d.id);
      }
    });
    if (tokens.length === 0) {
      logObserve({ requestId: reqId, stage: 'push_send', status: 'ok', pairId, role, dateKey, tokenCount: 0 });
      return;
    }

    const metaRef = firestore.collection('pair_media').doc(pairId).collection('days').doc(dateKey);
    const metaSnap = await metaRef.get();
    if (!metaSnap.exists) return;
    const roleData = metaSnap.data()?.[role];
    if (!roleData?.audioPath) return;
    const updatedAt = roleData.updatedAt?.toMillis?.() ?? roleData.version ?? 0;
    const seenAt = roleData.seenAt?.toMillis?.() ?? null;
    const isUnseen = seenAt == null || updatedAt > seenAt;
    if (!isUnseen) {
      logObserve({ requestId: reqId, stage: 'push_send', status: 'ok', pairId, role, dateKey, tokenCount: 0, note: 'already_seen' });
      return;
    }

    const messaging = admin.messaging();
    const multicast = {
      tokens,
      notification: {
        title: 'Tyson',
        body: '新しい音声が届きました',
      },
      data: { pairId, dateKey, role },
    };
    const result = await messaging.sendEachForMulticast(multicast);

    let successCount = 0;
    let errorCode = null;
    for (let i = 0; i < result.responses.length; i++) {
      const r = result.responses[i];
      if (r.success) {
        successCount++;
      } else {
        const code = r.error?.errorInfo?.code || r.error?.code || 'unknown';
        errorCode = code;
        const invalidCodes = ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered', 'messaging/invalid-argument'];
        if (invalidCodes.some((c) => String(code).includes(c))) {
          try {
            await devicesRef.doc(docIds[i]).delete();
          } catch (_) {}
        }
      }
    }
    logObserve({
      requestId: reqId,
      stage: 'push_send',
      status: result.successCount > 0 ? 'ok' : 'error',
      pairId,
      role,
      dateKey,
      tokenCount: tokens.length,
      successCount,
      errorCode: errorCode || undefined,
    });
  } catch (e) {
    const code = e?.code || 'unknown';
    const msg = (e?.message || String(e)).substring(0, 80);
    logObserve({ requestId: reqId, stage: 'push_send', status: 'error', pairId, role, dateKey, tokenCount: 0, errorCode: code, errorMessage: msg });
  }
}

/** GET: blob または signed URL */
async function handleGet(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();
  const pairId = req.query?.pairId || req.query?.pair_id;
  const clientDateKey = req.query?.dateKey || req.query?.date_key;
  const serverDateKey = getDateKeyNY();
  const dateKey = serverDateKey;
  const listenRole = req.query?.listenRole || req.query?.listen_role; // 'parent' | 'child'
  const mode = req.query?.mode || 'blob'; // 'blob' | 'signed'

  const firestoreDocPath = pairId && dateKey ? `pair_media/${pairId}/days/${dateKey}` : null;
  const dateKeyNormalized = clientDateKey && clientDateKey !== serverDateKey;

  if (!pairId) {
    logObserve({ requestId: reqId, stage: 'get_validate', status: 'error', pairId: null, role: listenRole, clientDateKey: clientDateKey || null, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 400, errorCode: 'missing_params', errorMessage: 'pairId required' });
    return res.status(400).json({
      success: false,
      error: 'pairId is required',
      requestId: reqId,
    });
  }

  if (!listenRole || (listenRole !== 'parent' && listenRole !== 'child')) {
    logObserve({ requestId: reqId, stage: 'get_validate', status: 'error', pairId, role: listenRole || null, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 400, errorCode: 'invalid_role', errorMessage: 'listenRole must be parent or child' });
    return res.status(400).json({
      success: false,
      error: 'listenRole must be "parent" or "child"',
      requestId: reqId,
    });
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    logObserve({ requestId: reqId, stage: 'get_auth', status: 'error', pairId, role: listenRole, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 401, errorCode: 'unauthorized', errorMessage: 'idToken required' });
    return res.status(401).json({
      success: false,
      error: 'Authorization: Bearer <idToken> required',
      requestId: reqId,
    });
  }

  try {
    const { uid } = await verifyIdToken(idToken);
    if (!isPairAllowed(uid, pairId)) {
      return res.status(403).json({
        success: false,
        error: 'Not a pair member',
        requestId: reqId,
      });
    }

    initFirebaseAdmin();

    const metaRef = firestore.collection('pair_media').doc(pairId).collection('days').doc(dateKey);
    const metaSnap = await metaRef.get();
    if (!metaSnap.exists) {
      logObserve({ requestId: reqId, stage: 'get_fetch', status: 'ok', pairId, role: listenRole, clientDateKey, serverDateKey, ...(dateKeyNormalized ? { note: 'dateKey_normalized' } : {}), storagePath: null, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
      return res.status(200).json({
        success: true,
        hasAudio: false,
        url: null,
        requestId: reqId,
        pairId,
        dateKey,
        role: listenRole,
      });
    }

    const meta = metaSnap.data();
    const availableKeys = Object.keys(meta || {}).filter(k => k !== 'latestUpdatedAt');
    const selectedKey = listenRole;
    
    // 新スキーマ優先: meta[listenRole] を取得
    let roleData = meta?.[listenRole];
    let isLegacy = false;
    let objectPath = listenRole; // Firestore key: parent | child | (legacy) audioPath

    // 旧スキーマフォールバック: parent のみ許す。child には絶対に旧 audioPath(直下) を返さない
    if (!roleData || !roleData.audioPath) {
      if (listenRole === 'parent' && meta?.audioPath) {
        isLegacy = true;
        objectPath = 'audioPath';
        roleData = {
          audioPath: meta.audioPath,
          mimeType: meta.mimeType,
          extension: meta.extension,
          uploadedAt: meta.uploadedAt,
          uploadedBy: meta.uploadedBy,
          version: meta.uploadedAt?.toMillis?.() || Date.now(),
        };
        logObserve({ requestId: reqId, stage: 'get_resolve', status: 'ok', pairId, role: listenRole, clientDateKey, serverDateKey, ...(dateKeyNormalized ? { note: 'dateKey_normalized' } : {}), storagePath: roleData.audioPath, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
      } else {
        logObserve({ requestId: reqId, stage: 'get_resolve', status: 'ok', pairId, role: listenRole, clientDateKey, serverDateKey, ...(dateKeyNormalized ? { note: 'dateKey_normalized' } : {}), storagePath: null, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
        return res.status(200).json({
          success: true,
          hasAudio: false,
          url: null,
          requestId: reqId,
          pairId,
          dateKey,
          role: listenRole,
        });
      }
    }

    const audioPath = roleData.audioPath;
    const resolvedAudioPath = audioPath;
    const version = roleData.version || roleData.uploadedAt?.toMillis?.() || Date.now();
    logObserve({ requestId: reqId, stage: 'get_resolve', status: 'ok', pairId, role: listenRole, clientDateKey, serverDateKey, ...(dateKeyNormalized ? { note: 'dateKey_normalized' } : {}), storagePath: resolvedAudioPath, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });

    const fileRef = storageBucket.file(audioPath);

    if (mode === 'signed') {
      const [signedUrl] = await fileRef.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000,
      });
      const updatedAt = roleData.updatedAt?.toMillis?.() ?? roleData.version ?? Date.now();
      const seenAt = roleData.seenAt?.toMillis?.() ?? null;
      return res.status(200).json({
        success: true,
        mode: 'signed',
        url: signedUrl,
        version,
        updatedAt,
        seenAt,
        audioPath,
        requestId: reqId,
        hasAudio: true,
      });
    }

    const [contents] = await fileRef.download();
    const mimeType = roleData.mimeType || 'audio/mp4';
    const updatedAt = roleData.updatedAt?.toMillis?.() ?? roleData.version ?? Date.now();
    const seenAt = roleData.seenAt?.toMillis?.() ?? null;
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.setHeader('X-Audio-Version', String(version));
    res.setHeader('X-Audio-UpdatedAt', String(updatedAt));
    if (seenAt != null) res.setHeader('X-Audio-SeenAt', String(seenAt));
    res.setHeader('X-Request-Id', reqId);
    return res.status(200).send(contents);
  } catch (e) {
    const code = e?.code || 'unknown';
    const msg = (e?.message || String(e)).substring(0, 100);
    logObserve({ requestId: reqId, stage: 'get_download', status: 'error', pairId, role: listenRole, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 500, errorCode: code, errorMessage: msg });
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch media',
      requestId: reqId,
      errorCode: code,
    });
  }
}

/** POST: upload audio */
async function handlePost(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();
  const firestoreDocPath = null; // set after pairId/dateKey known

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    logObserve({ requestId: reqId, stage: 'post_auth', status: 'error', pairId: null, role: null, dateKey: null, storagePath: null, firestoreDocPath: null, httpStatus: 401, errorCode: 'unauthorized', errorMessage: 'idToken required' });
    return res.status(401).json({
      success: false,
      error: 'Authorization: Bearer <idToken> required',
      requestId: reqId,
    });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return res.status(400).json({
      success: false,
      error: 'Content-Type must be multipart/form-data',
      requestId: reqId,
    });
  }

  try {
    const { uid } = await verifyIdToken(idToken);
    let fields, file;
    try {
      const parsed = await parseMultipartFormData(req);
      fields = parsed.fields;
      file = parsed.file;
    } catch (parseErr) {
      const msg = (parseErr?.message || String(parseErr)).substring(0, 100);
      logObserve({ requestId: reqId, stage: 'post_parse', status: 'error', pairId: null, role: null, dateKey: null, storagePath: null, firestoreDocPath: null, httpStatus: 400, errorCode: 'parse_failed', errorMessage: msg });
      throw parseErr;
    }

    const audioFile = file?.fieldName === 'audio' ? file : null;
    if (!audioFile || !audioFile.buffer?.length) {
      return res.status(400).json({
        success: false,
        error: 'FormData must include "audio" file',
        requestId: reqId,
      });
    }

    const pairId = fields.pairId || fields.pair_id || 'demo';
    const clientDateKey = fields.dateKey || fields.date_key || null;
    const serverDateKey = getDateKeyNY();
    const dateKey = serverDateKey;
    const dateKeyNormalized = clientDateKey && clientDateKey !== serverDateKey;
    const role = fields.role; // 'parent' | 'child' (必須)
    const docPath = `pair_media/${pairId}/days/${dateKey}`;

    // role を最初にチェック（必須化）
    if (!role || (role !== 'parent' && role !== 'child')) {
      logObserve({ requestId: reqId, stage: 'post_validate', status: 'error', pairId, role: role || null, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath: docPath, httpStatus: 400, errorCode: 'invalid_role', errorMessage: 'role must be parent or child' });
      return res.status(400).json({
        success: false,
        error: 'role must be "parent" or "child"',
        requestId: reqId,
      });
    }
    
    if (!isPairAllowed(uid, pairId)) {
      return res.status(403).json({
        success: false,
        error: 'Not a pair member',
        requestId: reqId,
      });
    }

    initFirebaseAdmin();

    const mimeType = audioFile.mimeType || 'audio/mp4';
    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('m4a') ? 'm4a' : 'webm';
    const objectPath = `pair-media/${pairId}/${dateKey}/${role}/recording.${ext}`;
    const version = Date.now();
    try {
      const fileRef = storageBucket.file(objectPath);
      await fileRef.save(audioFile.buffer, {
        contentType: mimeType,
        resumable: false,
      });
      logObserve({ requestId: reqId, stage: 'post_storage', status: 'ok', pairId, role, clientDateKey, serverDateKey, ...(dateKeyNormalized ? { note: 'dateKey_normalized' } : {}), storagePath: objectPath, firestoreDocPath: docPath, httpStatus: 200, errorCode: null, errorMessage: null });
    } catch (uploadErr) {
      const code = uploadErr?.code || 'unknown';
      const msg = (uploadErr?.message || String(uploadErr)).substring(0, 100);
      logObserve({ requestId: reqId, stage: 'post_storage', status: 'error', pairId, role, clientDateKey, serverDateKey, storagePath: objectPath, firestoreDocPath: docPath, httpStatus: 500, errorCode: code, errorMessage: msg });
      throw uploadErr;
    }

    try {
      const metaRef = firestore.collection('pair_media').doc(pairId).collection('days').doc(dateKey);
      const uploadedAtTs = admin.firestore.FieldValue.serverTimestamp();
      const roleData = {
        audioPath: objectPath,
        storagePath: objectPath,
        mimeType,
        extension: ext,
        uploadedAt: uploadedAtTs,
        updatedAt: uploadedAtTs,
        uploadedBy: uid,
        version,
        uploadId: reqId,
        role,
        dateKey,
      };
      await metaRef.set({
        [role]: roleData,
        latestUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      logObserve({ requestId: reqId, stage: 'post_firestore', status: 'ok', pairId, role, clientDateKey, serverDateKey, ...(dateKeyNormalized ? { note: 'dateKey_normalized' } : {}), storagePath: objectPath, firestoreDocPath: docPath, httpStatus: 200, errorCode: null, errorMessage: null });
    } catch (firestoreErr) {
      const code = firestoreErr?.code || 'unknown';
      const msg = (firestoreErr?.message || String(firestoreErr)).substring(0, 100);
      logObserve({ requestId: reqId, stage: 'post_firestore', status: 'error', pairId, role, clientDateKey, serverDateKey, storagePath: objectPath, firestoreDocPath: docPath, httpStatus: 500, errorCode: code, errorMessage: msg });
      throw firestoreErr;
    }

    const responseJson = {
      success: true,
      pairId,
      dateKey,
      role,
      version,
      requestId: reqId,
    };
    logObserve({ requestId: reqId, stage: 'post_done', status: 'ok', pairId, role, clientDateKey, serverDateKey, ...(dateKeyNormalized ? { note: 'dateKey_normalized' } : {}), storagePath: objectPath, firestoreDocPath: docPath, httpStatus: 200, errorCode: null, errorMessage: null });

    // Push通知（ベストエフォート・POST成功に影響しない）
    sendPushIfUnseen(reqId, pairId, role, dateKey).catch(() => {});

    return res.status(200).json(responseJson);
  } catch (e) {
    const code = e?.code || 'unknown';
    const msg = (e?.message || String(e)).substring(0, 100);
    logObserve({ requestId: reqId, stage: 'post_error', status: 'error', pairId: null, role: null, dateKey: null, storagePath: null, firestoreDocPath: null, httpStatus: 500, errorCode: code, errorMessage: msg });
    return res.status(500).json({
      success: false,
      error: 'Upload failed',
      requestId: reqId,
      errorCode: code,
    });
  }
}

/** PATCH: action=markSeen で seenAt を serverTimestamp に更新 */
async function handlePatch(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();
  const action = req.query?.action;
  const pairId = req.query?.pairId || req.query?.pair_id;
  const clientDateKey = req.query?.dateKey || req.query?.date_key;
  const serverDateKey = getDateKeyNY();
  const dateKey = serverDateKey;
  const role = req.query?.listenRole || req.query?.listen_role || req.query?.role;
  const firestoreDocPath = pairId && dateKey ? `pair_media/${pairId}/days/${dateKey}` : null;

  if (action !== 'markSeen') {
    return res.status(400).json({ success: false, error: 'action must be markSeen', requestId: reqId });
  }
  if (!pairId || !role || (role !== 'parent' && role !== 'child')) {
    logObserve({ requestId: reqId, stage: 'mark_seen', status: 'error', pairId: pairId || null, role: role || null, dateKey, firestoreDocPath, httpStatus: 400, errorCode: 'invalid_params', errorMessage: 'pairId and role (parent|child) required' });
    return res.status(400).json({ success: false, error: 'pairId and listenRole (parent|child) required', requestId: reqId });
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    return res.status(401).json({ success: false, error: 'Authorization required', requestId: reqId });
  }

  try {
    const { uid } = await verifyIdToken(idToken);
    if (!isPairAllowed(uid, pairId)) {
      return res.status(403).json({ success: false, error: 'Not a pair member', requestId: reqId });
    }
    initFirebaseAdmin();

    const metaRef = firestore.collection('pair_media').doc(pairId).collection('days').doc(dateKey);
    const metaSnap = await metaRef.get();
    if (!metaSnap.exists) {
      logObserve({ requestId: reqId, stage: 'mark_seen', status: 'ok', pairId, role, dateKey, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
      return res.status(200).json({ success: true, requestId: reqId });
    }
    const roleData = metaSnap.data()?.[role];
    if (!roleData?.audioPath) {
      logObserve({ requestId: reqId, stage: 'mark_seen', status: 'ok', pairId, role, dateKey, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
      return res.status(200).json({ success: true, requestId: reqId });
    }

    await metaRef.set({
      [role]: { ...roleData, seenAt: admin.firestore.FieldValue.serverTimestamp() },
      latestUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    logObserve({ requestId: reqId, stage: 'mark_seen', status: 'ok', pairId, role, dateKey, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
    return res.status(200).json({ success: true, requestId: reqId });
  } catch (e) {
    const code = e?.code || 'unknown';
    const msg = (e?.message || String(e)).substring(0, 100);
    logObserve({ requestId: reqId, stage: 'mark_seen', status: 'error', pairId, role, dateKey, firestoreDocPath, httpStatus: 500, errorCode: code, errorMessage: msg });
    return res.status(500).json({ success: false, error: 'Failed to mark seen', requestId: reqId });
  }
}

export default async function handler(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
