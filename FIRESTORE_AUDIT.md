# 保存・取得 不整合監査

## コレクション

| 用途 | コレクション名 | 書き込み元 | 読み込み元 |
|------|----------------|------------|------------|
| 修行記録（管理画面表示） | **shugyo** | api/upload.js | AdminPage.jsx, HomePage.jsx |
| 録音メタデータ | recordings | api/upload.js | （管理画面は使用しない） |

## 保存時（api/upload.js）

```javascript
const shugyoRef = firestore.collection('shugyo');
await shugyoRef.add({
  date: fileNameDate,           // YYYY-MM-DD（例: 2026-01-30）
  timestamp: now,               // JavaScript Date
  userName,
  audioURL: signedUrl,
  streakCount,
  createdAt: now,
  fromRecordingsId: recordingsDoc.id,
  source: 'api-upload',
});
```

- **プロジェクト**: FIREBASE_SERVICE_ACCOUNT の project_id
- **date 形式**: `isoDate.split('T')[0]` → YYYY-MM-DD

## 取得時（AdminPage.jsx）

```javascript
const q = query(
  collection(db, 'shugyo'),
  orderBy('timestamp', 'desc')
);
const querySnapshot = await getDocs(q);
```

- **プロジェクト**: VITE_FIREBASE_PROJECT_ID（firebase.js の initializeApp）
- **整合性**: 両者が同一プロジェクトを指すこと

## 不整合チェックリスト

- [ ] VITE_FIREBASE_PROJECT_ID === FIREBASE_SERVICE_ACCOUNT.project_id
- [ ] コレクション名 `shugyo` で一致
- [ ] orderBy('timestamp', 'desc') のインデックスが Firestore に存在
- [ ] Firestore Rules で shugyo の read が許可されている

## gsutil CORS コマンド（403対策）

```bash
gsutil cors set cors.json gs://tyson-3341f.firebasestorage.app
```
