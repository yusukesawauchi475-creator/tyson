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
| `/` | RootOrLanding → RootRoute | pairId有→ホーム, 無→ランディング |
| `/admin` | AdminPage | 管理画面 |
| `/demo` | DemoPage | デモ |
| `/landing` | LandingPage | ランディングページ |
| `/welcome` | WelcomePage | 新規ペア自動発行 + LINE share |
| `/pair/:slug` | PairWorld → RootRoute | pair コンテキスト確立 (URL = Source of Truth) |
| `/pair/:slug/album` | AlbumPage | 写真・声アルバム |
| `/pair/:slug/invite` | InvitePage | 招待リンク表示 (lang ja固定・Phase 3で対応予定) |

注: `localStorage['hum_last_slug']` は公理1例外として承認済みのキャッシュ（リダイレクト用）。真実のソースはURL path。

## ペアの仕組み
- 公開URL: `humfamily.com/pair/{6文字スラグ}` (例: /pair/ulf1q6)
- Vercel redirect → `/api/invite?action=resolve&number=slug`
- Firestore: `pair_numbers/{slug}` → `pairId` (例: PAIR-H58HTP)
- 内部ID `PAIR-XXXXXX` は URL に露出しない

## 主要ファイル

### フロントエンド
| ファイル | 役割 |
|---------|------|
| `src/App.jsx` | BrowserRouter ルーティング, RootOrLanding, RootRoute (role振り分け) |
| `src/pages/HomePage.jsx` | 親のホーム画面 (緑/ピンク/紫の3カード) |
| `src/pages/PairDailyPage.jsx` | 子のホーム画面 (同上) |
| `src/pages/AlbumPage.jsx` | アルバム (写真タブ/声タブ, ライトボックス, AlbumCalendar) |
| `src/pages/AdminPage.jsx` | 管理画面 (ペア発行, ダッシュボード, 未活動section) |
| `src/pages/RoleSelectPage.jsx` | 親/子の役割選択 |
| `src/pages/LandingPage.jsx` | 初回訪問ランディング |
| `src/pages/DemoPage.jsx` | デモ体験 |
| `src/pages/WelcomePage.jsx` | 新規ペア自動発行 + LINE share (Phase X-2.5-fix) |
| `src/pages/InvitePage.jsx` | 招待リンク表示ページ (lang ja固定・Phase 3予定) |
| `src/components/DailyPromptCard.jsx` | 今日の話題pill (AI話題 + 別の話題ボタン) |
| `src/components/VoiceLibrary.jsx` | 声の履歴一覧 (アルバム声タブ用) |
| `src/components/PwaInstallBanner.jsx` | Android PWAインストールバナー |
| `src/components/WeeklySummary.jsx` | 週次サマリー (日曜のみ) |
| `src/components/PairWorld.jsx` | /pair/:slug のコンテキスト確立 (pairId → Outlet) |
| `src/components/DemoModal.jsx` | PAIR-DEMOTEST 書き込みブロック + CTA モーダル |
| `src/components/AlbumCalendar.jsx` | アルバムのカレンダービュー |
| `src/components/FamilyInsightCard.jsx` | 家族インサイトカード (api/family-insight 利用) |
| `src/components/OneYearAgoBanner.jsx` | 1年前の記録バナー |
| `src/components/UploadErrorModal.jsx` | アップロードエラーモーダル |
| `src/components/InviteModal.jsx` | 招待share統一UI (LINE + clipboard、Phase II-share、日本語ハードコード既知問題) |
| `src/components/LanguageSwitch.jsx` | 言語切替 UI |
| `src/components/RoleBadge.jsx` | 役割バッジ表示 |
| `src/components/AdminAuth.jsx` | ⚠️ dead code: /api/admin/verify は_disabled/に移動済み、未使用 |
| `src/lib/pairDaily.js` | getPairId, getUserRole, markSeen, uploadAudio, fetchAudio 等 |
| `src/lib/journal.js` | 写真アップロード, fetchTodayJournalMeta, fetchAlbum |
| `src/lib/firebase.js` | Firebase初期化, getIdTokenForApi (匿名認証) |
| `src/lib/i18n.js` | 日英翻訳 |
| `src/lib/invite.js` | 招待URL生成, copyInviteLink |
| `src/lib/shareTargets.js` | SHARE_TARGETS 配列 (LINE等; 日本語ハードコード既知問題) |
| `src/lib/pairSlug.js` | slug生成/解決ユーティリティ |
| `src/lib/dateFormat.js` | NY時間日付フォーマット |
| `src/lib/voiceRole.js` | 音声ロール判定 |
| `src/lib/uiCopy.js` | UIコピー文字列 |
| `src/lib/tysonThemes.js` | テーマ定義 |
| `src/lib/indexedDB.js` | IndexedDB キャッシュ |
| `src/lib/fcm.js` | FCM プッシュ通知 |
| `src/lib/useAudioLevel.js` | 音声レベル検出 hook |
| `src/lib/deployHealthCheck.js` | デプロイヘルスチェック |
| `src/index.css` | グローバルCSS (.page, .bottom-nav 等) |

### API (Vercel Serverless)
| ファイル | 役割 |
|---------|------|
| `api/pair-media.js` | 音声 GET/POST/PATCH(markSeen) + voice-history (⚠️ POST L683: `\|\| 'demo'` fallback 既知問題) |
| `api/journal.js` | 写真 GET(今日→最新日フォールバック)/POST (⚠️ POST L402: `\|\| 'demo'` fallback 既知問題) |
| `api/album.js` | アルバム全日写真取得 |
| `api/invite.js` | ペア発行(create-numbered/create-welcome), スラグ解決(resolve) |
| `api/streak.js` | 連続記録ストリーク (⚠️ POST: PAIR-DEMOTEST 書き込みブロックなし 既知問題) |
| `api/daily-theme.js` | AI話題生成 (⚠️ verifyIdToken 未実装・認証なしアクセス可能 既知問題) |
| `api/family-insight.js` | 家族インサイト生成 (⚠️ UTC日付バグ・pairId空で200返却 既知問題) |
| `api/journal-analysis.js` | ジャーナル解析 (利用箇所確認要) |
| `api/admin-reset.js` | 管理リセット (⚠️ L110: `\|\| 'demo'` fallback 既知問題) |
| `api/admin-restore.js` | 管理復元 (⚠️ L109: `\|\| 'demo'` fallback 既知問題) |
| `api/admin-pairs.js` | ペアダッシュボード |
| `api/lib/pair-access.js` | TYSON-ZH90 allowlist (⚠️ 本番UID 2件ハードコード 既知問題・Phase 3 scaffolding) |
| `api/lib/parseFirebaseServiceAccount.js` | Firebase service account パース |

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
pair_media/{pairId}/days/{dateKey}  → { parent: { audioPath[], latestAudioPath, ... }, child: {...} }
journal/{pairId}/months/{YYYY-MM}/days/{YYYY-MM-DD} → { roleData: { parent: { generic_images: [...] }, child: {...} } }
```

## Storage 構造
```
pair-media/{pairId}/{dateKey}/{role}/recording_{HHMM}.{ext}
journal/{pairId}/{YYYY-MM}/{YYYY-MM-DD}/{role}/generic_image/photo-0{N}.{ext}
```

## 重要な制約
- **TYSON-ZH90**: テスト用ペア。データ・コードともに絶対に触らない
- **PAIR-DEMOTEST**: デモ用。READ_ONLY_PAIR_IDS で書き込みブロック（streak.js は未実装・既知問題）
- **日付**: 全てNY時間 (America/New_York) の YYYY-MM-DD
- **音声**: 同じ日に複数回録音可能 (recording_{HHMM}.ext)
- **写真**: 1日3枚まで (generic_images配列)
- **認証**: Firebase Anonymous Auth。API は Admin SDK の verifyIdToken で検証（daily-theme.js は未実装・既知問題）
- **pairId fallback 禁止**: `|| 'demo'` は Core Philosophy #2 違反。4 APIに残存（既知問題）
- **UID ハードコード**: api/lib/pair-access.js に本番UID 2件残存（Phase 3 scaffolding として保留）

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
- PAIR-DEMOTEST への書き込みが全APIでブロックされてるか確認
- getPairId() が null/invalid 時にフォールバックしてないか確認
- pairId='demo' でAPIを叩いたとき PAIR-DEMOTEST のデータが返らないか確認

### 2. データ整合性
- api/pair-media.js の set() が全て merge:true なしか確認
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
- BrowserRouter形式（/pair/:slug/path）が全リンクで使われてるか確認
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


## 過去 mistake と rule (毎 mistake 即追記)

このセクションは CTO + Boss + Claude Code が過去の mistake を忘れず再発防止策を毎回参照するため。
新 mistake 検出時は即追記 (Phase B で PostToolUse hook 実装後は物理強制)。
全 mistake は事実確認済み (Yusuke + Boss 直接確認、推測ゼロ)。

### Mistake 1: 段階 6 allowlist 撤廃で TYSON-ZH90 推測可能 slug 残置
- 発生: 段階 6 main merge
- 影響: 2026-04-26 朝、外部公開リスク (実害ゼロだが要修正)
- root cause: pair isolation = slug knowledge-based access に切替時、slug 自体の隠匿性 audit せず
- rule: 防御 layer の片方撤廃時、他方の強化を必須 audit step に。新 slug は generateSlug() (Crockford Base32) 経由のみ。

### Mistake 2: Phase II-pre partial 実装連鎖
- 発生: 2026-04-26 夜
- 詳細: Yusuke「Admin から各 pair link」依頼 → CTO が slug ある pair の link 化のみ実装、slug 無い pair / memo 表示を audit せず → Yusuke スクショ指摘で Phase II-pre-2 必要
- root cause: Yusuke 依頼の明示 + 暗黙 + 文脈依存要望を完全 enumerate せず、最小 scope に偏った prompt 発行
- rule: 全 prompt 発行前に variation table 作成、operator/data 系修正時は data variation 全行 audit。

### Mistake 3: Phase X-2.5「閉じる」ボタン削除 (CTA flow 切断)
- 発生: Phase X-2.5-fix で Boss 指示通り「閉じる」削除
- 詳細: acquisition flow 一本化のため削除、CTA flow 切断 + 誤タップ救済不在 = UX 違反、Yusuke 朝指摘で Phase X-2.5-fix-2 で復活
- root cause: UI 削除時に user journey 全 path で audit せず、誤タップ / 体験継続を考慮せず
- rule: UI 削除は user journey 全 path で audit、誤タップ救済は default 仕様。

### Mistake 4: DEMO format 違反 (写真追加 button 欠落)
- 発生: 2026-04-26 朝、Yusuke スクショで PAIR-DEMOTEST に「写真を送る」セクションなし発見
- root cause: isDemoTest 分岐が UI render 機能差を生み、core philosophy 軸 1 違反継続
- rule: isDemoTest 等の特殊 pair は UI 機能差ゼロ、write block + CTA モーダル trigger のみで差別化。

### Mistake 6: streak timezone 不整合 (option D 暫定)
- 発生: Phase I Bug 2 修正時、streak が NY 固定 dateKey で判定、JST upload と整合せず
- 詳細: Phase I Bug 2-fix N=2 broader で暫定対処済み (commit 6b1bafc)、Phase X-3-B で pairTimezone 本実装予定
- root cause: 段階 10-a 設計時に timezone 軸を audit せず、NY 固定で実装
- rule: dateKey 計算は pair の timezone context 必須、Phase X-3-B で pairTimezone 統合本実装。

### Mistake 8: Boss が CTO 前 prompt 見落とし二重発行リスク
- 発生: Phase X-1 main merge prompt 発行時
- 詳細: Boss が CTO 既発行 prompt を見落とし「即発行」指示 → Yusuke「c、再発行して」回答が証拠
- root cause: Boss thread と CTO thread の同期不足、prompt 履歴管理欠落
- rule: 新 prompt 発行前に Boss / CTO 間の prompt 状況確認 step、Yusuke が thread 跨ぐ際の context tracking 推奨。

### Mistake 9: 複数依頼 partial 実装 pattern (scope creep 回避偏重)
- 発生: 今夜複数の phase で繰り返し
- 詳細: Yusuke が 3 つ依頼 → CTO が 1-2 つで完了報告 → Yusuke 残り発見 → 再 prompt の悪循環
- Yusuke 観察: 「俺が 3 つ頼んでも、お前は 1 つか 2 つしかタスクができずに終わったという。俺が見つけて指摘してごめん、今やる、とまた始める。これとかいつかミスするから絶対に sustainable じゃなさすぎる」
- root cause: scope creep 回避と完全実装の trade-off で前者偏重、Yusuke 要望の完全 enumeration 不足
- rule: 1 phase で完結させる judgment 最優先、scope creep より完全実装。複数依頼受領時は variation table 作成必須。

### Mistake 10: CLAUDE.md 自身を毎回更新してなかった (運用基盤欠落)
- 発生: 2026-04-26 まで継続的に存在
- root cause: 過去 mistake を docs に永続化せず、context 依存記憶に依存 = 新 thread で同 mistake 再発
- rule: 全 mistake 検出時は CLAUDE.md に即追記、Phase B 後は PostToolUse hook で物理強制。

### Mistake 11: Boss が Phase 起草時に事実確認 / 既存 commit 状況 / 未検証技術 risk 分離 step を skip
- 発生: 2026-04-26 夜、Phase A 起草時
- 詳細: Boss が mistake 10 件のうち 4 件を memory + 推測ベースで書き、Boris Tips を未検証のまま Phase A 物理層に組み込もうとし、CTO 累計と Boss 番号のずれを確認せず Phase A 番号付けた
- root cause: Behavioral-8 (partial response) の延長、明示要望 + 暗黙要望の暗黙部分を enumerate せず、Boss 自身の partial response 病
- rule: Phase 起草時に必ず以下 3 軸 cross check:
  - 事実確認: 記載内容が本 thread / 既存 docs / Yusuke 直接確認に根拠あるか
  - 既存状態: 関連 commit / branch / 進行 phase 状況把握済みか
  - 技術 risk: 未検証技術含む場合、別 phase に分離可能か
- 観測: CTO + Boss 両者で同 pattern 発生、AI 単体運用への移行で全 AI agent (Boss / CTO / Claude Code 等) に同 self-audit step 必須化。

注: Mistake 5 (Yahoo ブラウザ) と Mistake 7 (Domain 削除提案) は本 phase scope では削除。Yusuke 後日確認で事実確定したら追加。
