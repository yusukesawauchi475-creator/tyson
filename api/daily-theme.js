/**
 * GET /api/daily-theme
 * Generate a personalized daily conversation topic using OpenAI.
 * Query: ?lang=ja|en&pairId=XXX
 */
import OpenAI from 'openai';
import admin from 'firebase-admin';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';

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

/** Fetch past topic history and photo patterns from Firestore */
async function getPersonalizationContext(pairId) {
  if (!pairId) return null;
  try {
    initFirebaseAdmin();

    // Get past topics from analysis-comment collection (stores topic per day)
    const topicHistory = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    // Check pair_media for recent days to find topics in metadata
    const mediaDays = await firestore.collection('pair_media').doc(pairId).collection('days')
      .orderBy(admin.firestore.FieldPath.documentId(), 'desc')
      .limit(30)
      .get();

    let parentVoiceDays = 0, childVoiceDays = 0, photoDays = 0;
    mediaDays.forEach(doc => {
      const data = doc.data();
      if (data.parent) parentVoiceDays++;
      if (data.child) childVoiceDays++;
    });

    // Check journal for photo upload patterns
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

    for (const mk of [monthKey, prevMonthKey]) {
      try {
        const days = await firestore.collection('journal').doc(pairId).collection('months').doc(mk).collection('days').get();
        days.forEach(doc => {
          const rd = doc.data()?.roleData;
          if (rd?.parent?.generic_images?.length > 0 || rd?.child?.generic_images?.length > 0) photoDays++;
        });
      } catch {}
    }

    // Get past AI topics from localStorage cache keys stored in Firestore (if any)
    // Since we don't store topics in Firestore, we'll pass usage patterns instead

    return {
      parentVoiceDays,
      childVoiceDays,
      photoDays,
      totalDays: mediaDays.size,
    };
  } catch (e) {
    console.error('[daily-theme] context fetch error:', e?.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const lang = (req.query.lang || 'ja').trim();
  const pairId = (req.query.pairId || '').trim();
  const pastTopics = (req.query.pastTopics || '').trim();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ success: false, topic: null, reason: 'no_api_key' });
  }

  try {
    const openai = new OpenAI({ apiKey });

    // Get personalization context
    const ctx = pairId ? await getPersonalizationContext(pairId) : null;

    let contextStr = '';
    if (ctx) {
      contextStr += `\nこのペアの利用状況: 過去30日で親が${ctx.parentVoiceDays}日、子が${ctx.childVoiceDays}日音声を送信。写真は${ctx.photoDays}日。`;
    }
    if (pastTopics) {
      contextStr += `\n過去のお題: ${pastTopics}。これらとは違う角度の質問にしてください。`;
    }

    const basePrompt = lang === 'en'
      ? 'Generate one daily voice exchange topic for a parent in Japan and a child living abroad. Focus on deep questions about memories, emotions, and family history, not surface-level daily life. Under 15 words. Return only the topic text.'
      : '日本に住む親と海外在住の子が毎日声を交換するアプリのお題を1つ生成してください。表面的な日常ではなく、記憶・感情・家族の歴史系の深掘りできる質問にしてください。20文字以内。お題のテキストだけ返してください。';

    const prompt = basePrompt + contextStr;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 60,
      temperature: 0.9,
    });

    const topic = completion.choices?.[0]?.message?.content?.trim() || null;
    return res.status(200).json({ success: true, topic, lang });
  } catch (e) {
    console.error('[daily-theme] OpenAI error:', e?.message);
    return res.status(200).json({ success: false, topic: null, reason: e?.message });
  }
}
