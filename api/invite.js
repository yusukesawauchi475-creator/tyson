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

  // GET ?action=resolve&number=N → no auth required, redirect only
  if (req.method === 'GET' && req.query?.action === 'resolve' && req.query?.number) {
    try {
      initFirebaseAdmin();
      const numDoc = await firestore.collection('pair_numbers').doc(String(req.query.number)).get();
      if (!numDoc.exists) {
        return res.status(404).json({ success: false, error: 'Number not found', requestId });
      }
      const resolvedPairId = numDoc.data()?.pairId;
      if (!resolvedPairId) {
        return res.status(404).json({ success: false, error: 'pairId not found for number', requestId });
      }
      const roleParam = req.query.role === 'parent' || req.query.role === 'child' ? `&role=${req.query.role}` : '';
      return res.redirect(302, `https://www.humfamily.com/#/?number=${encodeURIComponent(req.query.number)}${roleParam}`);
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message, requestId });
    }
  }

  // All other actions require auth
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

  // GET: validate pairId
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

  // POST: create-numbered or register pairId
  if (req.method === 'POST') {
    const action = req.query?.action || req.body?.action;

    // POST ?action=create-numbered
    if (action === 'create-numbered') {
      let body = {};
      try {
        if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
          body = req.body;
        } else {
          body = await readJsonBody(req);
        }
      } catch {}
      const memo = (body.memo || '').trim();

      // Generate PAIR-XXXXXX
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let pairId = 'PAIR-';
      for (let i = 0; i < 6; i++) pairId += chars[Math.floor(Math.random() * chars.length)];

      try {
        // Generate random 6-char slug (a-z 0-9, ~2.1 billion combinations)
        const slugChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const allSnap = await firestore.collection('pair_numbers').get();
        const existingSlugs = new Set(allSnap.docs.map(d => d.id));
        let slug;
        do {
          slug = '';
          for (let i = 0; i < 6; i++) slug += slugChars[Math.floor(Math.random() * slugChars.length)];
        } while (existingSlugs.has(slug));
        console.log('[invite] create-numbered: slug=', slug, 'total docs=', allSnap.size);

        // Write pair_numbers/{slug}
        await firestore.collection('pair_numbers').doc(slug).set({
          pairId,
          memo,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Write pairs/{pairId}
        await firestore.collection('pairs').doc(pairId).set({
          pairId,
          number: slug,
          memo,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.status(200).json({
          success: true,
          number: slug,
          pairId,
          url: `https://humfamily.com/pair/${slug}`,
          requestId,
        });
      } catch (e) {
        console.error('[invite] create-numbered error:', e.message, e.stack?.substring(0, 200));
        return res.status(500).json({ success: false, error: e.message, requestId });
      }
    }

    // POST: register pairId (existing logic)
    let body = {};
    try {
      if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        body = req.body;
      } else {
        body = await readJsonBody(req);
      }
    } catch {}

    const pairId = (body.pairId || '').trim();
    if (!pairId || !(pairId.startsWith('TYSON-') || pairId.startsWith('PAIR-'))) {
      return res.status(400).json({ success: false, error: 'valid pairId (TYSON-XXXX or PAIR-XXXX) is required', requestId });
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
