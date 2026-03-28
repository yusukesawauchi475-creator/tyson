/**
 * POST /api/journal-analysis-batch
 * Batch OCR for ALL journal_images of a given pairId.
 * Auth: X-Admin-Password header.
 * Body: { pairId }
 * Returns all dates/roles with OCR results.
 */
import OpenAI from 'openai';
import admin from 'firebase-admin';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';

let adminApp;
let firestore;
let storageBucket;
let adminInitError = null;

function initFirebaseAdmin() {
  if (adminInitError) throw adminInitError;
  if (adminApp) return;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    const parsedResult = parseFirebaseServiceAccount(raw);
    if (!parsedResult.success) throw new Error(parsedResult.error?.message || 'Parse failed');
    const parsed = parsedResult.data;
    const projectId = parsed.project_id ?? process.env.VITE_FIREBASE_PROJECT_ID;
    const envBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '';
    const storageBucketName = envBucket || `${projectId}.firebasestorage.app`;
    if (admin.apps?.length > 0) {
      adminApp = admin.app();
      firestore = admin.firestore();
      storageBucket = admin.storage().bucket(storageBucketName);
      return;
    }
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(parsed),
      storageBucket: storageBucketName,
    });
    firestore = admin.firestore();
    storageBucket = admin.storage().bucket(storageBucketName);
  } catch (e) { adminInitError = e; throw e; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const provided = (req.headers['x-admin-password'] || '').trim();
  const validPasswords = [process.env.ADMIN_PASSWORD, process.env.VITE_RESET_SECRET].filter(Boolean);
  if (!provided || !validPasswords.includes(provided)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: 'OPENAI_API_KEY not configured' });

  try {
    initFirebaseAdmin();

    const body = req.body || {};
    const pairId = (body.pairId || '').trim();
    if (!pairId) return res.status(400).json({ success: false, error: 'pairId required' });

    // 1. Scan all months/days for this pairId
    const monthRefs = await firestore.collection('journal').doc(pairId).collection('months').listDocuments();
    const allResults = [];
    let processed = 0;
    let skipped = 0;

    for (const monthRef of monthRefs) {
      const dayRefs = await monthRef.collection('days').listDocuments();
      for (const dayRef of dayRefs) {
        const dateKey = dayRef.id;
        const snap = await dayRef.get();
        if (!snap.exists) continue;
        const data = snap.data();

        for (const role of ['parent', 'child']) {
          const rd = data.roleData?.[role];
          if (!rd) continue;
          const journalImg = rd.journal_image;
          if (!journalImg || typeof journalImg.storagePath !== 'string') continue;

          // Check if already OCR'd
          if (data.journal_ocr?.[role]?.text) {
            allResults.push({
              dateKey,
              role,
              storagePath: journalImg.storagePath,
              status: 'already_done',
              text: data.journal_ocr[role].text,
            });
            skipped++;
            continue;
          }

          // Download image
          const fileRef = storageBucket.file(journalImg.storagePath);
          const [exists] = await fileRef.exists();
          if (!exists) {
            allResults.push({ dateKey, role, storagePath: journalImg.storagePath, status: 'file_not_found', text: null });
            continue;
          }

          const [buffer] = await fileRef.download();
          const base64 = buffer.toString('base64');
          const contentType = journalImg.contentType || 'image/jpeg';
          const dataUrl = `data:${contentType};base64,${base64}`;

          // OCR via OpenAI Vision
          const openai = new OpenAI({ apiKey });
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'この画像に含まれるすべてのテキストを正確に書き起こしてください。手書きの文字も含めて、できるだけ忠実にテキスト化してください。テキストが見つからない場合は「テキストなし」と返してください。画像の内容も簡潔に1-2文で説明してください。\n\n出力形式:\n【OCRテキスト】\n(抽出したテキスト)\n\n【画像の説明】\n(簡潔な説明)',
                  },
                  {
                    type: 'image_url',
                    image_url: { url: dataUrl, detail: 'high' },
                  },
                ],
              },
            ],
            max_tokens: 1000,
            temperature: 0.2,
          });

          const ocrText = completion.choices?.[0]?.message?.content?.trim() || '';

          // Save to Firestore
          await dayRef.set({
            journal_ocr: {
              ...(data.journal_ocr || {}),
              [role]: {
                text: ocrText,
                storagePath: journalImg.storagePath,
                analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
                model: 'gpt-4o-mini',
              },
            },
          }, { merge: true });

          allResults.push({ dateKey, role, storagePath: journalImg.storagePath, status: 'ok', text: ocrText });
          processed++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      pairId,
      summary: { total: allResults.length, processed, skipped },
      results: allResults.sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    });
  } catch (e) {
    console.error('[journal-analysis-batch] error:', e?.message);
    return res.status(500).json({ success: false, error: e?.message || 'Internal error' });
  }
}
