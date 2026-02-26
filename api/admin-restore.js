/**
 * POST /api/admin-restore
 * Restore from latest snapshot. Body: { pairId, dateKey }
 */
import admin from 'firebase-admin';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';

let adminApp;
let firestore;
let adminInitError = null;

function initFirebaseAdmin() {
  if (adminInitError) throw adminInitError;
  if (adminApp) return;

  if (admin.apps?.length > 0) {
    adminApp = admin.app();
    firestore = admin.firestore();
    return;
  }

  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    const parsedResult = parseFirebaseServiceAccount(raw);
    if (!parsedResult.success) throw new Error(parsedResult.error?.message || 'Parse failed');
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

function getDateKeyNY() {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const y = get('year'), m = get('month'), d = get('day');
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {}
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function genRequestId() {
  return 'REQ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
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

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed', requestId: reqId });
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    return res.status(401).json({ success: false, error: 'Authorization: Bearer <idToken> required', requestId: reqId });
  }

  try {
    const { uid } = await verifyIdToken(idToken);

    let body;
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      body = req.body;
    } else {
      body = await readJsonBody(req);
    }

    const pairId = (body.pairId || body.pair_id || 'demo').trim();
    const clientDateKey = body.dateKey || null;
    const serverDateKey = getDateKeyNY();
    const dateKey = clientDateKey || serverDateKey;
    const monthKey = dateKey.slice(0, 7);

    if (!pairId) {
      return res.status(400).json({ success: false, error: 'pairId required', requestId: reqId });
    }
    if (!isPairAllowed(uid, pairId)) {
      return res.status(403).json({ success: false, error: 'Not a pair member', requestId: reqId });
    }

    initFirebaseAdmin();

    const snapshotsRef = firestore.collection('journal').doc(pairId).collection('snapshots');
    const snapshotsSnap = await snapshotsRef.get();

    if (snapshotsSnap.empty) {
      return res.status(404).json({
        success: false,
        error: 'No snapshot found. Run Reset first.',
        requestId: reqId,
      });
    }

    const docs = snapshotsSnap.docs.sort((a, b) => {
      const aId = parseInt(a.id, 10) || 0;
      const bId = parseInt(b.id, 10) || 0;
      return bId - aId;
    });
    const latestDoc = docs[0];
    const snapshotData = latestDoc.data();
    const roleData = snapshotData?.roleData ?? {};

    const dayDocRef = firestore.collection('journal').doc(pairId).collection('months').doc(monthKey).collection('days').doc(dateKey);

    await dayDocRef.set({
      roleData,
      dateKey,
      monthKey,
    }, { merge: true });

    return res.status(200).json({
      success: true,
      requestId: reqId,
      pairId,
      dateKey,
      snapshotId: latestDoc.id,
      message: 'Restore complete.',
    });
  } catch (e) {
    const code = e?.code || 'unknown';
    const msg = (e?.message || String(e)).substring(0, 150);
    console.error('[admin-restore]', reqId, code, msg);
    return res.status(500).json({
      success: false,
      error: msg || 'Restore failed',
      requestId: reqId,
      errorCode: code,
    });
  }
}
