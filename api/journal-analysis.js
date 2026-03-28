/**
 * POST /api/journal-analysis
 * OCR + AI analysis for journal_image photos using OpenAI Vision API.
 * Auth: X-Admin-Password header (admin only).
 *
 * Single mode:  { pairId, dateKey, role? }
 * Batch mode:   { pairId, mode: "batch" }  — scans ALL dates for the pairId
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

const OCR_PROMPT = 'この画像に含まれるすべてのテキストを正確に書き起こしてください。手書きの文字も含めて、できるだけ忠実にテキスト化してください。テキストが見つからない場合は「テキストなし」と返してください。画像の内容も簡潔に1-2文で説明してください。\n\n出力形式:\n【OCRテキスト】\n(抽出したテキスト)\n\n【画像の説明】\n(簡潔な説明)';

async function ocrOneImage(apiKey, journalImg, docRef, existingData, role) {
  const fileRef = storageBucket.file(journalImg.storagePath);
  const [exists] = await fileRef.exists();
  if (!exists) {
    return { role, success: false, error: 'Image file not found in Storage', storagePath: journalImg.storagePath };
  }

  const [buffer] = await fileRef.download();
  const base64 = buffer.toString('base64');
  const contentType = journalImg.contentType || 'image/jpeg';
  const dataUrl = `data:${contentType};base64,${base64}`;

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: OCR_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ],
    max_tokens: 1000,
    temperature: 0.2,
  });

  const ocrText = completion.choices?.[0]?.message?.content?.trim() || '';

  await docRef.set({
    journal_ocr: {
      ...(existingData.journal_ocr || {}),
      [role]: {
        text: ocrText,
        storagePath: journalImg.storagePath,
        analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
        model: 'gpt-4o-mini',
      },
    },
  }, { merge: true });

  return { role, success: true, text: ocrText, storagePath: journalImg.storagePath };
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

    // Batch mode: scan all dates
    if (body.mode === 'batch') {
      const monthRefs = await firestore.collection('journal').doc(pairId).collection('months').listDocuments();
      const allResults = [];
      let processed = 0, skipped = 0;

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

            // Skip if already OCR'd (unless force=true)
            if (!body.force && data.journal_ocr?.[role]?.text) {
              allResults.push({
                dateKey, role, storagePath: journalImg.storagePath,
                status: 'already_done', text: data.journal_ocr[role].text,
              });
              skipped++;
              continue;
            }

            try {
              const result = await ocrOneImage(apiKey, journalImg, dayRef, data, role);
              allResults.push({ dateKey, ...result, status: result.success ? 'ok' : 'error' });
              if (result.success) processed++;
            } catch (err) {
              allResults.push({ dateKey, role, storagePath: journalImg.storagePath, status: 'error', error: err?.message });
            }
          }
        }
      }

      return res.status(200).json({
        success: true, pairId,
        summary: { total: allResults.length, processed, skipped },
        results: allResults.sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
      });
    }

    // Single mode
    const dateKey = (body.dateKey || '').trim();
    const roles = body.role ? [body.role] : ['parent', 'child'];
    if (!dateKey) return res.status(400).json({ success: false, error: 'dateKey required (or use mode:"batch")' });

    const monthKey = dateKey.slice(0, 7);
    const docRef = firestore.collection('journal').doc(pairId).collection('months').doc(monthKey).collection('days').doc(dateKey);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'No journal data for this date' });

    const data = snap.data();
    const results = [];

    for (const role of roles) {
      const rd = data.roleData?.[role];
      if (!rd) continue;
      const journalImg = rd.journal_image;
      if (!journalImg || typeof journalImg.storagePath !== 'string') continue;

      const result = await ocrOneImage(apiKey, journalImg, docRef, data, role);
      results.push(result);
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
