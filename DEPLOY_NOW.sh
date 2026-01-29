#!/bin/bash

# Vercelデプロイスクリプト - 最短ルート

echo "🚀 Project Tyson - Vercelデプロイ開始"
echo ""

# 1. ビルドテスト
echo "📦 ビルドテスト中..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ ビルドエラーが発生しました。修正してから再実行してください。"
    exit 1
fi

echo "✅ ビルド成功"
echo ""

# 2. Vercel CLIの確認
echo "🔍 Vercel CLIの確認中..."
if ! command -v vercel &> /dev/null; then
    echo "⚠️  Vercel CLIがインストールされていません。"
    echo "   インストール中..."
    npm install -g vercel
fi

echo "✅ Vercel CLI確認完了"
echo ""

# 3. ログイン確認
echo "🔐 Vercelログイン確認中..."
vercel whoami

if [ $? -ne 0 ]; then
    echo "⚠️  ログインが必要です。ブラウザが開きます..."
    vercel login
fi

echo "✅ ログイン確認完了"
echo ""

# 4. プロジェクトリンク（既存プロジェクトの場合）
echo "🔗 プロジェクトリンク中..."
echo "   既存プロジェクト「tyson-two」にリンクします..."
vercel link --yes --scope=$(vercel whoami 2>/dev/null | head -n 1) --project=tyson-two 2>/dev/null || vercel link

echo ""

# 5. 本番環境にデプロイ
echo "🚀 本番環境にデプロイ中..."
vercel --prod

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ デプロイ完了！"
    echo "🌐 URL: https://tyson-two.vercel.app"
    echo ""
    echo "おかんの修行画面が表示されるはずです！"
else
    echo ""
    echo "❌ デプロイエラーが発生しました。"
    echo "   エラーログを確認してください。"
    exit 1
fi
