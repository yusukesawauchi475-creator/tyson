# Phase D Completion (α-2 scope)

## Phase D 全体完了 marker

- Phase D 完了日時: 2026-04-29 19:35 UTC
- 採用 scope: **α-2 (slug rotation only、timezone は Phase X-3-B 別 phase)**
- Boss judgment: 確定 (philosophy 軸 1-5 整合 audit 済み)
- main merge: revert 0 維持で継続 (commit + push 後の 連続数は別途記録)

## Step 構成 (実施順)

### Step 1: 12 pair audit (commit fd325c1 後)
- output: `scripts/audit-phase-d-step1.js`、`docs/phase-d/raw-query-result.json`、`docs/phase-d/audit-result-step1.md`
- 結果: 12 pair × 10 column variation table 完成、TYSON-ZH90 / PAIR-* 不可侵確認

### Step 1.5: premise correction (commit fd37bf1)
- output: `docs/phase-d/premise-correction.md`
- 結果: 「想定外 2 件」が誤前提と判明 (Phase X-3-A は audioPath validation で pairTimezone 無関係、collection 名特定は完全)

### Step 2: 7 件 slug migration (本 step)
- output: `scripts/migrate-phase-d-step2.js`、`docs/phase-d/migration-result.md`
- 結果: 7/7 migration 完了 (test 3 即 deactivate + real 4 active)、failures 0
- 旧 → 新 slug mapping (確定):
  - mw49f0 → 3d8kgtp5 (test、deactivated)
  - h06m0g → kgaxrs94 (real、active)
  - libriv → jjw78emr (real、active)
  - 2habi5 → yntk4g9e (real、active)
  - 5828p4 → uzbjjjt8 (real、active)
  - lxm0mt → 9znpzaeb (test、deactivated)
  - ulf1q6 → 3vqg3n3x (test、deactivated)

## 達成 (Phase D 内で)

- ✅ slug guessable security 露出解消 (6 文字 → 8 文字 Crockford Base32 random、entropy 1.1T)
- ✅ upstream format 統一 (軸 1) — TYSON-ZH90 / PAIR-* prefix 系除く全 active slug が 8 文字統一
- ✅ Phase X-1 enforcement (firestore.rules + generateSlug helper) で client bypass 物理不能 (軸 3)
- ✅ test 系 3 件 即 deactivate (新 slug doc も deactivated:true)
- ✅ 内部 pairId (PAIR-*) 不変、voice / photo data 移動なし、user data integrity 維持

## 未達成 / 別 phase に持ち越し

### pairTimezone field 設定
- **担当: Phase X-3-B (未実装)**
- 現状: 全 12 pair で field 不在 (expected、Phase X-3-A は audioPath validation 担当で pairTimezone 無関係)
- TODO 場所: api/invite.js L131、api/streak.js L152、api/pair-media.js L161 (全件 `TODO(Phase X-3-B)`)
- 必要時期: 本物 pair 活動 detect 後 (現状 upload 0 件で timezone 推定不能)

### 本物 4 pair の timezone 推定
- 現状: 全件 upload 0 件 (Firestore コード上真実、誰も使ってない)
- timezone histogram 推定不能 (count<5 で ambiguous 判定)
- 解決経路:
  - (a) marketing 後の本物 pair 活動 detect → upload >= 5 で timezone 推定可能
  - (b) Yusuke 直接 outreach (本物 pair owner に「あなたの timezone」確認) → 手動入力
  - (c) Phase X-3-B (pairTimezone 必須化) で新規 pair は最初から保持、既存 pair backfill phase で別途
- 推奨: (a) を待つ、quartely review で activity 確認

## Phase X-3-B 着手前提条件

Phase X-3-B (pairTimezone 必須化) 着手の前提:

1. **sample data 揃う** — 本物 pair で upload >= 5 件、histogram で timezone 推定可能
2. **既存 12 pair backfill 戦略確定** — 本物 4 pair が活動開始したら timezone 推定 → backfill、test 系は固定値 or skip 判断
3. **Phase X-3-A (audioPath validation) 既存 enforcement 影響評価** — pairTimezone 必須化で audioPath validation logic に追加 field 必要、衝突 risk 確認
4. **Firestore migration script 設計** — 既存 `scripts/migrate-pair.js` / `scripts/migrate-phase-d-step2.js` の pattern 流用可

着手 trigger 候補:
- 本物 pair 活動 detect (cron 監視 or marketing 後 retention で確認)
- Yusuke が本物 pair owner outreach 完了 (timezone 手動取得)
- Phase B / Phase Z 完了後の自然な next phase として

## Phase D 独立 / 後続 phase との関係

Phase D は以下 phase と **独立**:
- **Phase B (skills/hooks)**: CTO infrastructure、Phase D 完了に依存しない
- **Phase Z (自動化)**: 自動 audit / migration script、Phase D の script は流用可だが依存なし
- **marketing**: 本物 pair 活動 detect 用、Phase D の slug rotation 完了で security 露出解消済み

Phase D 完了で以下 phase 着手 unblock:
- **Phase X-3-B (pairTimezone)**: 上記前提条件待ち、Phase D 完了とは独立
- **Phase B (skills/hooks)**: 着手可
- **marketing 拡大**: slug guessable 解消で本格展開可

## Mistake 追記候補 (本 phase 進行中検出、CLAUDE.md 反映済み or 反映候補)

- **Mistake 11 適用** (事実確認 step 必須): premise correction で発見、Plan Mode 内 grep + git log で premise 誤り 2 件確定、再 audit 不要と判明
- **Mistake 12 適用** (視覚仕様の配置形式 enumeration): UI Fix Round 1-3 で発覚、CLAUDE.md commit 1cc849c で反映済み
- **Mistake 13 適用** (input 値 range simulation): UI Fix Round 2 dashed line で発覚、CLAUDE.md 反映済み、本 phase でも variation table の input range 明示 (6 文字 → 8 文字 format simulation) で実践
- **Mistake 14 適用** (実機 test 4 点 checklist): 本 phase の Yusuke 実機 test section に 4 点全件記述 (URL / commit/push/deploy / cache clear / 確認項目)

## Reproducibility

```
# Step 1 audit 再実行
node scripts/audit-phase-d-step1.js > docs/phase-d/raw-query-result.json

# Step 2 migration 再実行 (idempotent、完了済 slug は skip)
SKIP_CONFIRM=1 node scripts/migrate-phase-d-step2.js
```

完了済 slug (deactivated:true 設定済) は script の `migrateOne` 内で skip + warn、二重 migration 不能。

## 結語

Phase D α-2 scope で完了。残課題 (pairTimezone backfill) は Phase X-3-B 担当、本物 pair 活動 detect 待ち。CTO の Phase D scope 完了報告として本 doc を marker とする。
