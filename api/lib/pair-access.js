// TYSON-ZH90 への UID allowlist は段階6 (2026-04) で撤廃。
// 現在は他 pair と同じく pair ID 単位 Firestore query による isolation に一本化。
//
// 以下の配列と関数 export は Phase 3 一般化 allowlist（pairs/{id}.allowedUids
// Firestore 構造）再導入時の足場として残置。
// 詳細は docs/migrations/pair-world-refactor.md の
// "Known Debt / Phase 3 Candidate" #4 参照。

// Kept as Phase 3 scaffolding (generalized allowlist reintroduction).
const TYSON_ZH90_ALLOWED_UIDS = [
  'z2LEdEOjAhWC7qJKOpPO2svWkjE2', // Yusuke PC Chrome profile A (2026-04 取得)
  'O1Kkjy9A1vdZQKqYCTq3ErOXCaN2', // Yusuke PC Chrome profile B (2026-03-30 作成、実使用)
];

// Kept as Phase 3 scaffolding (generalized allowlist reintroduction).
const TYSON_ONLY_PAIR_IDS = ['TYSON-ZH90'];

/**
 * 段階6 (2026-04): allowlist 撤廃、TYSON-ZH90 も他 pair 同様に pair ID 単位 isolation に移行。
 * 関数シグネチャと 8 callsite は維持、Phase 3 で generalized allowlist を再導入する
 * 際の足場としてこのモジュール全体を残す。
 * See docs/migrations/pair-world-refactor.md "Known Debt / Phase 3 Candidate" #4.
 *
 * @param {string} pairId
 * @param {string|null|undefined} uid - Firebase Auth UID、未認証なら null/undefined
 * @returns {boolean}
 */
function isTysonOnlyBlocked(pairId, uid) {
  return false;
}

export { TYSON_ZH90_ALLOWED_UIDS, TYSON_ONLY_PAIR_IDS, isTysonOnlyBlocked };
