# Firebase Rules デプロイ手順

## 現在の状態
✅ ルールファイルは既に作成済み:
- `firestore.rules` - `allow read, write: if true;`
- `storage.rules` - `allow read, write: if true;`
- `firebase.json` - 正しく設定済み
- `.firebaserc` - `tyson-3341f` に設定済み

## デプロイ実行コマンド

### 1. Firebase CLI のログイン確認
```bash
npx firebase-tools login
# → yusuke.sawauchi.475@gmail.com でログインしていることを確認
```

### 2. プロジェクトの確認
```bash
npx firebase-tools use tyson-3341f
```

### 3. Rules のデプロイ
```bash
npx firebase-tools deploy --only firestore:rules,storage:rules
```

### 4. デプロイ確認
デプロイが成功すると、以下のメッセージが表示されます:
```
✔  Deploy complete!
```

## トラブルシューティング

### エラー: "ルールファイルが見当たらない"
→ ルールファイルは既に存在しています。`firebase.json` のパスが正しいか確認してください。

### エラー: "権限がありません"
→ `yusuke.sawauchi.475@gmail.com` でログインしているか確認:
```bash
npx firebase-tools login --reauth
```

### エラー: "プロジェクトが見つかりません"
→ `.firebaserc` を確認:
```bash
cat .firebaserc
# → {"projects": {"default": "tyson-3341f"}} と表示されることを確認
```

## デプロイ後の確認
管理画面（/admin）に以下が表示されることを確認:
- ✅ "✅ デプロイ完了。聖域構築成功（tyson-3341f）"
