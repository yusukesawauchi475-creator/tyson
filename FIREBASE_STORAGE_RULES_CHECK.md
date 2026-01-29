# Firebase Storage Rules 確認手順

## 問題
匿名アプリでFirebase Storageに書き込むため、認証不要のルールが必要です。

## 確認手順

### 1. Firebase Consoleにアクセス
1. https://console.firebase.google.com/ にアクセス
2. プロジェクト「nacho-city」を選択
3. 左メニューから「Storage」を選択
4. 「ルール」タブをクリック

### 2. 現在のルールを確認
現在のルールが以下のようになっているか確認：

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /shugyo/{fileName} {
      // 匿名書き込みを許可（本番環境では推奨されないが、このアプリでは必要）
      allow write: if true;
      allow read: if true;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### 3. ルールが認証必須の場合
もし以下のような認証必須のルールになっている場合：

```javascript
allow write: if request.auth != null;
```

この場合、匿名ユーザーは書き込めません。上記の `allow write: if true;` に変更してください。

### 4. ルールの更新
1. ルールを編集
2. 「公開」ボタンをクリック
3. 数秒待ってから、アプリで再度アップロードを試す

## 確認コマンド（CLI）

Firebase CLIがインストールされている場合：

```bash
firebase storage:rules:get
```

## 注意事項
- `allow write: if true;` は誰でも書き込めるため、本番環境では推奨されません
- より安全な実装では、ファイルサイズ制限やファイルタイプの検証を追加してください
- 将来的には、Firebase Authenticationを導入して認証済みユーザーのみ書き込み可能にすることを推奨します
