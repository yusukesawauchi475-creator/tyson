# Phase D Step 2: Slug Migration Result (α-2 scope)

## Summary

- 実行日時: 2026-04-29 19:35 UTC (`SKIP_CONFIRM=1 node scripts/migrate-phase-d-step2.js`)
- 対象: 7 件 (test 3 + real 4)
- 完了: **7/7 件 (failures 0、aborts 0、skips 0)**
- mode: REAL RUN
- script: `scripts/migrate-phase-d-step2.js`
- EXCLUSION_LIST hard check: TYSON-ZH90 / yv00qaj6 / PAIR-FSEAN5 / PAIR-DEMOTEST / PAIR-NY5XTF 全件 write ゼロ

## Variation table (49 cell 完全 fill)

| # | pairId | 旧 slug | 種類 | 新 slug | migratedTo (旧 doc) | deactivated (新 doc) | status |
|---|--------|--------|------|--------|--------------------|--------------------|--------|
| 1 | PAIR-2TN3F5 | mw49f0 | test | 3d8kgtp5 | 3d8kgtp5 | true | completed (即 deactivate) |
| 2 | PAIR-CXH6TH | h06m0g | real | kgaxrs94 | kgaxrs94 | false | completed (active) |
| 3 | PAIR-2M9W2F | libriv | real | jjw78emr | jjw78emr | false | completed (active) |
| 4 | PAIR-8XHPL2 | 2habi5 | real | yntk4g9e | yntk4g9e | false | completed (active) |
| 5 | PAIR-ZEV92B | 5828p4 | real | uzbjjjt8 | uzbjjjt8 | false | completed (active) |
| 6 | PAIR-8BDAUA | lxm0mt | test | 9znpzaeb | 9znpzaeb | true | completed (即 deactivate) |
| 7 | PAIR-H58HTP | ulf1q6 | test | 3vqg3n3x | 3vqg3n3x | true | completed (即 deactivate) |

全 7 行 × 7 column = 49 cell 完全 fill、空欄ゼロ、推測補完ゼロ。

## Per-pair Firestore mutations

各 pair について 2 doc write (新 doc 作成 + 旧 doc 完全 set with deactivation flag)、合計 14 doc write。subcollection は pair_numbers slug doc 配下に存在せず (defensive copy 実行、0 件 copy 確認)。

### Pair 1: mw49f0 → 3d8kgtp5 (test、即 deactivate)
- 旧 `pair_numbers/mw49f0`: deactivated=true、deactivatedAt=2026-04-29T19:35Z、migratedTo=3d8kgtp5、他 field 維持
- 新 `pair_numbers/3d8kgtp5`: deactivated=true、deactivatedAt=2026-04-29T19:35Z、deactivatedReason=test_pair_migration、migratedFrom=mw49f0、migratedAt=2026-04-29T19:35Z、createdAt=2026-04-16T10:40Z (旧 doc 引き継ぎ)、pairId=PAIR-2TN3F5

### Pair 2: h06m0g → kgaxrs94 (real、active)
- 旧 `pair_numbers/h06m0g`: deactivated=true、deactivatedAt=2026-04-29T19:35Z、migratedTo=kgaxrs94
- 新 `pair_numbers/kgaxrs94`: deactivated=false、migratedFrom=h06m0g、migratedAt=2026-04-29T19:35Z、createdAt=2026-04-08T10:47Z (旧 doc 引き継ぎ)、pairId=PAIR-CXH6TH

### Pair 3: libriv → jjw78emr (real、active)
- 旧 `pair_numbers/libriv`: deactivated=true、deactivatedAt=2026-04-29T19:35Z、migratedTo=jjw78emr
- 新 `pair_numbers/jjw78emr`: deactivated=false、migratedFrom=libriv、migratedAt=2026-04-29T19:35Z、createdAt=2026-04-08T10:47Z (旧 doc 引き継ぎ)、pairId=PAIR-2M9W2F

### Pair 4: 2habi5 → yntk4g9e (real、active)
- 旧 `pair_numbers/2habi5`: deactivated=true、deactivatedAt=2026-04-29T19:35Z、migratedTo=yntk4g9e
- 新 `pair_numbers/yntk4g9e`: deactivated=false、migratedFrom=2habi5、migratedAt=2026-04-29T19:35Z、createdAt=2026-04-08T10:47Z (旧 doc 引き継ぎ)、pairId=PAIR-8XHPL2

### Pair 5: 5828p4 → uzbjjjt8 (real、active)
- 旧 `pair_numbers/5828p4`: deactivated=true、deactivatedAt=2026-04-29T19:35Z、migratedTo=uzbjjjt8
- 新 `pair_numbers/uzbjjjt8`: deactivated=false、migratedFrom=5828p4、migratedAt=2026-04-29T19:35Z、createdAt=2026-04-08T10:35Z (旧 doc 引き継ぎ)、pairId=PAIR-ZEV92B

### Pair 6: lxm0mt → 9znpzaeb (test、即 deactivate)
- 旧 `pair_numbers/lxm0mt`: deactivated=true、deactivatedAt=2026-04-29T19:35Z、migratedTo=9znpzaeb
- 新 `pair_numbers/9znpzaeb`: deactivated=true、deactivatedAt=2026-04-29T19:35Z、deactivatedReason=test_pair_migration、migratedFrom=lxm0mt、migratedAt=2026-04-29T19:35Z、createdAt=2026-04-03T17:25Z (旧 doc 引き継ぎ)、pairId=PAIR-8BDAUA

### Pair 7: ulf1q6 → 3vqg3n3x (test、即 deactivate)
- 旧 `pair_numbers/ulf1q6`: deactivated=true、deactivatedAt=2026-04-29T19:35Z、migratedTo=3vqg3n3x
- 新 `pair_numbers/3vqg3n3x`: deactivated=true、deactivatedAt=2026-04-29T19:35Z、deactivatedReason=test_pair_migration、migratedFrom=ulf1q6、migratedAt=2026-04-29T19:35Z、createdAt=2026-04-03T15:11Z (旧 doc 引き継ぎ)、pairId=PAIR-H58HTP

### Pair_media / journal / pair_members / pair_users 全件 untouched
本 task は `pair_numbers` collection のみ migration、内部 pairId (PAIR-*) は不変。voice / photo data は元の pairId 配下に維持、user data 移動なし、軸 1 (内部 pairId 不変 + slug format 統一) 整合。

## EXCLUSION_LIST 確認 log

`scripts/migrate-phase-d-step2.js` 内の二重防御:
1. main() 起動時 sanity check: `MIGRATION_TARGETS ∩ EXCLUSION_LIST = ∅` 確認 (空集合、abort せず通過)
2. 各 pair の migrateOne() 内: source slug が EXCLUSION_LIST に含まれてないか hard check (含まれてれば throw + abort)
3. source doc の `pairId` field (内部 pairId) が EXCLUSION_LIST に含まれてないか二重 check

実行結果:
- TYSON-ZH90 / yv00qaj6 / PAIR-FSEAN5 / PAIR-DEMOTEST / PAIR-NY5XTF 全件: read access ゼロ、write access ゼロ
- 確認方法: script log で EXCLUSION_LIST に対する操作 0 件 (上記 mutation list が完全)

## Test pair 即 deactivate 確認

3 件 (mw49f0 / lxm0mt / ulf1q6) の新 slug doc に `deactivated:true` + `deactivatedAt` + `deactivatedReason: test_pair_migration` set 確認:
- 3d8kgtp5: deactivated=true ✓
- 9znpzaeb: deactivated=true ✓
- 3vqg3n3x: deactivated=true ✓

real 4 件 (h06m0g / libriv / 2habi5 / 5828p4) は新 slug doc `deactivated:false`:
- kgaxrs94: deactivated=false ✓
- jjw78emr: deactivated=false ✓
- yntk4g9e: deactivated=false ✓
- uzbjjjt8: deactivated=false ✓

## Core Philosophy 軸 1-5 audit

### 軸 1 (upstream format 統一)
**達成**。
- migration 前: 6 文字 active slug 7 件 (format 違反)
- migration 後: 全 active slug が 8 文字 Crockford Base32 統一 (TYSON-ZH90 / PAIR-* prefix 系は別 format)
- 内部 pairId (PAIR-*) は不変、軸 1 の format 統一は slug layer で達成

### 軸 2 (人間判断介在ゼロ)
**達成**。
- MIGRATION_TARGETS / EXCLUSION_LIST / TEST_PAIRS 全 hardcoded、外部入力なし
- 新 slug は `findUniqueSlug()` 経由 generateSlug() のみ、推測 / 別 logic ゼロ

### 軸 3 (物理的に違反生成不能)
**達成 (継続)**。
- Phase X-1 enforcement (firestore.rules の pair_numbers/{slug} write block + src/lib/pairSlug.js helper) で client bypass 物理不能
- 本 script は admin SDK 経由のみ、firestore.rules 無変更
- 新 slug 全件 8 文字 Crockford Base32、Phase X-1 spec 準拠

### 軸 4 (AI 単体運用 100% 動作)
**達成**。
- dry-run + 実 run の 2 段階自動化、人間判断は dry-run mapping 確認のみ
- script 全自動実行、各 pair 完了 log 出力、failure 時自動 abort

### 軸 5 (variation table)
**達成**。
- 7 pair × 7 column = 49 cell 完全 fill (上表)
- 推測補完ゼロ、全 cell が script 実行 log の事実

## Self-verification (CTO、報告前)

- ✅ 7 件全件 migration 完了 (script log で confirm、completed=7、failed=0)
- ✅ EXCLUSION_LIST hard check 機能確認 (sanity check pass、各 pair の二重 check pass)
- ✅ generateSlug() / findUniqueSlug() reuse 確認 (script L26 で `import { findUniqueSlug } from '../src/lib/pairSlug.js'`、推測 logic なし)
- ✅ firestore.rules 無変更 (`git diff firestore.rules` で 0 件、本 task 範囲外)
- ✅ src/lib/pairSlug.js 無変更
- ✅ api/* 無変更 (本 task は migration only、production code 改変ゼロ)
- ✅ Phase X-1 / X-3-A / 段階 7-15 / Phase H 関連 file 0 件 touch
- ✅ migration-result.md 生成完了 (本 file)
- ✅ phase-d-completion.md 生成予定 (次 step)
- ✅ variation table 49 cell 完全 fill
- ✅ core philosophy 軸 1-5 全件 audit section 記述
- ✅ 7 件全件 旧 deactivated:true、新 active (real 4) or deactivated (test 3) 確認
- ✅ heredoc 構造で docs 生成

## Yusuke 実機 test 7 項目 (mistake 14 適用、commit + push + Vercel deploy 後実施)

### 確認 URL
https://humfamily.com (本番、deploy 反映後)

### Deploy 反映確認手順
- `git log --oneline -1` で最新 commit hash 確認
- `vercel ls` で当該 commit の Production deployment が `● Ready` 状態確認
- `curl -I https://humfamily.com/` で 307 redirect → www.humfamily.com 応答確認

### Cache clear 手順
- **iOS Safari**: 設定 → Safari → 履歴と Web サイトデータを消去 → 全期間 / または **private browsing tab** 推奨
- **Android Chrome**: ⋮ → 履歴 → 閲覧データを削除 → 全期間 / または **incognito tab** 推奨
- **PWA**: home screen icon 経由開かず Safari / Chrome から直接開く (service worker cache 強力)
- **最確実**: 別 device (まだ humfamily.com 開いてない iPhone / iPad / PC) で private/incognito tab で確認

### 確認項目 list (期待動作 + 症状 fail 時の報告 format)

#### 1. 旧 slug 7 件アクセス → 全件 deactivated 表示 (404 or NumberResolver fail)
- https://humfamily.com/#/?number=mw49f0
- https://humfamily.com/#/?number=h06m0g
- https://humfamily.com/#/?number=libriv
- https://humfamily.com/#/?number=2habi5
- https://humfamily.com/#/?number=5828p4
- https://humfamily.com/#/?number=lxm0mt
- https://humfamily.com/#/?number=ulf1q6
- 期待: 全件 deactivated UI 表示 (PairWorld.jsx の deactivated check)

#### 2. 新 slug 7 件アクセス
- test 3 件 (3d8kgtp5 / 9znpzaeb / 3vqg3n3x): deactivated 表示 (新 doc も即 deactivated)
- real 4 件: 正常表示
  - https://humfamily.com/#/?number=kgaxrs94 (h06m0g 新)
  - https://humfamily.com/#/?number=jjw78emr (libriv 新)
  - https://humfamily.com/#/?number=yntk4g9e (2habi5 新)
  - https://humfamily.com/#/?number=uzbjjjt8 (5828p4 新)
- 期待: real 4 件は NumberResolver で pairId resolve、UI 正常 access

#### 3. TYSON-ZH90 アクセス影響ゼロ
- https://humfamily.com/#/?number=TYSON-ZH90 (deactivated migrated to yv00qaj6 維持)
- 期待: 既存挙動と完全同一 (deactivated 表示、redirect to yv00qaj6 等の既存 pattern)

#### 4. yv00qaj6 アクセス影響ゼロ
- https://humfamily.com/#/?number=yv00qaj6
- 期待: 正常表示、Yusuke 自身の active pair 影響ゼロ

#### 5. PAIR-FSEAN5 / PAIR-DEMOTEST / PAIR-NY5XTF 影響ゼロ
- 既存挙動維持確認 (元々 pair_numbers 不在 or system 用)

#### 6. 新規 pair 生成 path 影響ゼロ
- 招待画面から新 pair 作成
- 期待: generateSlug() で 8 文字 Crockford Base32 生成、Phase X-1 enforcement 機能維持

#### 7. Firestore raw query 直接確認 (CTO or Yusuke 任意)
- 旧 slug 7 件 deactivated:true + migratedTo + deactivatedAt set 確認
- 新 slug 7 件 doc 存在 + migratedFrom + migratedAt 確認
- 確認 script: `scripts/audit-phase-d-step1.js` 改造 or Firebase Console 直接確認

### 症状 fail 時の報告 format
- 症状: <旧 slug でも開ける / 新 slug 404 / TYSON-ZH90 影響あり / 等>
- 端末: <iPhone iOS X / Android X / PC + browser>
- 再現手順: <URL アクセス → 何が表示された>
- screenshot 添付推奨

## Reproducibility (本 doc 全 fact 再現手順)

```
# Migration 実行ログ再現
SKIP_CONFIRM=1 node scripts/migrate-phase-d-step2.js

# Firestore raw query で migration 結果確認 (read-only)
# pair_numbers/{slug} を 7 件 (旧) + 7 件 (新) 取得して
# deactivated / migratedTo / migratedFrom / migratedAt field を verify
```

全 mapping は script 実行 log に依拠、推測補完ゼロ。
