# 🚀 Vercelデプロイ - 最短コマンド

## 即座に実行すべきコマンド（順番に実行）

### 1. ビルドテスト（既に成功確認済み）

```bash
cd /Users/yusukesawauchi/mixc-nekolist/Tyson
npm run build
```

✅ **結果**: ビルド成功（`dist/`ディレクトリに出力）

### 2. Vercel CLIのインストール（未インストールの場合）

```bash
npm install -g vercel
```

### 3. Vercelにログイン

```bash
vercel login
```

ブラウザが開くので、Vercelアカウントでログインしてください。

### 4. 既存プロジェクトにリンク

```bash
cd /Users/yusukesawauchi/mixc-nekolist/Tyson
vercel link
```

**プロンプトで以下を選択**:
- `Set up and deploy?` → **Yes**
- `Which scope?` → **あなたのアカウントを選択**
- `Link to existing project?` → **Yes**
- `What's the name of your existing project?` → **tyson-two**

### 5. 本番環境にデプロイ（最重要）

```bash
vercel --prod
```

これで https://tyson-two.vercel.app にデプロイされます。

---

## 🎯 ワンライナー（すべて実行済みの場合）

```bash
cd /Users/yusukesawauchi/mixc-nekolist/Tyson && vercel --prod
```

---

## 🔧 トラブルシューティング

### 404エラーが続く場合

```bash
# 強制再デプロイ
vercel --prod --force

# デバッグモード
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

### 環境変数が設定されていない場合

1. https://vercel.com/dashboard にアクセス
2. 「tyson-two」プロジェクトを選択
3. Settings → Environment Variables
4. 必要な環境変数を追加（`VERCEL_DEPLOY_GUIDE.md`を参照）

---

## ✅ デプロイ成功の確認

1. **URL確認**: https://tyson-two.vercel.app
2. **ホーム画面表示**: 録音ボタンが表示されることを確認
3. **API動作**: 録音機能が正常に動作することを確認

---

## 📝 注意事項

- **環境変数**: デプロイ前にVercelダッシュボードで環境変数が設定されているか確認
- **ビルド時間**: 初回デプロイは2-3分かかる場合があります
- **キャッシュ**: デプロイ後、ブラウザのキャッシュをクリアして確認してください
