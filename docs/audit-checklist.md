# Audit Checklist (4 軸)

本 checklist は core-philosophy.md の 4 軸を operation 可能な list 化したものです。
各 PR / 段階 / Phase / migration の merge 前 / 実行前に全項目 check。

## 軸 1: upstream format 統一

- [ ] 同 entity の生成 path が全部同 helper 関数を経由するか
- [ ] 直接 Firestore write を物理的に block しているか (Firestore Rules)
- [ ] format 違反 record が生成不能か (API write check)
- [ ] DEMO / 他 pair / production 全部同 component で render か (UI 機能差ゼロ)

例:
- slug 生成: generateSlug() のみ ✓
- audioPath[] write: api/pair-media.js POST のみ ✓
- pair render: PairWorld + 配下 component 同一 ✓

## 軸 2: 人間判断介在ゼロ

- [ ] secret / config 取得が AI 単体で可能か
- [ ] migration / 修正 / audit が admin script 一発で完結するか
- [ ] Firebase Console / Vercel Dashboard 等の UI 手動操作が必須でないか
- [ ] 必須の場合、明示的 Yusuke pipe flow が docs 化されているか

例:
- generateSlug() を AI が直接呼べる ✓
- migrate-pair.js を AI が引数 1 つで実行可能 ✓
- secret は .env.local に固定 + AI access パターン確立 ✓

## 軸 3: 物理的に違反生成不能

- [ ] scan / 監視じゃなく upstream で block しているか
- [ ] Firestore Security Rules で write 制限
- [ ] API write 時の必須 field check (400 reject)
- [ ] type / shape 違反を build error 化

例:
- pair_numbers 直接 write 禁止 (Phase X-1) → admin only
- audioPath[] item に uploadedBy / mimeType / deviceHint / roleAtUpload 必須 (Phase X-3) → 欠落 400
- DEMO で write 試行 → API 403 (機能差じゃなく permission)

## 軸 4: AI 単体運用 100% 動作

- [ ] 各 critical path で AI 単体実行 test 設計済みか (Phase X-4)
- [ ] AI が誤判断しても upstream block で被害が止まるか
- [ ] 人間 review が「望ましい」じゃなく「不要」レベルに到達しているか
- [ ] 失敗箇所が upstream 化対象として記録されているか

critical path 例:
- 新 pair 作成 (slug 生成 → Firestore write → URL 発行)
- voice / photo upload (metadata 必須 check → audioPath[] append)
- pair migration (deactivate + 新 slug 生成 + 通知)
- incident 対応 (security audit → mitigation → post-mortem)

## 各 Phase / PR の audit 報告フォーマット

```
## [Phase N / PR title] audit 結果

### 軸 1: upstream format 統一
- [ ] xxx → 該当箇所: file:line, 違反なし
- [ ] yyy → 該当箇所: ..., 違反あり (修正方針: ...)

### 軸 2: 人間判断介在ゼロ
- [ ] ...

### 軸 3: 物理的に違反生成不能
- [ ] ...

### 軸 4: AI 単体運用 100% 動作
- [ ] ...

### 違反箇所サマリー
- 軸 X 違反: N 件 → 修正対応: <Phase X-N で対応 / 別 issue 化 / 許容範囲>
```

## このドキュメントの運用

- core-philosophy.md と integral pair (片方だけでは機能しない)
- 各 PR description に「軸 1-4 audit 結果」section 必須化 (CLAUDE.md で強制)
- 違反検出時は post-mortem 化検討


## 軸 5: Variation table 作成済み

operator 系 / data 系 / UI 系修正時、全 data variation を table 化して各 variation で UX / logic 確認。

### 必須適用 case
- pair card / pair list 等の表示修正 (slug あり/なし、memo あり/なし、active/deactivated)
- API write logic 修正 (各 input pattern の reject 条件)
- UI 機能差を生む修正 (DEMO / 通常 pair / legacy pair の handling)

### Variation table format
table format: variation 1 | variation 2 | ... | 期待挙動

### 例 (Phase II-pre 時にやるべきだった)
- pair 種類: 通常 / legacy / DEMO / deactivated
- slug: あり / なし
- memo: あり / なし
- active: yes / no
- 期待挙動: link 化 / grayed-out / memo 表示 / 空

## Self-audit checklist (各 phase 完了時 + 全 output 前)

### 完了時 audit (Yusuke 指摘待たない)
- [ ] core philosophy 軸 1-5 audit
- [ ] fundamental philosophy 1-6 audit
- [ ] 全 button / API endpoint 動作確認 (test / screenshot)
- [ ] 段階7/10-a/10-b/段階11/段階13/段階14/段階15/X-* logic 無変更
- [ ] 削除追加ゼロ scan
- [ ] CLAUDE.md reflection 必要なら追記
- [ ] memory rules 全準拠 verify
- [ ] handoff-template.md 同期更新

### 全 output 前 audit (Boss / CTO / Claude Code)
- [ ] Yusuke 依頼の明示 + 暗黙 + 文脈依存要望全 enumerate 済み
- [ ] 各要望に対する response が含まれている
- [ ] 過去 mistake pattern と照合済み (CLAUDE.md mistake 1-11 参照、Mistake 5/7 は除外、後日追加)
- [ ] Variation table 必要な task で作成済み
- [ ] Self-verification 実行済み or 計画済み
- [ ] CLAUDE.md 更新必要なら追記済み
- [ ] 事実確認 + 既存状態確認 + 技術 risk 分離の 3 軸 cross check (Mistake 11 rule)
- [ ] Plan Mode 利用判断 (複雑 phase の場合)

Check pass しないと output しない。
