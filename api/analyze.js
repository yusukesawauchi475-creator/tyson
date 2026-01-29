import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const gemini = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

function toDetail(e) {
  return (e && e.stack) ? String(e.stack) : String(e);
}

function detailBrokenFields(broken) {
  const list = Array.isArray(broken) && broken.length ? broken.join(', ') : '不明';
  return `壊れている項目: ${list}`;
}

async function downloadAudioFromStorage(audioURL) {
  const response = await fetch(audioURL);
  if (!response.ok) throw new Error(`Failed to download audio: ${response.statusText}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
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
    return res.status(500).json({
      success: false,
      error: e.message || 'FIREBASE_SERVICE_ACCOUNT の設定に問題があります。',
      detail,
    });
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

  const { audioURL } = body;
  if (!audioURL) {
    return res.status(400).json({ error: 'audioURL is required' });
  }

  let audioBuffer;
  try {
    audioBuffer = await downloadAudioFromStorage(audioURL);
  } catch (e) {
    console.error('[/api/analyze] Storage download:', e);
    return res.status(500).json({
      success: false,
      error: `Storage download failed: ${e?.message ?? String(e)}`,
      detail: toDetail(e),
    });
  }

  let transcription;
  try {
    transcription = await transcribeAudio(audioBuffer);
  } catch (e) {
    console.error('[/api/analyze] Whisper transcribe:', e);
    return res.status(500).json({
      success: false,
      error: `Transcribe failed: ${e?.message ?? String(e)}`,
      detail: toDetail(e),
    });
  }

  let analysisResult;
  try {
    const provider = process.env.AI_PROVIDER || 'openai';
    analysisResult = await analyzeWithLLM(transcription, provider);
  } catch (e) {
    console.error('[/api/analyze] LLM analyze:', e);
    return res.status(500).json({
      success: false,
      error: `LLM analyze failed: ${e?.message ?? String(e)}`,
      detail: toDetail(e),
    });
  }

  return res.status(200).json({
    success: true,
    transcription,
    analysis: analysisResult,
  });
}
