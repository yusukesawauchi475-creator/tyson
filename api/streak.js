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

/**
 * pair_mediaのFirestoreデータからparent・child両方がuploadした日を集計し、
 * 今日から遡って連続日数を計算する。
 */
async function calculateStreakFromUploads(pairId) {
  initFirebaseAdmin();
  const daysSnap = await firestore.collection('pair_media').doc(pairId).collection('days').get();

  // parent・child両方が存在する日を抽出
  const bothDays = [];
  daysSnap.forEach(doc => {
    const data = doc.data();
    if (data.parent && data.child) {
      bothDays.push(doc.id); // doc.id = dateKey (YYYY-MM-DD)
    }
  });

  // 全日付（parent or childいずれかが存在する日）を収集してfirstDateKeyを算出
  const anyDays = [];
  daysSnap.forEach(doc => {
    const data = doc.data();
    if (data.parent || data.child) anyDays.push(doc.id);
  });
  anyDays.sort((a, b) => a.localeCompare(b));
  const firstDateKey = anyDays.length > 0 ? anyDays[0] : null;

  if (bothDays.length === 0) return { count: 0, lastDateKey: null, firstDateKey };

  // 日付降順ソート
  bothDays.sort((a, b) => b.localeCompare(a));

  const today = getDateKeyNY();

  // 今日または昨日から開始して連続日数をカウント
  let count = 0;
  let checkDate = today;

  // 今日がbothDaysに含まれていなければ昨日から開始
  if (!bothDays.includes(today)) {
    checkDate = getPrevDateKey(today);
    if (!bothDays.includes(checkDate)) {
      // 昨日もなければstreak=0
      return { count: 0, lastDateKey: bothDays[0] };
    }
  }

  // checkDateから遡ってカウント
  while (bothDays.includes(checkDate)) {
    count++;
    checkDate = getPrevDateKey(checkDate);
  }

  return { count, lastDateKey: bothDays[0], firstDateKey };
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
      const streak = await calculateStreakFromUploads(pairId);
      return res.status(200).json({
        success: true,
        count: streak.count,
        lastDateKey: streak.lastDateKey,
        firstDateKey: streak.firstDateKey,
        requestId,
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message, requestId });
    }
  }

  if (req.method === 'POST') {
    const { pairId } = req.body || {};
    if (!pairId) {
      return res.status(400).json({ success: false, error: 'pairId is required', requestId });
    }

    try {
      // Recalculate streak from actual upload data
      const streak = await calculateStreakFromUploads(pairId);

      // Save to Firestore for caching
      initFirebaseAdmin();
      const ref = firestore.doc(`pairs/${pairId}/meta/streak`);
      const data = { count: streak.count, lastDateKey: streak.lastDateKey, firstDateKey: streak.firstDateKey, updatedAt: Date.now() };
      await ref.set(data);

      return res.status(200).json({
        success: true,
        count: streak.count,
        lastDateKey: streak.lastDateKey,
        firstDateKey: streak.firstDateKey,
        requestId,
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message, requestId });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed', requestId });
}
