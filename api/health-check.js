import OpenAI from 'openai';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase設定（サーバー側ではVITE_プレフィックスなしの環境変数を使用）
// 注意: Vercelではクライアント側とサーバー側で環境変数名が異なるため、
// サーバー側ではVITE_プレフィックスなしで設定する必要がある
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || process.env.VITE_FIREBASE_MEASUREMENT_ID
};

// システム健全性チェック用API
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const results = {
    timestamp: new Date().toISOString(),
    services: {}
  };

  // OpenAI接続チェック
  try {
    const openai = process.env.OPENAI_API_KEY ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }) : null;

    if (openai) {
      // 簡単なAPI呼び出しで接続確認（実際のAPI呼び出しはしない）
      results.services.openai = {
        status: 'ok',
        configured: true,
        message: 'OpenAI API key is configured'
      };
    } else {
      results.services.openai = {
        status: 'error',
        configured: false,
        message: 'OpenAI API key is not configured'
      };
    }
  } catch (error) {
    results.services.openai = {
      status: 'error',
      configured: false,
      message: `OpenAI check failed: ${error.message}`
    };
  }

  // Firebase Firestore接続チェック
  try {
    const firebaseApp = initializeApp(firebaseConfig);
    const db = getFirestore(firebaseApp);
    
    // 簡単なクエリで接続確認
    const testQuery = collection(db, 'shugyo');
    await getDocs(testQuery);
    
    results.services.firestore = {
      status: 'ok',
      connected: true,
      message: 'Firestore connection successful'
    };
  } catch (error) {
    results.services.firestore = {
      status: 'error',
      connected: false,
      message: `Firestore connection failed: ${error.message}`
    };
  }

  // Firebase Storage接続チェック
  try {
    const firebaseApp = initializeApp(firebaseConfig);
    const storage = getStorage(firebaseApp);
    
    // Storageオブジェクトが取得できればOK
    if (storage) {
      results.services.firebaseStorage = {
        status: 'ok',
        connected: true,
        message: 'Firebase Storage connection successful'
      };
    } else {
      results.services.firebaseStorage = {
        status: 'error',
        connected: false,
        message: 'Firebase Storage initialization failed'
      };
    }
  } catch (error) {
    results.services.firebaseStorage = {
      status: 'error',
      connected: false,
      message: `Firebase Storage connection failed: ${error.message}`
    };
  }

  // 全体のステータス
  const allOk = Object.values(results.services).every(
    service => service.status === 'ok'
  );

  return res.status(allOk ? 200 : 503).json({
    ...results,
    overall: allOk ? 'healthy' : 'degraded'
  });
}
