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

/** GET: blob または signed URL */
async function handleGet(req, res) {
  const reqId = genRequestId();
  const pairId = req.query?.pairId || req.query?.pair_id;
  const dateKey = req.query?.dateKey || req.query?.date_key;
  const listenRole = req.query?.listenRole || req.query?.listen_role; // 'parent' | 'child'
  const type = req.query?.type || 'audio';
  const mode = req.query?.mode || 'blob'; // 'blob' | 'signed'

  console.log('[OBSERVE] handleGet entered:', { requestId: reqId, pairId, dateKey, listenRole, mode });

  if (!pairId || !dateKey) {
    return res.status(400).json({
      success: false,
      error: 'pairId and dateKey are required',
      requestId: reqId,
    });
  }

  if (!listenRole || (listenRole !== 'parent' && listenRole !== 'child')) {
    return res.status(400).json({
      success: false,
      error: 'listenRole must be "parent" or "child"',
      requestId: reqId,
    });
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
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
      console.log('[OBSERVE] handleGet: no doc exists:', { listenRole, pairId, dateKey, hasAudio: false });
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
        console.log('[OBSERVE] handleGet:', { objectPath, resolvedAudioPath: roleData.audioPath, isLegacy });
      } else {
        console.log('[OBSERVE] handleGet: no audio for role:', { listenRole, pairId, dateKey, selectedKey, availableKeys, hasRoleData: !!roleData, hasAudio: false });
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
    console.log('[OBSERVE] handleGet:', { objectPath, resolvedAudioPath, isLegacy });

    const fileRef = storageBucket.file(audioPath);

    if (mode === 'signed') {
      const [signedUrl] = await fileRef.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000,
      });
      return res.status(200).json({
        success: true,
        mode: 'signed',
        url: signedUrl,
        version,
        audioPath,
        requestId: reqId,
        hasAudio: true,
      });
    }

    const [contents] = await fileRef.download();
    const mimeType = roleData.mimeType || 'audio/mp4';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.setHeader('X-Audio-Version', String(version));
    return res.status(200).send(contents);
  } catch (e) {
    const code = e?.code || 'unknown';
    console.error(`[pair-media GET] ${reqId} error:`, code, e?.message);
    console.log('[OBSERVE] handleGet error:', { errorName: e?.name, errorCode: code, errorMessage: e?.message?.substring(0, 100) });
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
  const reqId = genRequestId();
  console.log('[OBSERVE] handlePost entered:', { requestId: reqId, method: req.method, url: req.url });

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  console.log('[OBSERVE] handlePost auth check:', { authHeaderPresent: !!idToken });
  if (!idToken) {
    return res.status(401).json({
      success: false,
      error: 'Authorization: Bearer <idToken> required',
      requestId: reqId,
    });
  }

  const contentType = req.headers['content-type'] || '';
  console.log('[OBSERVE] handlePost content-type:', { contentType: contentType.substring(0, 50) });
  if (!contentType.startsWith('multipart/form-data')) {
    return res.status(400).json({
      success: false,
      error: 'Content-Type must be multipart/form-data',
      requestId: reqId,
    });
  }

  try {
    const { uid } = await verifyIdToken(idToken);
    console.log('[OBSERVE] handlePost multipart parse start');
    let fields, file;
    try {
      const parsed = await parseMultipartFormData(req);
      fields = parsed.fields;
      file = parsed.file;
      console.log('[OBSERVE] handlePost multipart parsed:', {
        success: true,
        receivedFields: Object.keys(fields),
        receivedRole: fields.role || 'missing',
        receivedFileMeta: file ? { filename: file.filename, mimeType: file.mimeType, size: file.buffer?.length } : null,
      });
    } catch (parseErr) {
      console.log('[OBSERVE] handlePost multipart parse failed:', {
        success: false,
        errorName: parseErr?.name,
        errorMessage: parseErr?.message?.substring(0, 100),
      });
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
    const dateKey = fields.dateKey || fields.date_key;
    const role = fields.role; // 'parent' | 'child' (必須)
    
    // role を最初にチェック（必須化）
    if (!role || (role !== 'parent' && role !== 'child')) {
      console.log('[OBSERVE] handlePost role validation failed:', { receivedRole: role || 'missing', receivedFields: Object.keys(fields) });
      return res.status(400).json({
        success: false,
        error: 'role must be "parent" or "child"',
        requestId: reqId,
      });
    }
    
    if (!dateKey) {
      return res.status(400).json({
        success: false,
        error: 'dateKey is required',
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

    console.log('[OBSERVE] handlePost firebase upload start:', { role, pairId, dateKey, objectPath, version });
    try {
      const fileRef = storageBucket.file(objectPath);
      await fileRef.save(audioFile.buffer, {
        contentType: mimeType,
        resumable: false,
      });
      console.log('[OBSERVE] handlePost:', { objectPath, resolvedAudioPath: objectPath, isLegacy: false });
    } catch (uploadErr) {
      console.log('[OBSERVE] handlePost firebase upload failed:', {
        errorName: uploadErr?.name,
        errorCode: uploadErr?.code,
        errorMessage: uploadErr?.message?.substring(0, 100),
      });
      throw uploadErr;
    }

    console.log('[OBSERVE] handlePost firestore write start');
    try {
      const metaRef = firestore.collection('pair_media').doc(pairId).collection('days').doc(dateKey);
      const roleData = {
        audioPath: objectPath,
        mimeType,
        extension: ext,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        uploadedBy: uid,
        version,
      };
      await metaRef.set({
        [role]: roleData,
        latestUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log('[OBSERVE] handlePost firestore write success:', { objectPath, resolvedAudioPath: objectPath, isLegacy: false });
    } catch (firestoreErr) {
      console.log('[OBSERVE] handlePost firestore write failed:', {
        errorName: firestoreErr?.name,
        errorCode: firestoreErr?.code,
        errorMessage: firestoreErr?.message?.substring(0, 100),
      });
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
    console.log('[OBSERVE] handlePost response:', { status: 200, role, version, responseKeys: Object.keys(responseJson) });
    return res.status(200).json(responseJson);
  } catch (e) {
    const code = e?.code || 'unknown';
    console.error(`[pair-media POST] ${reqId} error:`, code, e?.message);
    console.log('[OBSERVE] handlePost error summary:', {
      errorName: e?.name,
      errorCode: code,
      errorMessage: e?.message?.substring(0, 100),
    });
    return res.status(500).json({
      success: false,
      error: 'Upload failed',
      requestId: reqId,
      errorCode: code,
    });
  }
}

export default async function handler(req, res) {
  const reqId = genRequestId();
  console.log('[OBSERVE] pair-media handler called:', { requestId: reqId, method: req.method, url: req.url });
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
