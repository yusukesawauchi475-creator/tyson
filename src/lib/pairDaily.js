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

/** NY時間で「昨日」のYYYY-MM-DDを返す（日付ズレ対策用） */
export function getYesterdayKeyNY() {
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

/** getDateKeyNY のエイリアス（後方互換） */
export const getDateKey = getDateKeyNY;

/** MVP用固定 pairId。単一ソース。 */
export const PAIR_ID_DEMO = 'demo';

export const PAIR_ID_STORAGE_KEY = 'tyson_pairId';

/** ユーザーの役割（parent / child）を localStorage で管理 */
export const USER_ROLE_STORAGE_KEY = 'tyson_userRole';
export function getUserRole() {
  try { const v = localStorage.getItem(USER_ROLE_STORAGE_KEY); return (v === 'parent' || v === 'child') ? v : null; } catch { return null; }
}
export function setUserRole(role) {
  try { localStorage.setItem(USER_ROLE_STORAGE_KEY, role); } catch {}
}
export function clearUserRole() {
  try { localStorage.removeItem(USER_ROLE_STORAGE_KEY); } catch {}
}

/** ランダムなユニーク pairId を生成: "PAIR-" + 6文字（誤読しにくい文字のみ）*/
export function generatePairId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // I, O, 0, 1 を除外
  let id = 'PAIR-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id; // 例: "PAIR-A3F7C9"
}

/**
 * URLに ?pairId=XXXX がある場合のみ localStorage に保存する。
 * 自動生成はしない（'demo' フォールバックを維持するため）。
 */
export function initPairId() {
  if (typeof window === 'undefined') return;
  try {
    const hash = window.location.hash || '';
    const qs = hash.indexOf('?') >= 0 ? hash.slice(hash.indexOf('?') + 1) : '';
    const fromQuery = new URLSearchParams(qs).get('pairId')?.trim?.();
    if (fromQuery) {
      localStorage.setItem(PAIR_ID_STORAGE_KEY, fromQuery);
    }
  } catch (_) {}
}

/**
 * pairId を取得（同期）。
 * 優先順位: URLクエリ > localStorage > 'demo'。
 * URLに ?pairId=XXXX があれば常に優先し、localStorageに上書き保存する。
 */
export function getPairId() {
  if (typeof window === 'undefined') return PAIR_ID_DEMO;
  try {
    // URLクエリを最優先（新規リンクで別pairIdに切り替わる）
    const hash = window.location.hash || '';
    const qIndex = hash.indexOf('?');
    const queryString = qIndex >= 0 ? hash.slice(qIndex + 1) : '';
    const fromQuery = new URLSearchParams(queryString).get('pairId')?.trim?.();
    if (fromQuery) {
      try { localStorage.setItem(PAIR_ID_STORAGE_KEY, fromQuery); } catch (_) {}
      return fromQuery;
    }
    // URLになければlocalStorageを使う
    const fromStorage = localStorage.getItem(PAIR_ID_STORAGE_KEY)?.trim?.();
    if (fromStorage) return fromStorage;
  } catch (_) {}
  return PAIR_ID_DEMO;
}

/** pairIdが明示的に設定されているか（'demo'フォールバックでないか） */
export function hasPairId() {
  if (typeof window === 'undefined') return false;
  try {
    const fromStorage = localStorage.getItem(PAIR_ID_STORAGE_KEY)?.trim?.();
    if (fromStorage) return true;
    const hash = window.location.hash || '';
    const qIndex = hash.indexOf('?');
    const queryString = qIndex >= 0 ? hash.slice(qIndex + 1) : '';
    const fromQuery = new URLSearchParams(queryString).get('pairId')?.trim?.();
    if (fromQuery) return true;
  } catch (_) {}
  return false;
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
  if (pairId === 'demo' && !hasPairId()) {
    return { success: false, error: 'ペアIDが見つかりません。招待リンクから再アクセスしてください。', requestId: requestId || 'NO-PAIR', errorCode: 'no_pair_id' };
  }
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
  const dateKey = _dateKey || getDateKeyNY();
  console.log('[fetchAudio] start', { listenRole, pairId, dateKey, requestId });
  const idToken = await getIdTokenForApi();
  if (!idToken) {
    console.error('[fetchAudio] no idToken');
    return { error: '認証できません', requestId: requestId || 'NO-TOKEN', errorCode: 'auth', hasAudio: false };
  }

  if (!listenRole || (listenRole !== 'parent' && listenRole !== 'child')) {
    return { error: 'listenRole must be "parent" or "child"', requestId: requestId || 'INVALID-ROLE', errorCode: 'invalid-role', hasAudio: false };
  }

  const cacheBuster = Date.now();
  const base = `/api/pair-media?pairId=${encodeURIComponent(pairId)}&dateKey=${encodeURIComponent(dateKey)}&type=audio&listenRole=${encodeURIComponent(listenRole)}&v=${cacheBuster}`;

  // Step 1: まずメタデータ取得（mode=signed）で hasAudio を確認
  try {
    console.log('[fetchAudio] checking metadata...');
    const metaRes = await fetch(base + '&mode=signed', {
      headers: { Authorization: `Bearer ${idToken}`, 'X-Request-Id': requestId },
      cache: 'no-store',
    });
    console.log('[fetchAudio] meta status:', metaRes.status);
    if (!metaRes.ok) {
      const errData = await metaRes.json().catch(() => ({}));
      console.error('[fetchAudio] meta error:', metaRes.status, errData);
      return {
        error: errData?.error || `HTTP ${metaRes.status}`,
        requestId: errData?.requestId || requestId,
        errorCode: errData?.errorCode || String(metaRes.status),
        hasAudio: errData?.hasAudio === false ? false : null,
      };
    }
    const meta = await metaRes.json().catch(() => ({}));
    console.log('[fetchAudio] meta:', { hasAudio: meta?.hasAudio, hasUrl: !!meta?.url });
    if (meta?.hasAudio === false || !meta?.url) {
      return {
        error: null,
        requestId: meta?.requestId || requestId,
        hasAudio: false,
      };
    }
  } catch (metaErr) {
    console.error('[fetchAudio] meta fetch error:', metaErr);
  }

  // Step 2: 音声バイナリを直接取得（blob endpoint、same-origin なので CORS 問題なし）
  try {
    console.log('[fetchAudio] fetching audio blob...');
    const res = await fetch(base, {
      headers: { Authorization: `Bearer ${idToken}`, 'X-Request-Id': requestId },
      cache: 'no-store',
    });
    console.log('[fetchAudio] blob status:', res.status, 'content-type:', res.headers.get('Content-Type'));

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('[fetchAudio] blob error:', res.status, errData);
      return {
        error: errData?.error || `HTTP ${res.status}`,
        requestId: errData?.requestId || requestId,
        errorCode: errData?.errorCode || String(res.status),
        hasAudio: errData?.hasAudio === false ? false : null,
      };
    }

    const contentType = res.headers.get('Content-Type') || 'audio/mp4';
    const rawBlob = await res.blob();
    console.log('[fetchAudio] blob size:', rawBlob.size, 'type:', rawBlob.type);

    if (!rawBlob || rawBlob.size < 10) {
      return { error: '音声データが空です', requestId, errorCode: 'empty', hasAudio: false };
    }

    // Blob の MIME type を強制設定（ブラウザがContent-Typeを無視する場合の対策）
    const blob = new Blob([rawBlob], { type: contentType });
    const objectUrl = URL.createObjectURL(blob);
    const version = res.headers.get('X-Audio-Version') || Date.now();
    console.log('[fetchAudio] objectUrl created, type:', contentType);

    return { url: objectUrl, mode: 'blob', requestId: res.headers.get('X-Request-Id') || requestId, version, hasAudio: true };
  } catch (e) {
    console.error('[fetchAudio] blob fetch error:', e);
    return {
      error: e?.message || '再生に失敗しました',
      requestId,
      errorCode: 'network',
      hasAudio: false,
    };
  }
}

/** action=markSeen で seenAt を更新。再生開始時に呼ぶ */
export async function markSeen(listenRole, pairId = getPairId(), _dateKey, requestId = genRequestId()) {
  // 呼び出し側が dateKey を指定した場合はそれを使う（昨日分対応）
  const dateKey = _dateKey || getDateKeyNY();
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

/** streakを取得。戻り値 { count, lastDateKey, firstDateKey } */
export async function getStreak(pairId = getPairId()) {
  const idToken = await getIdTokenForApi();
  if (!idToken) return { count: 0, lastDateKey: null, firstDateKey: null };
  try {
    const res = await fetch(`/api/streak?pairId=${encodeURIComponent(pairId)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return { count: 0, lastDateKey: null, firstDateKey: null };
    const data = await res.json();
    return { count: data.count ?? 0, lastDateKey: data.lastDateKey ?? null, firstDateKey: data.firstDateKey ?? null };
  } catch {
    return { count: 0, lastDateKey: null, firstDateKey: null };
  }
}

/** streakを更新。親と子の両方が録音した日に呼ぶ */
export async function updateStreak(pairId = getPairId()) {
  const idToken = await getIdTokenForApi();
  if (!idToken) return { success: false };
  try {
    const res = await fetch('/api/streak', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ pairId, dateKey: getDateKeyNY() }),
    });
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: true, count: data.count ?? 0 };
  } catch {
    return { success: false };
  }
}

/** hasAudio + isUnseen（未再生バッジ用）。updatedAt > seenAt または seenAt なしで未再生 */
export async function getListenRoleMeta(listenRole, pairId = getPairId()) {
  const todayKey = getDateKeyNY();
  console.log('[getListenRoleMeta] pairId:', pairId, 'listenRole:', listenRole, 'todayKey:', todayKey);
  const idToken = await getIdTokenForApi();
  console.log('[getListenRoleMeta] idToken:', idToken ? `OK(len=${idToken.length})` : 'NULL');
  if (!idToken) return { hasAudio: null, isUnseen: false }; // auth失敗→null（「まだです」誤表示を防ぐ）
  if (!listenRole || (listenRole !== 'parent' && listenRole !== 'child')) return { hasAudio: false, isUnseen: false };

  // サーバー側で今日→昨日フォールバックを実装済み。クライアントは1回のフェッチでよい。
  const url = `/api/pair-media?pairId=${encodeURIComponent(pairId)}&listenRole=${encodeURIComponent(listenRole)}&mode=signed&v=${Date.now()}`;
  console.log('[getListenRoleMeta] fetch:', url);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' });
    console.log('[getListenRoleMeta] status:', res.status);
    if (!res.ok) {
      console.log('[getListenRoleMeta] error status:', res.status);
      return { hasAudio: null, isUnseen: false }; // API エラー→null（誤表示防止）
    }
    const d = await res.json().catch(() => ({}));
    console.log('[getListenRoleMeta] json:', JSON.stringify(d).slice(0, 200));
    const hasAudio = !!d?.url;
    const updatedAt = d?.updatedAt ?? null;
    const seenAt = d?.seenAt ?? null;
    const isUnseen = hasAudio && (seenAt == null || (updatedAt != null && updatedAt > seenAt));
    console.log('[getListenRoleMeta] hasAudio:', hasAudio, 'isUnseen:', isUnseen);
    return { hasAudio, isUnseen };
  } catch (err) {
    console.log('[getListenRoleMeta] catch:', err?.message);
    return { hasAudio: null, isUnseen: false }; // ネットワークエラー→null（誤表示防止）
  }
}
