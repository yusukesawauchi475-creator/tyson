import admin from 'firebase-admin';
import { parseFirebaseServiceAccount } from './lib/parseFirebaseServiceAccount.js';
import { getEffectiveRole } from '../src/lib/voiceRole.js';
import { isPairAllowed } from './lib/pair-access.js';

let adminApp;
let firestore;
let adminInitError = null;

function initFirebaseAdmin() {
  if (adminInitError) throw adminInitError;
  if (adminApp) return;

  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    const parsedResult = parseFirebaseServiceAccount(raw);

    if (!parsedResult.success) {
      const e = parsedResult.error;
      const err = new Error(e.message);
      err.code = e.code;
      throw err;
    }

    const parsed = parsedResult.data;
    const projectId = parsed.project_id ?? process.env.VITE_FIREBASE_PROJECT_ID;
    const envBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '';
    const storageBucketName = envBucket || `${projectId}.firebasestorage.app`;

    if (admin.apps && admin.apps.length > 0) {
      adminApp = admin.app();
      firestore = admin.firestore();
      return;
    }

    adminApp = admin.initializeApp({
      credential: admin.credential.cert(parsed),
      storageBucket: storageBucketName,
    });

    firestore = admin.firestore();
  } catch (e) {
    adminInitError = e;
    throw e;
  }
}

function genRequestId() {
  return 'REQ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getDateKeyNY() {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const get = (t) => parts.find((p) => p.type === t)?.value;
    const y = get('year'), m = get('month'), d = get('day');
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {}
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function verifyIdToken(idToken) {
  initFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(idToken);
  return { uid: decoded.uid };
}

/** YYYY-MM-DD の前日を返す */
function getPrevDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  const py = date.getUTCFullYear();
  const pm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(date.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

/** YYYY-MM-DD の翌日を返す */
function getNextDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  const ny = date.getUTCFullYear();
  const nm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(date.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/**
 * pair_mediaのFirestoreデータからparent・child両方がuploadした日を集計し、
 * 今日から遡って連続日数を計算する。
 */
async function calculateStreakFromUploads(pairId) {
  initFirebaseAdmin();
  const daysSnap = await firestore.collection('pair_media').doc(pairId).collection('days').get();

  // Phase I Bug 2 fix: effective role aware (correctedRole/roleAtUpload 反映)
  // 段階10-a immutable correction で audioPath[] item に correctedRole 追記される。
  // streak は raw な data.parent/data.child の存在ではなく、各 item の effective role
  // (correctedRole ?? roleAtUpload ?? slot-side) で「実効的に両 role の voice がある日」を判定する。
  const computeEffectiveSides = (data) => {
    let hasEffectiveParent = false;
    let hasEffectiveChild = false;
    const visit = (items, defaultSide) => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        const role = getEffectiveRole(item, defaultSide);
        if (role === 'parent') hasEffectiveParent = true;
        else if (role === 'child') hasEffectiveChild = true;
        if (hasEffectiveParent && hasEffectiveChild) return;
      }
    };
    visit(data?.parent?.audioPath, 'parent');
    if (!(hasEffectiveParent && hasEffectiveChild)) {
      visit(data?.child?.audioPath, 'child');
    }
    // legacy record (audioPath 配列なし、role slot に latestAudioPath 等のみの旧 schema)
    // への graceful fallback: data.parent / data.child の存在で role 有とみなす
    if (!hasEffectiveParent && data?.parent && !Array.isArray(data?.parent?.audioPath)) {
      hasEffectiveParent = true;
    }
    if (!hasEffectiveChild && data?.child && !Array.isArray(data?.child?.audioPath)) {
      hasEffectiveChild = true;
    }
    return { hasEffectiveParent, hasEffectiveChild };
  };

  // 各 dateKey の effective sides を Map に集約 (隣接日 OR 判定で参照)
  const dateKeyToSides = new Map();
  daysSnap.forEach(doc => {
    dateKeyToSides.set(doc.id, computeEffectiveSides(doc.data()));
  });

  // Phase I Bug 2-fix (Boss 判断 option C-fast 暫定): N=2 broader 判定
  // bothDay = 「同 dateKey で両 role 揃う」OR「同 dateKey で片方 + 隣接日 (前日/翌日) に他 role」
  //
  // timezone 不整合の暫定対処:
  // Yusuke (NY、UTC-4) と mom (JST、UTC+9) は 13h 差のため、mom の朝 JST upload は前日 NY-dateKey に乗る。
  // 同 NY-dateKey に揃いにくい構造のため、隣接日 OR で「両 role の voice が ±1 日以内に交換された日」
  // として streak 判定する。
  //
  // TODO(Phase X-3): pairTimezone 必須化で本実装に置き換え予定
  //   - pair_numbers に pairTimezone field 追加
  //   - 各 user の upload 時に pairTimezone の dateKey で記録
  //   - streak 計算は同 dateKey 厳格判定に戻す (N=1)
  //   - 本 broader 判定は legacy record の graceful fallback として残す
  const bothDays = [];
  for (const [dateKey, sides] of dateKeyToSides) {
    // 同 dateKey で両 role 揃ってる場合 (基本ケース)
    if (sides.hasEffectiveParent && sides.hasEffectiveChild) {
      bothDays.push(dateKey);
      continue;
    }
    // 同 dateKey で片方のみ → 隣接日 (前日/翌日) で他 role を探す (broader 判定)
    const prevSides = dateKeyToSides.get(getPrevDateKey(dateKey));
    const nextSides = dateKeyToSides.get(getNextDateKey(dateKey));
    if (sides.hasEffectiveParent && !sides.hasEffectiveChild) {
      if ((prevSides && prevSides.hasEffectiveChild) || (nextSides && nextSides.hasEffectiveChild)) {
        bothDays.push(dateKey);
        continue;
      }
    }
    if (!sides.hasEffectiveParent && sides.hasEffectiveChild) {
      if ((prevSides && prevSides.hasEffectiveParent) || (nextSides && nextSides.hasEffectiveParent)) {
        bothDays.push(dateKey);
        continue;
      }
    }
  }

  // 全日付（parent or childいずれかが存在する日）を収集してfirstDateKeyを算出
  const anyDays = [];
  daysSnap.forEach(doc => {
    const data = doc.data();
    if (data.parent || data.child) anyDays.push(doc.id);
  });
  anyDays.sort((a, b) => a.localeCompare(b));
  const firstDateKey = anyDays.length > 0 ? anyDays[0] : null;

  if (bothDays.length === 0) return { count: 0, lastDateKey: null, firstDateKey };

  // 日付降順ソート
  bothDays.sort((a, b) => b.localeCompare(a));

  const today = getDateKeyNY();

  // 今日または昨日から開始して連続日数をカウント
  let count = 0;
  let checkDate = today;

  // 今日がbothDaysに含まれていなければ昨日から開始
  if (!bothDays.includes(today)) {
    checkDate = getPrevDateKey(today);
    if (!bothDays.includes(checkDate)) {
      // 昨日もなければstreak=0
      return { count: 0, lastDateKey: bothDays[0] };
    }
  }

  // checkDateから遡ってカウント
  while (bothDays.includes(checkDate)) {
    count++;
    checkDate = getPrevDateKey(checkDate);
  }

  return { count, lastDateKey: bothDays[0], firstDateKey };
}

export default async function handler(req, res) {
  const requestId = genRequestId();

  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    return res.status(401).json({ success: false, error: 'Unauthorized', requestId });
  }

  let uid;
  try {
    ({ uid } = await verifyIdToken(idToken));
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token', requestId });
  }

  if (req.method === 'GET') {
    const { pairId } = req.query;
    if (!pairId) {
      return res.status(400).json({ success: false, error: 'pairId is required', requestId });
    }

    try {
      initFirebaseAdmin();
      if (!(await isPairAllowed(uid, pairId, firestore))) {
        return res.status(403).json({ success: false, error: 'Not a pair member', requestId });
      }
      const streak = await calculateStreakFromUploads(pairId);
      return res.status(200).json({
        success: true,
        count: streak.count,
        lastDateKey: streak.lastDateKey,
        firstDateKey: streak.firstDateKey,
        requestId,
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message, requestId });
    }
  }

  if (req.method === 'POST') {
    const { pairId } = req.body || {};
    if (!pairId) {
      return res.status(400).json({ success: false, error: 'pairId is required', requestId });
    }

    try {
      initFirebaseAdmin();
      if (!(await isPairAllowed(uid, pairId, firestore))) {
        return res.status(403).json({ success: false, error: 'Not a pair member', requestId });
      }
      // Recalculate streak from actual upload data
      const streak = await calculateStreakFromUploads(pairId);

      const ref = firestore.doc(`pairs/${pairId}/meta/streak`);
      const data = { count: streak.count, lastDateKey: streak.lastDateKey, firstDateKey: streak.firstDateKey, updatedAt: Date.now() };
      await ref.set(data);

      return res.status(200).json({
        success: true,
        count: streak.count,
        lastDateKey: streak.lastDateKey,
        firstDateKey: streak.firstDateKey,
        requestId,
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message, requestId });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed', requestId });
}
