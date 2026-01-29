# Vercelデプロイ手順

## 1. 事前準備

### GitHubリポジトリにプッシュ

```bash
git add .
git commit -m "Ready for Vercel deployment"
git push origin main
```

## 2. Vercelでのプロジェクト作成

1. [Vercel](https://vercel.com)にログイン
2. **Add New Project** をクリック
3. GitHubリポジトリを選択
4. プロジェクト設定：
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (デフォルト)
   - **Build Command**: `npm run build` (自動検出されるはず)
   - **Output Directory**: `dist` (自動検出されるはず)

## 3. 環境変数の設定

**Settings** → **Environment Variables** で以下を設定：

### Firebase設定（VITE_プレフィックス必須）

```
VITE_FIREBASE_API_KEY=AIzaSyA_mvrNg6-DdoJN3H3iO8bTzLTZbqzUx0s
VITE_FIREBASE_AUTH_DOMAIN=nacho-city.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=nacho-city
VITE_FIREBASE_STORAGE_BUCKET=nacho-city.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1046182304435
VITE_FIREBASE_APP_ID=1:1046182304435:web:9776ea8772986e0c25eec6
VITE_FIREBASE_MEASUREMENT_ID=G-VQQ9T4BWHK
```

### AI API設定

```
OPENAI_API_KEY=sk-your-openai-api-key-here
AI_PROVIDER=openai
```

（オプション）Geminiを使用する場合：

```
GEMINI_API_KEY=your-gemini-api-key-here
AI_PROVIDER=gemini
```

**重要**: すべての環境（Production, Preview, Development）に同じ値を設定してください。

## 4. デプロイ実行

1. **Deploy** ボタンをクリック
2. デプロイが完了するまで待機（通常1-3分）
3. デプロイ完了後、URLが発行されます

## 5. 動作確認

### フロントエンドの確認

1. 発行されたURLにアクセス
2. 録音ボタンが表示されることを確認
3. 連続日数が表示されることを確認

### APIの確認

1. ブラウザの開発者ツールを開く
2. **Network** タブを確認
3. 録音を完了すると `/api/analyze` へのリクエストが送信されることを確認
4. エラーがないことを確認

### Firebase権限の確認

Firebase Consoleで以下を確認：

1. **Storage** → **Rules**:
   ```javascript
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /shugyo/{allPaths=**} {
         allow read, write: if true; // 本番環境では適切な認証ルールを設定
       }
     }
   }
   ```

2. **Firestore** → **Rules**:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /shugyo/{document=**} {
         allow read, write: if true; // 本番環境では適切な認証ルールを設定
       }
     }
   }
   ```

## 6. トラブルシューティング

### デプロイが失敗する場合

1. **Deployments** タブでエラーログを確認
2. 環境変数が正しく設定されているか確認
3. `vercel.json` の設定を確認

### APIが動かない場合

1. **Deployments** → デプロイを選択 → **Functions** タブ
2. `/api/analyze` のログを確認
3. 環境変数（特に `OPENAI_API_KEY`）が設定されているか確認
4. VercelのFunction Logsでエラーを確認

### Firebaseの権限エラーが出る場合

1. Firebase ConsoleでStorageとFirestoreのルールを確認
2. CORS設定を確認
3. 環境変数のFirebase設定が正しいか確認

### 環境変数が反映されない場合

1. 環境変数を設定した後、**新しいデプロイを実行**する必要があります
2. 既存のデプロイには環境変数の変更は反映されません

## 7. デプロイ後の確認事項

- [ ] フロントエンドが正常に表示される
- [ ] 録音機能が動作する
- [ ] Firebase Storageへのアップロードが成功する
- [ ] Firestoreへの保存が成功する
- [ ] AI分析が実行される
- [ ] 管理画面（/admin）が表示される
- [ ] 7日目ペイウォールが表示される（streakCountが7の倍数の時）

## 8. 本番環境のセキュリティ

デプロイ後、以下のセキュリティ設定を推奨：

1. FirebaseのStorageとFirestoreのルールを適切に設定
2. 環境変数はVercelの管理画面でのみ管理
3. APIキーをGitにコミットしない（`.gitignore`で除外済み）

## 9. おかんへの招待状

デプロイが完了し、すべての機能が正常に動作することを確認したら：

1. 発行されたURLをメモ
2. おかんに「修行の招待状」としてURLを送信
3. 使い方を説明

**準備完了！Weehawkenからの監査も待ってるで！** 🔥
