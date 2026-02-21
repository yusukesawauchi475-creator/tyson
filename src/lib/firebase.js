import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

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

// DEV時: 未設定ならダミーで初期化（画面が開くように）。本番では必須
const isDev = import.meta.env.DEV;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (isDev ? 'dev-dummy' : ''),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (isDev ? 'dev-dummy.firebaseapp.com' : ''),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || (isDev ? 'dev-dummy' : ''),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || (isDev ? 'dev-dummy.firebasestorage.app' : ''),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || (isDev ? '0' : ''),
  appId: import.meta.env.VITE_FIREBASE_APP_ID || (isDev ? 'dev-dummy' : ''),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

if (isDev) {
  const fmt = (v) => {
    const s = String(v ?? '');
    if (!s) return '(empty)';
    const len = s.length;
    const head = s.slice(0, 8);
    return len <= 8 ? `${head} (len=${len})` : `${head}...(len=${len})`;
  };
  const apiKeyRaw = import.meta.env.VITE_FIREBASE_API_KEY;
  const apiKeyNote = apiKeyRaw === undefined || apiKeyRaw === null || String(apiKeyRaw).trim() === ''
    ? ' ← .env.local 読めてない可能性'
    : '';
  console.log('[FirebaseConfig]', {
    apiKey: fmt(firebaseConfig.apiKey) + apiKeyNote,
    authDomain: fmt(firebaseConfig.authDomain),
    projectId: fmt(firebaseConfig.projectId),
    storageBucket: fmt(firebaseConfig.storageBucket),
    messagingSenderId: fmt(firebaseConfig.messagingSenderId),
    appId: fmt(firebaseConfig.appId),
    measurementId: firebaseConfig.measurementId ? fmt(firebaseConfig.measurementId) : '(not set)',
  });
}

const app = initializeApp(firebaseConfig);
export { app };
export const storage = getStorage(app);
export const db = getFirestore(app);
export const auth = getAuth(app);

/** Anonymous認証して idToken を取得。API呼び出し用。未設定時は null */
export async function getIdTokenForApi() {
  if (!isFirebaseConfigured) return null;
  try {
    const user = auth.currentUser;
    if (user) return await user.getIdToken(true);
    const { user: signedIn } = await signInAnonymously(auth);
    return signedIn.getIdToken();
  } catch (e) {
    if (import.meta.env.DEV) console.warn('getIdTokenForApi failed:', e?.message);
    return null;
  }
}

// 環境変数の検証結果をエクスポート
export const isFirebaseConfigured = missingEnvVars.length === 0;
