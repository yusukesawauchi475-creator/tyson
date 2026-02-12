import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';
import admin from 'firebase-admin';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const gemini = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const EXPECTED_ENV_ANALYZE = ['FIREBASE_SERVICE_ACCOUNT', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'AI_PROVIDER'];

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
      const broken = e.brokenFields ? ` [壊れている項目: ${e.brokenFields.join(', ')}]` : '';
      const err = new Error(e.message + broken);
      err.code = e.code;
      err.vercelHint = e.vercelHint;
      adminInitError = err;
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

/** Verify idToken. Returns { uid } or null. */
async function verifyIdToken(idToken) {
  try {
    initFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    return { uid: decoded.uid };
  } catch (e) {
    return null;
  }
}

/** MVP: pairId=demo は誰でもアクセス可。後でinvite token方式に戻す */
function isPairAllowed(uid, pairId) {
  if (pairId === 'demo') return true;
  return true; // 暫定: 全許可
}

function toDetail(e) {
  return (e && e.stack) ? String(e.stack) : String(e);
}

function detailBrokenFields(broken) {
  const list = Array.isArray(broken) && broken.length ? broken.join(', ') : '不明';
  return `壊れている項目: ${list}`;
}

const STORAGE_HINT_403 =
  'Storage 403: Signed URL 期限切れの可能性。CORS 設定・Storage Rules（allow read）を確認してください。';

async function downloadAudioFromStorage(audioURL, fetchFn = typeof fetch !== 'undefined' ? fetch : null) {
  const doFetch = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) {
    return { ok: false, step: 'Storage download', subStep: 'connection', status: null, error: 'fetch unavailable', detail: 'fetch unavailable', hint: null };
  }
  let response;
  try {
    response = await doFetch(audioURL);
  } catch (e) {
    return {
      ok: false,
      step: 'Storage download',
      subStep: 'connection',
      status: null,
      error: (e && e.message) || String(e),
      detail: toDetail(e),
      hint: '音声URLへの接続に失敗しました。ネットワーク・URLを確認してください。',
    };
  }
  if (!response.ok) {
    const status = response.status;
    let subStep = 'dl';
    let hint = null;
    if (status === 401) {
      subStep = 'auth';
      hint = 'Storage 401: 認証エラー。Signed URL または Service Account を確認してください。';
    } else if (status === 403) {
      subStep = 'forbidden';
      hint = STORAGE_HINT_403;
    } else if (status === 404) {
      subStep = 'existence';
      hint = 'Storage 404: オブジェクトが存在しません。audioURL を確認してください。';
    }
    return {
      ok: false,
      step: 'Storage download',
      subStep,
      status,
      error: `Failed to download audio: ${response.status} ${response.statusText}`,
      detail: `audioURL fetch ${status} ${response.statusText}`,
      hint,
    };
  }
  try {
    const arrayBuffer = await response.arrayBuffer();
    return { ok: true, buffer: Buffer.from(arrayBuffer) };
  } catch (e) {
    return {
      ok: false,
      step: 'Storage download',
      subStep: 'dl',
      status: response.status,
      error: (e && e.message) || String(e),
      detail: toDetail(e),
      hint: 'レスポンスの読み込みに失敗しました。',
    };
  }
}

async function transcribeAudio(audioBuffer) {
  if (!openai) throw new Error('OpenAI API key is not configured');
  const { File } = await import('node:buffer');
  const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    language: 'ja',
  });
  return transcription.text;
}

async function analyzeWithLLM(transcription, provider) {
  const prompt = `あなたは「タイソン」- 世界最高峰のリスクマネジメント・コーチです。Wall Streetで培った鋭い洞察力と、ボクシングの規律（Discipline）を融合させた分析能力を持っています。

以下の音声文字起こしテキストを、多角的かつ医学的ではなく「日々の規律と活力」の観点から徹底的に分析してください。

文字起こしテキスト:
${transcription}

## 分析観点（多角的評価）

### 1. リスク管理能力（0-100点）
- **声のハリ**: 声の張りやトーンから、体調の安定性と集中力を判定
- **語彙のバリエーション**: 使用語彙の多様性から、認知機能の活性度を判定
- **論理性**: 話の流れや論理的一貫性から、判断力の鋭さを判定
- **慎重さ**: 言葉選びや表現から、リスクを察知する能力を判定

### 2. マイク・タイソン指数（規律・Discipline）（0-100点）
- **体調の変化**: 前回との比較で、声の質や話すスピードの変化を検出
- **メンタリティの強さ**: 困難に立ち向かう姿勢や、前向きな表現を判定
- **規律の維持**: 日々の習慣や継続性への言及から、規律の維持度を判定
- **活力の持続**: 話の長さや内容の充実度から、活力の持続力を判定

### 3. 今日の元気度（活力指数）（0-100点）
- **声のトーン**: 明るさ、暗さ、抑揚から、感情の状態を判定
- **ポジティブ度**: 前向きな表現や感謝の言葉から、精神的な健康度を判定
- **エネルギーレベル**: 話すスピードや勢いから、身体的エネルギーレベルを判定
- **意欲**: 未来への言及や目標への言及から、意欲の高さを判定

## 分析の深さ
- 表面的な評価ではなく、声の質、語彙の変化、話の流れを総合的に分析
- 医学的診断ではなく、「日々の規律と活力」に対する鋭いフィードバックを提供
- 前回との比較（可能な場合）や、長期的な傾向を考慮した評価

以下のJSON形式で返答してください：
{
  "riskManagement": {
    "score": 数値（0-100）,
    "reason": "声のハリ、語彙のバリエーション、論理性、慎重さを総合的に評価した理由"
  },
  "mikeTysonIndex": {
    "score": 数値（0-100）,
    "reason": "体調の変化、メンタリティの強さ、規律の維持、活力の持続を総合的に評価した理由"
  },
  "energyLevel": {
    "score": 数値（0-100）,
    "reason": "声のトーン、ポジティブ度、エネルギーレベル、意欲を総合的に評価した理由"
  },
  "advice": "世界最高峰のリスクマネジメント・コーチとして、日々の規律と活力を高めるための鋭いフィードバック（ユーモアを含む）"
}`;

  if (provider === 'gemini' && gemini) {
    const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    throw new Error('Failed to parse JSON from Gemini response');
  }
  if (openai) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'あなたは「タイソン」- 世界最高峰のリスクマネジメント・コーチです。Wall Streetで培った鋭い洞察力と、ボクシングの規律（Discipline）を融合させた分析能力を持っています。声の質、語彙の変化、話の流れを多角的に分析し、「日々の規律と活力」に対する鋭いフィードバックを提供してください。医学的診断ではなく、規律と活力の観点から評価します。' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });
    const content = completion.choices[0].message.content;
    return JSON.parse(content);
  }
  throw new Error('No AI provider configured');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 環境変数自律監視: FIREBASE_SERVICE_ACCOUNT 二重エスケープ対応パース。失敗時は detail で壊れ項目を返却
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const envParse = parseFirebaseServiceAccount(raw);
  if (!envParse.success) {
    const e = envParse.error;
    const detail = detailBrokenFields(e.brokenFields) + (e.message ? ` | ${e.message}` : '');
    console.error('[/api/analyze] FIREBASE_SERVICE_ACCOUNT パース失敗:', detail);
    const payload = {
      success: false,
      error: e.message || 'FIREBASE_SERVICE_ACCOUNT の設定に問題があります。',
      detail,
      expectedEnv: EXPECTED_ENV_ANALYZE,
    };
    if (e.vercelHint) payload.vercelHint = e.vercelHint;
    return res.status(500).json(payload);
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    console.error('[/api/analyze] body parse:', e);
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON body',
      detail: toDetail(e),
    });
  }

  // 認証チェック
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const authResult = await verifyIdToken(idToken);
  
  if (!authResult) {
    return res.status(200).json({ success: false, error: 'auth_failed' });
  }

  const { audioURL, pairId, dateKey, role, sourceVersion: bodySourceVersion, version } = body;

  let audioBuffer;
  let sourceVersion;

  // 新方式: pairId/dateKey/role から音声を取得
  if (pairId && dateKey && role) {
    if (role !== 'parent' && role !== 'child') {
      return res.status(200).json({ success: false, error: 'invalid_role' });
    }

    if (!isPairAllowed(authResult.uid, pairId)) {
      return res.status(200).json({ success: false, error: 'pair_not_allowed' });
    }

    // sourceVersionがbodyに含まれているかチェック
    if (!bodySourceVersion && !version) {
      return res.status(200).json({ success: false, error: 'missing_source_version' });
    }

    try {
      initFirebaseAdmin();
      
      // Firestoreから音声パスを取得
      const metaRef = firestore.collection('pair_media').doc(pairId).collection('days').doc(dateKey);
      const metaSnap = await metaRef.get();
      
      if (!metaSnap.exists) {
        return res.status(200).json({ success: false, error: 'no_audio_found' });
      }

      const meta = metaSnap.data();
      const roleData = meta?.[role];
      
      if (!roleData || !roleData.audioPath) {
        return res.status(200).json({ success: false, error: 'no_audio_for_role' });
      }

      const audioPath = roleData.audioPath;
      // bodyから送られてきたsourceVersionを優先、なければFirestoreから取得
      sourceVersion = bodySourceVersion || version || roleData.version || roleData.uploadedAt?.toMillis?.() || Date.now();

      // 解析開始時にaiStatusを'running'に設定（sourceVersionガード付き）
      const docPath = `pair_media/${pairId}/days/${dateKey}/analysis/${role}`;
      const docRef = firestore.doc(docPath);
      
      // 既存のsourceVersionをチェック（古い解析が走っている可能性）
      const currentDoc = await docRef.get();
      const currentData = currentDoc.data();
      const currentSourceVersion = currentData?.sourceVersion;
      
      // 既存のsourceVersionが現在のversionと異なる場合は、古い解析なので上書きしない
      if (currentSourceVersion && currentSourceVersion !== sourceVersion) {
        console.log('[OBSERVE] analyze: existing sourceVersion differs, skipping start', { currentSourceVersion, sourceVersion });
        return res.status(200).json({ success: false, error: 'source_version_mismatch_on_start' });
      }
      
      await docRef.set({
        aiStatus: 'running',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        aiUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        sourceVersion,
      }, { merge: true });

      // Storageからダウンロード
      const fileRef = storageBucket.file(audioPath);
      const [contents] = await fileRef.download();
      audioBuffer = contents;

      console.log('[OBSERVE] analyze: audio downloaded from Storage', { pairId, dateKey, role, audioPath, sourceVersion });
    } catch (e) {
      console.error('[/api/analyze] Storage download error:', e);
      
      // エラー状態をFirestoreに保存（sourceVersionは既に取得済み）
      if (sourceVersion) {
        try {
          const docPath = `pair_media/${pairId}/days/${dateKey}/analysis/${role}`;
          const docRef = firestore.doc(docPath);
          await docRef.set({
            aiStatus: 'error',
            errorCode: 'storage_download_failed',
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            aiUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            sourceVersion,
          }, { merge: true });
        } catch (writeErr) {
          console.error('[/api/analyze] Firestore error write failed:', writeErr);
        }
      }
      
      return res.status(200).json({ success: false, error: 'storage_download_failed', detail: toDetail(e) });
    }
  } else if (audioURL) {
    // 旧方式: audioURL から取得（後方互換性）
    const downloadResult = await downloadAudioFromStorage(audioURL, undefined);
    if (!downloadResult.ok) {
      console.error('[/api/analyze] Storage download:', downloadResult.step, downloadResult.subStep, downloadResult.status, downloadResult.error);
      const payload = {
        success: false,
        step: downloadResult.step,
        subStep: downloadResult.subStep,
        status: downloadResult.status,
        error: downloadResult.error,
        detail: downloadResult.detail,
        expectedEnv: EXPECTED_ENV_ANALYZE,
      };
      if (downloadResult.hint) payload.hint = downloadResult.hint;
      payload.userAction = '権限設定を確認してください。Firebase Storage の CORS 設定および Storage Rules を確認し、gsutil cors set cors.json gs://BUCKET を実行してください。';
      return res.status(downloadResult.status === 403 ? 403 : 500).json(payload);
    }
    audioBuffer = downloadResult.buffer;
    sourceVersion = Date.now();
  } else {
    return res.status(200).json({ success: false, error: 'audioURL or pairId/dateKey/role is required' });
  }

  let transcription;
  try {
    transcription = await transcribeAudio(audioBuffer);
  } catch (e) {
    console.error('[/api/analyze] Whisper transcribe:', e);
    return res.status(500).json({
      success: false,
      step: 'Transcribe',
      error: `Transcribe failed: ${e?.message ?? String(e)}`,
      detail: toDetail(e),
      expectedEnv: EXPECTED_ENV_ANALYZE,
    });
  }

  let analysisResult;
  try {
    const provider = process.env.AI_PROVIDER || 'openai';
    analysisResult = await analyzeWithLLM(transcription, provider);
  } catch (e) {
    console.error('[/api/analyze] LLM analyze:', e);
    
    // pairId/dateKey/role 方式の場合はエラー状態をFirestoreに保存
    if (pairId && dateKey && role) {
      try {
        initFirebaseAdmin();
        const docPath = `pair_media/${pairId}/days/${dateKey}/analysis/${role}`;
        const docRef = firestore.doc(docPath);
        
        // 書き込み前にsourceVersionを再チェック（古い音声の結果を上書きしない）
        const currentDoc = await docRef.get();
        const currentData = currentDoc.data();
        const currentSourceVersion = currentData?.sourceVersion;
        
        if (currentSourceVersion && currentSourceVersion !== sourceVersion) {
          console.log('[OBSERVE] analyze: sourceVersion mismatch, skipping write', { currentSourceVersion, sourceVersion });
          return res.status(200).json({ success: false, error: 'source_version_mismatch' });
        }
        
        await docRef.set({
          aiStatus: 'error',
          errorCode: 'llm_analyze_failed',
          finishedAt: admin.firestore.FieldValue.serverTimestamp(),
          aiUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          sourceVersion,
        }, { merge: true });
      } catch (writeErr) {
        console.error('[/api/analyze] Firestore error write failed:', writeErr);
      }
    }
    
    return res.status(500).json({
      success: false,
      step: 'LLM analyze',
      error: `LLM analyze failed: ${e?.message ?? String(e)}`,
      detail: toDetail(e),
      expectedEnv: EXPECTED_ENV_ANALYZE,
    });
  }

  // pairId/dateKey/role 方式の場合はFirestoreに保存
  if (pairId && dateKey && role) {
    try {
      initFirebaseAdmin();
      const docPath = `pair_media/${pairId}/days/${dateKey}/analysis/${role}`;
      const docRef = firestore.doc(docPath);
      
      // 書き込み前にsourceVersionを再チェック（古い音声の結果を上書きしない）
      const currentDoc = await docRef.get();
      const currentData = currentDoc.data();
      const currentSourceVersion = currentData?.sourceVersion;
      
      if (currentSourceVersion && currentSourceVersion !== sourceVersion) {
        console.log('[OBSERVE] analyze: sourceVersion mismatch, skipping write', { currentSourceVersion, sourceVersion });
        return res.status(200).json({ success: false, error: 'source_version_mismatch' });
      }
      
      // aiTextを2行に整形（1行目=要約、2行目=秒数は既存のdurationSecから取得）
      const existingDurationSec = currentData?.durationSec || null;
      const durationLine = (existingDurationSec && existingDurationSec >= 5 && existingDurationSec <= 6000)
        ? `${existingDurationSec}秒残せました。`
        : '残せました。';
      
      // adviceを要約として使用（最大60文字程度）
      const summary = analysisResult.advice ? analysisResult.advice.substring(0, 60) : '記録ありがとうございます。';
      const aiText = `${summary}\n${durationLine}`;
      
      await docRef.set({
        aiStatus: 'done',
        aiText,
        transcript: transcription.substring(0, 200), // 短く
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        aiUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        sourceVersion,
      }, { merge: true });
      
      console.log('[OBSERVE] analyze: saved to Firestore', { pairId, dateKey, role, sourceVersion });
    } catch (writeErr) {
      console.error('[/api/analyze] Firestore write failed:', writeErr);
      // Firestore書き込み失敗でも解析結果は返す
    }
  }

  return res.status(200).json({
    success: true,
    transcription,
    analysis: analysisResult,
  });
}

export { downloadAudioFromStorage };
