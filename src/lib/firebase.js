import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

// 環境変数の完全マッピングと検証
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

// 環境変数の完全な検証（undefined, null, 空文字列をチェック）
const missingEnvVars = requiredEnvVars.filter(
  varName => {
    const value = import.meta.env[varName]
    const isMissing = value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
    if (isMissing) {
      console.error(`❌ 環境変数未設定: ${varName}`, { value, type: typeof value })
    }
    return isMissing
  }
);

// 環境変数が欠けている場合は警告を表示
if (missingEnvVars.length > 0) {
  // 警告をDOMに直接追加（Reactコンポーネントがマウントされる前に表示）
  const warningDiv = document.createElement('div');
  warningDiv.id = 'firebase-env-warning';
  warningDiv.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
    color: #ffffff;
    padding: 20px;
    font-size: 24px;
    font-weight: 700;
    text-align: center;
    z-index: 99999;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    border-bottom: 4px solid #ffffff;
  `;
  warningDiv.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto;">
      ⚠️ 環境設定を完了させてください
      <div style="font-size: 18px; margin-top: 10px; font-weight: 500;">
        以下の環境変数が設定されていません: ${missingEnvVars.join(', ')}
      </div>
      <div style="font-size: 16px; margin-top: 8px; opacity: 0.9;">
        アプリの一部機能が正常に動作しない可能性があります。Vercelの環境変数設定を確認してください。
      </div>
    </div>
  `;
  document.body.appendChild(warningDiv);
  
  // コンソールにも警告を出力
  console.error('❌ Firebase環境変数エラー:', {
    missing: missingEnvVars,
    allRequired: requiredEnvVars
  });
}

// Tyson専用環境（tyson-3341f）: フォールバック値なし（環境変数必須）
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);
export const db = getFirestore(app);

// 環境変数の検証結果をエクスポート
export const isFirebaseConfigured = missingEnvVars.length === 0;
