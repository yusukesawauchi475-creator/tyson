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

const AUTH_STATE_TIMEOUT_MS = 4000;
let authSelfHealRevision = 0;

export function logAuthSelfHealEvent(event, details = {}) {
  try {
    console.log('[AUTH_SELF_HEAL]', JSON.stringify({
      event,
      ts: new Date().toISOString(),
      ...details,
    }));
  } catch {
    console.log('[AUTH_SELF_HEAL]', event, details);
  }
}

export function getAuthSelfHealRevision() {
  return authSelfHealRevision;
}

async function waitForAuthState(timeoutMs = AUTH_STATE_TIMEOUT_MS) {
  if (typeof auth.authStateReady === 'function') {
    let timedOut = false;
    let timeoutId = null;
    await Promise.race([
      auth.authStateReady(),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          logAuthSelfHealEvent('auth_restore_timeout', { timeoutMs, hasCurrentUser: !!auth.currentUser });
          resolve(null);
        }, timeoutMs);
      }),
    ]);
    if (timeoutId) clearTimeout(timeoutId);
    if (auth.currentUser || timedOut) return auth.currentUser || null;
  }

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const done = (user) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(user || null);
    };
    const timer = setTimeout(() => {
      logAuthSelfHealEvent('auth_restore_timeout', { timeoutMs, hasCurrentUser: !!auth.currentUser });
      done(auth.currentUser || null);
    }, timeoutMs);
    unsubscribe = auth.onAuthStateChanged((user) => done(user));
  });
}

async function getUserToken(user, forceRefresh) {
  if (!user) return null;
  try {
    if (forceRefresh) {
      authSelfHealRevision += 1;
      logAuthSelfHealEvent('forceRefresh', { uidPrefix: user.uid?.slice(0, 6) || null });
    }
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

/** Anonymous認証して idToken を取得。API呼び出し用。未設定時は null */
export async function getIdTokenForApi() {
  if (!isFirebaseConfigured) return null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      let user = auth.currentUser;

      if (!user) {
        user = await waitForAuthState();
      }

      if (!user) {
        user = auth.currentUser;
      }

      if (!user) {
        authSelfHealRevision += 1;
        logAuthSelfHealEvent('reauth', { attempt });
        const result = await signInAnonymously(auth);
        user = result.user;
      }

      const cachedToken = await getUserToken(user, false);
      if (cachedToken) return cachedToken;

      const refreshedToken = await getUserToken(user, true);
      if (refreshedToken) return refreshedToken;

      const latestUser = auth.currentUser || await waitForAuthState(300);
      const latestToken = await getUserToken(latestUser, true);
      if (latestToken) return latestToken;
    } catch (e) {
      if (attempt === 1 && import.meta.env.DEV) console.warn('getIdTokenForApi failed:', e?.message);
    }
  }

  return null;
}

// 環境変数の検証結果をエクスポート
export const isFirebaseConfigured = missingEnvVars.length === 0;
