import admin from 'firebase-admin';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';
import { findUniqueSlug } from '../src/lib/pairSlug.js';

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

  // GET ?action=resolve&number=N → redirect (auth optional; if present, claim membership)
  if (req.method === 'GET' && req.query?.action === 'resolve' && req.query?.number) {
    try {
      initFirebaseAdmin();
      const numDoc = await firestore.collection('pair_numbers').doc(String(req.query.number)).get();
      if (!numDoc.exists) {
        return res.status(404).json({ success: false, error: 'Number not found', requestId });
      }
      const numData = numDoc.data() || {};
      // 段階15: deactivated slug は 404 扱い（migratedTo は response 漏洩禁止）
      if (numData.deactivated === true) {
        return res.status(404).json({ success: false, error: 'Number not found', requestId });
      }
      const resolvedPairId = numData.pairId;
      if (!resolvedPairId) {
        return res.status(404).json({ success: false, error: 'pairId not found for number', requestId });
      }

      // Phase 1 pair-membership: 認証済み uid があれば pair_users/{pairId}/members/{uid} を claim (idempotent)
      const claimToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
      if (claimToken) {
        try {
          const decoded = await admin.auth().verifyIdToken(claimToken);
          const claimUid = decoded.uid;
          const claimRole = req.query.role === 'parent' || req.query.role === 'child' ? req.query.role : 'unknown';
          await firestore
            .collection('pair_users').doc(resolvedPairId)
            .collection('members').doc(claimUid)
            .set({
              role: claimRole,
              claimedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          console.log('[AUTH_SELF_HEAL_SERVER]', JSON.stringify({
            event: 'claim',
            pairId: resolvedPairId,
            slug: String(req.query.number),
            uidPrefix: claimUid.slice(0, 6),
            role: claimRole,
            requestId,
          }));
        } catch (_) {
          // claim 失敗しても resolve UX は維持 (lockout 別 phase で扱う)
        }
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

    // Phase X-2.5-fix: pair 作成 logic を内部 helper 化、create-numbered と create-welcome で reuse
    // TODO(Phase X-3-B): pairTimezone を必須引数として追加予定
    // TODO(Phase Y): email 入力統合 (retention 強化、magic link auth) を別 action で追加予定
    async function createPairNumberedDoc({ memo, source }) {
      // Generate PAIR-XXXXXX (I/O/0/1 除外)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let pairId = 'PAIR-';
      for (let i = 0; i < 6; i++) pairId += chars[Math.floor(Math.random() * chars.length)];

      // Phase X-1: generateSlug() helper 経由、length 8 + Crockford Base32 chars
      const slug = await findUniqueSlug(async (candidate) => {
        const snap = await firestore.collection('pair_numbers').doc(candidate).get();
        return snap.exists;
      });

      const baseDoc = {
        pairId,
        memo: memo || '',
        ...(source ? { source } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await firestore.collection('pair_numbers').doc(slug).set(baseDoc);
      await firestore.collection('pairs').doc(pairId).set({ ...baseDoc, number: slug });

      return { slug, pairId };
    }

    // POST ?action=create-numbered (既存、admin / invite UI 経由)
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

      try {
        const { slug, pairId } = await createPairNumberedDoc({ memo, source: null });
        console.log('[invite] create-numbered: slug=', slug);
        return res.status(200).json({
          success: true,
          number: slug,
          pairId,
          url: `https://www.humfamily.com/pair/${slug}?openExternalBrowser=1`,
          requestId,
        });
      } catch (e) {
        console.error('[invite] create-numbered error:', e.message, e.stack?.substring(0, 200));
        return res.status(500).json({ success: false, error: e.message, requestId });
      }
    }

    // POST ?action=create-welcome (Phase X-2.5-fix、DEMO CTA 経由の自動 pair 発行)
    if (action === 'create-welcome') {
      try {
        const { slug, pairId } = await createPairNumberedDoc({ memo: '', source: 'demo-cta' });
        console.log('[invite] create-welcome: slug=', slug);
        return res.status(200).json({
          success: true,
          slug,
          pairId,
          url: `https://www.humfamily.com/pair/${slug}?openExternalBrowser=1`,
          requestId,
        });
      } catch (e) {
        console.error('[invite] create-welcome error:', e.message, e.stack?.substring(0, 200));
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
