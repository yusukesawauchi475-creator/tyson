# Phase D Step 1 想定外検出 2 件の premise 訂正

## Summary

前 audit (commit fd325c1 後、`docs/phase-d/audit-result-step1.md`) で報告された「想定外検出 2 件」は、Plan Mode 内の追加 grep + git log で **両件とも premise 誤り** と判明、再 audit 不要、両件とも実害なし。

- 想定外 1 (本物 4 pair upload 0 件 → CTO の collection 名特定ミス疑惑): **誤検証**、collection 名特定は完全、upload 0 件はコード上真実
- 想定外 2 (Phase X-3-A pairTimezone field 全 12 pair 不在): **そもそも 想定外でない**、Phase X-3-A は audioPath validation で pairTimezone と無関係、pairTimezone は Phase X-3-B 担当で未実装、前 audit-result-step1.md L10 が既に "expected" と明記済み

## 訂正 1: 「想定外 2 (Phase X-3-A pairTimezone 全 12 pair 不在)」は想定外でない

### 主張 (Boss 報告書での誤り)

> "想定外 2: Phase X-3-A pairTimezone field 全 12 pair 不在 → 仮説 (a) 期待動作 (新規 pair 生成 path のみ機能、既存 backfill 未実施) / (b) 機能不全 (新規 pair 生成時 set されてない bug) 未確定"

### 事実 (commit + grep で確定)

#### Phase X-3-A の実体は audioPath validation
`git log --grep "X-3-A"` 結果:
```
fd17602 merge: Phase X-3-A metadata 必須化 (audioPath validation)
05cbea1 feat(metadata): audioPath[] 必須 field validation (Phase X-3-A、Phase X-3-B pairTimezone 別日)
```

commit 05cbea1 stat: `api/pair-media.js | 42 ++++++++++++++++++++++++++++++++++++++++++` (audioPath validation 追加 42 行のみ)

→ Phase X-3-A は audioPath[] field の必須化、pairTimezone とは完全に無関係。

#### pairTimezone は Phase X-3-B 担当、未実装
`grep "pairTimezone" api/` 結果:
```
api/invite.js:131:    // TODO(Phase X-3-B): pairTimezone を必須引数として追加予定
api/streak.js:152:  // TODO(Phase X-3): pairTimezone 必須化で本実装に置き換え予定
api/streak.js:153:  //   - pair_numbers に pairTimezone field 追加
api/streak.js:154:  //   - 各 user の upload 時に pairTimezone の dateKey で記録
api/pair-media.js:161: * TODO(Phase X-3-B): pairTimezone 必須化を本 validation に追加予定
api/pair-media.js:162: *   - pairTimezone field を必須 list に追加
api/pair-media.js:163: *   - pair_numbers の pairTimezone から resolve した値を newEntry に含める
```

→ 全 TODO コメントが「Phase X-3-B 予定」と明記、現時点で pairTimezone を set する実装は存在しない。

### 前 audit-result-step1.md L10 が既に正解記載

```
- Phase X-3-A pairTimezone field: ❌ 全 12 pair で field 不在（pair 単位の pairTimezone 必須化は Phase X-3-B 未実装、expected）
```

前 audit 自身が「Phase X-3-B 未実装、expected」と書いている。Boss 報告書での「想定外」frame 自体が前 audit の正しい記述を読み違えた結果。

### 結論
- 想定外 2 はそもそも 想定外でない
- 仮説 (a) 期待動作 = 前 audit 時点で確定済み、追加検証不要
- pairTimezone field 不在は Phase X-3-B 未実装の自然な状態、bug でない
- Phase D 進行への impact: ゼロ (Phase X-3-B は別 phase、Phase D scope 外)

## 訂正 2: 「想定外 1 (本物 4 pair upload 0 件) collection 名特定ミス疑惑」は誤検証

### 主張 (再 audit prompt での疑惑)

> "前 audit script は journal/{pairId}/months/(monthKey)/days/(dateKey) path のみ scan、voices / photos collection 直接 scan 未実施の可能性"

### 事実 (api 全 file grep で確定)

`grep "collection(" api/` で全 28 箇所の collection 参照を取得。production active の voice/photo upload write path:

| 種別 | path | 参照箇所 |
|------|------|---------|
| voice | `pair_media/{pairId}/days/{dateKey}` | api/pair-media.js L252, L526, L752, L897, L1053 |
| photo | `journal/{pairId}/months/{monthKey}/days/{dateKey}` | api/journal.js L270, L449 |

その他の collection:
- `pair_numbers` / `pairs` / `pair_users` / `pair_members` → meta only、user 生成 content なし
- `voices` / `photos` 別 collection → **存在しない** (grep で 0 件)
- `_disabled/*` の `recordings` / `shugyo` collection → 全 file `_disabled/` 配下、production 経路から呼び出されない (api/_disabled/ 内)

### 前 audit script (scripts/audit-phase-d-step1.js) の path 特定

L103-120 (`scanVoiceUploads`):
- `db.collection('pair_media').doc(pairId).collection('days').get()` → days subcollection 全件 scan
- 各 day doc の `parent.audioPath[].version` + `child.audioPath[].version` で UTC ms 抽出

L122-157 (`scanPhotoUploads`):
- `db.collection('journal').doc(pairId).collection('months').listDocuments()` → 全 month traverse
- 各 month の `days` subcollection 全 day scan
- `roleData.{role}.generic_images[].uploadedAt` + `journal_image.uploadedAt` で timestamp 抽出

→ active production path 全件 cover、collection 名特定はコード上完全。

### 結論
- 前 audit script の path 特定は完全、bug なし
- 本物 4 pair (h06m0g / libriv / 2habi5 / 5828p4) の upload 0 件は **コード上真実** (Firestore に voice/photo 記録ゼロ)
- Yusuke 認識「ベータ走り出し中、Facebook 投稿で engagement あり」との矛盾の原因仮説:
  - (a) Facebook 投稿閲覧と app 実際 install/録音の間に転換 funnel あり、engagement あっても録音 0 件は十分あり得る
  - (b) 招待 URL 配布後の onboarding stage、まだ録音 step まで到達してない
  - (c) 別環境 (preview deploy / dev) で録音、production Firestore に未到達
- 上記 (a)(b)(c) いずれも script bug でなく、user behavior or onboarding flow の話、Phase D 進行判断材料として扱う

## Phase D 進行方針 3 択 (Yusuke / Boss 判断材料)

両 premise 訂正後の確定事実:
- 本物 4 pair upload 真に 0 件 (Firestore 上)
- pairTimezone field 不在は expected (Phase X-3-B で対処予定)

進行方針:

### α-2: slug rotation only (timezone は Phase X-3-B 別 phase)
- migration 対象 7 件 (本物 4 + test 3) で slug rotation 実施
- timezone 推定 / migration は scope 外、Phase X-3-B 後に別 migration として対処
- pro: 短期実行可能、Phase D 完了させて Phase X-3-B に進める
- con: pairTimezone backfill 機会失う (Phase X-3-B でやり直し)

### 元 scope: timezone 推定 + slug rotation 同時 migration
- 本物 4 pair の upload 0 件のため timezone ambiguous 確定、推定不能
- 推定不能のため migration 不可、本路線は実質崩壊
- 取りうる実行: Yusuke が本物 4 pair の owner に「あなたの timezone」直接確認 → 手動入力で migration
- pro: 完全 migration、Phase X-3-B 待ち不要
- con: Yusuke 手動 outreach 必須 (4 件)、scope creep

### 凍結: Phase D 全停止、Phase X-3-B 先行
- Phase X-3-B (pairTimezone 必須化) を先に実装、新規 pair は最初から pairTimezone 持ち
- 既存 12 pair は Phase X-3-B 完了後の backfill phase で対処
- pro: 上流 (新規 pair) の format 統一が先、philosophy 軸 1 整合
- con: Phase D 既に着手済み、凍結は過去 work の意味薄れる

## 推奨 (CTO 観点)

**α-2 採用**:
- 想定外 2 が premise 誤りで仮説 (a) 期待動作確定、pairTimezone は Phase X-3-B 別 phase で正常進行可能
- 本物 4 pair upload 0 件は Phase D 進行への blocker でない (slug rotation は upload 数と無関係)
- 元 scope は timezone 推定不能で実質崩壊、Yusuke 手動 outreach は scope creep
- 凍結は過去 work の有効活用低下

ただし最終判断は Yusuke / Boss。

## Reproducibility (本 doc 全 fact 再現手順)

```
# 訂正 1 の確認
git log --grep "X-3-A" --oneline
git show --stat 05cbea1
grep -rn "pairTimezone" api/

# 訂正 2 の確認
grep -rn "collection(" api/ | head -60
grep -rn "voices\|photos" api/ | grep -v "audioPath\|generic_images"

# 前 audit-result の正解記述確認
sed -n '10p' docs/phase-d/audit-result-step1.md
```

全 fact が grep / git log の機械的 output で再現可能、推測補完ゼロ。
