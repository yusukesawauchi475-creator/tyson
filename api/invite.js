import admin from 'firebase-admin';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';

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
      const err = new Error(e.message);
      err.code = e.code;
      throw err;
    }

    const parsed = parsedResult.data;
    const projectId = parsed.project_id ?? process.env.VITE_FIREBASE_PROJECT_ID;

    adminApp = admin.initializeApp({
      credential: admin.credential.cert(parsed),
      projectId,
    });

    firestore = admin.firestore();
  } catch (e) {
    adminInitError = e;
    throw e;
  }
}

function genRequestId() {
  return 'REQ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function verifyIdToken(idToken) {
  initFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(idToken);
  return { uid: decoded.uid };
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
  const requestId = genRequestId();

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    return res.status(401).json({ success: false, error: 'Unauthorized', requestId });
  }

  try {
    await verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token', requestId });
  }

  initFirebaseAdmin();

  // GET: validate that pairId exists
  if (req.method === 'GET') {
    const { pairId } = req.query;
    if (!pairId) {
      return res.status(400).json({ success: false, error: 'pairId is required', requestId });
    }
    try {
      const snap = await firestore.collection('pairs').doc(pairId).get();
      return res.status(200).json({ success: true, valid: snap.exists, pairId, requestId });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message, requestId });
    }
  }

  // POST: register pairId in Firestore (idempotent)
  if (req.method === 'POST') {
    let body = {};
    try {
      if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        body = req.body;
      } else {
        body = await readJsonBody(req);
      }
    } catch {}

    const pairId = (body.pairId || '').trim();
    if (!pairId || !pairId.startsWith('TYSON-')) {
      return res.status(400).json({ success: false, error: 'valid pairId (TYSON-XXXX) is required', requestId });
    }

    try {
      const docRef = firestore.collection('pairs').doc(pairId);
      const snap = await docRef.get();
      if (!snap.exists) {
        await docRef.set({
          pairId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      return res.status(200).json({ success: true, pairId, requestId });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message, requestId });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed', requestId });
}
