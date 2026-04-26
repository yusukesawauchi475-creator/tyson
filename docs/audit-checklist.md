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
