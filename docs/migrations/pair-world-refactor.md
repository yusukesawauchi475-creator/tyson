# Pair-World Refactor

## Background

Humのpair管理が構造的に data cross / data leak のリスクを抱えていることが判明した（2026年4月、複数のバグ修正を経て発覚）。

### 問題の症状

- AlbumPage の Home/Invite ボタン挙動を同一ファイルで5回連続修正することになった
- PC ブラウザで / を開くと localStorage 経由で最新発行pair の Home が表示される現象
- 「他人の Album URL を踏むと localStorage が汚染される」リスクが構造的に存在

### 根本原因

pairId の解決ロジックが3層（URL query / localStorage / fallback）に分散していた。ページ毎に取得経路が異なり、状態の真実のソースが曖昧。

### セカンドオピニオン

Gemini 2.5 Pro と ChatGPT に独立監査を依頼。両AIとも「構造問題、URL path = Source of Truth への移行を今すぐ実施すべき」と判定。工数 1.5〜2日。

## Design Decision

4公理（CLAUDE.md の Architectural Axioms 参照）を採用。特に「公理1: URL = Source of Truth」「公理2: Pair is a World」に基づき、全 pair 状態を URL path で表現する。

## Migration Plan

全4フェーズ。各Phase完了時に本番デプロイし、βユーザー（30家族）への影響を1日確認してから次Phaseへ進む。

### Phase 1: 新URL構造追加 + BrowserRouter移行（0.5日）

/pair/:slug, /pair/:slug/album, /pair/:slug/invite のルートを追加。HashRouter から BrowserRouter へ移行。既存の /#/ 系URLは触らず並存。vercel.json で rewrites 設定。

### Phase 2: 内部切り替え（1日）

全ページで useParams() 経由で slug → pairId 解決。getPairId() の localStorage 書き込みを停止。既存URLから来た場合は一時的に localStorage 読み取りで動く状態を維持。

### Phase 3: 旧URL redirect（0.25日）

/#/?pairId=X → /pair/:slug/home
/#/album?pairId=X → /pair/:slug/album
Firestore で pairId → slug 逆引き実装。

### Phase 4: Cleanup（0.25日）

getPairId() 関数削除。HashRouter 関連コード削除。localStorage の tyson_pairId キー削除。BrowserRouter のみに統一。

全Phase合計: 2日

### 完了後

Verification System（nightly 自動検証）の実装を別途開始する。詳細仕様は Phase 4 完了後に議論。

## Branch Strategy

- main は常にデプロイ可能
- 各Phase は feature/pair-world-phase-N ブランチで作業
- 各Phase完了時に main へ merge、本番デプロイ、1日様子見
- 問題発生時は revert で main に戻せる状態を保つ

## Pre-Refactor Affected Surfaces（2026年4月時点の影響範囲調査結果）

### A. localStorage tyson_pairId 書き込み箇所（3件）

- src/App.jsx:31 — NumberResolver 成功時
- src/lib/pairDaily.js:80 — initPairId、URL に ?pairId がある時
- src/lib/pairDaily.js:100 — getPairId の副作用（read中にwrite、公理3違反）

### B. getPairId() 呼び出し箇所（約50件、12ファイル）

ページ系（計32箇所）:
- HomePage.jsx: L91, 133, 146, 170, 183, 199, 279, 286, 295, 340, 386, 397, 410, 611（14箇所）
- PairDailyPage.jsx: L76, 117, 174, 182, 191, 231, 244, 282, 454, 482, 519, 551, 589, 698, 821（15箇所）
- AlbumPage.jsx: L63（URL直読みの fallback）
- AdminPage.jsx: L245, 293（2箇所）

ライブラリ default 引数（計11箇所）:
- pairDaily.js: L91（定義）, 140, 204, 303, 322, 350, 367, 388（7 default args）
- journal.js: L66, 151, 187, 206（4 default args）

コンポーネント（計7箇所）:
- OneYearAgoBanner.jsx: L42
- VoiceLibrary.jsx: L11（pairIdProp || getPairId()）
- DailyPromptCard.jsx: L211, 243（2箇所）
- FamilyInsightCard.jsx: L23
- WeeklySummary.jsx: L21

ルーティング:
- App.jsx:63（RootOrLanding fallback）

### C. /pair/:slug URL 生成箇所（5箇所）

- AdminPage.jsx:411（copyUrl）
- AlbumPage.jsx:155（handleShare slug form）
- HomePage.jsx:349（handleShare slug form）
- PairDailyPage.jsx:707（handleShare slug form）
- api/invite.js:172（create-numbered response）

### D. Legacy /#/?pairId=X 生成箇所（Phase 3 で /pair/:slug 形式へ統一、4箇所）

- AlbumPage.jsx:151
- DemoPage.jsx:108
- HomePage.jsx:345
- PairDailyPage.jsx:703

### E. HashRouter 依存箇所（10+箇所）

- HashRouter import + 使用: App.jsx:2, 107, 124
- window.location.hash 直読み: App.jsx:54, 71; pairDaily.js:76, 95, 116; AlbumPage.jsx:56; HomePage.jsx:637, 668; PairDailyPage.jsx:839, 866
- window.location.hash 書き込み: LanguageSwitch.jsx:13
- react-router-dom import 全ページ: App, Home, PairDaily, Album, Landing, Admin（6ファイル）

### F. PWA manifest start_url

- public/manifest.json:5 "start_url": "/"
- public/manifest.json:6 "scope": "/"
- Phase 1以降も「/」維持（Landing がデフォルト）
- 個別 pair の PWAインストールは設計上考慮しない

### G. Firebase Auth 匿名UID と pairId の関係

- firebase.js:4, 115, 128 — signInAnonymously 関連
- UID と pairId は紐付かない(直交性あり)
- UID = ブラウザ識別、pairId = 家族世界識別
- Refactor後もこの直交性を維持

## Implementation Log（各Phase完了時に追記）

### Phase 1

- Status: 未着手
- Branch: feature/pair-world-phase-1
- Start: (未定)
- Merged: (未定)
- Commit SHA: (未定)
- Deployment: (未定)
- βユーザー影響: (未定)

### Phase 2

- Status: 未着手

### Phase 3

- Status: 未着手

### Phase 4

- Status: 未着手

## Post-Refactor Evaluation（完了後に記載）

(Phase 4完了後に書く)

## Lessons Learned（完了後に記載）

(Phase 4完了後に書く)
