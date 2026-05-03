# Step 3: azmcqghd 撮影用 demo photo 投入 — 完了 marker

## Summary

| 項目 | 値 |
|------|----|
| 実行日時 | 2026-05-03 (NY 9:08am EDT 前後 dry-run、その後実 run) |
| target slug | azmcqghd |
| target pairId | PAIR-SPC2NF |
| 投入画像数 | 10 件 |
| role 分配 | parent=5、child=5 (Yusuke 「半々」spec ±0) |
| 日付分散 | 2026-04-27 〜 2026-05-03 (過去 7 日)、選択肢 A spec (1-2 枚/日) |
| failures | 0 |
| skips | 0 |
| 確認 URL | https://www.humfamily.com/pair/azmcqghd/album |

## Variation table (10 行 × 7 column 完全 fill)

| # | image (~/Downloads/) | role | dateKey (NY) | timestamp (NY) | storagePath | uploadId |
|---|----------------------|------|--------------|----------------|-------------|----------|
| 1 | kling_20260504_作品_Elderly_Ja_346_0.png | parent | 2026-04-27 | 19:16:16 | journal/PAIR-SPC2NF/2026-04/2026-04-27/parent/generic_image/photo-01.png | DEMO-01-20260503 |
| 2 | kling_20260504_作品_Image1_Ima_324_0.png | child | 2026-04-28 | 21:35:02 | journal/PAIR-SPC2NF/2026-04/2026-04-28/child/generic_image/photo-01.png | DEMO-02-20260503 |
| 3 | kling_20260504_作品_Elderly_Ja_337_0.png | child | 2026-04-28 | 11:29:53 | journal/PAIR-SPC2NF/2026-04/2026-04-28/child/generic_image/photo-02.png | DEMO-03-20260503 |
| 4 | kling_20260504_作品_Image1_Ima_331_0.png | parent | 2026-04-29 | 17:57:35 | journal/PAIR-SPC2NF/2026-04/2026-04-29/parent/generic_image/photo-01.png | DEMO-04-20260503 |
| 5 | kling_20260504_作品_Image1_Ima_321_0.png | child | 2026-04-30 | 12:06:15 | journal/PAIR-SPC2NF/2026-04/2026-04-30/child/generic_image/photo-01.png | DEMO-05-20260503 |
| 6 | kling_20260504_作品_Elderly_Ja_342_0.png | parent | 2026-05-01 | 09:14:33 | journal/PAIR-SPC2NF/2026-05/2026-05-01/parent/generic_image/photo-01.png | DEMO-06-20260503 |
| 7 | kling_20260504_作品_Image1_Ima_311_0.png | parent | 2026-05-02 | 20:58:02 | journal/PAIR-SPC2NF/2026-05/2026-05-02/parent/generic_image/photo-01.png | DEMO-07-20260503 |
| 8 | kling_20260504_作品_Elderly_Ja_344_0.png | child | 2026-05-02 | 14:42:03 | journal/PAIR-SPC2NF/2026-05/2026-05-02/child/generic_image/photo-01.png | DEMO-08-20260503 |
| 9 | kling_20260504_作品_Image1_Ima_314_0.png | parent | 2026-05-03 | 09:08:54 | journal/PAIR-SPC2NF/2026-05/2026-05-03/parent/generic_image/photo-01.png | DEMO-09-20260503 |
| 10 | kling_20260504_作品_Elderly_Ja_349_0.png | child | 2026-05-03 | 11:03:46 | journal/PAIR-SPC2NF/2026-05/2026-05-03/child/generic_image/photo-01.png | DEMO-10-20260503 |

合計 bytes: 40,566,882 (約 38.7 MB、Storage cost 軽微)

## Core philosophy 軸 1-5 audit

### 軸 1: data leak / cross / lost しない
- 全 10 件の storagePath が `journal/PAIR-SPC2NF/...` 限定 (script log 確認、上 table 確認)
- 全 10 件の Firestore docPath が `journal/PAIR-SPC2NF/months/.../days/...` 限定
- script 内 hard check (`p.storagePath.startsWith('journal/PAIR-SPC2NF/')`) で TARGET_PAIR_ID 以外への write 物理不能
- EXCLUSION_LIST (TYSON-ZH90 / yv00qaj6 / 本物 4 pair / 旧 slug 7 件 / test slug 3 件 / 特殊 PAIR-*) いずれにも一致せず、hard check trigger 0 件
- 結論: data leak / cross / lost 一切なし

### 軸 2: 人間判断介在ゼロ
- TARGET / EXCLUSION 全件 hardcoded、script 引数で書き換え不能
- 画像 file pattern hardcoded (`kling_20260504*.png`)
- role split / 日付分散 / timestamp 全て script 自動実行 (mulberry32 deterministic、seed=20260503 固定)
- Yusuke 介入: dry-run 結果確認 → variation table 承認 → 実 run 承認 のみ (最小)
- 同 seed で再実行すれば同 plan、再現性確保

### 軸 3: upstream で物理 enforce
- azmcqghd は Phase X-1 generateSlug() 経由発行済 active pair (Crockford Base32 8 文字)
- 通常 active pair として通常 Storage path / Firestore doc path で write、特別扱いなし
- bucket 名明示 (`admin.storage().bucket(bucketName)`)、memory hard rule 準拠で silent fail 物理不能
- api/journal.js の Storage path / Firestore meta 仕様完全踏襲、UI render layer (album L289-310 generic_images 配列読み込み logic) と整合

### 軸 4: AI 単体運用 100% 動作
- script 自律実行、Yusuke 介入は dry-run / 実 run 承認 + 実機 test のみ
- mistake 17 enforce: 本 task は Boss judgment 通過済の確定 task continuation、新 phase initiation でない
- philosophy 軸 4 (AI 単体運用) 維持

### 軸 5: variation table
- 10 行 × 7 column 完全 fill (上 table)、空欄ゼロ
- mistake 11 (推測実装禁止) 準拠、全 cell が dry-run + 実 run log から fact

## Self-verification 4 点 (mistake 14 適用)

### 1. 確認 URL
**https://www.humfamily.com/pair/azmcqghd/album**

src grep fact 確認: src/pages/AlbumPage.jsx は `/pair/:slug/album` route で render (App.jsx routing + AlbumPage.jsx L43 outletContext)、direct path access OK。

### 2. commit/push/deploy 状態 確認手順
- 本 docs commit 後の git log で最新 commit hash 確認
- Vercel deployment status: `vercel ls` or Vercel dashboard で production Ready 確認 (本 task は frontend code 無変更、Storage / Firestore 直接 write のため deploy 待機不要だが、念のため確認)
- 本 task は src/* / api/* 無変更 (script + docs のみ) のため、frontend deploy 不要、データは即時反映

### 3. cache clear 手順
- iOS Safari: 設定 → Safari → 履歴消去、または **private browsing tab** 推奨
- Mac Safari / Chrome: 履歴削除、または **private/incognito tab** 推奨
- PWA 経由開かない (service worker cache 強力)
- 推奨: private/incognito tab で `https://www.humfamily.com/pair/azmcqghd/album` open

### 4. 確認項目 list (Yusuke 実機 test 7 項目)

#### 必須確認
1. **album で 10 枚表示**: private tab で URL access、role 切替で parent 5 + child 5 が表示
2. **過去 7 日分にランダム分散表示**: album 日付 sort で 04-27 / 04-28 (×2) / 04-29 / 04-30 / 05-01 / 05-02 (×2) / 05-03 (×2) に分散
3. **parent / child role 半々表示**: album role tab 切替で各 5 枚見える、片寄り NG
4. **撮影用 demo として違和感ない画像質感**: kling AI 生成画像が family demo として natural か Yusuke 主観
5. **同日複数枚の index sort**: 04-28 child は photo-01 + photo-02 で並ぶ、05-02 / 05-03 は parent + child 別 role

#### 任意確認 (cost 高ければ skip OK)
6. **他 pair (yv00qaj6 / 新 slug 4 件 / TYSON-ZH90) album 影響ゼロ**: 各 URL access で既存挙動維持
7. **album 以外の page (ホーム / role select 等) 表示影響ゼロ**

#### 症状 fail 時の報告 format
- 症状: 例「画像表示されない / 一部だけ表示 / role 偏り / 日付集中」
- 端末: Mac Safari / iOS / Android
- 再現手順: URL access → 表示 → 操作
- screenshot 添付推奨

## 投入 file (Storage + Firestore)

### Storage (10 件)
全件 `journal/PAIR-SPC2NF/{monthKey}/{dateKey}/{role}/generic_image/photo-0{N}.png`

### Firestore docs (8 件、4 月 5 件 + 5 月 3 件、複数枚同日は単一 doc)
- journal/PAIR-SPC2NF/months/2026-04/days/2026-04-27 (parent ×1)
- journal/PAIR-SPC2NF/months/2026-04/days/2026-04-28 (child ×2)
- journal/PAIR-SPC2NF/months/2026-04/days/2026-04-29 (parent ×1)
- journal/PAIR-SPC2NF/months/2026-04/days/2026-04-30 (child ×1)
- journal/PAIR-SPC2NF/months/2026-05/days/2026-05-01 (parent ×1)
- journal/PAIR-SPC2NF/months/2026-05/days/2026-05-02 (parent ×1 + child ×1)
- journal/PAIR-SPC2NF/months/2026-05/days/2026-05-03 (parent ×1 + child ×1)

各 doc の roleData.{role}.generic_images[] に {storagePath, kind:'generic_image', uploadId, updatedAt(number ms), bytes, contentType:'image/png', width:0, height:0, index} 完全 fill。

## script 仕様補足

- `scripts/upload-demo-azmcqghd.js`: deterministic random (mulberry32, seed=20260503)、再実行で同 plan
- `--dry-run` flag で write skip、log + table のみ
- per-image sequence (batch なし、partial rollback 対応)
- Storage upload → Firestore write の順、Firestore 失敗時は Storage delete (orphan 回避)
- bucket 明示 `admin.storage().bucket(bucketName)` (memory hard rule)
- TARGET_PAIR_ID 以外への write を script 内 hard check で abort

## 関連 commit 構成 (Yusuke 指示後)

- commit 1: scripts/upload-demo-azmcqghd.js (gitignore 内、`-f` で force add 必要)
- commit 2: docs/phase-3-demo-azmcqghd/upload-result.md (本 docs)

## 次の step (実機 test → 撮影)

1. Yusuke commit + push 指示
2. (frontend deploy 不要、Storage / Firestore は即時反映済)
3. Yusuke 実機 test (7 項目、private tab で確認)
4. test 通過 → tutorial video 撮影に azmcqghd album 使用
