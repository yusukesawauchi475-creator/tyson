# Hum Core Philosophy

このドキュメントは Hum project の最上位 SSoT (Single Source of Truth) です。
全ての PR / 段階 / Phase / refactor / migration の判断はこの 4 原則 + 4 軸に従います。
矛盾発生時は本 doc が CLAUDE.md, README, migration docs より優先されます。

## 4 つの core 原則

### 原則 1: data leak / cross / lost しない

**definition**: pair 間の data 漏洩 / 別 pair への混入 / 永続的喪失を物理的に発生不能にする。

**enforcement layer**:
- API write 時の pair_id 必須 check
- Firestore Security Rules で uid-based access (Phase 3 backlog: 認証必須化)
- audioPath[] / photos[] への immutable 追記モデル (削除しない)
- migration script は data 複製じゃなく metadata flag で deactivate

**violation history**:
- 2026-04-26: TYSON-ZH90 incident (推測可能 slug = pair isolation 弱体化)
- 詳細: docs/post-mortems/2026-04-26-tyson-zh90-incident.md

### 原則 2: upstream で同じ format で作る

**definition**: 同 entity (slug / metadata / role / audio path 等) の生成 path を 1 つの helper 関数経由に統一、format 違反を physically 不能にする。scan / 監視ではなく upstream block。

**enforcement layer**:
- generateSlug() helper 1 関数経由 (Phase X-1)
- audioPath[] write API 必須 field check (Phase X-3)
- DEMO link UI も同 component 経由 (Phase X-2.5)

**violation history**:
- 弱 slug 残置 (TYSON-ZH90, ulf1q6 等の推測可能 / 短い slug)
- DEMO link UI 機能差 (写真追加ボタンなし等、isDemoTest 分岐の副作用)
- audioPath[] metadata 任意 (uploadedBy / mimeType / deviceHint / roleAtUpload 欠落 record の歴史的存在)

### 原則 3: AI 単体運用 100% 動作

**definition**: 人間判断介在ゼロで AI agent が migration / 修正 / audit / incident 対応 全部実行可能な状態。Yusuke は product owner judgment に集中、operation は AI に委譲できる。

**enforcement layer**:
- secret / config の AI access 可能な store (or 明示的 pipe flow)
- admin script 一発で完結する operation (Firebase Console UI 手動操作不要)
- AI が誤判断しても upstream block で被害が enforce される構造

**violation history**:
- 2026-04-26 incident で secret 取得 flow が Yusuke 手動依存 (Firebase Console screenshot)
- AI が schema 推測ミスしても upstream で block される構造がなかった

### 原則 4: 30 年 sustainable

**definition**: 削除しない、immutable 追記のみ、format 統一、AI が 30 年後でも data 解釈可能な構造。

**enforcement layer**:
- deactivated flag (削除しない)
- correctedRole 追記モデル (original 保持、Phase 段階10-a)
- migrationFrom / migrationTo audit trail
- 全 record に metadata 必須 (Phase X-3)

**violation history**:
- audioPath[] metadata 欠落 record (歴史的、graceful fallback で前方互換維持)

## 4 軸 audit checklist

各 PR / 段階 / Phase の merge 前に以下 4 軸を check。詳細は docs/audit-checklist.md。

1. **upstream format 統一**: 同 entity 生成が単一 helper 経由か
2. **人間判断介在ゼロ**: AI 単体で operation 完結するか
3. **物理的に違反生成不能**: scan じゃなく upstream block か
4. **AI 単体運用 100% 動作**: critical path の AI test pass するか

## このドキュメントの位置づけ

```
docs/core-philosophy.md  ← 最上位 SSoT (本 doc)
       ↓ ref
   CLAUDE.md  ← 実装 guidance
       ↓ ref
   段階 docs / Phase docs / migration docs
```

矛盾発生時は本 doc が優先。新原則追加 / 既存原則修正は Yusuke (product owner) judgment のみで可能。


## 6 Fundamental Philosophy (CTO + Claude Code 運用 baseline)

これらは「軸 1-5 audit checklist」よりさらに上位の運用思想。AI 単体運用への移行を前提とする。

### Philosophy 1: Persistent learning over context-dependent memory
- 過去 mistake / 学びを context window 依存じゃなく docs に永続化
- 新 thread / 新 session で同 mistake 再発しない構造
- 実装: CLAUDE.md mistake list、post-mortems、Phase B で PostToolUse hook

### Philosophy 2: Complete enumeration over partial response
- Yusuke 依頼受領時、明示 + 暗黙 + 文脈依存要望を全 enumerate
- partial 実装で後追い修正は禁止、1 phase で完結
- 実装: variation table 必須化 (軸 5)、self-audit step

### Philosophy 3: Self-verification over founder visibility
- Yusuke スクショ指摘待たず、CTO + Claude Code 自身が test / screenshot / API health check
- founder visibility は最終 verify、CTO の audit failure を Yusuke が補完する pattern 撲滅
- 実装: Phase B で PostToolUse hook、test / screenshot 自動化

### Philosophy 4: Upstream physical enforcement over downstream check
- 違反を生成不能にする upstream block (Firestore Rules、API validation、generateSlug() helper)
- scan / 監視じゃなく入口で物理 block
- 実装: Phase X-1 (slug)、Phase X-3-A (metadata)、Phase X-3-B (timezone)

### Philosophy 5: AI-only operation as design baseline
- 全機能を AI が単体実行可能な前提で設計
- 人間判断介在ゼロを default、人間 review は exception
- 実装: Phase E (Z 設計)、Phase B (skills/hooks)

### Philosophy 6: Subagent specialization over single-thread orchestration
- 1 task = 1 subagent role 分担
- main thread は orchestrator、複雑 audit / multi-file 修正は subagent 委譲
- 実装: Plan Mode + subagents (Phase B 標準化)
