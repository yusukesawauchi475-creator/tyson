#!/bin/bash

# Firebase Rules 自動デプロイスクリプト（リトライ付き）
# API有効化待ちを自動でリトライし、成功するまで30秒おきに実行

set -e

MAX_RETRIES=20
RETRY_INTERVAL=30
PROJECT_ID="tyson-3341f"

echo "🚀 Firebase Rules 自動デプロイ開始（プロジェクト: $PROJECT_ID）"
echo "📋 最大リトライ回数: $MAX_RETRIES 回（30秒間隔）"
echo ""

# 認証確認とログイン
echo "🔍 認証状態を確認中..."
if ! npx firebase-tools projects:list &>/dev/null; then
  echo "⚠️  認証が必要です。自動でログインを試行します..."
  echo "📧 yusuke.sawauchi.475@gmail.com でログインしてください"
  npx firebase-tools login --no-localhost || {
    echo "❌ ログインに失敗しました。手動で実行してください:"
    echo "   npx firebase-tools login --reauth"
    exit 1
  }
fi

# プロジェクトを確認
echo "🔍 プロジェクトを確認中..."
npx firebase-tools use "$PROJECT_ID" || {
  echo "⚠️  プロジェクトの切り替えに失敗しました。手動で確認してください:"
  echo "   npx firebase-tools use $PROJECT_ID"
  exit 1
}

# Firestore Rules デプロイ（リトライ付き）
deploy_firestore() {
  local attempt=1
  while [ $attempt -le $MAX_RETRIES ]; do
    echo ""
    echo "📤 Firestore Rules デプロイ試行 #$attempt..."
    
    if npx firebase-tools deploy --only firestore:rules 2>&1 | grep -q "Deploy complete"; then
      echo ""
      echo "✅ Firestore Rules デプロイ成功！"
      return 0
    else
      if [ $attempt -lt $MAX_RETRIES ]; then
        echo "⏳ デプロイ失敗。30秒後にリトライします..."
        sleep $RETRY_INTERVAL
      fi
    fi
    
    attempt=$((attempt + 1))
  done
  
  echo ""
  echo "❌ Firestore Rules デプロイが $MAX_RETRIES 回のリトライ後も失敗しました"
  return 1
}

# Storage Rules デプロイ（リトライ付き）
deploy_storage() {
  local attempt=1
  while [ $attempt -le $MAX_RETRIES ]; do
    echo ""
    echo "📤 Storage Rules デプロイ試行 #$attempt..."
    
    if npx firebase-tools deploy --only storage 2>&1 | grep -q "Deploy complete"; then
      echo ""
      echo "✅ Storage Rules デプロイ成功！"
      return 0
    else
      if [ $attempt -lt $MAX_RETRIES ]; then
        echo "⏳ デプロイ失敗。30秒後にリトライします..."
        sleep $RETRY_INTERVAL
      fi
    fi
    
    attempt=$((attempt + 1))
  done
  
  echo ""
  echo "❌ Storage Rules デプロイが $MAX_RETRIES 回のリトライ後も失敗しました"
  return 1
}

# デプロイ実行
if deploy_firestore && deploy_storage; then
  echo ""
  echo "🎉 全てのRulesデプロイが完了しました！"
  echo "✅ デプロイ完了。聖域構築成功（$PROJECT_ID）"
  exit 0
else
  echo ""
  echo "❌ デプロイに失敗しました。手動で確認してください。"
  exit 1
fi
