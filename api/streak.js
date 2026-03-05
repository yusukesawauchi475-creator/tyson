import admin from 'firebase-admin';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';

let adminApp;
let firestore;
let adminInitError = null;

function initFirebaseAdmin() {
  if (adminInitError) throw adminInitError;
  if (adminApp) return;

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

    // 既存appがある場合もstorageBucketNameを渡す（他のAPIがstorageBucketなしで初期化した場合のバグを回避）
    if (admin.apps && admin.apps.length > 0) {
      adminApp = admin.app();
      firestore = admin.firestore();
      return;
    }

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

async function verifyIdToken(idToken) {
  initFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(idToken);
  return { uid: decoded.uid };
}

/** YYYY-MM-DD の前日を返す */
function getPrevDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  const py = date.getUTCFullYear();
  const pm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(date.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

export default async function handler(req, res) {
  const requestId = genRequestId();

  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    return res.status(401).json({ success: false, error: 'Unauthorized', requestId });
  }

  try {
    await verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token', requestId });
  }

  if (req.method === 'GET') {
    const { pairId } = req.query;
    if (!pairId) {
      return res.status(400).json({ success: false, error: 'pairId is required', requestId });
    }

    try {
      initFirebaseAdmin();
      const snap = await firestore.doc(`pairs/${pairId}/meta/streak`).get();
      if (!snap.exists) {
        return res.status(200).json({ success: true, count: 0, lastDateKey: null, requestId });
      }
      const data = snap.data();
      return res.status(200).json({
        success: true,
        count: data.count ?? 0,
        lastDateKey: data.lastDateKey ?? null,
        updatedAt: data.updatedAt ?? null,
        requestId,
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message, requestId });
    }
  }

  if (req.method === 'POST') {
    const { pairId, dateKey } = req.body || {};
    if (!pairId) {
      return res.status(400).json({ success: false, error: 'pairId is required', requestId });
    }

    const today = dateKey || getDateKeyNY();

    try {
      initFirebaseAdmin();
      const ref = firestore.doc(`pairs/${pairId}/meta/streak`);

      const newData = await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? snap.data() : {};
        const lastDateKey = current.lastDateKey ?? null;
        const prevDateKey = getPrevDateKey(today);

        let count;
        if (lastDateKey === today) {
          // 今日すでに更新済み → そのまま
          count = current.count ?? 1;
        } else if (lastDateKey === prevDateKey) {
          // 昨日と連続 → +1
          count = (current.count ?? 0) + 1;
        } else {
          // 途切れ → リセット
          count = 1;
        }

        const data = { count, lastDateKey: today, updatedAt: Date.now() };
        tx.set(ref, data);
        return data;
      });

      return res.status(200).json({
        success: true,
        count: newData.count,
        lastDateKey: newData.lastDateKey,
        requestId,
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message, requestId });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed', requestId });
}
