import { getIdTokenForApi } from './firebase.js';
import { getDateKeyNY, PAIR_ID_DEMO, genRequestId } from './pairDaily.js';

/** File を data URL (base64) に変換 */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('File read failed'));
    r.readAsDataURL(file);
  });
}

/**
 * ジャーナル画像をアップロード（1日1枚・親用）。JSON body (imageDataUrl) で送信。
 * @param {File} file - 画像ファイル（クライアントで必要なら縮小済み）
 * @param {string} [requestId] - X-Request-Id に載せるID（省略時は genRequestId()）
 * @param {string} [pairId]
 * @returns {Promise<{ success: boolean, requestId?: string, dateKey?: string, storagePath?: string, error?: string, errorCode?: string }>}
 */
export async function uploadJournalImage(file, requestId = genRequestId(), pairId = PAIR_ID_DEMO) {
  const idToken = await getIdTokenForApi();
  if (!idToken) {
    return { success: false, error: '認証できません', requestId, errorCode: 'auth' };
  }

  if (!file || !(file instanceof File)) {
    return { success: false, error: 'image file required', requestId, errorCode: 'invalid_input' };
  }

  let imageDataUrl;
  try {
    imageDataUrl = await fileToDataUrl(file);
  } catch (e) {
    return { success: false, error: '画像の読み込みに失敗しました', requestId, errorCode: 'read_failed' };
  }

  try {
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({
        pairId,
        role: 'parent',
        requestId,
        imageDataUrl,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        requestId: data?.requestId ?? requestId,
        error: data?.error || `HTTP ${res.status}`,
        errorCode: data?.errorCode || String(res.status),
      };
    }
    return {
      success: true,
      requestId: data?.requestId ?? requestId,
      dateKey: data?.dateKey,
      storagePath: data?.storagePath,
    };
  } catch (e) {
    return {
      success: false,
      requestId,
      error: e?.message || 'ネットワークエラー',
      errorCode: 'network',
    };
  }
}

/**
 * 当日のジャーナルメタを取得（親用）
 * @param {string} [pairId]
 * @returns {Promise<{ hasImage: boolean, requestId?: string, dateKey?: string, storagePath?: string, updatedAt?: number }>}
 */
export async function fetchTodayJournalMeta(pairId = PAIR_ID_DEMO) {
  const idToken = await getIdTokenForApi();
  if (!idToken) return { hasImage: false };

  const clientDateKey = getDateKeyNY();
  try {
    const res = await fetch(
      `/api/journal?pairId=${encodeURIComponent(pairId)}&role=parent&clientDateKey=${encodeURIComponent(clientDateKey)}&v=${Date.now()}`,
      { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
    );
    if (!res.ok) return { hasImage: false };
    const data = await res.json().catch(() => ({}));
    return {
      hasImage: !!data?.hasImage,
      requestId: data?.requestId ?? undefined,
      dateKey: data?.dateKey ?? undefined,
      storagePath: data?.storagePath ?? undefined,
      updatedAt: data?.updatedAt ?? undefined,
    };
  } catch (_) {
    return { hasImage: false };
  }
}
