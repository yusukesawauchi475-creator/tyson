import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { ref, getDownloadURL } from 'firebase/storage';

// 環境変数を読み込む
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// CORS設定
app.use(cors());
app.use(express.json());

// Firebase設定（環境変数から読み込み、tyson-3341f専用）
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'tyson-3341f',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || 'tyson-3341f.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID
};

const firebaseApp = initializeApp(firebaseConfig);
const storage = getStorage(firebaseApp);

// OpenAI初期化
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Gemini初期化
const gemini = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Firebase Storageから音声ファイルをダウンロード
async function downloadAudioFromStorage(audioURL) {
  try {
    const response = await fetch(audioURL);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error downloading audio from Storage:', error);
    throw error;
  }
}

// Whisper APIで文字起こし
async function transcribeAudio(audioBuffer) {
  try {
    if (!openai) {
      throw new Error('OpenAI API key is not configured');
    }

    // OpenAI SDKを使用して文字起こし
    // Fileオブジェクトを作成（Node.js環境用）
    const { File } = await import('node:buffer');
    const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'ja',
    });

    return transcription.text;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw error;
  }
}

// LLMで分析
async function analyzeWithLLM(transcription, provider = 'openai') {
  const prompt = `あなたは「おかん」の息子です。以下の音声文字起こしテキストを分析して、3つの観点で評価してください。

文字起こしテキスト:
${transcription}

以下の3つの観点で分析し、それぞれ0-100のスコアと簡潔な理由を提供してください：

1. リスク管理能力: 喋り方の慎重さや論理性から判定（0-100点）
2. マイク・タイソン指数: 規律（Discipline）を感じる強気なメンタリティがあるか（0-100点）
3. 今日の元気度: 声のトーンや内容からポジティブ度を判定（0-100点）

さらに、息子（俺）からのユーモア溢れる一言アドバイスを生成してください。

以下のJSON形式で返答してください：
{
  "riskManagement": {
    "score": 数値,
    "reason": "理由"
  },
  "mikeTysonIndex": {
    "score": 数値,
    "reason": "理由"
  },
  "energyLevel": {
    "score": 数値,
    "reason": "理由"
  },
  "advice": "ユーモア溢れる一言アドバイス"
}`;

  try {
    if (provider === 'gemini' && gemini) {
      const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // JSONを抽出（```json で囲まれている場合がある）
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
      throw new Error('Failed to parse JSON from Gemini response');
    } else if (openai) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'あなたは「おかん」の息子です。ユーモア溢れる分析とアドバイスを提供してください。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      const content = completion.choices[0].message.content;
      return JSON.parse(content);
    } else {
      throw new Error('No AI provider configured');
    }
  } catch (error) {
    console.error('Error analyzing with LLM:', error);
    throw error;
  }
}

// /api/pair-media（Pair MVP: 録音→保存→再生）
let pairMediaHandler = null;
(async () => {
  try {
    pairMediaHandler = (await import('./api/pair-media.js')).default;
    app.all('/api/pair-media', (req, res) => {
      console.log('[OBSERVE] Express route /api/pair-media hit:', { method: req.method, url: req.url });
      return pairMediaHandler(req, res);
    });
  } catch (err) {
    console.error('[OBSERVE] Failed to load pair-media handler:', err?.message);
    app.all('/api/pair-media', (req, res) => {
      res.status(500).json({ success: false, error: 'pair-media handler not loaded', requestId: 'LOAD-ERR' });
    });
  }
})();

// /api/analyze エンドポイント
app.post('/api/analyze', async (req, res) => {
  try {
    const { audioURL, docId } = req.body;

    if (!audioURL) {
      return res.status(400).json({ error: 'audioURL is required' });
    }

    console.log('Starting analysis for:', audioURL);

    // 1. Firebase Storageから音声ファイルをダウンロード
    console.log('Downloading audio from Storage...');
    const audioBuffer = await downloadAudioFromStorage(audioURL);

    // 2. Whisper APIで文字起こし
    console.log('Transcribing audio with Whisper...');
    const transcription = await transcribeAudio(audioBuffer);
    console.log('Transcription:', transcription);

    // 3. LLMで分析
    console.log('Analyzing with LLM...');
    const provider = process.env.AI_PROVIDER || 'openai';
    const analysisResult = await analyzeWithLLM(transcription, provider);
    console.log('Analysis result:', analysisResult);

    // 4. 結果を返す
    res.json({
      success: true,
      transcription,
      analysis: analysisResult,
    });
  } catch (error) {
    console.error('Error in /api/analyze:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

process.on('beforeExit', (code) => {
  console.log('[OBSERVE] process.beforeExit:', code);
});

process.on('exit', (code) => {
  console.log('[OBSERVE] process.exit:', code);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('[OBSERVE] process.unhandledRejection:', reason?.name, reason?.message?.substring(0, 100));
});

process.on('uncaughtException', (error) => {
  console.log('[OBSERVE] process.uncaughtException:', error?.name, error?.message?.substring(0, 100));
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`AI Provider: ${process.env.AI_PROVIDER || 'openai'}`);
});

server.on('close', () => {
  console.log('[OBSERVE] server.close event fired');
});

server.on('error', (err) => {
  console.log('[OBSERVE] server.error:', err?.name, err?.message?.substring(0, 100));
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill existing process or use different port.`);
    process.exit(1);
  }
});
