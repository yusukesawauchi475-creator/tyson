/**
 * POST /api/journal-analysis
 * OCR + AI analysis for journal_image photos using OpenAI Vision API.
 * Auth: X-Admin-Password header (admin only).
 * Body: { pairId, dateKey, role? }
 *
 * Flow:
 * 1. Get journal_image storagePath from Firestore
 * 2. Download image from Firebase Storage
 * 3. Send to OpenAI Vision (gpt-4o-mini) for OCR/text extraction
 * 4. Save extracted text to Firestore journal_ocr field
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

  // Admin auth
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
    const dateKey = (body.dateKey || '').trim();
    const roles = body.role ? [body.role] : ['parent', 'child'];

    if (!pairId || !dateKey) {
      return res.status(400).json({ success: false, error: 'pairId and dateKey required' });
    }

    const monthKey = dateKey.slice(0, 7);
    const docRef = firestore.collection('journal').doc(pairId).collection('months').doc(monthKey).collection('days').doc(dateKey);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: 'No journal data for this date' });
    }

    const data = snap.data();
    const results = [];

    for (const role of roles) {
      const rd = data.roleData?.[role];
      if (!rd) continue;

      const journalImg = rd.journal_image;
      if (!journalImg || typeof journalImg.storagePath !== 'string') continue;

      // Download image from Storage
      const fileRef = storageBucket.file(journalImg.storagePath);
      const [exists] = await fileRef.exists();
      if (!exists) {
        results.push({ role, success: false, error: 'Image file not found in Storage' });
        continue;
      }

      const [buffer] = await fileRef.download();
      const base64 = buffer.toString('base64');
      const contentType = journalImg.contentType || 'image/jpeg';
      const dataUrl = `data:${contentType};base64,${base64}`;

      // OpenAI Vision OCR
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

      const ocrResult = completion.choices?.[0]?.message?.content?.trim() || '';

      // Save to Firestore
      await docRef.set({
        journal_ocr: {
          ...(data.journal_ocr || {}),
          [role]: {
            text: ocrResult,
            storagePath: journalImg.storagePath,
            analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
            model: 'gpt-4o-mini',
          },
        },
      }, { merge: true });

      results.push({ role, success: true, text: ocrResult, storagePath: journalImg.storagePath });
    }

    if (results.length === 0) {
      return res.status(200).json({ success: false, error: 'No journal_image found for any role', pairId, dateKey });
    }

    return res.status(200).json({ success: true, pairId, dateKey, results });
  } catch (e) {
    console.error('[journal-analysis] error:', e?.message);
    return res.status(500).json({ success: false, error: e?.message || 'Internal error' });
  }
}
