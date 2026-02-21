// 音声ファイルをMP3に変換して再アップロードするAPI
import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';

// Firebase設定
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || process.env.VITE_FIREBASE_MEASUREMENT_ID
};

// 注意: Vercel Serverless Functionsではffmpegを直接使用できないため、
// この実装は参考用です。実際の実装には外部サービス（Cloud Functions等）が必要です。

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audioURL, docId } = req.body || {};

    if (!audioURL || !docId) {
      return res.status(400).json({ error: 'audioURL and docId are required' });
    }

    // 音声ファイルをダウンロード
    const response = await fetch(audioURL);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // 注意: Vercel Serverless Functionsではffmpegを使用できないため、
    // 実際の実装には以下のいずれかが必要です：
    // 1. Firebase Cloud Functionsでffmpegを使用
    // 2. 外部の音声変換サービス（Cloudinary等）を使用
    // 3. クライアント側で録音時にMP3形式で保存

    // ここでは、クライアント側で録音形式を統一する方法を推奨します
    return res.status(200).json({
      success: true,
      message: 'Audio conversion requires Cloud Functions or external service'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
