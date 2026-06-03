/**
 * GET /api/family-insight
 * Generate a 1-line family insight comment using OpenAI.
 * Query: ?pairId=XXX&lang=ja|en
 * Auth: Bearer token
 */
import OpenAI from 'openai';
import admin from 'firebase-admin';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';
import { isPairAllowed } from './lib/pair-access.js';

let adminApp;
let firestore;
let adminInitError = null;

function initFirebaseAdmin() {
  if (adminInitError) throw adminInitError;
  if (adminApp) return;
  if (admin.apps?.length > 0) { adminApp = admin.app(); firestore = admin.firestore(); return; }
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    const parsedResult = parseFirebaseServiceAccount(raw);
    if (!parsedResult.success) throw new Error(parsedResult.error?.message || 'Parse failed');
    const parsed = parsedResult.data;
    const projectId = parsed.project_id ?? process.env.VITE_FIREBASE_PROJECT_ID;
    const envBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '';
    adminApp = admin.initializeApp({ credential: admin.credential.cert(parsed), storageBucket: envBucket || `${projectId}.firebasestorage.app` });
    firestore = admin.firestore();
  } catch (e) { adminInitError = e; throw e; }
}

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!idToken) return res.status(401).json({ success: false, error: 'Unauthorized' });

  let uid;
  try {
    initFirebaseAdmin();
    ({ uid } = await admin.auth().verifyIdToken(idToken));
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  const pairId = (req.query.pairId || '').trim();
  const lang = (req.query.lang || 'ja').trim();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!pairId || !apiKey) return res.status(200).json({ success: false, comment: null });

  if (!(await isPairAllowed(uid, pairId, firestore))) {
    return res.status(403).json({ success: false, error: 'Not a pair member' });
  }

  try {
    // Collect 7-day activity data
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 86400000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push({ dateKey: `${y}-${m}-${dd}`, dow: d.getDay() });
    }

    let parentDays = [], childDays = [], bothDays = 0, photoDays = 0;

    // Voice data
    const mediaDocs = await Promise.all(
      dates.map(({ dateKey }) =>
        firestore.collection('pair_media').doc(pairId).collection('days').doc(dateKey).get()
      )
    );
    mediaDocs.forEach((snap, i) => {
      if (!snap.exists) return;
      const data = snap.data();
      const dowLabel = lang === 'en' ? DOW_EN[dates[i].dow] : DOW_JA[dates[i].dow];
      if (data.parent) parentDays.push(dowLabel);
      if (data.child) childDays.push(dowLabel);
      if (data.parent && data.child) bothDays++;
    });

    // Photo data
    const monthKey = dates[0].dateKey.slice(0, 7);
    try {
      const journalDays = await Promise.all(
        dates.map(({ dateKey }) =>
          firestore.collection('journal').doc(pairId).collection('months').doc(monthKey).collection('days').doc(dateKey).get()
        )
      );
      journalDays.forEach(snap => {
        if (!snap.exists) return;
        const rd = snap.data()?.roleData;
        if (rd?.parent?.generic_images?.length > 0 || rd?.child?.generic_images?.length > 0) photoDays++;
      });
    } catch {}

    // Streak
    let streak = 0;
    try {
      const streakSnap = await firestore.doc(`pairs/${pairId}/meta/streak`).get();
      if (streakSnap.exists) streak = streakSnap.data()?.count || 0;
    } catch {}

    // Need at least 7 days of some activity
    if (parentDays.length + childDays.length < 2) {
      return res.status(200).json({ success: false, comment: null, reason: 'insufficient_data' });
    }

    const roundTripRate = parentDays.length > 0 ? Math.round((bothDays / parentDays.length) * 100) : 0;

    const dataStr = lang === 'en'
      ? `Past 7 days: Parent sent voice on ${parentDays.join(', ') || 'none'}. Child sent voice on ${childDays.join(', ') || 'none'}. Round-trip rate: ${roundTripRate}%. Photos: ${photoDays} days. Streak: ${streak} days.`
      : `過去7日: 親の音声送信日=${parentDays.join('・') || 'なし'}。子の音声送信日=${childDays.join('・') || 'なし'}。往復率=${roundTripRate}%。写真=${photoDays}日。連続=${streak}日。`;

    const prompt = lang === 'en'
      ? `Based on this family app usage data, generate ONE warm, specific observation comment about this family's habits or patterns. Either praise them, point out a pattern, or encourage continuation. Keep it under 30 words. Data: ${dataStr}`
      : `以下のデータを元に、家族の習慣や傾向について温かく具体的な観察コメントを1文で生成してください。褒めるか、パターンを指摘するか、継続を称えるかのどれか。30文字以内。データ: ${dataStr}`;

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 80,
      temperature: 0.8,
    });

    const comment = completion.choices?.[0]?.message?.content?.trim() || null;
    return res.status(200).json({ success: true, comment });
  } catch (e) {
    console.error('[family-insight] error:', e?.message);
    return res.status(200).json({ success: false, comment: null, reason: e?.message });
  }
}
