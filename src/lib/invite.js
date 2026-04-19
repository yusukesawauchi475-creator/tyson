// 招待 URL 生成とクリップボードコピーの共通 helper
//
// 段階5 で navigator.share を撤去、clipboard 一本化方針。
// 呼び出し側で既存 toast UI (toastMsg state + inline style) に feedback を流す。
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase.js';

const BASE_URL = 'https://www.humfamily.com';

/**
 * slug から招待 URL を同期的に生成。
 * @param {string} slug - pair slug（例: 'ulf1q6'）
 * @returns {string}
 */
export function buildInviteUrl(slug) {
  if (!slug) throw new Error('buildInviteUrl: slug is required');
  return `${BASE_URL}/pair/${slug}?openExternalBrowser=1`;
}

/**
 * pairId から Firestore lookup で number（slug）を取得、招待 URL を生成。
 * number 未発行 / lookup 失敗時はレガシー HashRouter 形式へ fallback。
 * @param {string} pairId
 * @returns {Promise<string>}
 */
export async function resolveAndBuildInviteUrl(pairId) {
  if (!pairId) throw new Error('resolveAndBuildInviteUrl: pairId is required');
  try {
    const snap = await getDoc(doc(db, 'pairs', pairId));
    const num = snap.data()?.number;
    if (num) return `${BASE_URL}/pair/${num}?openExternalBrowser=1`;
  } catch (e) {
    console.error('resolveAndBuildInviteUrl lookup failed:', e);
  }
  // Legacy fallback（number 未発行 pair 用）
  return `${BASE_URL}/#/?pairId=${encodeURIComponent(pairId)}&openExternalBrowser=1`;
}

/**
 * URL をクリップボードにコピー。成功/失敗を返却。
 * @param {string} url
 * @returns {Promise<{ success: boolean, error?: Error }>}
 */
export async function copyInviteLink(url) {
  if (!url) throw new Error('copyInviteLink: url is required');
  try {
    await navigator.clipboard.writeText(url);
    return { success: true };
  } catch (e) {
    console.error('copyInviteLink failed:', e);
    return { success: false, error: e };
  }
}
