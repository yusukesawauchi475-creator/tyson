import { getIdTokenForApi } from './firebase.js';

/** NY時間（America/New_York、DST対応）で YYYY-MM-DD を返す。単一ソース。 */
export function getDateKeyNY() {
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

/** getDateKeyNY のエイリアス（後方互換） */
export const getDateKey = getDateKeyNY;

/** MVP用固定 pairId。後で invite token 方式に戻す */
export const PAIR_ID_DEMO = 'demo';

const PAIR_ID_STORAGE_KEY = 'tyson_pairId';

/**
 * pairId を取得。優先順位: URLクエリ(?pairId=) > localStorage(tyson_pairId) > 'demo'。
 * HashRouter では /#/?pairId=XXX のクエリを参照。クエリで取得した場合は localStorage に保存する。
 */
export function getPairId() {
  if (typeof window === 'undefined') return PAIR_ID_DEMO;
  try {
    const hash = window.location.hash || '';
    const qIndex = hash.indexOf('?');
    const queryString = qIndex >= 0 ? hash.slice(qIndex + 1) : '';
    const params = new URLSearchParams(queryString);
    const fromQuery = params.get('pairId')?.trim?.();
    if (fromQuery) {
      try {
        localStorage.setItem(PAIR_ID_STORAGE_KEY, fromQuery);
      } catch (_) {}
      return fromQuery;
    }
    const fromStorage = localStorage.getItem(PAIR_ID_STORAGE_KEY)?.trim?.();
    if (fromStorage) return fromStorage;
  } catch (_) {}
  return PAIR_ID_DEMO;
}

/** requestId生成: REQ- + base36 timestamp + 乱数 */
export function genRequestId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `REQ-${ts.slice(-6)}${rnd}`;
}

/**
 * FormData で audio を POST。戻り値 { success, requestId, error, errorCode, version }
 * @param {Blob} blob
 * @param {string} role - 'parent' | 'child'
 * @param {string} pairId
 * @param {string} dateKey
 * @param {string} [requestId] - 呼び出し側で生成したrequestId（省略時は内部生成）
 */
export async function uploadAudio(blob, role, pairId = getPairId(), _dateKey, requestId = genRequestId()) {
  const dateKey = getDateKeyNY();
  const idToken = await getIdTokenForApi();
  if (!idToken) {
    return { success: false, error: '認証できません', requestId: requestId || 'NO-TOKEN', errorCode: 'auth' };
  }

  if (!role || (role !== 'parent' && role !== 'child')) {
    return { success: false, error: 'role must be "parent" or "child"', requestId: requestId || 'INVALID-ROLE', errorCode: 'invalid-role' };
  }
  const form = new FormData();
  form.append('audio', blob, `recording.${blob.type?.includes('mp4') ? 'mp4' : blob.type?.includes('m4a') ? 'm4a' : 'webm'}`);
  form.append('pairId', pairId);
  form.append('dateKey', dateKey);
  form.append('role', role);

  try {
    const res = await fetch('/api/pair-media', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'X-Request-Id': requestId,
      },
      body: form,
    });
    
    const responseText = await res.text();
    const data = (() => {
      try {
        return JSON.parse(responseText);
      } catch {
        return {};
      }
    })();

    if (!res.ok) {
      return {
        success: false,
        requestId: data?.requestId || requestId,
        error: data?.error || `HTTP ${res.status}`,
        errorCode: data?.errorCode || String(res.status),
      };
    }
    return { success: true, requestId: data?.requestId || requestId, version: data?.version, dateKey: data?.dateKey ?? dateKey };
  } catch (e) {
    return {
      success: false,
      requestId: requestId,
      error: e?.message || 'ネットワークエラー',
      errorCode: 'network',
    };
  }
}

/**
 * 相手の音声を取得。まず blob で取得→objectURL。失敗時は mode=signed で署名URLを取得。
 * 戻り値 { url, mode: 'blob'|'signed', requestId, version, hasAudio } または { error, requestId, errorCode, hasAudio }
 * @param {string} listenRole - 'parent' | 'child' (相手のrole)
 * @param {string} pairId
 * @param {string} dateKey
 */
export async function fetchAudioForPlayback(listenRole, pairId = getPairId(), _dateKey, requestId = genRequestId()) {
  const dateKey = getDateKeyNY();
  const idToken = await getIdTokenForApi();
  if (!idToken) {
    return { error: '認証できません', requestId: requestId || 'NO-TOKEN', errorCode: 'auth', hasAudio: false };
  }

  if (!listenRole || (listenRole !== 'parent' && listenRole !== 'child')) {
    return { error: 'listenRole must be "parent" or "child"', requestId: requestId || 'INVALID-ROLE', errorCode: 'invalid-role', hasAudio: false };
  }

  const cacheBuster = Date.now();
  const base = `/api/pair-media?pairId=${encodeURIComponent(pairId)}&dateKey=${encodeURIComponent(dateKey)}&type=audio&listenRole=${encodeURIComponent(listenRole)}&v=${cacheBuster}`;

  try {
    const resBlob = await fetch(base, {
      headers: {
        Authorization: `Bearer ${idToken}`,
        'X-Request-Id': requestId,
      },
      cache: 'no-store',
    });

    if (!resBlob.ok) {
      const errData = await resBlob.json().catch(() => ({}));
      const hasAudio = errData?.hasAudio === false ? false : null;
      return {
        error: errData?.error || `HTTP ${resBlob.status}`,
        requestId: errData?.requestId || requestId,
        errorCode: errData?.errorCode || String(resBlob.status),
        hasAudio,
      };
    }

    const blob = await resBlob.blob();
    if (!blob || blob.size < 10) {
      return { error: '音声データが空です', requestId: requestId, errorCode: 'empty', hasAudio: false };
    }

    const version = resBlob.headers.get('X-Audio-Version') || resBlob.headers.get('X-Audio-UpdatedAt') || Date.now();
    const objectUrl = URL.createObjectURL(blob);
    return { url: objectUrl, mode: 'blob', requestId: resBlob.headers.get('X-Request-Id') || requestId, version, hasAudio: true };
  } catch (_) {
    try {
      const resSigned = await fetch(base + '&mode=signed', {
        headers: {
          Authorization: `Bearer ${idToken}`,
          'X-Request-Id': requestId,
        },
        cache: 'no-store',
      });
      const data = await resSigned.json().catch(() => ({}));
      if (data?.url) {
        const version = data?.version || data?.updatedAt || Date.now();
        const urlWithVersion = `${data.url}${data.url.includes('?') ? '&' : '?'}v=${version}`;
        return { url: urlWithVersion, mode: 'signed', requestId: data?.requestId || requestId, version, hasAudio: true };
      }
      return {
        error: data?.error || '署名URLの取得に失敗しました',
        requestId: data?.requestId || requestId,
        errorCode: data?.errorCode || 'signed-failed',
        hasAudio: data?.hasAudio === false ? false : null,
      };
    } catch (e2) {
      return {
        error: e2?.message || '再生に失敗しました',
        requestId: requestId,
        errorCode: 'fallback-failed',
        hasAudio: false,
      };
    }
  }
}

/** action=markSeen で seenAt を更新。再生開始時に呼ぶ */
export async function markSeen(listenRole, pairId = getPairId(), _dateKey, requestId = genRequestId()) {
  const dateKey = getDateKeyNY();
  const idToken = await getIdTokenForApi();
  if (!idToken) return { success: false, requestId };
  if (!listenRole || (listenRole !== 'parent' && listenRole !== 'child')) return { success: false, requestId };
  try {
    const res = await fetch(
      `/api/pair-media?action=markSeen&pairId=${encodeURIComponent(pairId)}&dateKey=${encodeURIComponent(dateKey)}&listenRole=${encodeURIComponent(listenRole)}`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${idToken}`, 'X-Request-Id': requestId }, cache: 'no-store' }
    );
    const data = await res.json().catch(() => ({}));
    return { success: res.ok, requestId: data?.requestId ?? requestId };
  } catch {
    return { success: false, requestId };
  }
}

/** 相手の音声が存在するか確認（軽量チェック） */
export async function hasTodayAudio(listenRole, pairId = getPairId()) {
  const dateKey = getDateKeyNY();
  const idToken = await getIdTokenForApi();
  if (!idToken) return false;
  if (!listenRole || (listenRole !== 'parent' && listenRole !== 'child')) return false;
  try {
    const cacheBuster = Date.now();
    const res = await fetch(
      `/api/pair-media?pairId=${encodeURIComponent(pairId)}&dateKey=${encodeURIComponent(dateKey)}&type=audio&listenRole=${encodeURIComponent(listenRole)}&mode=signed&v=${cacheBuster}`,
      { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
    );
    if (res.ok) {
      const d = await res.json().catch(() => ({}));
      return !!d?.url;
    } else if (res.status === 404) {
      // 404は「音声なし」として静かに扱う
      return false;
    } else {
      // 401/500等は警告のみ
      console.warn('[OBSERVE] hasTodayAudio error:', { listenRole, status: res.status });
      return false;
    }
  } catch (_) {
    return false;
  }
}

/** hasAudio + isUnseen（未再生バッジ用）。updatedAt > seenAt または seenAt なしで未再生 */
export async function getListenRoleMeta(listenRole, pairId = getPairId()) {
  const dateKey = getDateKeyNY();
  const idToken = await getIdTokenForApi();
  if (!idToken) return { hasAudio: false, isUnseen: false };
  if (!listenRole || (listenRole !== 'parent' && listenRole !== 'child')) return { hasAudio: false, isUnseen: false };
  try {
    const res = await fetch(
      `/api/pair-media?pairId=${encodeURIComponent(pairId)}&dateKey=${encodeURIComponent(dateKey)}&listenRole=${encodeURIComponent(listenRole)}&mode=signed&v=${Date.now()}`,
      { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
    );
    if (!res.ok) return { hasAudio: false, isUnseen: false };
    const d = await res.json().catch(() => ({}));
    const hasAudio = !!d?.url;
    const updatedAt = d?.updatedAt ?? null;
    const seenAt = d?.seenAt ?? null;
    const isUnseen = hasAudio && (seenAt == null || (updatedAt != null && updatedAt > seenAt));
    return { hasAudio, isUnseen };
  } catch (_) {
    return { hasAudio: false, isUnseen: false };
  }
}
