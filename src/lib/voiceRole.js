/**
 * 段階10-a: immutable 訂正追記モデルで voice の表示 role を決定する helper。
 *
 * 原則:
 * - audioPath[] item は書き換えない。訂正は correctedRole/correctedAt/correctedBy/
 *   correctionReason/correctionReasonDetail を追記する形で行う。
 * - client 側（Album / Admin / AI analysis）は effectiveRole = correctedRole ?? roleAtUpload
 *   で分類し、訂正後の意図を反映する。
 * - 30 年 sustainability のため、原 data は将来の分析・監査のため永続化される。
 */

/**
 * voice item の「実効 role」を返す。
 * - correctedRole があれば最優先（admin が訂正した role）
 * - なければ roleAtUpload（録音時に client が送信した role）
 * - 両方欠落なら fallbackRole（item が保存されている audioPath[] の slot 名）
 *
 * @param {object} item - audioPath[] の 1 要素
 * @param {'parent'|'child'|null} fallbackRole - 新 schema 以前の legacy record 用
 * @returns {'parent'|'child'|null}
 */
export function getEffectiveRole(item, fallbackRole) {
  if (!item) return fallbackRole ?? null;
  if (item.correctedRole === 'parent' || item.correctedRole === 'child') {
    return item.correctedRole;
  }
  if (item.roleAtUpload === 'parent' || item.roleAtUpload === 'child') {
    return item.roleAtUpload;
  }
  return fallbackRole ?? null;
}

/**
 * item が admin により訂正されたか判定。UI で ✏️ マーク等を表示する用途。
 *
 * @param {object} item
 * @returns {boolean}
 */
export function isCorrected(item) {
  return Boolean(item && item.correctedRole);
}
