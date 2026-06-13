import admin from 'firebase-admin';
import {
  parseFirebaseServiceAccount,
  CODE_PARSE_ERROR,
  CODE_EMPTY,
} from './lib/parseFirebaseServiceAccount.js';
import { isTysonOnlyBlocked, isPairAllowed } from './lib/pair-access.js';

let adminApp;
let firestore;
let storageBucket;
let adminInitError = null;

function initFirebaseAdmin() {
  if (adminInitError) throw adminInitError;
  if (adminApp) return;

  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    const parsedResult = parseFirebaseServiceAccount(raw);

    if (!parsedResult.success) {
      const e = parsedResult.error;
      const broken = e.brokenFields ? ` [壊れている項目: ${e.brokenFields.join(', ')}]` : '';
      const err = new Error(e.message + broken);
      err.code = e.code;
      err.vercelHint = e.vercelHint;
      throw err;
    }

    const parsed = parsedResult.data;
    const projectId = parsed.project_id ?? process.env.VITE_FIREBASE_PROJECT_ID;
    const envBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '';
    const storageBucketName = envBucket || `${projectId}.firebasestorage.app`;
    if (!storageBucketName) throw new Error('FATAL: storageBucketName is empty');

    // 既存appがある場合も明示的なbucket名を指定（streak.js等がstorageBucket未設定で初期化した場合のfallbackバグを回避）
    if (admin.apps && admin.apps.length > 0) {
      adminApp = admin.app();
      firestore = admin.firestore();
      storageBucket = admin.storage().bucket(storageBucketName);
      return;
    }

    adminApp = admin.initializeApp({
      credential: admin.credential.cert(parsed),
      storageBucket: storageBucketName,
    });

    firestore = admin.firestore();
    storageBucket = admin.storage().bucket(storageBucketName);
  } catch (e) {
    adminInitError = e;
    console.error('[INIT ERROR]', e.message, e.stack);
    throw e;
  }
}

/** @returns {string} */
function genRequestId() {
  return 'REQ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** NY時間（America/New_York）で YYYY-MM-DD。server側正規化用。 */
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

/** NY時間の HHMM (4桁、ゼロ埋め)。複数録音保存用のファイル名サフィックス。 */
function getHHMMNY() {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const h = get('hour'), m = get('minute');
    if (h && m) return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;
  } catch {}
  return String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
}

/** NY時間で昨日の YYYY-MM-DD */
function getYesterdayKeyNY() {
  const yesterday = new Date(Date.now() - 86400000);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(yesterday);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const y = get('year'), m = get('month'), d = get('day');
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {}
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, '0');
  const d = String(yesterday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** OBSERVEログ1行JSON（秘密情報は含めない） */
function logObserve(obj) {
  console.log('[OBSERVE]', JSON.stringify(obj));
}

/** Verify idToken. Returns { uid } or throws. */
async function verifyIdToken(idToken) {
  initFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(idToken);
  return { uid: decoded.uid };
}

/**
 * 段階10-a: User-Agent から device 種別を簡易推定（audit / 訂正時の diagnostic 用）。
 * 返り値: 'ios-safari' / 'android-chrome' / 'pc-chrome' / 'unknown'
 */
function deriveDeviceHint(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return 'unknown';
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios-safari';
  if (/Android/.test(userAgent)) return 'android-chrome';
  if (/Windows|Macintosh|Linux/.test(userAgent)) return 'pc-chrome';
  return 'unknown';
}

/**
 * Phase X-3-A: audioPath[] 必須 metadata validation
 *
 * core-philosophy.md 軸 1 (upstream format 統一) + 軸 3 (物理的に違反生成不能) を
 * data layer で enforce. write 時に必須 field の値が物理的に揃っていることを保証し、
 * 欠落は code bug（default fill 失敗）として 500 reject + log。
 *
 * 必須 field:
 *   - uploadedBy:    auth uid（認証で必ず存在）
 *   - mimeType:      audio MIME type（POST handler で `|| 'audio/mp4'` default fill）
 *   - deviceHint:    UA 由来 hint（deriveDeviceHint で常に non-empty string 返却）
 *   - roleAtUpload:  'parent' | 'child'（POST handler L673 で validation 済）
 *
 * graceful fallback は read 側のみ維持（既存 record 前方互換、getEffectiveRole 等）。
 *
 * TODO(Phase X-3-B): pairTimezone 必須化を本 validation に追加予定
 *   - pairTimezone field を必須 list に追加
 *   - pair_numbers の pairTimezone から resolve した値を newEntry に含める
 *   - 既存 record の graceful fallback は read 側で維持
 */
function validateAudioPathItem(item) {
  const requiredFields = ['uploadedBy', 'mimeType', 'deviceHint', 'roleAtUpload'];
  const missing = requiredFields.filter((f) => !item || !item[f]);
  if (missing.length > 0) return { valid: false, missing };
  return { valid: true };
}

const READ_ONLY_PAIR_IDS = ['PAIR-DEMOTEST'];

/**
 * Parse multipart form-data (Vercel serverless compatible)
 */
async function parseMultipartFormData(req) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error('Invalid multipart/form-data: boundary not found');

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  const boundaryString = `--${boundary}`;
  const parts = buffer.toString('binary').split(boundaryString);

  const fields = {};
  let file = null;

  for (const part of parts) {
    if (!part || part === '--\r\n' || part === '--') continue;
    const [rawHeaders, rawBody] = part.split('\r\n\r\n');
    if (!rawBody) continue;
    const headerLines = rawHeaders.split('\r\n').filter(Boolean);
    const dispositionLine = headerLines.find((l) =>
      l.toLowerCase().startsWith('content-disposition')
    );
    if (!dispositionLine) continue;
    const nameMatch = dispositionLine.match(/name="([^"]+)"/i);
    const filenameMatch = dispositionLine.match(/filename="([^"]*)"/i);
    const name = nameMatch?.[1];
    const bodyContent = rawBody.slice(0, rawBody.lastIndexOf('\r\n'));

    if (filenameMatch && filenameMatch[1]) {
      const ctLine = headerLines.find((l) => l.toLowerCase().startsWith('content-type'));
      const mimeType = ctLine ? ctLine.split(':')[1].trim() : 'application/octet-stream';
      file = {
        fieldName: name,
        filename: filenameMatch[1] || 'audio',
        mimeType,
        buffer: Buffer.from(bodyContent, 'binary'),
      };
    } else if (name) {
      fields[name] = bodyContent.trim();
    }
  }
  return { fields, file };
}

/** 未再生ならPush送信。child送信→親へ、parent送信→子へ。ベストエフォート。 */
async function sendPushIfUnseen(reqId, pairId, role, dateKey) {
  const recipientRole = role === 'child' ? 'parent' : 'child';
  const devicesCollection = recipientRole === 'parent' ? 'parentDevices' : 'childDevices';

  try {
    initFirebaseAdmin();
    const devicesRef = firestore.collection('pair_users').doc(pairId).collection(devicesCollection);
    const devicesSnap = await devicesRef.get();
    const tokens = [];
    const docIds = [];
    devicesSnap.docs.forEach((d) => {
      const t = d.data()?.token;
      if (t && typeof t === 'string') {
        tokens.push(t);
        docIds.push(d.id);
      }
    });
    if (tokens.length === 0) {
      logObserve({ requestId: reqId, stage: 'push_send', status: 'ok', pairId, role, dateKey, tokenCount: 0 });
      return;
    }

    const metaRef = firestore.collection('pair_media').doc(pairId).collection('days').doc(dateKey);
    const metaSnap = await metaRef.get();
    if (!metaSnap.exists) return;
    const roleData = metaSnap.data()?.[role];
    if (!roleData?.audioPath) return;
    const updatedAt = roleData.updatedAt?.toMillis?.() ?? roleData.version ?? 0;
    const seenAt = roleData.seenAt?.toMillis?.() ?? null;
    const isUnseen = seenAt == null || updatedAt > seenAt;
    if (!isUnseen) {
      logObserve({ requestId: reqId, stage: 'push_send', status: 'ok', pairId, role, dateKey, tokenCount: 0, note: 'already_seen' });
      return;
    }

    const messaging = admin.messaging();
    const multicast = {
      tokens,
      notification: {
        title: 'Tyson',
        body: '新しい音声が届きました',
      },
      data: { pairId, dateKey, role },
    };
    const result = await messaging.sendEachForMulticast(multicast);

    let successCount = 0;
    let errorCode = null;
    for (let i = 0; i < result.responses.length; i++) {
      const r = result.responses[i];
      if (r.success) {
        successCount++;
      } else {
        const code = r.error?.errorInfo?.code || r.error?.code || 'unknown';
        errorCode = code;
        const invalidCodes = ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered', 'messaging/invalid-argument'];
        if (invalidCodes.some((c) => String(code).includes(c))) {
          try {
            await devicesRef.doc(docIds[i]).delete();
          } catch (_) {}
        }
      }
    }
    logObserve({
      requestId: reqId,
      stage: 'push_send',
      status: result.successCount > 0 ? 'ok' : 'error',
      pairId,
      role,
      dateKey,
      tokenCount: tokens.length,
      successCount,
      errorCode: errorCode || undefined,
    });
  } catch (e) {
    const code = e?.code || 'unknown';
    const msg = (e?.message || String(e)).substring(0, 80);
    logObserve({ requestId: reqId, stage: 'push_send', status: 'error', pairId, role, dateKey, tokenCount: 0, errorCode: code, errorMessage: msg });
  }
}

/** GET: voice-history action */
async function handleVoiceHistory(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) return res.status(401).json({ error: 'Unauthorized' });
  let uid;
  try { ({ uid } = await verifyIdToken(idToken)); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  const pairId = req.query?.pairId;
  if (!pairId) return res.status(400).json({ error: 'pairId is required' });
  if (isTysonOnlyBlocked(pairId, uid)) return res.status(403).json({ error: 'Access denied' });
  const limit = Math.min(parseInt(req.query?.limit) || 30, 365);

  try {
    initFirebaseAdmin();
    if (!(await isPairAllowed(uid, pairId, firestore))) {
      return res.status(403).json({ error: 'Not a pair member', requestId: reqId });
    }
    const daysSnap = await firestore
      .collection('pair_media').doc(pairId).collection('days')
      .get();

    const sortedDocs = daysSnap.docs
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, limit);

    const days = [];
    for (const doc of sortedDocs) {
      const data = doc.data();
      const dateKey = doc.id;
      const entry = { dateKey, parent: null, child: null };

      for (const role of ['parent', 'child']) {
        const rd = data[role];
        if (!rd) continue;

        // 録音リストを構築（新スキーマ: 配列, 旧スキーマ: 単一文字列）
        let recordings = [];
        if (Array.isArray(rd.audioPath) && rd.audioPath.length > 0) {
          recordings = rd.audioPath;
        } else if (typeof rd.audioPath === 'string' && rd.audioPath) {
          recordings = [{ path: rd.audioPath, hhmm: null, version: rd.version, mimeType: rd.mimeType, ext: rd.extension }];
        } else if (rd.latestAudioPath) {
          recordings = [{ path: rd.latestAudioPath, hhmm: null, version: rd.version, mimeType: rd.mimeType }];
        }
        if (recordings.length === 0) continue;

        const updatedAt = rd.updatedAt?.toMillis?.() ?? rd.version ?? null;
        const seenAt = rd.seenAt?.toMillis?.() ?? null;
        const isUnseen = seenAt == null || (updatedAt != null && updatedAt > seenAt);

        const items = [];
        for (const r of recordings) {
          if (!r?.path) continue;
          let url = null;
          try {
            const fileRef = storageBucket.file(r.path);
            const [exists] = await fileRef.exists();
            if (exists) {
              const [signedUrl] = await fileRef.getSignedUrl({ action: 'read', expires: Date.now() + 3600000 });
              url = signedUrl;
            }
          } catch (_) {}
          if (url) items.push({
            url,
            hhmm: r.hhmm || null,
            version: r.version || null,
            mimeType: r.mimeType || 'audio/mp4',
            // 段階10-a: client 側で effectiveRole 判定・訂正 UI 表示するため metadata を渡す。
            // 旧 record では欠落、client は graceful 処理（fallback to column role）。
            uploadedBy: r.uploadedBy || null,
            roleAtUpload: r.roleAtUpload || null,
            deviceHint: r.deviceHint || null,
            correctedRole: r.correctedRole || null,
            correctedAt: r.correctedAt?.toMillis?.() ?? r.correctedAt ?? null,
            correctedBy: r.correctedBy || null,
            correctionReason: r.correctionReason || null,
            correctionReasonDetail: r.correctionReasonDetail || null,
          });
        }
        if (items.length === 0) continue;

        // 最新が先頭（POST時の順序を維持）
        entry[role] = {
          hasAudio: true,
          isUnseen,
          updatedAt,
          seenAt,
          url: items[0].url,             // 後方互換: 最新1件のURL
          mimeType: items[0].mimeType || 'audio/mp4',
          items,                          // 全録音
        };
      }
      if (entry.parent || entry.child) days.push(entry);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, days });
  } catch (e) {
    console.error('[voice-history] error:', e.message, e.stack?.substring(0, 200));
    return res.status(500).json({ error: e.message });
  }
}

/** GET: voice-month action (calendar view用、月のhasParent/hasChildのみ返す) */
async function handleVoiceMonth(req, res) {
  const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!idToken) return res.status(401).json({ error: 'Unauthorized' });
  let uid;
  try { ({ uid } = await verifyIdToken(idToken)); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  const pairId = req.query?.pairId;
  const month = req.query?.month;
  if (!pairId) return res.status(400).json({ error: 'pairId is required' });
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  if (isTysonOnlyBlocked(pairId, uid)) return res.status(403).json({ error: 'Access denied' });

  try {
    initFirebaseAdmin();
    if (!(await isPairAllowed(uid, pairId, firestore))) {
      return res.status(403).json({ error: 'Not a pair member' });
    }
    const daysSnap = await firestore
      .collection('pair_media').doc(pairId).collection('days')
      .get();

    const days = [];
    for (const doc of daysSnap.docs) {
      const dateKey = doc.id;
      if (!dateKey.startsWith(`${month}-`)) continue;
      const data = doc.data();
      const hasRole = (rd) => !!(rd?.latestAudioPath
        || (Array.isArray(rd?.audioPath) && rd.audioPath.length > 0)
        || (typeof rd?.audioPath === 'string' && rd.audioPath));
      const hasParent = hasRole(data?.parent);
      const hasChild = hasRole(data?.child);
      if (hasParent || hasChild) days.push({ date: dateKey, hasParent, hasChild });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, days });
  } catch (e) {
    console.error('[voice-month] error:', e.message, e.stack?.substring(0, 200));
    return res.status(500).json({ error: e.message });
  }
}

/** GET: blob または signed URL */
async function handleGet(req, res) {
  // voice-history アクション
  if (req.query?.action === 'voice-history') return handleVoiceHistory(req, res);
  // voice-month アクション（カレンダービュー用）
  if (req.query?.action === 'voice-month') return handleVoiceMonth(req, res);

  const reqId = req.headers['x-request-id'] || genRequestId();
  const pairId = req.query?.pairId || req.query?.pair_id;
  const clientDateKey = req.query?.dateKey || req.query?.date_key;
  const serverDateKey = getDateKeyNY();
  // サーバー側のNY日付を正規化ソースとして使用（クライアントのtimezone誤差を無視）
  const dateKey = serverDateKey;
  const listenRole = req.query?.listenRole || req.query?.listen_role; // 'parent' | 'child'
  const mode = req.query?.mode || 'blob'; // 'blob' | 'signed'

  const firestoreDocPath = pairId && dateKey ? `pair_media/${pairId}/days/${dateKey}` : null;
  const dateKeyNormalized = clientDateKey && clientDateKey !== serverDateKey;

  if (!pairId) {
    logObserve({ requestId: reqId, stage: 'get_validate', status: 'error', pairId: null, role: listenRole, clientDateKey: clientDateKey || null, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 400, errorCode: 'missing_params', errorMessage: 'pairId required' });
    return res.status(400).json({
      success: false,
      error: 'pairId is required',
      requestId: reqId,
    });
  }

  if (!listenRole || (listenRole !== 'parent' && listenRole !== 'child')) {
    logObserve({ requestId: reqId, stage: 'get_validate', status: 'error', pairId, role: listenRole || null, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 400, errorCode: 'invalid_role', errorMessage: 'listenRole must be parent or child' });
    return res.status(400).json({
      success: false,
      error: 'listenRole must be "parent" or "child"',
      requestId: reqId,
    });
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    logObserve({ requestId: reqId, stage: 'get_auth', status: 'error', pairId, role: listenRole, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 401, errorCode: 'unauthorized', errorMessage: 'idToken required' });
    return res.status(401).json({
      success: false,
      error: 'Authorization: Bearer <idToken> required',
      requestId: reqId,
    });
  }

  try {
    const { uid } = await verifyIdToken(idToken);
    if (isTysonOnlyBlocked(pairId, uid)) {
      return res.status(403).json({ success: false, error: 'Access denied', requestId: reqId });
    }
    initFirebaseAdmin();
    if (!(await isPairAllowed(uid, pairId, firestore))) {
      console.log('[AUTH_SELF_HEAL_SERVER]', JSON.stringify({
        event: 'membership_403',
        endpoint: 'pair-media',
        pairId,
        uidPrefix: uid.slice(0, 6),
        role: listenRole,
        requestId: reqId,
      }));
      return res.status(403).json({
        success: false,
        error: 'Not a pair member',
        requestId: reqId,
      });
    }

    // roleData から有効なオーディオパス（文字列）を解決
    const extractEffectivePath = (rd) => {
      if (!rd) return null;
      if (rd.latestAudioPath && typeof rd.latestAudioPath === 'string') return rd.latestAudioPath;
      if (typeof rd.audioPath === 'string') return rd.audioPath;
      if (Array.isArray(rd.audioPath) && rd.audioPath[0]?.path) return rd.audioPath[0].path;
      return null;
    };

    // Firestoreからroleデータを解決するヘルパー（今日 → 昨日フォールバック対応）
    const resolveMeta = async (dk) => {
      const ref = firestore.collection('pair_media').doc(pairId).collection('days').doc(dk);
      const snap = await ref.get();
      if (!snap.exists) return null;
      const m = snap.data();
      let rd = m?.[listenRole];
      // 旧スキーマフォールバック: parent のみ許す
      if (!extractEffectivePath(rd)) {
        if (listenRole === 'parent' && m?.audioPath) {
          rd = { audioPath: m.audioPath, latestAudioPath: m.audioPath, mimeType: m.mimeType, extension: m.extension,
                  uploadedAt: m.uploadedAt, uploadedBy: m.uploadedBy,
                  version: m.uploadedAt?.toMillis?.() || Date.now(), isLegacy: true };
        } else {
          return null; // 音声なし
        }
      }
      return { meta: m, roleData: rd, isLegacy: !!rd.isLegacy, resolvedDateKey: dk };
    };

    // 今日のNY dateKeyで試し、音声なければ昨日も試す（JST↔NY時差による日付ズレ対策）
    let resolved = await resolveMeta(dateKey);
    if (!resolved) {
      const yesterdayKey = getYesterdayKeyNY();
      console.log(`[handleGet] today(${dateKey}) no audio → try yesterday(${yesterdayKey})`);
      resolved = await resolveMeta(yesterdayKey);
    }

    if (!resolved) {
      logObserve({ requestId: reqId, stage: 'get_resolve', status: 'ok', pairId, role: listenRole, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
      return res.status(200).json({
        success: true,
        hasAudio: false,
        url: null,
        requestId: reqId,
        pairId,
        dateKey,
        role: listenRole,
      });
    }

    const { meta, roleData, isLegacy, resolvedDateKey } = resolved;
    const objectPath = isLegacy ? 'audioPath' : listenRole;

    const audioPath = extractEffectivePath(roleData);
    const resolvedAudioPath = audioPath;

    logObserve({ requestId: reqId, stage: 'get_resolve', status: 'ok', pairId, role: listenRole, clientDateKey, serverDateKey, storagePath: audioPath, firestoreDocPath, httpStatus: 200, errorCode: null, note: resolvedDateKey !== dateKey ? `fallback_to_${resolvedDateKey}` : undefined });
    const version = roleData.version || roleData.uploadedAt?.toMillis?.() || Date.now();
    logObserve({ requestId: reqId, stage: 'get_resolve', status: 'ok', pairId, role: listenRole, clientDateKey, serverDateKey, ...(dateKeyNormalized ? { note: 'dateKey_normalized' } : {}), storagePath: resolvedAudioPath, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });

    const fileRef = storageBucket.file(audioPath);

    if (mode === 'signed') {
      try {
        const [signedUrl] = await fileRef.getSignedUrl({
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000,
        });
        const updatedAt = roleData.updatedAt?.toMillis?.() ?? roleData.version ?? Date.now();
        const seenAt = roleData.seenAt?.toMillis?.() ?? null;
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
          success: true,
          mode: 'signed',
          url: signedUrl,
          version,
          updatedAt,
          seenAt,
          audioPath,
          dateKey: resolvedDateKey,
          requestId: reqId,
          hasAudio: true,
        });
      } catch (signErr) {
        console.error('[handleGet] getSignedUrl failed:', signErr.message?.substring(0, 100), { audioPath });
        return res.status(500).json({ success: false, error: 'Failed to generate signed URL', requestId: reqId, errorCode: 'signed_url_failed' });
      }
    }

    const [contents] = await fileRef.download();
    const storedMime = roleData.mimeType || 'audio/mp4';
    // Android browsers may not play audio/mp4 from iOS; serve as audio/mpeg for broader compat
    const mimeType = storedMime.includes('webm') ? 'audio/webm' : storedMime.includes('aac') ? 'audio/aac' : storedMime;
    const updatedAt = roleData.updatedAt?.toMillis?.() ?? roleData.version ?? Date.now();
    const seenAt = roleData.seenAt?.toMillis?.() ?? null;
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Audio-MimeType', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.setHeader('X-Audio-Version', String(version));
    res.setHeader('X-Audio-UpdatedAt', String(updatedAt));
    res.setHeader('X-Audio-DateKey', String(resolvedDateKey));
    if (seenAt != null) res.setHeader('X-Audio-SeenAt', String(seenAt));
    res.setHeader('X-Request-Id', reqId);
    return res.status(200).send(contents);
  } catch (e) {
    const code = e?.code || 'unknown';
    const msg = (e?.message || String(e)).substring(0, 100);
    logObserve({ requestId: reqId, stage: 'get_download', status: 'error', pairId, role: listenRole, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath, httpStatus: 500, errorCode: code, errorMessage: msg });
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch media',
      requestId: reqId,
      errorCode: code,
    });
  }
}

/** POST: upload audio */
async function handlePost(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();

  // 段階10-a: role 切替履歴の immutable 追記（action=role-history-record）
  if (req.query?.action === 'role-history-record') return handleRoleHistoryRecord(req, res);

  const firestoreDocPath = null; // set after pairId/dateKey known

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    logObserve({ requestId: reqId, stage: 'post_auth', status: 'error', pairId: null, role: null, dateKey: null, storagePath: null, firestoreDocPath: null, httpStatus: 401, errorCode: 'unauthorized', errorMessage: 'idToken required' });
    return res.status(401).json({
      success: false,
      error: 'Authorization: Bearer <idToken> required',
      requestId: reqId,
    });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return res.status(400).json({
      success: false,
      error: 'Content-Type must be multipart/form-data',
      requestId: reqId,
    });
  }

  try {
    const { uid } = await verifyIdToken(idToken);
    let fields, file;
    try {
      const parsed = await parseMultipartFormData(req);
      fields = parsed.fields;
      file = parsed.file;
    } catch (parseErr) {
      const msg = (parseErr?.message || String(parseErr)).substring(0, 100);
      logObserve({ requestId: reqId, stage: 'post_parse', status: 'error', pairId: null, role: null, dateKey: null, storagePath: null, firestoreDocPath: null, httpStatus: 400, errorCode: 'parse_failed', errorMessage: msg });
      throw parseErr;
    }

    const audioFile = file?.fieldName === 'audio' ? file : null;
    if (!audioFile || !audioFile.buffer?.length) {
      return res.status(400).json({
        success: false,
        error: 'FormData must include "audio" file',
        requestId: reqId,
      });
    }

    const pairId = fields.pairId || fields.pair_id;
    if (!pairId) {
      return res.status(400).json({
        success: false,
        error: 'pairId is required',
        requestId: reqId,
      });
    }

    if (isTysonOnlyBlocked(pairId, uid)) {
      return res.status(403).json({ success: false, error: 'Access denied', requestId: reqId });
    }
    if (READ_ONLY_PAIR_IDS.includes(pairId)) {
      return res.status(403).json({ success: false, error: 'This pair is read-only', requestId: reqId });
    }

    const clientDateKey = fields.dateKey || fields.date_key || null;
    const serverDateKey = getDateKeyNY();
    const dateKey = serverDateKey;
    const dateKeyNormalized = clientDateKey && clientDateKey !== serverDateKey;
    const role = fields.role; // 'parent' | 'child' (必須)
    const docPath = `pair_media/${pairId}/days/${dateKey}`;

    // role を最初にチェック（必須化）
    if (!role || (role !== 'parent' && role !== 'child')) {
      logObserve({ requestId: reqId, stage: 'post_validate', status: 'error', pairId, role: role || null, clientDateKey, serverDateKey, storagePath: null, firestoreDocPath: docPath, httpStatus: 400, errorCode: 'invalid_role', errorMessage: 'role must be parent or child' });
      return res.status(400).json({
        success: false,
        error: 'role must be "parent" or "child"',
        requestId: reqId,
      });
    }
    
    initFirebaseAdmin();
    if (!(await isPairAllowed(uid, pairId, firestore))) {
      console.log('[AUTH_SELF_HEAL_SERVER]', JSON.stringify({
        event: 'membership_403',
        endpoint: 'pair-media',
        method: 'POST',
        pairId,
        uidPrefix: uid.slice(0, 6),
        role,
        requestId: reqId,
      }));
      return res.status(403).json({
        success: false,
        error: 'Not a pair member',
        requestId: reqId,
      });
    }

    const mimeType = audioFile.mimeType || 'audio/mp4';
    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('m4a') ? 'm4a' : 'webm';
    // 時刻付きファイル名で複数録音を保存（同じ日に複数回録音できる）
    const hhmm = getHHMMNY();
    const objectPath = `pair-media/${pairId}/${dateKey}/${role}/recording_${hhmm}.${ext}`;
    // NOTE: 過去の録音は削除しない（複数録音保存のため）
    const version = Date.now();
    // 段階10-a: device hint を User-Agent から推定
    const deviceHint = deriveDeviceHint(req.headers['user-agent'] || '');
    try {
      const fileRef = storageBucket.file(objectPath);
      await fileRef.save(audioFile.buffer, {
        contentType: mimeType,
        resumable: false,
        // 段階10-a: Storage 側にも uploader 情報を記録（Firestore 喪失時の diagnostic 保険）
        metadata: {
          metadata: {
            uploadedBy: uid,
            roleAtUpload: role,
            uploadedAtMs: String(version),
            deviceHint,
          },
        },
      });
      logObserve({ requestId: reqId, stage: 'post_storage', status: 'ok', pairId, role, clientDateKey, serverDateKey, ...(dateKeyNormalized ? { note: 'dateKey_normalized' } : {}), storagePath: objectPath, firestoreDocPath: docPath, httpStatus: 200, errorCode: null, errorMessage: null });
    } catch (uploadErr) {
      const code = uploadErr?.code || 'unknown';
      const msg = (uploadErr?.message || String(uploadErr)).substring(0, 100);
      logObserve({ requestId: reqId, stage: 'post_storage', status: 'error', pairId, role, clientDateKey, serverDateKey, storagePath: objectPath, firestoreDocPath: docPath, httpStatus: 500, errorCode: code, errorMessage: msg });
      throw uploadErr;
    }

    try {
      const metaRef = firestore.collection('pair_media').doc(pairId).collection('days').doc(dateKey);

      // 既存のaudioPath配列を取得して新エントリを先頭に追加
      const existingSnap = await metaRef.get();
      const existingRole = existingSnap.exists ? (existingSnap.data()?.[role] || {}) : {};
      const existingArray = Array.isArray(existingRole.audioPath) ? existingRole.audioPath : [];

      // 段階10-a: audioPath[] item に 30-year sustainability 用 metadata を付加。
      // uploadedBy/roleAtUpload/deviceHint が原始値、correctedRole 系は admin 訂正で追記。
      const newEntry = {
        path: objectPath,
        hhmm,
        version,
        mimeType,
        ext,
        uploadedBy: uid,
        roleAtUpload: role,
        deviceHint,
        correctedRole: null,
        correctedAt: null,
        correctedBy: null,
        correctionReason: null,
        correctionReasonDetail: null,
      };

      // Phase X-3-A: audioPath[] 必須 metadata 物理 enforcement
      // 欠落 = code bug（default fill 失敗）→ 500 で write を阻止
      const validation = validateAudioPathItem(newEntry);
      if (!validation.valid) {
        console.error('[pair-media POST] audioPath metadata validation failed:', validation.missing, 'newEntry:', newEntry);
        logObserve({ requestId: reqId, stage: 'post_validate_metadata', status: 'error', pairId, role, clientDateKey, serverDateKey, storagePath: objectPath, firestoreDocPath: docPath, httpStatus: 500, errorCode: 'metadata_incomplete', errorMessage: `missing: ${validation.missing.join(',')}` });
        return res.status(500).json({
          success: false,
          error: 'Internal: audioPath metadata incomplete',
          missing: validation.missing,
          requestId: reqId,
        });
      }

      const audioPathArray = [newEntry, ...existingArray.filter(e => e?.path !== objectPath)];

      const uploadedAtTs = admin.firestore.FieldValue.serverTimestamp();
      const roleData = {
        audioPath: audioPathArray,        // 配列: 全録音（新しい順）
        latestAudioPath: objectPath,      // 文字列: 最新1件
        storagePath: objectPath,
        mimeType,
        extension: ext,
        uploadedAt: uploadedAtTs,
        updatedAt: uploadedAtTs,
        uploadedBy: uid,
        version,
        uploadId: reqId,
        role,
        dateKey,
      };
      await metaRef.set({
        [role]: roleData,
        latestUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      logObserve({ requestId: reqId, stage: 'post_firestore', status: 'ok', pairId, role, clientDateKey, serverDateKey, ...(dateKeyNormalized ? { note: 'dateKey_normalized' } : {}), storagePath: objectPath, firestoreDocPath: docPath, httpStatus: 200, errorCode: null, errorMessage: null });
    } catch (firestoreErr) {
      const code = firestoreErr?.code || 'unknown';
      const msg = (firestoreErr?.message || String(firestoreErr)).substring(0, 100);
      console.error(`[ORPHAN FILE ALERT] pairId:${pairId} path:${objectPath} timestamp:${new Date().toISOString()}`);
      logObserve({ requestId: reqId, stage: 'post_firestore', status: 'error', pairId, role, clientDateKey, serverDateKey, storagePath: objectPath, firestoreDocPath: docPath, httpStatus: 500, errorCode: code, errorMessage: msg });
      throw firestoreErr;
    }

    const responseJson = {
      success: true,
      pairId,
      dateKey,
      role,
      version,
      requestId: reqId,
    };
    logObserve({ requestId: reqId, stage: 'post_done', status: 'ok', pairId, role, clientDateKey, serverDateKey, ...(dateKeyNormalized ? { note: 'dateKey_normalized' } : {}), storagePath: objectPath, firestoreDocPath: docPath, httpStatus: 200, errorCode: null, errorMessage: null });

    // Push通知（ベストエフォート・POST成功に影響しない）
    sendPushIfUnseen(reqId, pairId, role, dateKey).catch(() => {});

    return res.status(200).json(responseJson);
  } catch (e) {
    const code = e?.code || 'unknown';
    const msg = (e?.message || String(e)).substring(0, 100);
    logObserve({ requestId: reqId, stage: 'post_error', status: 'error', pairId: null, role: null, dateKey: null, storagePath: null, firestoreDocPath: null, httpStatus: 500, errorCode: code, errorMessage: msg });
    return res.status(500).json({
      success: false,
      error: 'Upload failed',
      requestId: reqId,
      errorCode: code,
    });
  }
}

/** PATCH: action=markSeen で seenAt を serverTimestamp に更新 */
/**
 * 段階10-a: admin による voice role 訂正（immutable 追記）。
 * 原 item は audioPath[] の位置を変えず、correctedRole/correctedAt/correctedBy/
 * correctionReason/correctionReasonDetail を item 内に追記する。
 * client 側は getEffectiveRole(item) で訂正後の分類を行う。
 * 認証: X-Admin-Password ヘッダ (ADMIN_PASSWORD env と一致必須)。
 */
async function handleCorrect(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();

  const provided = (req.headers['x-admin-password'] || '').trim();
  const validPasswords = [process.env.ADMIN_PASSWORD, process.env.VITE_RESET_SECRET].filter(Boolean);
  if (!provided || !validPasswords.includes(provided)) {
    return res.status(401).json({ success: false, error: 'Unauthorized', requestId: reqId });
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid JSON body', requestId: reqId });
    }
  }

  const { pairId, dateKey, hhmm, correctedRole, correctionReason, correctionReasonDetail } = body || {};
  const VALID_REASONS = ['role誤タップ', '誤録音', 'その他'];

  if (!pairId || !dateKey || !hhmm || !correctedRole || !correctionReason) {
    return res.status(400).json({ success: false, error: 'pairId, dateKey, hhmm, correctedRole, correctionReason required', requestId: reqId });
  }
  if (!['parent', 'child'].includes(correctedRole)) {
    return res.status(400).json({ success: false, error: 'correctedRole must be parent or child', requestId: reqId });
  }
  if (!VALID_REASONS.includes(correctionReason)) {
    return res.status(400).json({ success: false, error: `correctionReason must be one of ${VALID_REASONS.join('/')}`, requestId: reqId });
  }
  if (correctionReason === 'その他' && correctionReasonDetail && correctionReasonDetail.length > 100) {
    return res.status(400).json({ success: false, error: 'correctionReasonDetail must be 100 chars or less', requestId: reqId });
  }
  if (READ_ONLY_PAIR_IDS.includes(pairId)) {
    return res.status(403).json({ success: false, error: 'This pair is read-only', requestId: reqId });
  }

  try {
    initFirebaseAdmin();
    const docRef = firestore.collection('pair_media').doc(pairId).collection('days').doc(dateKey);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: 'Day document not found', requestId: reqId });
    }
    const data = snap.data();

    // parent.audioPath[] と child.audioPath[] 両方を検索、hhmm match item を特定
    let foundRole = null;
    let foundIdx = -1;
    for (const r of ['parent', 'child']) {
      const items = Array.isArray(data[r]?.audioPath) ? data[r].audioPath : [];
      const idx = items.findIndex(it => it && it.hhmm === hhmm);
      if (idx !== -1) { foundRole = r; foundIdx = idx; break; }
    }
    if (foundRole === null) {
      return res.status(404).json({ success: false, error: `Item with hhmm=${hhmm} not found`, requestId: reqId });
    }

    // immutable 追記: item を原始位置に残し、訂正 field を追記するだけ
    const items = [...data[foundRole].audioPath];
    const target = items[foundIdx];
    const correctedAt = Date.now();
    items[foundIdx] = {
      ...target,
      correctedRole,
      correctedAt,
      correctedBy: 'admin',
      correctionReason,
      correctionReasonDetail: correctionReasonDetail || null,
    };

    // set() で document 全体を書き戻す（merge: true 禁止、spread で既存 field 保持）
    const newDoc = {
      ...data,
      [foundRole]: { ...data[foundRole], audioPath: items },
      latestUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await docRef.set(newDoc);

    logObserve({ requestId: reqId, stage: 'correct', status: 'ok', pairId, role: foundRole, dateKey, firestoreDocPath: `pair_media/${pairId}/days/${dateKey}`, httpStatus: 200, errorCode: null, errorMessage: null, note: `corrected hhmm=${hhmm} roleAtUpload=${foundRole} -> correctedRole=${correctedRole} reason=${correctionReason}` });
    return res.status(200).json({ success: true, corrected: { hhmm, roleAtUpload: foundRole, correctedRole, correctionReason, correctedAt }, requestId: reqId });
  } catch (e) {
    const msg = (e?.message || String(e)).substring(0, 150);
    logObserve({ requestId: reqId, stage: 'correct', status: 'error', pairId, dateKey, httpStatus: 500, errorCode: 'correct_failed', errorMessage: msg });
    return res.status(500).json({ success: false, error: msg, requestId: reqId });
  }
}

/**
 * 段階10-a: role 切替の immutable 履歴記録。
 * Firestore `pair_members/{pairId}/role_history/{autoId}` に doc 追加。
 * 認証: Firebase idToken (Bearer header)。
 */
async function handleRoleHistoryRecord(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) return res.status(401).json({ success: false, error: 'Unauthorized', requestId: reqId });
  let uid;
  try { ({ uid } = await verifyIdToken(idToken)); } catch { return res.status(401).json({ success: false, error: 'Invalid token', requestId: reqId }); }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid JSON body', requestId: reqId });
    }
  }

  const { pairId, fromRole, toRole, reason } = body || {};
  const VALID_REASONS = ['initial', 'switch-button', 'url-param', 'admin-override', 'other', 'unknown'];
  const VALID_ROLES = ['parent', 'child', null];

  if (!pairId) {
    return res.status(400).json({ success: false, error: 'pairId is required', requestId: reqId });
  }
  if (!VALID_ROLES.includes(fromRole === undefined ? null : fromRole)) {
    return res.status(400).json({ success: false, error: 'fromRole must be parent/child/null', requestId: reqId });
  }
  if (!VALID_ROLES.includes(toRole === undefined ? null : toRole)) {
    return res.status(400).json({ success: false, error: 'toRole must be parent/child/null', requestId: reqId });
  }
  if (!reason || !VALID_REASONS.includes(reason)) {
    return res.status(400).json({ success: false, error: `reason must be one of ${VALID_REASONS.join('/')}`, requestId: reqId });
  }
  if (isTysonOnlyBlocked(pairId, uid)) {
    return res.status(403).json({ success: false, error: 'Access denied', requestId: reqId });
  }

  try {
    initFirebaseAdmin();
    // immutable 追記: pair_members/{pairId}/role_history/{autoId}
    await firestore
      .collection('pair_members').doc(pairId)
      .collection('role_history').add({
        userUid: uid,
        fromRole: fromRole ?? null,
        toRole: toRole ?? null,
        reason,
        changedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    logObserve({ requestId: reqId, stage: 'role_history_record', status: 'ok', pairId, role: toRole, httpStatus: 200, errorCode: null, errorMessage: null, note: `uid=...${uid.slice(-6)} ${fromRole || 'null'}->${toRole || 'null'} reason=${reason}` });
    return res.status(200).json({ success: true, requestId: reqId });
  } catch (e) {
    const msg = (e?.message || String(e)).substring(0, 150);
    logObserve({ requestId: reqId, stage: 'role_history_record', status: 'error', pairId, httpStatus: 500, errorCode: 'record_failed', errorMessage: msg });
    return res.status(500).json({ success: false, error: msg, requestId: reqId });
  }
}

async function handlePatch(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();
  const action = req.query?.action;

  // 段階10-a: admin voice role 訂正（immutable 追記）
  if (action === 'correct') return handleCorrect(req, res);

  const pairId = req.query?.pairId || req.query?.pair_id;
  const clientDateKey = req.query?.dateKey || req.query?.date_key;
  const serverDateKey = getDateKeyNY();
  const dateKey = clientDateKey || serverDateKey;
  const role = req.query?.listenRole || req.query?.listen_role || req.query?.role;
  const firestoreDocPath = pairId && dateKey ? `pair_media/${pairId}/days/${dateKey}` : null;

  if (READ_ONLY_PAIR_IDS.includes(pairId)) {
    return res.status(403).json({ success: false, error: 'This pair is read-only', requestId: reqId });
  }
  if (action !== 'markSeen') {
    return res.status(400).json({ success: false, error: 'action must be markSeen', requestId: reqId });
  }
  if (!pairId || !role || (role !== 'parent' && role !== 'child')) {
    logObserve({ requestId: reqId, stage: 'mark_seen', status: 'error', pairId: pairId || null, role: role || null, dateKey, firestoreDocPath, httpStatus: 400, errorCode: 'invalid_params', errorMessage: 'pairId and role (parent|child) required' });
    return res.status(400).json({ success: false, error: 'pairId and listenRole (parent|child) required', requestId: reqId });
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    return res.status(401).json({ success: false, error: 'Authorization required', requestId: reqId });
  }

  try {
    const { uid } = await verifyIdToken(idToken);
    if (isTysonOnlyBlocked(pairId, uid)) {
      return res.status(403).json({ success: false, error: 'Access denied', requestId: reqId });
    }
    initFirebaseAdmin();
    if (!(await isPairAllowed(uid, pairId, firestore))) {
      return res.status(403).json({ success: false, error: 'Not a pair member', requestId: reqId });
    }

    const metaRef = firestore.collection('pair_media').doc(pairId).collection('days').doc(dateKey);
    const metaSnap = await metaRef.get();
    if (!metaSnap.exists) {
      logObserve({ requestId: reqId, stage: 'mark_seen', status: 'ok', pairId, role, dateKey, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
      return res.status(200).json({ success: true, requestId: reqId });
    }
    const roleData = metaSnap.data()?.[role];
    const hasAnyAudio = !!(roleData?.latestAudioPath
      || (typeof roleData?.audioPath === 'string' && roleData.audioPath)
      || (Array.isArray(roleData?.audioPath) && roleData.audioPath.length > 0));
    if (!hasAnyAudio) {
      logObserve({ requestId: reqId, stage: 'mark_seen', status: 'ok', pairId, role, dateKey, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
      return res.status(200).json({ success: true, requestId: reqId });
    }

    await metaRef.set({
      [role]: { ...roleData, seenAt: admin.firestore.FieldValue.serverTimestamp() },
      latestUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    logObserve({ requestId: reqId, stage: 'mark_seen', status: 'ok', pairId, role, dateKey, firestoreDocPath, httpStatus: 200, errorCode: null, errorMessage: null });
    return res.status(200).json({ success: true, requestId: reqId });
  } catch (e) {
    const code = e?.code || 'unknown';
    const msg = (e?.message || String(e)).substring(0, 100);
    logObserve({ requestId: reqId, stage: 'mark_seen', status: 'error', pairId, role, dateKey, firestoreDocPath, httpStatus: 500, errorCode: code, errorMessage: msg });
    return res.status(500).json({ success: false, error: 'Failed to mark seen', requestId: reqId });
  }
}

export default async function handler(req, res) {
  const reqId = req.headers['x-request-id'] || genRequestId();
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id, X-Admin-Password');
  res.setHeader('Access-Control-Expose-Headers', 'X-Audio-DateKey, X-Audio-Version, X-Audio-UpdatedAt, X-Audio-SeenAt, X-Audio-MimeType, X-Request-Id');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
