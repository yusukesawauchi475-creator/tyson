# Firebase Storage CORS 設定

403 Forbidden (audioURL fetch) 対策: tyson-two.vercel.app からの GET を許可する CORS を適用してください。

## 1行コマンド（ルートで実行）

```bash
gsutil cors set cors.json gs://$(grep -o '"project_id":"[^"]*"' .env.local 2>/dev/null | cut -d'"' -f4).firebasestorage.app
```

プロジェクトIDが分かっている場合（例: tyson-3341f）:

```bash
gsutil cors set cors.json gs://tyson-3341f.firebasestorage.app
```

## 手順

1. Google Cloud SDK (gsutil) をインストール済みであること
2. `gcloud auth login` で認証
3. 上記コマンドを実行
