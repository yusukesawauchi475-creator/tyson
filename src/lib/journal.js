import { getIdTokenForApi } from './firebase.js';
import { getDateKeyNY, getPairId, genRequestId } from './pairDaily.js';

/** File を data URL (base64) に変換 */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('File read failed'));
    r.readAsDataURL(file);
  });
}

const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.65;

/** 画像を必要なら縮小して返す（ジャーナル用） */
export function resizeImageIfNeeded(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w <= MAX_IMAGE_EDGE && h <= MAX_IMAGE_EDGE) {
        resolve(file);
        return;
      }
      const scale = Math.min(MAX_IMAGE_EDGE / w, MAX_IMAGE_EDGE / h);
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale);
      c.height = Math.round(h * scale);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(new File([blob], file.name || 'page-01.jpg', { type: file.type || 'image/jpeg' }));
        },
        file.type || 'image/jpeg',
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

/**
 * ジャーナル画像をアップロード（1日1枚）。JSON body (imageDataUrl) で送信。
 * @param {File} file - 画像ファイル（クライアントで必要なら縮小済み）
 * @param {string} [requestId] - X-Request-Id に載せるID（省略時は genRequestId()）
 * @param {string} [pairId]
 * @param {string} [role] - 'parent' | 'child'（省略時は parent）
 * @returns {Promise<{ success: boolean, requestId?: string, dateKey?: string, storagePath?: string, error?: string, errorCode?: string }>}
 */
export async function uploadJournalImage(file, requestId = genRequestId(), pairId, role = 'parent') {
  const pid = pairId ?? getPairId();
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

  const roleVal = role === 'child' ? 'child' : 'parent';
  try {
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({
        pairId: pid,
        role: roleVal,
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
 * 当日のジャーナルメタを取得
 * @param {string} [pairId]
 * @param {string} [role] - 'parent' | 'child'（省略時は parent）
 * @returns {Promise<{ hasImage: boolean, requestId?: string, dateKey?: string, storagePath?: string, updatedAt?: number }>}
 */
export async function fetchTodayJournalMeta(pairId, role = 'parent') {
  const pid = pairId ?? getPairId();
  const idToken = await getIdTokenForApi();
  if (!idToken) return { hasImage: false };

  const roleVal = role === 'child' ? 'child' : 'parent';
  const clientDateKey = getDateKeyNY();
  try {
    const res = await fetch(
      `/api/journal?pairId=${encodeURIComponent(pid)}&role=${encodeURIComponent(roleVal)}&clientDateKey=${encodeURIComponent(clientDateKey)}&v=${Date.now()}`,
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

/**
 * 親/子の今日のジャーナル画像表示用URLを取得（GET /api/journal の url/signedUrl を返す）
 * @param {string} [pairId]
 * @param {string} [role] - 'parent' | 'child'（省略時は parent）
 * @returns {Promise<string|null>}
 */
export async function fetchJournalViewUrl(pairId, role = 'parent') {
  const pid = pairId ?? getPairId();
  const idToken = await getIdTokenForApi();
  if (!idToken) throw new Error('認証できません');

  const roleVal = role === 'child' ? 'child' : 'parent';
  const clientDateKey = getDateKeyNY();
  const res = await fetch(
    `/api/journal?pairId=${encodeURIComponent(pid)}&role=${encodeURIComponent(roleVal)}&clientDateKey=${encodeURIComponent(clientDateKey)}&v=${Date.now()}`,
    { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  if (!data?.hasImage) return null;
  const url =
    data.url ||
    data.signedUrl ||
    data.downloadUrl ||
    data.meta?.url ||
    data.meta?.signedUrl ||
    null;
  return typeof url === 'string' ? url : null;
}
