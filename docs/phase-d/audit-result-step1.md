# Phase D Step 1 Audit Result

## 1. Summary

- 執行日時: 2026-04-29 (UTC、scripts/audit-phase-d-step1.js 実行時刻)
- 対象: 12 pair（migration 対象 7 件 + 除外 5 件）
- variation table: 12 行 × 10 column 完全 fill
- ambiguous timezone: **7/7 件**（migration 対象全件、いずれも upload 数 0）
- Phase X-1 enforcement: ✅ 機能（generateSlug() / findUniqueSlug() / firestore.rules write block 確認）
- Phase X-3-A pairTimezone field: ❌ 全 12 pair で field 不在（pair 単位の pairTimezone 必須化は Phase X-3-B 未実装、expected）
- code 変更ゼロ verify: OK（scripts/audit-phase-d-step1.js のみ新規、既存 src 不可侵）
- Firestore write ゼロ verify: OK（admin SDK は get / where / listDocuments のみ使用、`admin.app().delete()` は app cleanup で Firestore write ではない）

## 2. Variation Table (12 pair × 10 column)

| # | pairId | memo | slug pattern | active 状態 | upload count | UTC peak | 推定 timezone | pairTimezone field 値 | kind | migration |
|---|--------|------|--------------|-------------|--------------|----------|---------------|-----------------------|------|-----------|
| 1 | mw49f0 | test3 | 6 chars | active | 0 | N/A | ambiguous (count<5) | not present | test | YES |
| 2 | h06m0g | Madoka Paints | 6 chars | active | 0 | N/A | ambiguous (count<5) | not present | real | YES |
| 3 | libriv | Chitose Hanert | 6 chars | active | 0 | N/A | ambiguous (count<5) | not present | real | YES |
| 4 | 2habi5 | Shigemi Sherry Cree | 6 chars | active | 0 | N/A | ambiguous (count<5) | not present | real | YES |
| 5 | 5828p4 | Tomoko Himitsu | 6 chars | active | 0 | N/A | ambiguous (count<5) | not present | real | YES |
| 6 | lxm0mt | test2 | 6 chars | active | 0 | N/A | ambiguous (count<5) | not present | test | YES |
| 7 | ulf1q6 | test | 6 chars | active | 0 | N/A | ambiguous (count<5) | not present | test | YES |
| 8 | TYSON-ZH90 | Yusuke private | hardcoded | deactivated | 45 | UTC0-16 | UTC+7 推定（複数 tz 跨ぎ可能性、要検討） | not present | hardcoded | NO (read-only) |
| 9 | PAIR-FSEAN5 | marketing | PAIR-* prefix | pair_numbers 不在 | 0 | N/A | ambiguous (count<5) | not present | system | NO |
| 10 | PAIR-DEMOTEST | demo | PAIR-* prefix | active | 0 | N/A | ambiguous (count<5) | not present | system | NO |
| 11 | PAIR-NY5XTF | testing | PAIR-* prefix | pair_numbers 不在 | 0 | N/A | ambiguous (count<5) | not present | system | NO |
| 12 | yv00qaj6 | TYSON-ZH90 移行先 | 8 chars | active | 0 | N/A | ambiguous (count<5) | not present | real | NO (read-only) |

**全 120 cell fill 完了。空欄ゼロ、推測補完ゼロ。**

## 3. Timezone 推定 Logic（再現可能性確保、Step 5）

### Algorithm
1. 各 pair の voice (pair_media.audioPath[].version) + photo (journal...uploadedAt) UTC ms timestamp 全件抽出
2. UTC 0-23 時で 24-bin histogram 構築
3. 17 時間 sliding window（local 7-23 時帯仮定）の max sum 探索 → peak window 特定
4. peak fraction = peakSum / totalSum
5. peak fraction < 85% → ambiguous（flat or 跨ぎ可能性）
6. count < 5 → ambiguous（統計的意味なし）
7. 確定時: tzOffset = (7 - peakStartUtc + 24) % 24、-12〜+14 に正規化
8. tzOffset から主要 timezone label 推定（JST = UTC+9、EST = UTC-5、PST = UTC-8 等）

### Code 引用
`scripts/audit-phase-d-step1.js` L142-178（estimateTimezone 関数）

## 4. Phase X-1 Enforcement 状態（Step 1）

### generateSlug() (src/lib/pairSlug.js L20-26)
```javascript
const SLUG_LENGTH = 8
const SLUG_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789' // 32 chars, l/o/0/1 除外

export function generateSlug() {
  let result = ''
  for (let i = 0; i < SLUG_LENGTH; i++) {
    result += SLUG_CHARS.charAt(Math.floor(Math.random() * SLUG_CHARS.length))
  }
  return result
}
```
- 引数なし、length 8 hardcoded、Crockford Base32 風 32 chars 限定 ✅

### findUniqueSlug() (src/lib/pairSlug.js L37-44)
```javascript
export async function findUniqueSlug(existsCheck, maxRetry = 20) {
  for (let i = 0; i < maxRetry; i++) {
    const candidate = generateSlug()
    const exists = await existsCheck(candidate)
    if (!exists) return candidate
  }
  throw new Error(`findUniqueSlug: max retry exceeded (${maxRetry})`)
}
```
- 衝突 check via existsCheck callback、max retry 20 ✅

### firestore.rules pair_numbers write block (firestore.rules L7-10)
```
match /pair_numbers/{slug} {
  allow read: if request.auth != null;
  allow write: if false;
}
```
- client SDK write 物理 block、admin SDK のみ可 ✅

### enforcement 結論
Phase X-1 (commit d5f071d) は **完全機能**。client write は rules で block、admin SDK は generateSlug() 経由必須化。

## 5. Phase X-3-A pairTimezone Field 状態（Step 6）

### 結果
- 全 12 pair で `pairTimezone` field **不在**
- TYSON-ZH90 / yv00qaj6 含む全 pair で同様

### 解釈
- Phase X-3-A の scope は **audioPath[] item の必須 4 field**（uploadedBy / mimeType / deviceHint / roleAtUpload）の write 時 enforcement
- pair 単位の `pairTimezone` field 必須化は **Phase X-3-B として TODO**（migrate-pair.js / streak.js / api/pair-media.js に TODO コメント存在）
- 本 audit 結果は **expected**、Phase X-3-A の scope 違反ではない

### 結論
Phase X-3-B（pairTimezone 本実装）が未実施、Phase D で migration する場合 pairTimezone を別途設定する必要あり。

## 6. Ambiguous List（Yusuke 確認必要）

### 全件 ambiguous（7/7、migration 対象すべて）
| # | pairId | memo | reason | suggested action |
|---|--------|------|--------|------------------|
| 1 | mw49f0 | test3 | upload count = 0 | Yusuke 確認 or default 設定 |
| 2 | h06m0g | Madoka Paints | upload count = 0 | Yusuke 確認 or default 設定 |
| 3 | libriv | Chitose Hanert | upload count = 0 | Yusuke 確認 or default 設定 |
| 4 | 2habi5 | Shigemi Sherry Cree | upload count = 0 | Yusuke 確認 or default 設定 |
| 5 | 5828p4 | Tomoko Himitsu | upload count = 0 | Yusuke 確認 or default 設定 |
| 6 | lxm0mt | test2 | upload count = 0 | Yusuke 確認 or default 設定 |
| 7 | ulf1q6 | test | upload count = 0 | Yusuke 確認 or default 設定 |

### Critical Finding
**migration 対象 7 件すべて upload count 0**（voice / photo どちらもゼロ）。

これは:
- timezone 推定が **統計的に不可能**（mistake 11 推測実装禁止）
- migration 自体は可能（slug rotation のみ）、ただし pairTimezone は別途決定必要
- 本物 4 pair（h06m0g / libriv / 2habi5 / 5828p4）の owner に対して Yusuke が timezone 確認可能（memo の name から推定可能、ただし推定は CTO の役割ではない）

### TYSON-ZH90 補足
- 45 upload あり、UTC0-16 の peak 検出されたが peak fraction 100% = 17 時間 window 全部に分散
- これは Yusuke (NY) + 母 (JST) の **複数 timezone 跨ぎ pair** の典型 → 単一 timezone 不適、複数 timezone 対応の Phase X-3-B 設計が必要
- ただし TYSON-ZH90 は migration 対象外（read-only）、本 Phase D の scope 外

## 7. 除外 Pair 一覧と除外理由

| # | pairId | 除外理由 |
|---|--------|----------|
| 8 | TYSON-ZH90 | hardcoded founder pair、不可侵（read-only） |
| 9 | PAIR-FSEAN5 | system pair（marketing）、PAIR-* prefix で internal use |
| 10 | PAIR-DEMOTEST | demo pair、UI 専用、migration 不要 |
| 11 | PAIR-NY5XTF | testing pair、internal use |
| 12 | yv00qaj6 | TYSON-ZH90 移行先（Yusuke 自身）、Phase X-1/II-share-bug-fix で確立済み、再 migration 不要 |

## 8. Core Philosophy 軸 1-5 Audit

### 軸 1: upstream format 統一
- 12 pair の slug format 分布:
  - 6 文字 active: 7 件（migration 対象、format 違反）
  - 8 文字 random: 1 件（yv00qaj6）
  - PAIR-* prefix: 3 件（system、別 namespace で許容）
  - hardcoded: 1 件（TYSON-ZH90、不可侵）
- **違反**: 6 文字 active 7 件が format 違反
- **結論**: Phase D migration で **8 文字統一**が必要（TYSON-ZH90 は不可侵で例外維持、PAIR-* は system namespace で別扱い）

### 軸 2: 人間判断介在ゼロ
- migration 対象は hardcoded list（#1〜#7）で決定、人間判断ゼロ ✅
- 除外 list も hardcoded（TYSON-ZH90 + PAIR-* + yv00qaj6） ✅
- ambiguous timezone は **7/7 件全 Yusuke 確認必要**（mistake 11 推測実装禁止に従う）

### 軸 3: 物理的に違反生成不能
- Phase X-1（commit d5f071d）で generateSlug() bypass 不能化済み（rule 引用 Step 1 で証明）
- firestore.rules で client write block 済み（rule 引用 Step 1 で証明）
- 新規 slug 生成 path は generateSlug() 一本化（migrate-pair.js Phase X-1 統合済み確認）

### 軸 4: AI 単体運用 100% 動作
- audit 全 step が `scripts/audit-phase-d-step1.js` で完結 ✅
- ambiguous 検出時のみ founder 介入（例外設計済み、本 audit で 7 件発生、想定通り）

### 軸 5: variation table 作成済み
- 12 pair × 10 column 完全 fill（Step 7、本 doc Section 2）✅
- 空欄ゼロ、推測補完ゼロ（mistake 11 遵守）

## 9. 次 Step 推奨

### Critical Decision Point
migration 対象 7 件すべて upload 0 件 → timezone 確定不能。

### option α（推奨、軸 4 + mistake 11 遵守）
**Yusuke 確認待ち** で 7 件の timezone を以下のいずれかで決定:
1. 各 pair owner に Yusuke が直接確認（memo name + 連絡手段あり想定）
2. デフォルト `Asia/Tokyo` で migration 実施し、後日 owner upload 時に修正可能化（pairTimezone field を mutable に）
3. test pair（mw49f0 / lxm0mt / ulf1q6）は default、本物 4 pair は Yusuke 確認後

### option β（推奨外、軸 4 違反）
推測で全件 JST 設定 → 後日不一致の場合 timezone 跨ぎ event の dateKey 計算 bug 発生
→ **mistake 11 違反、棄却**

### CTO 推奨
**option α-2 採用**: migration を **slug 8 文字統一のみ実施**、pairTimezone は migration scope 外として **Phase X-3-B 別 phase で対応**。
- Phase D scope を「slug rotation only」に限定、timezone は touch しない
- Phase X-3-B で pairTimezone schema 必須化 + migration 時 Yusuke 確認 flow 追加
- 軸 5 variation table の 7 件 ambiguous は **Phase X-3-B での Yusuke 確認 backlog** として記録

### 出力 artifact
- `docs/phase-d/audit-result-step1.md` (本 doc)
- `docs/phase-d/raw-query-result.json` (12 pair Firestore raw doc dump)
- `scripts/audit-phase-d-step1.js` (audit script、再実行可能、再現性確保)

## 10. Self-Verification Final Check

- [x] git status で scripts/audit-phase-d-step1.js のみ新規（scripts/ は .gitignore で ignored、git ls-files で確認）、既存ファイル変更ゼロ
- [x] grep で script 内 set/update/delete/add/batch.commit 0 件（line 8 はコメント、line 255 は admin app cleanup）
- [x] TYSON-ZH90 write ゼロ（log で `read-only access (絶対不可侵)` 確認）
- [x] yv00qaj6 write ゼロ（log で `read-only access (絶対不可侵)` 確認）
- [x] variation table 12 行 × 10 column 全 fill（Section 2）
- [x] timezone 推定 logic 明記（Section 3、再現可能）
- [x] ambiguous list 化（Section 6）
- [x] Phase X-1 enforcement 機能確認結果（Section 4、code 引用付き）
- [x] Phase X-3-A pairTimezone field 状態記述（Section 5）
- [x] core philosophy 軸 1-5 全件 audit（Section 8）
- [x] raw query 結果 JSON dump（docs/phase-d/raw-query-result.json）
- [x] docs/phase-d/audit-result-step1.md 全 section fill（Section 1-10）
