/**
 * pairSlug.js — pair slug 生成の単一 helper (Phase X-1)
 *
 * core-philosophy.md 軸 1 (upstream format 統一) + 軸 3 (物理的に違反生成不能) を物理 enforcement.
 * 全 slug 生成 path はこの module を経由する。bypass 経路は Firestore Rules で block (firestore.rules).
 *
 * spec:
 *   - length: 8 chars (hardcoded、caller が変更不能)
 *   - chars: Crockford Base32 風 (l/o/0/1 除外、判別困難文字を物理的に排除)
 *   - 32^8 ≈ 2^40 = 1.1T combinations
 */

const SLUG_LENGTH = 8
const SLUG_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789' // 32 chars, l/o/0/1 除外

/**
 * generateSlug — 単発の random slug 生成 (衝突 check なし)
 * @returns {string} 8-char Crockford Base32 風 slug
 */
export function generateSlug() {
  let result = ''
  for (let i = 0; i < SLUG_LENGTH; i++) {
    result += SLUG_CHARS.charAt(Math.floor(Math.random() * SLUG_CHARS.length))
  }
  return result
}

/**
 * findUniqueSlug — Firestore pair_numbers 内で重複しない slug を生成
 * @param {function} existsCheck (slug) => Promise<boolean>
 *                   slug が既存 collection 内に存在するか確認する関数を caller が渡す
 *                   理由: admin SDK と client SDK で API が違うため、helper 内に Firestore 依存を入れない
 * @param {number} maxRetry default 20
 * @returns {Promise<string>} 衝突しない slug
 * @throws maxRetry 超過時 Error
 */
export async function findUniqueSlug(existsCheck, maxRetry = 20) {
  for (let i = 0; i < maxRetry; i++) {
    const candidate = generateSlug()
    const exists = await existsCheck(candidate)
    if (!exists) return candidate
  }
  throw new Error(`findUniqueSlug: max retry exceeded (${maxRetry})`)
}

// spec metadata (audit / debug 用、external 参照可能)
export const SLUG_SPEC = {
  length: SLUG_LENGTH,
  chars: SLUG_CHARS,
  charsCount: SLUG_CHARS.length,
  entropyBits: Math.log2(Math.pow(SLUG_CHARS.length, SLUG_LENGTH)).toFixed(1),
}
