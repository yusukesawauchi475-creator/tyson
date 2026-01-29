# Firebase Rules デプロイ - 最終手順

## ✅ 現在の状態
全てのファイルは既に作成・設定済み:
- ✅ `firestore.rules` - 作成済み（allow read, write: if true;）
- ✅ `storage.rules` - 作成済み（allow read, write: if true;）
- ✅ `firebase.json` - 正しく設定済み
- ✅ `.firebaserc` - `tyson-3341f` に設定済み

## 🚀 デプロイ実行コマンド

### 前提条件
1. Firebase Consoleで `tyson-3341f` プロジェクトの以下APIが有効化されていること:
   - Firestore API
   - Firebase Storage API

### デプロイ手順

```bash
# 1. Firebase CLI にログイン（yusuke.sawauchi.475@gmail.com）
npx firebase-tools login

# 2. プロジェクトを確認
npx firebase-tools use tyson-3341f

# 3. Firestore Rules をデプロイ
npx firebase-tools deploy --only firestore:rules

# 4. Storage Rules をデプロイ（Firestoreが成功した後）
npx firebase-tools deploy --only storage:rules
```

### エラーが発生した場合

#### エラー: "missing required API"
→ Firebase Console (https://console.firebase.google.com/project/tyson-3341f/settings/api) で以下を有効化:
- Cloud Firestore API
- Firebase Storage API

#### エラー: "Could not find rules"
→ ルールファイルは既に存在しています。以下を確認:
```bash
ls -la firestore.rules storage.rules
```

#### エラー: "権限がありません"
→ 正しいアカウントでログインしているか確認:
```bash
npx firebase-tools login --reauth
# → yusuke.sawauchi.475@gmail.com を選択
```

## ✅ デプロイ成功の確認

デプロイが成功すると、管理画面（/admin）に以下が表示されます:
- ✅ "✅ デプロイ完了。聖域構築成功（tyson-3341f）"

Firebase Consoleでも確認可能:
- Firestore: https://console.firebase.google.com/project/tyson-3341f/firestore/rules
- Storage: https://console.firebase.google.com/project/tyson-3341f/storage/rules
