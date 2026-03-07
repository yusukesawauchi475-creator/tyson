import admin from 'firebase-admin';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';

let adminApp;
let firestore;
let _storageBucketName = null;

function initAdmin() {
  if (adminApp) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const result = parseFirebaseServiceAccount(raw);
  if (!result.success) throw new Error(result.error.message);
  const parsed = result.data;
  const projectId = parsed.project_id ?? process.env.VITE_FIREBASE_PROJECT_ID;
  const envBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '';
  _storageBucketName = envBucket || `${projectId}.firebasestorage.app`;
  if (!_storageBucketName) throw new Error('storageBucketName is empty');
  if (admin.apps && admin.apps.length > 0) {
    adminApp = admin.app();
    firestore = admin.firestore();
    return;
  }
  adminApp = admin.initializeApp({ credential: admin.credential.cert(parsed), storageBucket: _storageBucketName });
  firestore = admin.firestore();
}

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

function getYesterdayKeyNY() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const y = get('year'), m = get('month'), dk = get('day');
    if (y && m && dk) return `${y}-${m}-${dk}`;
  } catch (_) {}
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const pairId = req.query.pairId || 'demo';
  const todayKey = getDateKeyNY();
  const yesterdayKey = getYesterdayKeyNY();
  const serverNow = new Date().toISOString();

  const result = {
    serverNow,
    todayKey,
    yesterdayKey,
    pairId,
    adminInit: { ok: false, error: null },
    storageBucket: { ok: false, name: null },
    days: {},
  };

  try {
    initAdmin();
    result.adminInit.ok = true;
    result.storageBucket.ok = !!_storageBucketName;
    result.storageBucket.name = _storageBucketName;
  } catch (e) {
    result.adminInit.error = e.message;
    return res.status(200).json(result);
  }

  for (const dk of [todayKey, yesterdayKey]) {
    try {
      const snap = await firestore.collection('pair_media').doc(pairId).collection('days').doc(dk).get();
      if (!snap.exists) {
        result.days[dk] = { exists: false };
      } else {
        const d = snap.data();
        result.days[dk] = {
          exists: true,
          topLevelKeys: Object.keys(d),
          parent: d.parent ? { audioPath: d.parent.audioPath || null, uploadedAt: d.parent.uploadedAt || null } : null,
          child: d.child ? { audioPath: d.child.audioPath || null, uploadedAt: d.child.uploadedAt || null } : null,
        };
      }
    } catch (e) {
      result.days[dk] = { error: e.message };
    }
  }

  return res.status(200).json(result);
}
