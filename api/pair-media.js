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
  const type = req.query?.type || 'audio';
  const mode = req.query?.mode || 'blob'; // 'blob' | 'signed'

  if (!pairId || !dateKey) {
    return res.status(400).json({
      success: false,
      error: 'pairId and dateKey are required',
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
      return res.status(404).json({
        success: false,
        error: 'No media for this date',
        requestId: reqId,
      });
    }

    const meta = metaSnap.data();
    const audioPath = meta?.audioPath;
    if (!audioPath) {
      return res.status(404).json({
        success: false,
        error: 'No audio for this date',
        requestId: reqId,
      });
    }

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
        requestId: reqId,
      });
    }

    const [contents] = await fileRef.download();
    const mimeType = meta.mimeType || 'audio/mp4';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).send(contents);
  } catch (e) {
    const code = e?.code || 'unknown';
    console.error(`[pair-media GET] ${reqId} error:`, code, e?.message);
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

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
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
    const { fields, file } = await parseMultipartFormData(req);

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
    const objectPath = `pair-media/${pairId}/${dateKey}/recording.${ext}`;

    const fileRef = storageBucket.file(objectPath);
    await fileRef.save(audioFile.buffer, {
      contentType: mimeType,
      resumable: false,
    });

    const metaRef = firestore.collection('pair_media').doc(pairId).collection('days').doc(dateKey);
    await metaRef.set({
      audioPath: objectPath,
      mimeType,
      extension: ext,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      uploadedBy: uid,
    });

    return res.status(200).json({
      success: true,
      pairId,
      dateKey,
      requestId: reqId,
    });
  } catch (e) {
    const code = e?.code || 'unknown';
    console.error(`[pair-media POST] ${reqId} error:`, code, e?.message);
    return res.status(500).json({
      success: false,
      error: 'Upload failed',
      requestId: reqId,
      errorCode: code,
    });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
