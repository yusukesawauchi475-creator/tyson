# 2026-04-26 TYSON-ZH90 Incident Post-Mortem

## Summary

2026-04-26 (Yusuke 朝): humfamily.com/pair/TYSON-ZH90 が誰でも URL 直打ちでアクセス可能、founder family の voice / photo data が外部公開リスク状態にあったことが Yusuke 検出。緊急対応で slug migration + deactivation hotfix で security 確保 (約 60 分)。

但しこの incident は表面的な security 問題ではなく、複数の structural / behavioral root cause が連鎖した結果。本 post-mortem で 6 項目記録、再発防止策と Phase X 設計に反映。

## Timeline

- 2026-04-26 (時刻): Yusuke が humfamily.com/pair/TYSON-ZH90 を外部から開くと family link がそのまま開けることを発見
- 同 (時刻+5min): Boss + CTO に emergency 報告
- 同 (時刻+10min): CTO が選択肢 B (passphrase gate) 提案 → Boss 却下
- 同 (時刻+15min): Boss が選択肢 D (slug randomize) 確定
- 同 (時刻+30min): 段階1 admin script 実装 (CTO prompt は schema 推測ミス、Claude Code が code 精読で訂正、scripts/migrate-pair.js)
- 同 (時刻+45min): Yusuke が migrate-pair.js 実行、TYSON-ZH90 → 新 random slug 完了
- 同 (時刻+60min): 段階2 hotfix (PairWorld + API endpoint deactivated check) main merge
- 同 (時刻+70min): API curl で TYSON-ZH90 → 404 確認、security 確保
- 同 (時刻+75min): Firebase Console 案内 → スクショで slug が CTO chat に漏洩 (事故)
- 同 (時刻+80min): Boss 判断 (α: 現 slug 維持、再 migration 中止)、母 LINE 移行へ

## Structural Failures (3 件)

### Structural-1: Pair-World Refactor (commit ff5f47b) call site 更新漏れ

- **検出**: Phase I 調査で Claude Code 発見
- **詳細**: getListenRoleMeta(listenRole, pairId) を required 第二引数化したが HomePage / PairDailyPage の 5-9 箇所の caller で pairId 未指定。pairId === undefined → API URL pairId=undefined → 404 → hasAudio = false → HomePage「まだ届いていません」誤表示
- **被害**: founder family TYSON-ZH9O で母さんが voice 送っても Yusuke の Home 画面に「届いていません」表示、trust bug
- **root cause**: refactor 時に required arg 化したが call site grep で全件確認しなかった
- **対策**:
  - Phase X-3 で API write 必須 field check 強制 → 同種 issue で 400 error / build error
  - audit 軸 3 (物理的に違反生成不能) で同 pattern 検知

### Structural-2: 段階10-a immutable correction の day-level 構造非更新

- **検出**: Phase I 調査で Claude Code 発見
- **詳細**: audioPath[] item に correctedRole 追記モデルだが、day document 直下の parent / child field 構造は変えない。例: 4/23 mom が誤って parent slot に upload → data.parent のみ存在、data.child 不在。後で訂正されても data.parent.audioPath[0].correctedRole = 'child' 追記だけで data.child field は作られない。streak.js の data.parent && data.child check は raw 構造を見るため、訂正後の effective dual-role を認識しない → 該当日が bothDays から漏れ、streak 「1 日連続」誤表示
- **被害**: 79 日連続使用が streak 表示で「1 日連続」、Yusuke の達成感削がれる、習慣化 motivation 低下
- **root cause**: data 整合性の semantics layer (effective role) を logic layer に渡してない、layer 跨ぎの incomplete refactor
- **対策**:
  - Phase X-4 (AI 単体運用 test) で streak / journal / album の cross-component 一貫性 test 設計
  - Phase 3 backlog: data integrity test suite 整備

### Structural-3: 段階6 TYSON-ZH90 allowlist 撤廃で推測可能 slug 残置

- **検出**: 2026-04-26 incident で Yusuke 検出
- **詳細**: 段階6 で「TYSON-ZH90 allowlist 撤廃」main merge 時、通常の pair isolation = slug knowledge-based access に切替えた。pair isolation は slug を知ってる人なら誰でも開ける前提だが、TYSON-ZH90 が推測しやすい slug な事に気付かなかった。allowlist という別 layer の防御を撤廃する時、slug 自体の隠匿性を upgrade する必要があった
- **被害**: 外部公開リスク (実 incident は外部漏洩経路ゼロ確認、実害なし)
- **root cause**: 防御 layer の設計時に「片方撤廃なら他方強化」trade-off を audit しなかった
- **対策**:
  - Phase X-1 で generateSlug() upstream 強制 → 弱 slug 物理的生成不能
  - Phase X-2 で既存弱 slug 一括 migration
  - Phase 3 backlog: Firebase Auth 必須化で slug 漏洩しても認証で防御

## Behavioral Failures (3 件、CTO 判断 pattern)

### Behavioral-1: schema 推測ミス (pair_members vs pair_numbers)

- **発生**: 段階1 admin script prompt で CTO が「pair_members/{slug}」と書いた、実 schema は pair_numbers/{slug}
- **影響**: Claude Code が code 精読で訂正したから救われたが、もし精読せず実装してたら data 複製 risky operation 発動の危険
- **root cause**: CTO が memory ベースで schema 推測、Yusuke memory ルール「Claude must read actual code before acting」違反
- **対策**:
  - core-philosophy.md 軸 4 (AI 単体運用) で「schema 触る前に必ず grep / view で actual schema 確認」step 必須化
  - Phase X-4 で AI 単体実行 test に schema audit 含める

### Behavioral-2: B 案 passphrase gate 提案 (段階6 撤廃の design 後退)

- **発生**: incident 検出時、CTO が選択肢 B (TYSON-ZH90 限定 passphrase gate) 提案
- **影響**: Boss が即却下したから実装に至らず、実害なし。但し提案自体が「段階6 product milestone (allowlist 撤廃) の後退」「TYSON-ZH90 hardcoded 特例 logic 追加」で 2 重の design 違反
- **root cause**: 緊急時の panic mindset で応急処置に走り、core philosophy (upstream format 統一) を瞬間的に忘れた
- **対策**:
  - core-philosophy.md を最上位 SSoT 化、緊急時こそ参照
  - 緊急 hotfix prompt 発行前に「core-philosophy.md と整合するか」self-check 必須化

### Behavioral-3: Firebase Console screenshot 案内で secret 漏洩

- **発生**: 新 slug 取得手順で CTO が「Firebase Console で migratedTo field 確認」案内、Yusuke のスクショ習慣 (memory 記載) を考慮せず slug 文字列が CTO chat に漏れた
- **影響**: Anthropic 内部のみへの漏洩 (確率低)、実害なし。但し設計の「secret は Yusuke 手元のみ」原則を Yusuke 自身が破る形になり、再 migration 試行 → "Source not found" rabbit hole 発生 → 母さん voice exchange 復活が遅延
- **root cause**:
  - CTO が Yusuke の操作習慣を考慮せず secret 取得 flow 設計
  - secret 取得 flow が Firebase Console UI 手動操作依存 = 軸 2 (人間判断介在ゼロ) 違反
- **対策**:
  - core-philosophy.md 軸 2 で「secret 取得 flow の AI 単体実行可能化」必須化
  - admin script で secret 取得 / 表示 / clipboard copy 一発化 (Phase 3 backlog)
  - 当面は secret 案内時「画面共有 / コピペ禁止、手元メモのみ」明示

## 教訓 (cross-cutting)

1. **構造的盲点 (Structural)** は code review / refactor 時の cross-layer audit 不足から生まれる。Phase X-3 (metadata 強制) + X-4 (AI 単体 test) で同種 issue を upstream block する
2. **行動的盲点 (Behavioral)** は CTO の memory ベース判断 + 完璧主義 + 緊急時 panic から生まれる。core-philosophy.md SSoT 化 + audit checklist 強制で同種 issue を upstream block する
3. **両方の盲点 が連鎖** したのが本 incident。layer 別の対策じゃなく cross-layer の core philosophy enforcement (Phase X) で根本対処する

## Phase X との対応

| Phase | 対象 |
|---|---|
| X-0 (本 doc 含む) | core-philosophy.md SSoT 化、6 項目記録 |
| X-1 | Structural-3 (slug 強制 generation) |
| X-2 | Structural-3 (弱 slug 一括 migration) |
| X-2.5 | Structural-3 派生 (DEMO link UI format 統一) |
| X-3 | Structural-1, Structural-2 (metadata 必須化 = call site / layer 跨ぎ漏れ block) |
| X-4 | Behavioral-1, Behavioral-2, Behavioral-3 (AI 単体運用 test = 行動 pattern 違反検知) |

## 再発防止 KPI

- 軸 1-4 audit 違反検出率 (Phase X 完了後 0 件目標)
- AI 単体実行 test pass 率 (Phase X-4 完了後 100% 目標)
- secret 取得 flow の Yusuke 手動操作回数 (Phase X-4 完了後 0 回目標)
- 緊急 hotfix での design 後退提案件数 (Phase X-0 以降 0 件目標)
