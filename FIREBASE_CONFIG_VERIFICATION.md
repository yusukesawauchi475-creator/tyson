# Firebase設定の物理的照合結果

## 1. Vercel環境変数の値

### 実行コマンド:
```bash
vercel env pull .env.vercel.production --environment=production
cat .env.vercel.production | grep -E "VITE_FIREBASE"
```

### 結果:
```
VITE_FIREBASE_API_KEY="AIzaSyA_mvrNg6-DdoJN3H3iO8bTzLTZbqzUx0s"
VITE_FIREBASE_APP_ID="1:1046182304435:web:9776ea8772986e0c25eec6"
VITE_FIREBASE_AUTH_DOMAIN="tyson-3341f.firebaseapp.com"
VITE_FIREBASE_MEASUREMENT_ID="G-VQQ9T4BWHK"
VITE_FIREBASE_MESSAGING_SENDER_ID="1046182304435"
VITE_FIREBASE_PROJECT_ID="tyson-3341f"
VITE_FIREBASE_STORAGE_BUCKET="tyson-3341f.firebasestorage.app"
```

## 2. Firebase Consoleでの確認手順

1. https://console.firebase.google.com/project/tyson-3341f/settings/general にアクセス
2. 「マイアプリ」セクションでWebアプリの設定を確認
3. 以下の値がVercel環境変数と1文字の狂いもなく一致していることを確認:
   - apiKey: `AIzaSyA_mvrNg6-DdoJN3H3iO8bTzLTZbqzUx0s`
   - authDomain: `tyson-3341f.firebaseapp.com`
   - projectId: `tyson-3341f`
   - storageBucket: `tyson-3341f.firebasestorage.app`
   - messagingSenderId: `1046182304435`
   - appId: `1:1046182304435:web:9776ea8772986e0c25eec6`
   - measurementId: `G-VQQ9T4BWHK`

## 3. CORS設定

### 実行コマンド:
```bash
./setup-storage-cors.sh
```

### CORS設定内容:
```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "responseHeader": ["Content-Type", "Authorization"],
    "maxAgeSeconds": 3600
  }
]
```

### 手動設定手順（gsutilがない場合）:
1. Google Cloud Console (https://console.cloud.google.com/storage/browser/tyson-3341f.firebasestorage.app?project=tyson-3341f) にアクセス
2. バケットを選択
3. 「設定」タブ → 「CORS設定」を開く
4. 上記のJSONを貼り付け

## 4. タイムアウト設定の変更

### 変更内容:
- Storageアップロード: 30秒
- Firestore書き込み: 30秒
- IndexedDB同期: 30秒

### 変更箇所:
- `src/pages/HomePage.jsx`: `uploadAudioToStorage`関数（634行目付近）
- `src/pages/HomePage.jsx`: `saveToFirestore`関数（734行目付近）
- `src/pages/HomePage.jsx`: `syncIndexedDBToFirebase`関数（197行目付近）

## 5. IndexedDB Transactionエラーの修正

### 問題:
`markAsSynced`関数でtransactionがinactiveになるエラー

### 修正内容:
- 新しいtransactionを作成して更新処理を実行
- transactionが完了するまで待機

### 変更箇所:
- `src/lib/indexedDB.js`: `markAsSynced`関数（139行目付近）
