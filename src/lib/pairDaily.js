import { getIdTokenForApi } from './firebase.js';

/** NY時間（America/New_York、DST対応）で YYYY-MM-DD を返す */
export function getDateKey() {
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
  // フォールバック：端末ローカル日付（JST固定には戻さない）
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** MVP用固定 pairId。後で invite token 方式に戻す */
export const PAIR_ID_DEMO = 'demo';

/**
 * FormData で audio を POST。戻り値 { success, requestId, error, errorCode, version }
 * @param {Blob} blob
 * @param {string} role - 'parent' | 'child'
 * @param {string} pairId
 * @param {string} dateKey
 */
export async function uploadAudio(blob, role, pairId = PAIR_ID_DEMO, dateKey = getDateKey()) {
  console.log('[OBSERVE] uploadAudio called:', { role, pairId, dateKey });
  const idToken = await getIdTokenForApi();
  if (!idToken) {
    console.log('[OBSERVE] uploadAudio: idToken missing');
    return { success: false, error: '認証できません', requestId: 'NO-TOKEN', errorCode: 'auth' };
  }

  if (!role || (role !== 'parent' && role !== 'child')) {
    return { success: false, error: 'role must be "parent" or "child"', requestId: 'INVALID-ROLE', errorCode: 'invalid-role' };
  }

  const reqId = 'REQ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const form = new FormData();
  form.append('audio', blob, `recording.${blob.type?.includes('mp4') ? 'mp4' : blob.type?.includes('m4a') ? 'm4a' : 'webm'}`);
  form.append('pairId', pairId);
  form.append('dateKey', dateKey);
  form.append('role', role);

  const formKeys = [];
  for (const key of form.keys()) formKeys.push(key);

  console.log('[OBSERVE] uploadAudio fetch start:', {
    url: '/api/pair-media',
    method: 'POST',
    authHeaderPresent: !!idToken,
    bodyIsFormData: form instanceof FormData,
    formKeys: formKeys,
  });

  try {
    const res = await fetch('/api/pair-media', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
      body: form,
    });
    
    const responseText = await res.text();
    const responseSnippet = responseText.length > 200 ? responseText.slice(0, 200) + '...' : responseText;
    const data = (() => {
      try {
        return JSON.parse(responseText);
      } catch {
        return {};
      }
    })();

    console.log('[OBSERVE] uploadAudio fetch complete:', {
      responseStatus: res.status,
      responseOk: res.ok,
      responseSnippet: responseSnippet.replace(/Bearer\s+[^\s"]+/gi, 'Bearer [MASKED]'),
    });

    if (!res.ok) {
      console.error(`[pair-media] ${reqId} error:`, data?.errorCode ?? res.status, data?.error);
      return {
        success: false,
        requestId: data?.requestId || reqId,
        error: data?.error || `HTTP ${res.status}`,
        errorCode: data?.errorCode || String(res.status),
      };
    }
    console.log('[OBSERVE] uploadAudio success:', { role, version: data?.version });
    return { success: true, requestId: data?.requestId || reqId, version: data?.version };
  } catch (e) {
    console.error(`[pair-media] ${reqId} fetch failed:`, e?.message);
    console.log('[OBSERVE] uploadAudio fetch exception:', { errorName: e?.name, errorMessage: e?.message });
    return {
      success: false,
      requestId: reqId,
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
export async function fetchAudioForPlayback(listenRole, pairId = PAIR_ID_DEMO, dateKey = getDateKey()) {
  console.log('[OBSERVE] fetchAudioForPlayback called:', { listenRole, pairId, dateKey });
  const idToken = await getIdTokenForApi();
  if (!idToken) {
    return { error: '認証できません', requestId: 'NO-TOKEN', errorCode: 'auth', hasAudio: false };
  }

  if (!listenRole || (listenRole !== 'parent' && listenRole !== 'child')) {
    return { error: 'listenRole must be "parent" or "child"', requestId: 'INVALID-ROLE', errorCode: 'invalid-role', hasAudio: false };
  }

  const reqId = 'REQ-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const cacheBuster = Date.now();
  const base = `/api/pair-media?pairId=${encodeURIComponent(pairId)}&dateKey=${encodeURIComponent(dateKey)}&type=audio&listenRole=${encodeURIComponent(listenRole)}&v=${cacheBuster}`;

  try {
    const resBlob = await fetch(base, {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: 'no-store',
    });

    if (!resBlob.ok) {
      const errData = await resBlob.json().catch(() => ({}));
      const hasAudio = errData?.hasAudio === false ? false : null;
      return {
        error: errData?.error || `HTTP ${resBlob.status}`,
        requestId: errData?.requestId || reqId,
        errorCode: errData?.errorCode || String(resBlob.status),
        hasAudio,
      };
    }

    const blob = await resBlob.blob();
    if (!blob || blob.size < 10) {
      return { error: '音声データが空です', requestId: reqId, errorCode: 'empty', hasAudio: false };
    }

    const version = resBlob.headers.get('X-Audio-Version') || Date.now();
    const objectUrl = URL.createObjectURL(blob);
    console.log('[OBSERVE] fetchAudioForPlayback blob success:', { listenRole, pairId, dateKey, version, objectUrlCreated: true });
    return { url: objectUrl, mode: 'blob', requestId: reqId, version, hasAudio: true };
  } catch (_) {
    try {
      const resSigned = await fetch(base + '&mode=signed', {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const data = await resSigned.json().catch(() => ({}));
      if (data?.url) {
        const version = data?.version || Date.now();
        // signed URLはHTTP URLなので、versionをqueryとして付与してもOK（キャッシュ回避）
        const urlWithVersion = `${data.url}${data.url.includes('?') ? '&' : '?'}v=${version}`;
        console.log('[OBSERVE] fetchAudioForPlayback signed success:', { listenRole, version, urlLength: urlWithVersion.length });
        return { url: urlWithVersion, mode: 'signed', requestId: data?.requestId || reqId, version, hasAudio: true };
      }
      return {
        error: data?.error || '署名URLの取得に失敗しました',
        requestId: data?.requestId || reqId,
        errorCode: data?.errorCode || 'signed-failed',
        hasAudio: data?.hasAudio === false ? false : null,
      };
    } catch (e2) {
      console.error(`[pair-media] ${reqId} blob+signed both failed:`, e2?.message);
      return {
        error: e2?.message || '再生に失敗しました',
        requestId: reqId,
        errorCode: 'fallback-failed',
        hasAudio: false,
      };
    }
  }
}

/** 相手の音声が存在するか確認（軽量チェック） */
export async function hasTodayAudio(listenRole, pairId = PAIR_ID_DEMO, dateKey = getDateKey()) {
  console.log('[OBSERVE] hasTodayAudio called:', { listenRole, dateKey });
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
      const hasAudio = !!d?.url;
      console.log('[OBSERVE] hasTodayAudio result:', { listenRole, hasAudio });
      return hasAudio;
    } else {
      const d = await res.json().catch(() => ({}));
      const hasAudio = d?.hasAudio === false ? false : null;
      console.log('[OBSERVE] hasTodayAudio error:', { listenRole, status: res.status, hasAudio });
      return hasAudio === false ? false : false; // エラー時はfalse扱い
    }
  } catch (_) {
    console.log('[OBSERVE] hasTodayAudio exception:', { listenRole });
    return false;
  }
}
