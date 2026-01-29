# Vercelデプロイ前監査 - 修正内容

## 修正箇所と理由

### 1. ✅ 環境変数の参照漏れを修正

**問題**: `api/analyze.js`で`process.env.VITE_FIREBASE_API_KEY`を使用していたが、VercelのServerless Functionsでは`VITE_`プレフィックス付きの環境変数はクライアント側（Viteビルド時）でのみ利用可能。サーバー側では`process.env`で直接アクセスできない。

**修正**: 
- `api/analyze.js`からFirebase設定のインポートと初期化を削除
- Firebase Storageから直接URLでダウンロードするため、Firebase SDKは不要
- 環境変数は`OPENAI_API_KEY`、`GEMINI_API_KEY`、`AI_PROVIDER`のみ使用

**理由**: Serverless FunctionsではFirebase Storageの公開URLから直接`fetch`でダウンロードできるため、Firebase SDKは不要。これにより環境変数の問題も解決。

### 2. ✅ vercel.jsonの設定を簡素化

**問題**: 
- `rewrites`設定が不要（Vercelは自動的に`/api`フォルダをServerless Functionsとして認識）
- `headers`設定は冗長（CORSは関数内で処理）

**修正**: 
- `rewrites`と`headers`を削除
- 最小限の設定のみ残す

**理由**: Vercelは`/api`フォルダを自動認識するため、明示的なルーティング設定は不要。CORSは関数内で処理するため、`vercel.json`での設定は冗長。

### 3. ✅ 不要な依存関係を削除

**問題**: 
- `api/analyze.js`で`initializeApp`と`getStorage`をインポートしていたが使用していない
- Firebase SDKのインポートが不要

**修正**: 
- Firebase関連のインポートをすべて削除
- Firebase Storageから直接URLでダウンロードする実装に統一

**理由**: Serverless FunctionsではFirebase Storageの公開URLから直接`fetch`でダウンロードできるため、Firebase SDKは不要。これによりバンドルサイズも削減。

## 修正後の動作確認

修正後、以下の動作を確認してください：

1. ✅ 環境変数は`OPENAI_API_KEY`、`GEMINI_API_KEY`、`AI_PROVIDER`のみ必要
2. ✅ Firebase設定はクライアント側（`src/lib/firebase.js`）のみで使用
3. ✅ Serverless FunctionsはFirebase Storageの公開URLから直接ダウンロード
4. ✅ `vercel.json`は最小限の設定のみ

## 環境変数の設定（再確認）

Vercelで設定する環境変数：

### クライアント側（VITE_プレフィックス必須）
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (オプション)

### サーバー側（VITE_プレフィックス不要）
- `OPENAI_API_KEY` (必須)
- `GEMINI_API_KEY` (オプション)
- `AI_PROVIDER` (デフォルト: `openai`)

**重要**: クライアント側とサーバー側で環境変数の命名規則が異なることに注意。
