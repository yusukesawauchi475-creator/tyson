# Vercelデプロイ前チェックリスト

## ✅ 準備完了チェック

### 1. コードの準備
- [x] `api/analyze.js` が作成されている
- [x] `vercel.json` が設定されている
- [x] Firebase設定が環境変数化されている
- [x] `.gitignore` に `.env.local` が含まれている

### 2. 環境変数の準備

Vercelダッシュボードで以下の環境変数を設定：

#### Firebase設定（必須・VITE_プレフィックス付き）
- [ ] `VITE_FIREBASE_API_KEY`
- [ ] `VITE_FIREBASE_AUTH_DOMAIN`
- [ ] `VITE_FIREBASE_PROJECT_ID`
- [ ] `VITE_FIREBASE_STORAGE_BUCKET`
- [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `VITE_FIREBASE_APP_ID`
- [ ] `VITE_FIREBASE_MEASUREMENT_ID` (オプション)

#### AI API設定（必須）
- [ ] `OPENAI_API_KEY`
- [ ] `AI_PROVIDER` (デフォルト: `openai`)

#### オプション（Geminiを使用する場合）
- [ ] `GEMINI_API_KEY`
- [ ] `AI_PROVIDER` を `gemini` に設定

### 3. Firebase設定の確認

#### Storage Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /shugyo/{allPaths=**} {
      allow read, write: if true; // 本番では適切な認証ルールを設定
    }
  }
}
```

#### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /shugyo/{document=**} {
      allow read, write: if true; // 本番では適切な認証ルールを設定
    }
  }
}
```

### 4. デプロイ手順

1. [ ] GitHubリポジトリにプッシュ済み
2. [ ] Vercelでプロジェクトを作成
3. [ ] 環境変数をすべて設定
4. [ ] デプロイを実行
5. [ ] デプロイが成功することを確認

### 5. デプロイ後の動作確認

- [ ] フロントエンドが正常に表示される
- [ ] 録音ボタンが表示される
- [ ] 録音機能が動作する
- [ ] Firebase Storageへのアップロードが成功する
- [ ] Firestoreへの保存が成功する
- [ ] `/api/analyze` エンドポイントが動作する
- [ ] AI分析が実行される
- [ ] 管理画面（/admin）が表示される
- [ ] 7日目ペイウォールが表示される（streakCountが7の倍数の時）

### 6. トラブルシューティング

問題が発生した場合：

1. **デプロイが失敗する**
   - VercelのDeploymentsタブでエラーログを確認
   - 環境変数が正しく設定されているか確認

2. **APIが動かない**
   - Functionsタブでログを確認
   - 環境変数（特に `OPENAI_API_KEY`）が設定されているか確認

3. **Firebaseの権限エラー**
   - Firebase ConsoleでStorageとFirestoreのルールを確認
   - CORS設定を確認

4. **環境変数が反映されない**
   - 環境変数を設定した後、**新しいデプロイを実行**する必要があります

## 🚀 デプロイ完了後

デプロイが成功し、すべての機能が正常に動作することを確認したら：

1. 発行されたURLをメモ
2. おかんに「修行の招待状」としてURLを送信
3. 使い方を説明

**準備完了！Weehawkenからの監査も待ってるで！** 🔥
