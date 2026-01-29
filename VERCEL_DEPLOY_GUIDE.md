# Vercelデプロイ完全ガイド - 404エラー解決

## 🔍 問題の原因

1. **Gitリポジトリ未接続**: Vercelダッシュボードで「Connect Git Repository」と表示されている
2. **デプロイ未完了**: 404エラーが発生している
3. **ビルド設定**: 確認済み（正常）

## ✅ 解決手順

### 方法1: Vercel CLIで直接デプロイ（推奨・最短ルート）

#### ステップ1: Vercel CLIのインストール確認

```bash
# Vercel CLIがインストールされているか確認
vercel --version

# インストールされていない場合
npm install -g vercel
```

#### ステップ2: Vercelにログイン

```bash
# Vercelにログイン（ブラウザが開きます）
vercel login
```

#### ステップ3: プロジェクトをリンク（既存プロジェクトの場合）

```bash
# 既存のプロジェクト（tyson-two.vercel.app）にリンク
cd /Users/yusukesawauchi/mixc-nekolist/Tyson
vercel link

# プロンプトに従って：
# - Set up and deploy? → Yes
# - Which scope? → あなたのアカウントを選択
# - Link to existing project? → Yes
# - What's the name of your existing project? → tyson-two
```

#### ステップ4: 本番環境にデプロイ

```bash
# 本番環境にデプロイ（--prodフラグが重要）
vercel --prod
```

### 方法2: Gitリポジトリを接続して自動デプロイ

#### ステップ1: Gitリポジトリを初期化

```bash
cd /Users/yusukesawauchi/mixc-nekolist/Tyson
git init
git add .
git commit -m "Initial commit"
```

#### ステップ2: GitHub/GitLab/Bitbucketにリポジトリを作成

- GitHub: https://github.com/new
- リポジトリ名: `tyson` など

#### ステップ3: リモートリポジトリにプッシュ

```bash
git remote add origin https://github.com/[your-username]/tyson.git
git branch -M main
git push -u origin main
```

#### ステップ4: Vercelダッシュボードで接続

1. https://vercel.com/dashboard にアクセス
2. 「Add New...」→「Project」をクリック
3. 作成したGitリポジトリを選択
4. プロジェクト名を「tyson-two」に設定
5. 「Deploy」をクリック

## 🔧 ビルド設定の確認

### vercel.json の設定（確認済み）

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite"
}
```

✅ **設定は正しい**: Viteのビルド出力ディレクトリ（`dist`）と一致

### ビルドテスト（確認済み）

```bash
npm run build
```

✅ **ビルド成功**: `dist/`ディレクトリに正常に出力されている

## 🚀 最短ルート（推奨）

### コマンド一覧

```bash
# 1. プロジェクトディレクトリに移動
cd /Users/yusukesawauchi/mixc-nekolist/Tyson

# 2. Vercel CLIでログイン（初回のみ）
vercel login

# 3. 既存プロジェクトにリンク
vercel link
# → プロンプトで「tyson-two」を選択

# 4. 本番環境にデプロイ
vercel --prod
```

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

## 📋 デプロイ後の確認

1. **URL確認**: https://tyson-two.vercel.app にアクセス
2. **404エラー解消**: ホーム画面が表示されることを確認
3. **API動作確認**: 録音機能が正常に動作することを確認

## 🐛 トラブルシューティング

### 404エラーが続く場合

1. **ビルドログを確認**
   ```bash
   vercel logs
   ```

2. **再デプロイ**
   ```bash
   vercel --prod --force
   ```

3. **キャッシュクリア**
   ```bash
   vercel --prod --force --debug
   ```

### 環境変数エラー

- Vercelダッシュボード → Project Settings → Environment Variables で確認
- すべての環境変数が設定されているか確認

### ビルドエラー

- ローカルで `npm run build` を実行してエラーを確認
- `dist/`ディレクトリが生成されているか確認
