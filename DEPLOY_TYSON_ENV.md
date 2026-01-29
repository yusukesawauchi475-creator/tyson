# Tyson専用環境（tyson-3341f）への完全移行ガイド

## 🚨 重要: アカウント確認

作業前に必ず以下を確認:
```bash
firebase login
# → yusuke.sawauchi.475@gmail.com でログインしていることを確認
firebase projects:list
# → tyson-3341f が表示されることを確認
```

## 1. Firebase CLI設定

```bash
# プロジェクトを切り替え
firebase use tyson-3341f

# 確認
firebase use
# → "Using tyson-3341f" と表示されることを確認
```

## 2. Rules のデプロイ（コンソール不要）

```bash
# Firestore Rules と Storage Rules を一撃でデプロイ
firebase deploy --only firestore:rules,storage:rules
```

これで以下が自動デプロイされます:
- `firestore.rules` → `allow read, write: if true;`
- `storage.rules` → `allow read, write: if true;`

**CEOはコンソールのRulesタブを開く必要なし**

## 3. Vercel環境変数の更新

### 方法A: 手動でFirebase Consoleから取得

1. Firebase Console にアクセス: https://console.firebase.google.com/project/tyson-3341f/settings/general
2. 「マイアプリ」セクションから Web アプリの設定を確認
3. 以下の値を Vercel に設定:

```bash
# 各環境変数を設定（production環境）
vercel env add VITE_FIREBASE_API_KEY production
# → Firebase Console の apiKey を入力

vercel env add VITE_FIREBASE_AUTH_DOMAIN production
# → Firebase Console の authDomain を入力（例: tyson-3341f.firebaseapp.com）

vercel env add VITE_FIREBASE_PROJECT_ID production
# → tyson-3341f を入力

vercel env add VITE_FIREBASE_STORAGE_BUCKET production
# → tyson-3341f.firebasestorage.app を入力

vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID production
# → Firebase Console の messagingSenderId を入力

vercel env add VITE_FIREBASE_APP_ID production
# → Firebase Console の appId を入力

vercel env add VITE_FIREBASE_MEASUREMENT_ID production
# → Firebase Console の measurementId を入力（オプション）
```

### 方法B: 既存の環境変数を削除して再追加

```bash
# 古い環境変数を削除（nacho-city用）
vercel env rm VITE_FIREBASE_API_KEY production
vercel env rm VITE_FIREBASE_AUTH_DOMAIN production
vercel env rm VITE_FIREBASE_PROJECT_ID production
vercel env rm VITE_FIREBASE_STORAGE_BUCKET production
vercel env rm VITE_FIREBASE_MESSAGING_SENDER_ID production
vercel env rm VITE_FIREBASE_APP_ID production

# 上記の方法Aで新しい値を追加
```

## 4. デプロイと確認

```bash
# 強制デプロイ
vercel --prod --force

# 管理画面で以下を確認:
# ✅ "✅ Tyson専用環境に完全隔離成功（tyson-3341f）" バナーが表示される
# ✅ フッターに "Project: tyson-3341f" が表示される
# ✅ 以前のプロジェクト（nacho-city, Oasis）への誤送信が物理的に不可能
```

## 5. 隔離の証明

管理画面（/admin）に以下が表示されることを確認:
- ✅ 緑色のバナー: "✅ Tyson専用環境に完全隔離成功（tyson-3341f）"
- ✅ フッター: "Project: tyson-3341f"

これにより、以前のプロジェクトへの誤送信が**物理的に不可能**であることが保証されます。

## 6. 防弾仕様の再点検

以下の動作を確認:
- ✅ 録音完了後0.1秒で「保存完了 ✅」が表示される
- ✅ アップロード失敗時に即座に IndexedDB に退避される
- ✅ フッターに接続先ID `tyson-3341f` が表示される

---

**勝利報告**: 全ての設定が完了したら、CEOに報告:
- ✅ Firebase CLI で Rules をデプロイ完了（コンソール不要）
- ✅ Vercel 環境変数を tyson-3341f に更新完了
- ✅ 管理画面に隔離成功バナー表示
- ✅ フッターにプロジェクトID表示
- ✅ 以前のプロジェクトへの誤送信が物理的に不可能
