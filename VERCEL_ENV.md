# Vercel環境変数設定ガイド

このドキュメントは、Vercelにデプロイする際に必要な環境変数の設定方法を説明します。

## Vercelダッシュボードでの設定手順

1. Vercelダッシュボードにログイン
2. プロジェクトを選択（または新規作成）
3. **Settings** → **Environment Variables** に移動
4. 以下の環境変数を追加

## 必要な環境変数一覧

### Firebase設定（VITE_プレフィックス付き）

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `VITE_FIREBASE_API_KEY` | Firebase API Key | `AIzaSyA_mvrNg6-DdoJN3H3iO8bTzLTZbqzUx0s` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `nacho-city.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | `nacho-city` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket | `nacho-city.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID | `1046182304435` |
| `VITE_FIREBASE_APP_ID` | Firebase App ID | `1:1046182304435:web:9776ea8772986e0c25eec6` |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase Measurement ID（オプション） | `G-VQQ9T4BWHK` |

### AI API設定

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `OPENAI_API_KEY` | OpenAI API Key（必須） | `sk-...` |
| `GEMINI_API_KEY` | Google Gemini API Key（オプション） | `...` |
| `AI_PROVIDER` | 使用するAIプロバイダー | `openai` または `gemini` |

## 環境ごとの設定

Vercelでは、以下の環境ごとに環境変数を設定できます：

- **Production**（本番環境）
- **Preview**（プレビュー環境）
- **Development**（開発環境）

すべての環境で同じ値を設定することを推奨します。

## 設定後の確認

環境変数を設定したら：

1. **Deployments** タブで新しいデプロイを実行
2. デプロイが完了したら、`/api/analyze` エンドポイントが正常に動作するか確認
3. ブラウザのコンソールでエラーがないか確認

## トラブルシューティング

### Firebaseの権限エラーが出る場合

1. Firebase Consoleで、StorageとFirestoreのルールを確認
2. 認証が必要な場合は、認証設定を確認
3. CORS設定を確認

### APIが動かない場合

1. VercelのFunction Logsを確認（**Deployments** → デプロイを選択 → **Functions** タブ）
2. 環境変数が正しく設定されているか確認
3. APIキーが有効か確認

## セキュリティ注意事項

- 環境変数は**絶対に**Gitにコミットしないでください
- `.env.local`ファイルは`.gitignore`に含まれています
- 本番環境のAPIキーは厳重に管理してください
