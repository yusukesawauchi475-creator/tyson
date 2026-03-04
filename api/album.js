import admin from 'firebase-admin';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';

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
      const err = new Error(e.message);
      err.code = e.code;
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

function genRequestId() {
  return 'REQ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function verifyIdToken(idToken) {
  initFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(idToken);
  return { uid: decoded.uid };
}

async function getSignedUrl(storagePath) {
  try {
    const [url] = await storageBucket.file(storagePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
    return url || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const requestId = genRequestId();

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed', requestId });
  }

  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    return res.status(401).json({ success: false, error: 'Unauthorized', requestId });
  }

  try {
    await verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token', requestId });
  }

  const { pairId } = req.query;
  if (!pairId) {
    return res.status(400).json({ success: false, error: 'pairId is required', requestId });
  }

  try {
    initFirebaseAdmin();

    const monthsSnap = await firestore
      .collection('journal').doc(pairId).collection('months')
      .get();

    const daysByDate = {};

    await Promise.all(
      monthsSnap.docs.map(async (monthDoc) => {
        const daysSnap = await monthDoc.ref.collection('days').get();

        await Promise.all(
          daysSnap.docs.map(async (dayDoc) => {
            const dateKey = dayDoc.id;
            const data = dayDoc.data();
            const roleDataAll = data?.roleData ?? {};
            const photoJobs = [];

            for (const role of ['parent', 'child']) {
              const rd = roleDataAll[role];
              if (!rd || typeof rd !== 'object') continue;

              // journal_image
              const journalEntry = (rd.journal_image && typeof rd.journal_image?.storagePath === 'string')
                ? rd.journal_image
                : (typeof rd.storagePath === 'string' ? { storagePath: rd.storagePath, updatedAt: rd.updatedAt } : null);

              if (journalEntry?.storagePath) {
                photoJobs.push(
                  getSignedUrl(journalEntry.storagePath).then((url) => {
                    if (!url) return null;
                    return {
                      url,
                      storagePath: journalEntry.storagePath,
                      role,
                      kind: 'journal_image',
                      updatedAt: journalEntry.updatedAt?.toMillis?.() ?? journalEntry.updatedAt ?? null,
                    };
                  })
                );
              }

              // generic_images
              let genericList = Array.isArray(rd.generic_images) ? rd.generic_images : [];
              if (genericList.length === 0 && rd.generic_image?.storagePath) {
                genericList = [{ ...rd.generic_image, index: 1 }];
              }

              for (const item of genericList) {
                if (!item?.storagePath) continue;
                const itemCopy = item;
                photoJobs.push(
                  getSignedUrl(itemCopy.storagePath).then((url) => {
                    if (!url) return null;
                    return {
                      url,
                      storagePath: itemCopy.storagePath,
                      role,
                      kind: 'generic_image',
                      updatedAt: itemCopy.updatedAt?.toMillis?.() ?? itemCopy.updatedAt ?? null,
                      index: typeof itemCopy.index === 'number' ? itemCopy.index : 1,
                    };
                  })
                );
              }
            }

            const resolved = (await Promise.all(photoJobs)).filter(Boolean);
            if (resolved.length > 0) {
              daysByDate[dateKey] = resolved;
            }
          })
        );
      })
    );

    const days = Object.keys(daysByDate)
      .sort((a, b) => b.localeCompare(a))
      .map((dateKey) => ({ dateKey, photos: daysByDate[dateKey] }));

    return res.status(200).json({ success: true, days, requestId });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message, requestId });
  }
}
