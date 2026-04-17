# Hum — プロジェクトガイド

## 概要
毎日1分、家族と声・写真を交換するアプリ。  
本番: https://www.humfamily.com / https://tyson-two.vercel.app

## Core Philosophy

Humの全ての判断はこの3原則から逆算される。機能追加・バグ修正・UI変更のあらゆる場面で優先される。

1. **User data never lost** — 一度録音・撮影・送信されたユーザーのデータは、いかなる理由でも失われてはならない。「送信しました」表示はFirestore書き込み確認後のみ。楽観的UI禁止。
2. **User data never crossed** — あるペアのデータが別のペアに見えてはならない。pairId fallbackは絶対禁止（nullならエラー、デモへのフォールバックも不可）。PAIR-DEMOTESTの isolation は厳守。
3. **Easy look back** — 積み重なった家族の記録（写真・音声）に、いつでも戻れる体験を最優先に設計する。過去を遡ることで今日の1分に意味が生まれる。Album、カレンダービュー、日付スクロール等の「振り返り機能」はHumの中核。

## スタック
- **フロントエンド**: Vite + React (HashRouter), インラインCSS中心
- **バックエンド**: Vercel Serverless Functions (`api/` ディレクトリ)
- **データ**: Firebase Firestore + Firebase Storage
- **認証**: Firebase Anonymous Auth
- **デプロイ**: Vercel Pro（mainブランチ push で自動デプロイ）
- **フォント**: Nunito (Google Fonts, 700/800)

## ルーティング (HashRouter)
| パス | コンポーネント | 説明 |
|------|-------------|------|
| `/#/` | RootOrLanding → RootRoute | pairId有→ホーム, 無→ランディング |
| `/#/?number=X` | NumberResolver → RootRoute | /pair/X 経由のスラグ解決 |
| `/#/album` | AlbumPage | 写真・声アルバム |
| `/#/admin` | AdminPage | 管理画面 |
| `/#/demo` | DemoPage | デモ |
| `/#/landing` | LandingPage | ランディングページ |

## ペアの仕組み
- 公開URL: `humfamily.com/pair/{6文字スラグ}` (例: /pair/ulf1q6)
- Vercel redirect → `/api/invite?action=resolve&number=slug`
- Firestore: `pair_numbers/{slug}` → `pairId` (例: PAIR-H58HTP)
- 内部ID `PAIR-XXXXXX` は URL に露出しない

## 主要ファイル

### フロントエンド
| ファイル | 役割 |
|---------|------|
| `src/App.jsx` | ルーティング, NumberResolver, RootRoute (role振り分け) |
| `src/pages/HomePage.jsx` | 親のホーム画面 (緑/ピンク/紫の3カード) |
| `src/pages/PairDailyPage.jsx` | 子のホーム画面 (同上) |
| `src/pages/AlbumPage.jsx` | アルバム (写真タブ/声タブ, ライトボックス) |
| `src/pages/AdminPage.jsx` | 管理画面 (ペア発行, ダッシュボード) |
| `src/pages/RoleSelectPage.jsx` | 親/子の役割選択 |
| `src/pages/LandingPage.jsx` | 初回訪問ランディング |
| `src/pages/DemoPage.jsx` | デモ体験 |
| `src/components/DailyPromptCard.jsx` | 今日の話題pill (AI話題 + 別の話題ボタン) |
| `src/components/VoiceLibrary.jsx` | 声の履歴一覧 (アルバム声タブ用) |
| `src/components/PwaInstallBanner.jsx` | Android PWAインストールバナー |
| `src/components/WeeklySummary.jsx` | 週次サマリー (日曜のみ) |
| `src/lib/pairDaily.js` | getPairId, getUserRole, markSeen, uploadAudio, fetchAudio 等 |
| `src/lib/journal.js` | 写真アップロード, fetchTodayJournalMeta, fetchAlbum |
| `src/lib/firebase.js` | Firebase初期化, getIdTokenForApi (匿名認証) |
| `src/lib/i18n.js` | 日英翻訳 |
| `src/index.css` | グローバルCSS (.page, .bottom-nav 等) |

### API (Vercel Serverless)
| ファイル | 役割 |
|---------|------|
| `api/pair-media.js` | 音声 GET/POST/PATCH(markSeen) + voice-history |
| `api/journal.js` | 写真 GET(今日→最新日フォールバック)/POST |
| `api/album.js` | アルバム全日写真取得 |
| `api/invite.js` | ペア発行(create-numbered), スラグ解決(resolve) |
| `api/streak.js` | 連続記録ストリーク |
| `api/daily-theme.js` | AI話題生成 |
| `api/admin-reset.js` | 管理リセット |
| `api/admin-restore.js` | 管理復元 |
| `api/admin-pairs.js` | ペアダッシュボード |

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
- **PAIR-DEMOTEST**: デモ用。READ_ONLY_PAIR_IDS で書き込みブロック
- **日付**: 全てNY時間 (America/New_York) の YYYY-MM-DD
- **音声**: 同じ日に複数回録音可能 (recording_{HHMM}.ext)
- **写真**: 1日3枚まで (generic_images配列)
- **認証**: Firebase Anonymous Auth。API は Admin SDK の verifyIdToken で検証

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
- HashRouter形式（/#/path）が全リンクで使われてるか確認
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
