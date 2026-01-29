# 🚀 Vercelデプロイ - 最終手順（404エラー解決）

## ✅ 完了した作業

1. ✅ **ビルドテスト**: 正常に動作（`dist/`ディレクトリに出力）
2. ✅ **vercel.json修正**: SPAルーティング用の`rewrites`を追加
3. ✅ **Vercel CLI確認**: インストール済み

## 🎯 最短ルート - 実行すべきコマンド

### ステップ1: Vercelにログイン（初回のみ）

```bash
cd /Users/yusukesawauchi/mixc-nekolist/Tyson
vercel login
```

ブラウザが開くので、Vercelアカウントでログインしてください。

### ステップ2: 既存プロジェクトにリンク

```bash
vercel link
```

**プロンプトで以下を選択**:
- `Set up and deploy?` → **Yes**
- `Which scope?` → **あなたのアカウントを選択**
- `Link to existing project?` → **Yes**
- `What's the name of your existing project?` → **tyson-two**

### ステップ3: 本番環境にデプロイ（最重要）

```bash
vercel --prod
```

これで https://tyson-two.vercel.app にデプロイされます。

---

## 🎯 ワンライナー（ログイン済みの場合）

```bash
cd /Users/yusukesawauchi/mixc-nekolist/Tyson && vercel --prod
```

---

## 📋 修正内容

### vercel.json に追加した設定

```json
"rewrites": [
  {
    "source": "/(.*)",
    "destination": "/index.html"
  }
]
```

**理由**: React Router（SPA）のルーティングを正しく動作させるため。これがないと`/admin`などのパスで404エラーが発生します。

---

## ⚠️ 環境変数の確認

デプロイ前に、Vercelダッシュボードで以下の環境変数が設定されているか確認：

### クライアント側（VITE_プレフィックス必須）
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (オプション)

### サーバー側（VITE_プレフィックス不要）
- `OPENAI_API_KEY`
- `GEMINI_API_KEY` (オプション)
- `AI_PROVIDER` (デフォルト: `openai`)
- `ADMIN_PASSWORD`

**設定方法**: https://vercel.com/dashboard → 「tyson-two」プロジェクト → Settings → Environment Variables

---

## 🔧 トラブルシューティング

### 404エラーが続く場合

```bash
# 強制再デプロイ
vercel --prod --force

# デバッグモード（詳細ログ）
vercel --prod --force --debug
```

### プロジェクトが見つからない場合

```bash
# 新規プロジェクトとして作成
vercel --prod

# プロンプトで：
# - Set up and deploy? → Yes
# - Which scope? → あなたのアカウントを選択
# - Link to existing project? → No
# - What's your project's name? → tyson-two
```

### ビルドエラーが発生する場合

```bash
# ローカルでビルドテスト
npm run build

# エラーがあれば修正してから再デプロイ
vercel --prod
```

---

## ✅ デプロイ成功の確認

1. **URL確認**: https://tyson-two.vercel.app
2. **ホーム画面表示**: 録音ボタンが表示されることを確認
3. **ルーティング確認**: `/admin`にアクセスして認証画面が表示されることを確認
4. **API動作確認**: 録音機能が正常に動作することを確認

---

## 📝 注意事項

- **初回デプロイ**: 2-3分かかる場合があります
- **キャッシュ**: デプロイ後、ブラウザのキャッシュをクリア（Cmd+Shift+R）して確認
- **環境変数**: デプロイ後に環境変数が反映されない場合は、再デプロイが必要

---

## 🎉 完了

上記のコマンドを実行すれば、**「URLを叩けばおかんの修行画面が出る」状態**になります！
