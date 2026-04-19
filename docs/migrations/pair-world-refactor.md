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

## Implementation Log

### Phase 1

- Status: 完了
- Branch: feature/pair-world-phase-1
- Start: 2026-04 (Phase 0 直後)
- Commit SHA: 90d522d
- Merge commit: 9e566ec (--no-ff)
- Deployment: humfamily.com 本番（Vercel 自動デプロイ）
- βユーザー影響: なし（確認時点で影響ゼロ）
- Yusuke 承認記録: 実機4項目（/pair/ulf1q6 Home, /pair/ulf1q6/album, /, /#/admin）全OK

### Phase 2

- Status: 完了
- Branch: feature/pair-world-phase-2
- Start: 2026-04 (Phase 1 直後)
- Commit 履歴:
  - c00569c: 元 Phase 2 (useOutletContext 移行 + navigate 新形式)
  - 1e30bf4: Commit A (HashRouter 完全削除、LanguageSwitch useSearchParams 化)
  - 64d2e2c: Commit B (getPairId/initPairId/NumberResolver/localStorage tyson_pairId 完全削除)
  - ff5f47b: Commit C (コンポーネント5個 props 化、ライブラリ関数 pairId 必須引数化)
  - 80dd657: Commit D (/admin 新ルート、vercel.json redirects 削除)
  - dd095a0: Commit E (DemoPage の hash URL → navigate 新形式に修正)
  - ce14460: Commit F (/eng 系ルート4つ削除)
- Merge commit: e082ba9 (--no-ff)
- Deployment: humfamily.com 本番（Vercel 自動デプロイ）
- Yusuke 承認記録: 実機5項目（Home/Album遷移/Home戻り/Landing/Demo）全OK、PAIR-DEMOTEST は Firestore に手動登録で対応

### Phase 3

- Status: 廃止（βユーザー不要前提の変更により、Phase 2 に統合）

### Phase 4

- Status: 廃止（Phase 2 Final に統合完了）

## Post-Refactor Evaluation

### 実施期間
2026年4月（Phase 0 ドキュメント化から Phase 2 Final main マージ完了まで）

### 結果サマリ
- 7 commit で Pair-World Refactor を完了
- 全 grep チェッククリア（localStorage tyson_pairId / getPairId / initPairId / NumberResolver / window.location.hash / HashRouter / PAIR_ID_STORAGE_KEY / tyson_pairId リテラル、全てゼロ件）
- 4公理のうち 3.5 達成:
  - 公理1 URL = Source of Truth: 達成（localStorage 依存完全除去、URL slug が pairId の唯一のソース）
  - 公理2 Pair is a World: 達成（pair 間データ混線の経路が構造的に存在しない）
  - 公理3 Side effects are explicit: 達成（read-中-write 副作用を持つ getPairId を関数ごと削除）
  - 公理4 Verification is automatic: 部分達成（nightly CI / static analysis 未実装、将来タスク）

### 発見された dead code
以下2コンポーネントは Refactor 過程で import 元が存在しないことが判明。削除せず保持:
- src/components/OneYearAgoBanner.jsx
- src/components/FamilyInsightCard.jsx

将来の Memory Surfacing 機能（docs/features/memory-surfacing.md 参照）で活用予定。

### 保留された作業
- TYSON-ZH90 保護コード（api/album.js, api/pair-media.js, api/journal.js の 403 blocker, AdminPage の HIDDEN_PAIR_IDS）: 意図的に維持。現状の isolation で十分。
- tyson → hum の名称変更（リポジトリ名、Vercel 設定等）: 任意、将来判断。
- apex humfamily.com → www.humfamily.com 307 redirect: 意図不明だが触らない方針。
- Verification System（公理4）: nightly CI / static analysis 未実装、別タスクとして着手予定。

### βユーザーへの影響
なし。移行期間中の βユーザー 0 前提で実施したため、既存 localStorage 喪失・旧URL非互換化のコストを許容できた。

## Known Debt / Phase 3 Candidate

Phase 2 Final 完了時点で認識された技術負債 backlog。各項目は段階1〜6 の実装過程で露呈。
Phase 3 Refactor で整理予定、YC Summer 応募完了後に着手判断する。現時点では対症療法で進行、
docs に記録することで将来の設計判断材料とする。

### 1. Role management ambiguity

- **現状**: role マスターが URL param (`?role=X`) / localStorage (`tyson_userRole`) / Firestore (UID→role マッピングなし) の3層に散在
- **段階4 での変更**: URL param 削除、localStorage が実質マスター化
- **残課題**: localStorage はクライアント端末属性、別端末アクセス時の整合性未設計
- **Phase 3 検討事項**:
  - マスター層の明確化
  - Firestore に UID→role 正規化を持たせるか
  - または localStorage 一本で良いかの設計判断

### 2. Pair ID naming inconsistency

- **現状の命名バリアント**:
  - レガシー: `TYSON-ZH90`（Yusuke 家族）
  - 新規正規: `PAIR-XXX`（PAIR-FSEAN5, PAIR-NY5XTF, PAIR-DEMOTEST 等）
  - 旧テスト: `ulf1q6`, `h06m0g`, `2habi5`（英数字6文字、prefix なし）
  - 番号: `/pair/N` → NumberResolver 解決
- **問題**: 新規 pair 作成時の命名規則が不明確、将来エンジニアが読んで即理解できない
- **Phase 3 検討事項**:
  - 正規命名規則（`PAIR-` prefix 強制）
  - legacy alias 設計
  - 番号 URL との関係整理

### 3. Demo pair special-casing scattered

- **現状**: `pairId === 'PAIR-DEMOTEST'` 判定分岐が以下に点在
  - `src/pages/AlbumPage.jsx`（段階1 で `demoVoiceDays` / `DEMO_ALBUM_PHOTO_SETS` / `DEMO_VOICE_META` 導入）
  - `src/pages/HomePage.jsx`（段階2 で parent audio demo 分岐 4箇所追加）
  - `src/components/AlbumCalendar.jsx`（段階3 で Calendar 件数バッジの demo 分岐、feature/calendar-count-badges に留保中）
- **問題**: 将来 demo pair を複数化（日本語 demo と英語 demo 等）する際、全箇所に分岐追加が必要
- **Phase 3 検討事項**:
  - `isDemoPair(pairId)` helper を `src/lib` に一元化
  - 全箇所を helper 経由に置換
  - demo ID は array 化で複数対応

### 4. Allowlist per-pair access control

- **現状**: TYSON-ZH90 のみ UID allowlist 制限、他 pair は UID 制限なし
- **実装**: `api/lib/pair-access.js` に TYSON-ZH90 専用の allowlist ロジックがハードコード
- **問題**: 他家族 pair も UID 制限したくなった場合、pair ごとに `pair-access.js` を改修する必要
- **Phase 3 検討事項**:
  - `pairs/{id}.allowedUids` 的な Firestore 構造で一般化
  - `pair-access.js` は generic な allowlist 判定のみ担当
- **段階6 (2026-04-19) での更新**: TYSON-ZH90 allowlist は撤廃済み。pair ID 単位 Firestore query による標準 isolation に統一。Phase 3 で `pairs/{id}.allowedUids` 的な Firestore ベース構造で一般化再導入を検討する。`api/lib/pair-access.js` の配列・関数・8 callsite は Phase 3 足場として残置中。

### 5. Firestore / Storage rules are authenticated-only

- **現状**: `firestore.rules` と `storage.rules` が「認証済みユーザーなら全 document 読み書き可能」の設計
- **問題**: pair 単位の access control がルールレベルで存在しない、クライアント直接 Firestore access（`src/lib/invite.js`, `src/components/PairWorld.jsx`, `src/pages/AdminPage.jsx` 等）が既に複数経路存在するため、API 層の allowlist では万全でなかった
- **段階6 での影響**: allowlist 撤廃によりこの既存課題が可視化された（allowlist が元から穴あり状態だった事実）
- **Phase 3 検討事項**: Firestore rules を pair 単位 access control に強化、例えば `allow read: if request.auth.uid in resource.data.allowedUids` 的な構造、Debt #4 の Firestore 化と一体で設計

## Lessons Learned

### セカンドオピニオンの有効性
Gemini 2.5 Pro と ChatGPT に独立監査を依頼し、両AIとも「構造問題、URL path = Source of Truth への移行を今すぐ実施すべき」と判定。この一致により方針確定が加速した。大規模リファクタの方針決定時は、独立した複数の判断源を取ることが有効。

### 3層役割分担の機能
Boss（戦略・設計）/ CTO（指示書の実装プロンプト化）/ Claude Code（実装）の3層分担は、各層の責任が明確で効率的に機能した。特に CTO が Boss の指示書を Claude Code が実行可能な精密プロンプトに変換する層は、実装時の推測ミスを大幅に減らした。

### 柔軟な Phase 設計の価値
当初の4 Phase 計画（各Phase完了後に1日様子見）は、途中で前提が変わった際（既存ユーザー0判明）に Phase 3/4 を Phase 2 に統合するスコープ縮小が可能だった。Phase を「時間の経過」ではなく「論理的な境界」で切っておくと、前提変化に柔軟に対応できる。

### ドキュメントの二層構造の価値
CLAUDE.md は「今の原則」、docs/migrations/ は「歴史的記録」の二層構造を Phase 0 で確立したことで、移行が進んでも CLAUDE.md は肥大化せず、進行中リファクタの詳細は migrations に集約できた。完了時には CLAUDE.md の「進行中のMigration」セクションを完了状態に更新するだけで履歴は migrations に残る。

### コードブロック内バッククォートのネスト問題
Boss から CTO への指示書、および CTO から Claude Code への指示書で、マークダウンコードブロックのバッククォート（3連続）をネストすると指示書が壊れる事件が発生。以降の原則として、指示書内のコード例はインデント or 行プレフィックス or EOF heredoc で表現し、マークダウンコードブロックのネストは禁止とする。

### 次回リファクタ時の推奨アプローチ
- Phase 0 として必ず原則のドキュメント化とセカンドオピニオンを先行
- docs/migrations/ 配下に新ファイルを作成し、影響範囲調査（Pre-Refactor Affected Surfaces）を最初に完了
- Phase 境界は論理的な切れ目で、各 Phase で build と grep による検証を必ず通す
- 既存ユーザーへの影響評価を Phase 計画に組み込み、影響が小さければスコープを圧縮できる設計にする
- 破壊変更を含む commit は feature ブランチで複数の論理 commit に分割し、各 commit で build を通しておく（revert 時の切り分けが可能になる）
