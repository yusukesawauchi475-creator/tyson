import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';


function mask(s) {
  if (!s || typeof s !== 'string') return '(empty)';
  const t = s.replace(/\\n/g, '').trim();
  if (!t.length) return '(empty)';
  if (t.length <= 12) return '***';
  return `${t.slice(0, 8)}...${t.slice(-4)}`;
}

function getEnv(key) {
  let v = process.env[key];
  if (v == null && key.startsWith('VITE_')) v = process.env[key.replace(/^VITE_/, '')];
  if (v == null && !key.startsWith('VITE_')) v = process.env['VITE_' + key];
  return typeof v === 'string' ? v.replace(/\\n/g, '').trim() : (v ? String(v) : '');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const projectId = getEnv('VITE_FIREBASE_PROJECT_ID') || getEnv('FIREBASE_PROJECT_ID');
  const storageBucket = getEnv('VITE_FIREBASE_STORAGE_BUCKET') || getEnv('FIREBASE_STORAGE_BUCKET');
  const apiKey = getEnv('VITE_FIREBASE_API_KEY') || getEnv('FIREBASE_API_KEY');
  const appId = getEnv('VITE_FIREBASE_APP_ID') || getEnv('FIREBASE_APP_ID');
  const apiKeyPrefix = mask(apiKey);
  const cfg = {
    apiKey,
    authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN') || getEnv('FIREBASE_AUTH_DOMAIN'),
    projectId,
    storageBucket,
    messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || getEnv('FIREBASE_MESSAGING_SENDER_ID'),
    appId,
    measurementId: getEnv('VITE_FIREBASE_MEASUREMENT_ID') || getEnv('FIREBASE_MEASUREMENT_ID'),
  };

  if (!projectId || !storageBucket || !apiKey || !appId) {
    return res.status(503).json({
      success: false,
      error: 'Firebase env missing',
      configCheck: { projectId: projectId || null, storageBucket: storageBucket || null, apiKeyPrefix, appId: appId || null },
    });
  }

  try {
    const app = initializeApp(cfg);
    const storage = getStorage(app);
    const path = `test/proof_${Date.now()}.txt`;
    const proof1 = req.query?.proof === '1' || req.query?.proof === 'true';
    const body = proof1 ? 'x' : `tyson-3341f storage upload proof ${new Date().toISOString()}\n`;
    const bytes = new Uint8Array(Buffer.from(body, 'utf8'));

    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, bytes);
    const url = await getDownloadURL(storageRef);

    return res.status(200).json({
      success: true,
      url,
      path,
      bytesWritten: bytes.length,
      configCheck: { projectId, storageBucket, apiKeyPrefix, appId },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: err.message || String(err),
      code: err.code || null,
      configCheck: { projectId, storageBucket, apiKeyPrefix, appId },
      timestamp: new Date().toISOString(),
    });
  }
}
