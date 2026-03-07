import admin from 'firebase-admin';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';

function getDateKeyNY() {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const y = get('year'), m = get('month'), d = get('day');
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (_) {}
  return now.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const result = {
    serverNow: new Date().toISOString(),
    todayKeyNY: getDateKeyNY(),
    adminInit: { ok: false, error: null },
    storageBucket: { ok: false, name: null },
    firestore: { ok: false, error: null, docExists: null },
  };

  // 1. Firebase Admin 初期化
  let db, storageBucketName;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    const parsed = parseFirebaseServiceAccount(raw);
    if (!parsed.success) throw new Error(parsed.error.message);
    const sa = parsed.data;
    const projectId = sa.project_id ?? process.env.VITE_FIREBASE_PROJECT_ID;
    const envBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '';
    storageBucketName = envBucket || `${projectId}.firebasestorage.app`;

    if (!storageBucketName) throw new Error('storageBucketName is empty');

    if (!(admin.apps && admin.apps.length > 0)) {
      admin.initializeApp({ credential: admin.credential.cert(sa), storageBucket: storageBucketName });
    }
    db = admin.firestore();
    result.adminInit.ok = true;
    result.storageBucket.ok = true;
    result.storageBucket.name = storageBucketName;
  } catch (e) {
    result.adminInit.error = e.message;
    return res.status(200).json(result);
  }

  // 2. Firestore読み取り
  try {
    const snap = await db.collection('pair_media').doc('demo').collection('days').doc(result.todayKeyNY).get();
    result.firestore.ok = true;
    result.firestore.docExists = snap.exists;
    if (snap.exists) {
      const d = snap.data();
      result.firestore.topLevelKeys = Object.keys(d);
      result.firestore.hasChild = !!(d.child && d.child.audioPath);
      result.firestore.hasParent = !!(d.parent && d.parent.audioPath);
    }
  } catch (e) {
    result.firestore.error = e.message;
  }

  return res.status(200).json(result);
}
