# General AI-Solo Project Framework

任意の project (Hum / Oasis / Ippei / Arbi-Scan 等) で AI 単体運用前提の運用基盤を Day 1 から立ち上げるための general framework。

## 必須要素 8 項目 (任意 project 同じ)

### 1. CLAUDE.md (project 直下)
- 最上位原則 (core-philosophy.md SSoT 参照)
- 過去 mistake list + rule (毎 mistake 即追記、事実確認済みのみ)
- Project 固有 context + 進行中 phase

### 2. docs/core-philosophy.md
- 4 軸 audit (upstream format 統一 / 人間判断介在ゼロ / 物理的に違反生成不能 / AI 単体運用 100% 動作)
- 軸 5 (Variation table)
- 6 fundamental philosophy
- Project 固有 violation history

### 3. docs/audit-checklist.md
- 軸 1-5 全件 audit checklist
- Self-audit checklist (完了時 + output 前)

### 4. docs/post-mortems/
- 各 incident 詳細記録 (Structural / Behavioral 分類)
- Cross-cutting 教訓

### 5. docs/handoff-template.md
- Thread 移行用 template
- 新 session 即時 context 復元

### 6. PostToolUse hook (Phase B で実装、Boris Cherny Tip 10)
- lint + test + screenshot + API health check
- Reflection 自動抽出 → CLAUDE.md 追記
- Variation table 自動 verify
- 注: 未検証技術、Phase B で実運用検証しながら setup

### 7. Skills (Phase B で実装、Boris Cherny Tip 5)
- main-merge.md (main merge 手順 SSoT)
- variation-table.md (table 作成 template)
- handoff-update.md (handoff-template 同期手順)
- self-audit.md (output 前 self-audit checklist)
- 注: 未検証技術、Phase B で実運用検証しながら setup

### 8. Plan Mode + subagents 運用 (Phase B 標準化)
- 複雑 phase で Plan Mode 標準化
- subagent 役割分担 (audit / implement / test / verify)

## Project 固有 customize 例

### Hum (本 project)
- 段階 system (段階 7/10-a/10-b/段階 11/段階 13/段階 14/段階 15)
- Phase X-* (slug / metadata / DEMO / migration)
- Phase Y (email + magic link auth)
- Phase Z (automation roadmap、Slack / cron / retention report / CI)

### Oasis (NYC トイレ発見アプリ、検討中)
- 場所 data 整合性 audit
- 写真 metadata 必須化
- review system

### Ippei (TBD project)
- TBD

### Arbi-Scan (日米価格差 SaaS、検討中)
- 価格 data 同期 audit
- API rate limit
- subscription tier handling

## Day 1 setup 手順 (新 project 立ち上げ時)

1. project repo init
2. mkdir -p docs/post-mortems docs/migrations
3. CLAUDE.md template から start (本 framework copy)
4. docs/core-philosophy.md 4 軸 + 軸 5 + 6 philosophy 適用
5. docs/audit-checklist.md 軸 1-5 適用
6. docs/handoff-template.md 適用
7. PostToolUse hook 設定 (.claude/hooks/) ← Phase B で
8. 第 1 mistake 検出時に CLAUDE.md mistake list start

これで Day 1 から AI 単体運用前提の運用基盤を確立、Yusuke 1 人 (or AI agent 1 人) で sustainable 開発可能。

## 注意 (Yusuke + Boss + CTO 共有)

- skills / hooks (Boris Cherny Tips) は未検証技術、Phase A1 では setup せず Phase B 統合
- 他 project への横展開時も Phase B 完了後の検証済み技術を copy する
- 未検証技術の先行 setup は無駄リスク (Phase A2 skip 判断と同根拠)
