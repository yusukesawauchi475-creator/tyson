import { getIdTokenForApi } from './firebase.js';

/** JST で YYYY-MM-DD を返す */
export function getDateKey() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** MVP用固定 pairId。後で invite token 方式に戻す */
export const PAIR_ID_DEMO = 'demo';

/**
 * FormData で audio を POST。戻り値 { success, requestId, error, errorCode }
 */
export async function uploadAudio(blob, pairId = PAIR_ID_DEMO, dateKey = getDateKey()) {
  const idToken = await getIdTokenForApi();
  if (!idToken) {
    return { success: false, error: '認証できません', requestId: 'NO-TOKEN', errorCode: 'auth' };
  }

  const reqId = 'REQ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const form = new FormData();
  form.append('audio', blob, `recording.${blob.type?.includes('mp4') ? 'mp4' : blob.type?.includes('m4a') ? 'm4a' : 'webm'}`);
  form.append('pairId', pairId);
  form.append('dateKey', dateKey);

  try {
    const res = await fetch('/api/pair-media', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[pair-media] ${reqId} error:`, data?.errorCode ?? res.status, data?.error);
      return {
        success: false,
        requestId: data?.requestId || reqId,
        error: data?.error || `HTTP ${res.status}`,
        errorCode: data?.errorCode || String(res.status),
      };
    }
    return { success: true, requestId: data?.requestId || reqId };
  } catch (e) {
    console.error(`[pair-media] ${reqId} fetch failed:`, e?.message);
    return {
      success: false,
      requestId: reqId,
      error: e?.message || 'ネットワークエラー',
      errorCode: 'network',
    };
  }
}

/**
 * 今日の音声を取得。まず blob で取得→objectURL。失敗時は mode=signed で署名URLを取得。
 * 戻り値 { url, mode: 'blob'|'signed', requestId } または { error, requestId, errorCode }
 */
export async function fetchAudioForPlayback(pairId = PAIR_ID_DEMO, dateKey = getDateKey()) {
  const idToken = await getIdTokenForApi();
  if (!idToken) {
    return { error: '認証できません', requestId: 'NO-TOKEN', errorCode: 'auth' };
  }

  const reqId = 'REQ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const base = `/api/pair-media?pairId=${encodeURIComponent(pairId)}&dateKey=${encodeURIComponent(dateKey)}&type=audio`;

  try {
    const resBlob = await fetch(base, {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!resBlob.ok) {
      const errData = await resBlob.json().catch(() => ({}));
      return {
        error: errData?.error || `HTTP ${resBlob.status}`,
        requestId: errData?.requestId || reqId,
        errorCode: errData?.errorCode || String(resBlob.status),
      };
    }

    const blob = await resBlob.blob();
    if (!blob || blob.size < 10) {
      return { error: '音声データが空です', requestId: reqId, errorCode: 'empty' };
    }

    const url = URL.createObjectURL(blob);
    return { url, mode: 'blob', requestId: reqId };
  } catch (_) {
    try {
      const resSigned = await fetch(base + '&mode=signed', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await resSigned.json().catch(() => ({}));
      if (data?.url) {
        return { url: data.url, mode: 'signed', requestId: data?.requestId || reqId };
      }
      return {
        error: data?.error || '署名URLの取得に失敗しました',
        requestId: data?.requestId || reqId,
        errorCode: data?.errorCode || 'signed-failed',
      };
    } catch (e2) {
      console.error(`[pair-media] ${reqId} blob+signed both failed:`, e2?.message);
      return {
        error: e2?.message || '再生に失敗しました',
        requestId: reqId,
        errorCode: 'fallback-failed',
      };
    }
  }
}

/** 今日の音声が存在するか確認（軽量チェック） */
export async function hasTodayAudio(pairId = PAIR_ID_DEMO, dateKey = getDateKey()) {
  const idToken = await getIdTokenForApi();
  if (!idToken) return false;
  try {
    const res = await fetch(
      `/api/pair-media?pairId=${encodeURIComponent(pairId)}&dateKey=${encodeURIComponent(dateKey)}&type=audio&mode=signed`,
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    if (res.ok) {
      const d = await res.json().catch(() => ({}));
      return !!d?.url;
    }
  } catch (_) {}
  return false;
}
