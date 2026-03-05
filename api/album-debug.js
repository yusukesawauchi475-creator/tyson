/**
 * GET /api/album-debug?pairId=demo
 * Firestoreのデータ構造を確認するデバッグ用エンドポイント。
 * 署名付きURLは生成しない（Firestoreデータの存在確認のみ）。
 */
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

async function verifyIdToken(idToken) {
  initFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(idToken);
  return { uid: decoded.uid };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!idToken) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { pairId = 'demo' } = req.query;

  try {
    initFirebaseAdmin();

    // journal/{pairId} document
    const pairDocRef = firestore.collection('journal').doc(pairId);
    const pairDoc = await pairDocRef.get();

    // months collection (listDocuments で phantom docs も含む)
    const monthDocRefs = await pairDocRef.collection('months').listDocuments();

    const months = [];
    for (const monthRef of monthDocRefs) {
      const dayDocRefs = await monthRef.collection('days').listDocuments();
      const days = await Promise.all(dayDocRefs.map(async (dayRef) => {
        const dayDoc = await dayRef.get();
        const data = dayDoc.data();
        const roleData = data?.roleData ?? {};
        const summary = {};
        for (const role of ['parent', 'child']) {
          const rd = roleData[role];
          if (!rd) continue;
          summary[role] = {
            hasJournalImage: !!(rd.journal_image?.storagePath || rd.storagePath),
            journalImagePath: rd.journal_image?.storagePath || rd.storagePath || null,
            genericImagesCount: Array.isArray(rd.generic_images) ? rd.generic_images.length : (rd.generic_image?.storagePath ? 1 : 0),
            genericImagePaths: Array.isArray(rd.generic_images)
              ? rd.generic_images.map((g) => g?.storagePath).filter(Boolean)
              : (rd.generic_image?.storagePath ? [rd.generic_image.storagePath] : []),
          };
        }
        return { dateKey: dayRef.id, roles: summary };
      }));
      months.push({ monthKey: monthRef.id, daysCount: days.length, days });
    }

    return res.status(200).json({
      pairId,
      pairDocExists: pairDoc.exists,
      monthsCount: months.length,
      months,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}
