// TYSON-ZH90 への UID allowlist 判定を一元管理する
//
// 運用:
// - TYSON_ZH90_ALLOWED_UIDS に列挙された UID のみアクセス可能
// - 他 UID（匿名含む）は 403 拒否
// - 親 Android UID は取得次第、後日追加する
//
// このファイルを変更する時は commit message に "tyson-zh90-unlock:" プレフィックス推奨

const TYSON_ZH90_ALLOWED_UIDS = [
  'z2LEdEOjAhWC7qJKOpPO2svWkjE2', // Yusuke PC Chrome (2026-04 取得)
  // TODO: 親 Android UID を追加（取得次第）
];

const TYSON_ONLY_PAIR_IDS = ['TYSON-ZH90'];

/**
 * pairId が TYSON-ZH90 系で、かつ uid が allowlist にない場合 true を返す。
 * true なら API ハンドラ側で 403 返却すべき。
 *
 * @param {string} pairId
 * @param {string|null|undefined} uid - Firebase Auth UID、未認証なら null/undefined
 * @returns {boolean}
 */
function isTysonOnlyBlocked(pairId, uid) {
  if (!TYSON_ONLY_PAIR_IDS.includes(pairId)) return false;
  if (!uid) return true;
  return !TYSON_ZH90_ALLOWED_UIDS.includes(uid);
}

export { TYSON_ZH90_ALLOWED_UIDS, TYSON_ONLY_PAIR_IDS, isTysonOnlyBlocked };
