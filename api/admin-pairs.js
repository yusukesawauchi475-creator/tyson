/**
 * GET /api/admin-pairs
 * Returns activity dashboard data for all pairIds.
 * Auth: X-Admin-Password header must match ADMIN_PASSWORD env var.
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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const provided = (req.headers['x-admin-password'] || req.query.password || '').trim();
  if (!adminPassword || provided !== adminPassword) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    initFirebaseAdmin();

    // Collect all pairIds from pair_media
    const pairMediaDocs = await firestore.collection('pair_media').listDocuments();
    const pairIds = pairMediaDocs.map(d => d.id);

    // Also check journal collection for pairIds not in pair_media
    const journalDocs = await firestore.collection('journal').listDocuments();
    for (const d of journalDocs) {
      if (!pairIds.includes(d.id)) pairIds.push(d.id);
    }

    // Generate date range (past 30 days)
    const dates = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${dd}`);
    }

    const pairs = [];

    for (const pairId of pairIds) {
      const activity = {};
      let lastActivity = null;

      // Get pair_media days
      const mediaDays = await firestore.collection('pair_media').doc(pairId).collection('days').listDocuments();
      for (const dayRef of mediaDays) {
        const dateKey = dayRef.id;
        const snap = await dayRef.get();
        if (!snap.exists) continue;
        const data = snap.data();
        if (!activity[dateKey]) activity[dateKey] = { parent: {}, child: {} };
        if (data.parent) {
          activity[dateKey].parent.voice = true;
          const ts = data.parent.updatedAt?._seconds || data.parent.uploadedAt?._seconds;
          if (ts && (!lastActivity || ts > lastActivity)) lastActivity = ts;
        }
        if (data.child) {
          activity[dateKey].child.voice = true;
          const ts = data.child.updatedAt?._seconds || data.child.uploadedAt?._seconds;
          if (ts && (!lastActivity || ts > lastActivity)) lastActivity = ts;
        }
      }

      // Get journal months/days
      const months = await firestore.collection('journal').doc(pairId).collection('months').listDocuments();
      for (const monthRef of months) {
        const days = await monthRef.collection('days').listDocuments();
        for (const dayRef of days) {
          const dateKey = dayRef.id;
          const snap = await dayRef.get();
          if (!snap.exists) continue;
          const data = snap.data();
          if (!activity[dateKey]) activity[dateKey] = { parent: {}, child: {} };
          if (data.roleData?.parent) {
            activity[dateKey].parent.photo = true;
          }
          if (data.roleData?.child) {
            activity[dateKey].child.photo = true;
          }
        }
      }

      // Build 30-day calendar
      const calendar = dates.map(dateKey => {
        const a = activity[dateKey];
        if (!a) return { date: dateKey, parent: null, child: null };
        return {
          date: dateKey,
          parent: (a.parent.voice || a.parent.photo) ? {
            voice: !!a.parent.voice,
            photo: !!a.parent.photo,
          } : null,
          child: (a.child.voice || a.child.photo) ? {
            voice: !!a.child.voice,
            photo: !!a.child.photo,
          } : null,
        };
      });

      pairs.push({
        pairId,
        lastActivity: lastActivity ? new Date(lastActivity * 1000).toISOString() : null,
        calendar,
      });
    }

    // Sort by lastActivity (most recent first)
    pairs.sort((a, b) => (b.lastActivity || '') > (a.lastActivity || '') ? 1 : -1);

    return res.status(200).json({ success: true, pairs, dates });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
