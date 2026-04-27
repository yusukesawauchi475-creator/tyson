# Hum — プロジェクトガイド

## 最上位原則

本 file の全内容は **docs/core-philosophy.md** の SSoT (Single Source of Truth) に従う。
矛盾発生時は core-philosophy.md が優先。

新規 PR / Phase 実装前に **docs/audit-checklist.md** の 4 軸 audit を実施。
違反検出時は post-mortem 化検討。

直近 incident: **docs/post-mortems/2026-04-26-tyson-zh90-incident.md** (structural 3 + behavioral 3 件記録)

## 概要
毎日1分、家族と声・写真を交換するアプリ。  
本番: https://www.humfamily.com / https://tyson-two.vercel.app

## Core Philosophy

Humの全ての判断はこの3原則から逆算される。機能追加・バグ修正・UI変更のあらゆる場面で優先される。

1. **User data never lost** — 一度録音・撮影・送信されたユーザーのデータは、いかなる理由でも失われてはならない。「送信しました」表示はFirestore書き込み確認後のみ。楽観的UI禁止。
2. **User data never crossed** — あるペアのデータが別のペアに見えてはならない。pairId fallbackは絶対禁止（nullならエラー、デモへのフォールバックも不可）。PAIR-DEMOTESTの isolation は厳守。
3. **Easy look back** — 積み重なった家族の記録（写真・音声）に、いつでも戻れる体験を最優先に設計する。過去を遡ることで今日の1分に意味が生まれる。Album、カレンダービュー、日付スクロール等の「振り返り機能」はHumの中核。

## Architectural Axioms（30年耐える設計のための公理）

Humの全ての実装判断はこの4公理から演繹される。違反は機能追加・バグ修正に関わらず却下される。

### 公理1: URL = Source of Truth

状態は常にURLから復元可能であること。localStorage / sessionStorage / memory はキャッシュであり、真実のソースではない。pairId の真実のソースは URL path（/pair/:slug）のみ。リロード・戻る・進む・URL共有・PWAインストールのいずれの経路でも、URLが同じなら同じ状態が復元されなければならない。

### 公理2: Pair is a World

各 pair は独立した「世界」である。世界は URL path で識別される。ある世界のデータが別の世界に流出する経路は構造的に存在してはならない。世界間の橋は demo への導線のみ（demo は完全独立の特殊世界）。

### 公理3: Side effects are explicit

関数の命名で副作用の有無を明示する。get* / fetch* 関数は read のみ。set* / save* / update* 関数は write のみ。両方を行う関数は命名で明示（syncPairContext 等）。混合関数は作らない。

### 公理4: Verification is automatic

公理1-3への違反を人間の目視で発見する仕組みは信用しない。毎日 nightly CI / static analysis が自動検証する。人間のレビューは二次検証であり一次ではない。

## 不変の3原則（Core Philosophy の継続）

1. User data never lost — 一度入ったデータは失われない
2. User data never crossed — ペア間データは構造的に混ざらない
3. Verify every day — 毎日自動検証される

このCore Philosophyセクションは全ての技術判断の上位概念として機能する。Axiomsと原則が衝突する実装が要求された場合、CTOは作業を止めて確認を求める。

## 進行中のMigration

Pair-World Refactor は 2026年4月に完了。詳細は docs/migrations/pair-world-refactor.md 参照。

現在、Humは「URL = Source of Truth」原則で動作し、pair間データ混線は構造的に不可能。4公理（URL = Source of Truth / Pair is a World / Side effects are explicit / Verification is automatic）への準拠を達成。ただし公理4（Verification is automatic）は nightly CI 未実装のため、部分達成。

次のMigration予定: なし（必要時に docs/migrations/ に新規ファイル作成）

進行中の将来機能: Memory Surfacing（docs/features/memory-surfacing.md 参照）

## スタック
- **フロントエンド**: Vite + React (BrowserRouter), インラインCSS中心
- **バックエンド**: Vercel Serverless Functions (`api/` ディレクトリ)
- **データ**: Firebase Firestore + Firebase Storage
- **認証**: Firebase Anonymous Auth
- **デプロイ**: Vercel Pro（mainブランチ push で自動デプロイ）
- **フォント**: Nunito (Google Fonts, 700/800)

## ルーティング (BrowserRouter)
| パス | コンポーネント | 説明 |
|------|-------------|------|
| `/` | RootOrLanding | PWA slug復元→/pair/:slug リダイレクト、なければ LandingPage |
| `/admin` | AdminPage | 管理画面 |
| `/demo` | DemoPage | デモ体験 |
| `/landing` | LandingPage | ランディングページ |
| `/welcome` | WelcomePage | DEMO CTA経由 自動pair発行・LINE共有 (Phase X-2.5-fix) |
| `/pair/:slug` | PairWorld → RootRoute | slug解決後 role振り分け (親→HomePage, 子→PairDailyPage) |
| `/pair/:slug/album` | PairWorld → AlbumPage | 写真・声アルバム |
| `/pair/:slug/invite` | PairWorld → InvitePage | 招待リンク共有 (lang='ja'固定 既知バグ) |

**注意**: `localStorage['hum_last_slug']` でPWA slug復元を行う。公理1の例外として承認済み（slugはURL公開値、pairId内部IDは保存しない）。

## ペアの仕組み
- 公開URL: `humfamily.com/pair/{6文字スラグ}` (例: /pair/ulf1q6)
- Vercel redirect → `/api/invite?action=resolve&number=slug`
- Firestore: `pair_numbers/{slug}` → `pairId` (例: PAIR-H58HTP)
- 内部ID `PAIR-XXXXXX` は URL に露出しない

## 主要ファイル

### フロントエンド (ページ)
| ファイル | 役割 |
|---------|------|
| `src/App.jsx` | BrowserRouter, RootOrLanding (PWA slug復元), PairWorld wrapper, RootRoute (role振り分け) |
| `src/pages/HomePage.jsx` | 親のホーム画面 (緑/ピンク/紫の3カード) |
| `src/pages/PairDailyPage.jsx` | 子のホーム画面 (同上) |
| `src/pages/AlbumPage.jsx` | アルバム (写真タブ/声タブ, カレンダービュー, ライトボックス) |
| `src/pages/AdminPage.jsx` | 管理画面 (ペア発行, ダッシュボード, pair link直接遷移) |
| `src/pages/RoleSelectPage.jsx` | 親/子の役割選択 |
| `src/pages/LandingPage.jsx` | 初回訪問ランディング |
| `src/pages/DemoPage.jsx` | デモ体験 (DemoModal CTA付き) |
| `src/pages/InvitePage.jsx` | 招待リンク共有 (lang='ja'固定 **既知バグ: lang prop未接続**) |
| `src/pages/WelcomePage.jsx` | DEMO CTA経由 自動pair発行・LINE共有 (Phase X-2.5-fix) |

### フロントエンド (コンポーネント)
| ファイル | 役割 |
|---------|------|
| `src/components/PairWorld.jsx` | pairId解決コンテキストラッパー (slug→pairId, localStorage slug保存) |
| `src/components/DailyPromptCard.jsx` | 今日の話題pill (AI話題 + 別の話題ボタン) |
| `src/components/VoiceLibrary.jsx` | 声の履歴一覧 (アルバム声タブ用) |
| `src/components/AlbumCalendar.jsx` | アルバムカレンダービュー |
| `src/components/FamilyInsightCard.jsx` | 家族インサイトカード (OpenAI GPT-4o-mini) |
| `src/components/OneYearAgoBanner.jsx` | 1年前の思い出バナー |
| `src/components/DemoModal.jsx` | DEMO write操作時のCTAモーダル (録音・写真送信時) |
| `src/components/UploadErrorModal.jsx` | アップロードエラー再試行モーダル |
| `src/components/PwaInstallBanner.jsx` | Android PWAインストールバナー |
| `src/components/WeeklySummary.jsx` | 週次サマリー (日曜のみ) |
| `src/components/LanguageSwitch.jsx` | 言語切り替えUI |
| `src/components/RoleBadge.jsx` | 親/子ロールバッジ |
| `src/components/AdminAuth.jsx` | **dead code**: /api/admin/verify (_disabled) への依存。どこからもimport未使用 |

### フロントエンド (lib)
| ファイル | 役割 |
|---------|------|
| `src/lib/pairDaily.js` | getUserRole, markSeen, uploadAudio, fetchAudio 等 |
| `src/lib/journal.js` | 写真アップロード, fetchTodayJournalMeta, fetchAlbum |
| `src/lib/firebase.js` | Firebase初期化, getIdTokenForApi (匿名認証) |
| `src/lib/i18n.js` | 日英翻訳 |
| `src/lib/invite.js` | copyInviteLink, buildInviteUrl |
| `src/lib/pairSlug.js` | slug ↔ pairId 解決ヘルパー |
| `src/lib/dateFormat.js` | NY時間ベース日付フォーマット |
| `src/lib/voiceRole.js` | 音声ロール判定 |
| `src/lib/uiCopy.js` | UIコピー文字列 (i18n補助) |
| `src/lib/tysonThemes.js` | テーマカラー定義 |
| `src/lib/indexedDB.js` | IndexedDB キャッシュ |
| `src/lib/fcm.js` | Firebase Cloud Messaging |
| `src/lib/useAudioLevel.js` | 録音レベルメーター hook |
| `src/lib/deployHealthCheck.js` | デプロイ正常性チェック |
| `src/index.css` | グローバルCSS (.page, .bottom-nav 等) |

### API (Vercel Serverless)
| ファイル | 役割 |
|---------|------|
| `api/pair-media.js` | 音声 GET/POST/PATCH(markSeen) + voice-history。**既知バグ: POST に `pairId='demo'` fallback残存** |
| `api/journal.js` | 写真 GET(今日→最新日フォールバック)/POST。**既知バグ: POST に `pairId='demo'` fallback残存** |
| `api/album.js` | アルバム全日写真取得 |
| `api/invite.js` | ペア発行(create-numbered / create-welcome), スラグ解決(resolve) |
| `api/streak.js` | 連続記録ストリーク。**既知バグ: POST に PAIR-DEMOTEST 書き込みブロックなし** |
| `api/daily-theme.js` | AI話題生成。**既知バグ[Critical]: verifyIdToken なし、認証なしで全ペアデータアクセス可能** |
| `api/family-insight.js` | 7日間アクティビティ→OpenAI GPT-4o-mini インサイト生成 (GET)。**既知バグ: UTC日付使用、pairId未指定で200返す** |
| `api/journal-analysis.js` | journal_image写真をOpenAI Vision APIでOCR+AI解析 (POST, 管理者専用) |
| `api/admin-reset.js` | 管理リセット。**既知バグ: `pairId='demo'` fallback残存** |
| `api/admin-restore.js` | 管理復元。**既知バグ: `pairId='demo'` fallback残存** |
| `api/admin-pairs.js` | ペアダッシュボード |
| `api/lib/pair-access.js` | isPairAllowed(), isTysonOnlyBlocked()。**既知バグ: TYSON_ZH90_ALLOWED_UIDS に本番UID残存** |
| `api/lib/parseFirebaseServiceAccount.js` | 環境変数からFirebase service account解析 |

### 設定
| ファイル | 役割 |
|---------|------|
| `vercel.json` | リダイレクト (/pair/:number), リライト, キャッシュヘッダー |
| `firebase.json` | Firestore/Storage ルール参照 |
| `firestore.rules` | Firestore セキュリティルール (auth必須) |
| `storage.rules` | Storage セキュリティルール (auth必須) |
| `index.html` | エントリポイント, PWA manifest, OGP, Nunito読み込み |
| `vite.config.js` | Vite設定 |

## Firestore 構造
```
pair_numbers/{slug}        → { pairId, memo, createdAt }
pairs/{PAIR-XXXXXX}        → { pairId, number(slug), memo, createdAt }
pairs/{PAIR-XXXXXX}/meta/streak → { currentStreak, lastStreakDate, ... }
pair_media/{pairId}/days/{dateKey}  → { parent: { audioPath[], latestAudioPath, seenAt, ... }, child: {...} }
journal/{pairId}/months/{YYYY-MM}/days/{YYYY-MM-DD} → { roleData: { parent: { generic_images: [...] }, child: {...} } }
```

## Storage 構造
```
pair-media/{pairId}/{dateKey}/{role}/recording_{HHMM}.{ext}
journal/{pairId}/{YYYY-MM}/{YYYY-MM-DD}/{role}/generic_image/photo-0{N}.{ext}
```

## 重要な制約
- **TYSON-ZH90**: テスト用ペア。データ・コードともに絶対に触らない
- **PAIR-DEMOTEST**: デモ用。READ_ONLY_PAIR_IDS で書き込みブロック（ただし **streak.js POST は未対応** — 既知バグ）
- **日付**: 全てNY時間 (America/New_York) の YYYY-MM-DD
- **音声**: 同じ日に複数回録音可能 (recording_{HHMM}.ext)
- **写真**: 1日3枚まで (generic_images配列)
- **認証**: Firebase Anonymous Auth。API は Admin SDK の verifyIdToken で検証（**daily-theme.js は未実装** — 既知バグ）
- **pairId fallback禁止**: `pairId='demo'` fallback は Core Philosophy #2 違反。**pair-media.js POST / journal.js POST / admin-reset.js / admin-restore.js の4箇所に残存** — 既知バグ
- **pair-media.js の merge:true**: parent/child が同一 dateKey doc を共有するため一部で意図的に使用。QA チェックの例外として承認済み
- **audioPath[] 必須バリデーション**: Phase X-3-A で実装済み。POST 時に metadata 検証あり

## 開発コマンド
```bash
npm run dev          # Vite開発サーバー
npm run build        # 本番ビルド
firebase deploy --only firestore:rules,storage  # ルールデプロイ
```

## Routine QA
推測禁止。全てコードを読んでから報告。

### 1. セキュリティ & データ漏洩
- firestore.rules を読む
- TYSON-ZH90 が外部からアクセスできる経路がないか確認
- PAIR-DEMOTEST への書き込みが全APIでブロックされてるか確認（**streak.js POST は未対応の既知バグ**）
- pairId 未指定時にフォールバックしてないか確認（**4 API に `|| 'demo'` 残存の既知バグ**）
- pairId='demo' でAPIを叩いたとき PAIR-DEMOTEST のデータが返らないか確認
- **daily-theme.js は verifyIdToken なし（既知バグ）。新規 API 追加時は必ず認証チェックを実装する**

### 2. データ整合性
- api/pair-media.js の set() が全て merge:true なしか確認（**一部で意図的使用あり: parent/child が同一 dateKey doc 共有のため。コメントで理由が明記されていれば OK**）
- 「送信しました」表示がFirestore書き込み確認後のみか確認
- Firebase Admin Storage が全て admin.storage().bucket(storageBucketName) か確認

### 3. Vercel関数の追加
- Vercel Pro プラン使用中のため、関数数の上限（旧12個）は撤廃済み
- 新規 serverless 関数の追加は「個数制限」ではなく「要承認」ルール（勝手に追加しない）
- 既存関数の修正は通常通り可

### 4. JP/EN
- src/pages/ 以下の全JSXファイルで日本語ハードコード文字列を検索
- grep -rn "[^\x00-\x7F]" src/pages/ | grep -v "//.*[^\x00-\x7F]" でリストアップ
- i18n対応されてない文字列を報告

### 5. UIの一貫性
- BottomNavがHomePage/AlbumPage/PairDailyPageに存在するか確認
- BrowserRouter形式（/pair/:slug/path）が全リンクで使われてるか確認（HashRouter /#/ は廃止済み）
- pairId=PAIR-DEMOTESTでデモ写真・音声のフォールバックがあるか確認（他pairIdに漏れてないか）

### 6. Firestore インデックス
- 全クエリに .orderBy() があるものをリストアップ
- 対応するインデックスがfirestore.indexes.jsonに定義されてるか確認

### 7. ボタン動作確認
- src/pages/ 全JSXファイルでonClickハンドラーがないbuttonタグを検索
  grep -n "<button" src/pages/*.jsx | grep -v "onClick"
- 録音ボタン・写真追加ボタン・招待ボタン・再生ボタンのhandlerが存在するか確認
- PAIR-DEMOTEST時のデモメッセージ表示ロジックが各ボタンにあるか確認

### 8. クロスユーザーデータ漏洩
- 全APIファイルでpairIdバリデーションを確認：
  grep -n "pairId" api/*.js | grep -v "req.query\|req.body\|return.*400\|return.*403"
- pairIdなし・不正値でAPIが200を返すケースがないか確認
- AlbumPage/VoiceLibraryでdays.length===0のフォールバックがPAIR-DEMOTEST限定か再確認

### 9. JP/EN文字列チェック
- JPモード時に英語ハードコード文字列がないか確認：
  grep -rn 'lang.*jp\|lang.*JP' src/pages/ | head -20
- 以下のキーワードが日本語ページに存在しないか確認：
  grep -rn '"Send"\|"Record"\|"Add Photo"\|"Invite"\|"Play"' src/pages/
- 日付フォーマットがNYタイムゾーン基準か確認：
  grep -rn "getDateKeyNY\|toLocaleString" src/ | head -20

### 報告形式
問題が見つかったら以下の形式で：
#### [Critical/High/Medium/Low] タイトル
- ファイル: xxx.js L123
- 問題: 何が起きてるか
- 影響: 誰が/何が影響を受けるか
- 修正案: 何をすべきか

問題がなければ「✅ クリーン」と報告。
