#!/bin/bash

# Vercel環境変数を tyson-3341f に強制同期するスクリプト

set -e

echo "🚀 Vercel環境変数を tyson-3341f に強制同期開始"
echo ""

# 必要な環境変数のリスト
declare -A ENV_VARS=(
  ["VITE_FIREBASE_PROJECT_ID"]="tyson-3341f"
  ["VITE_FIREBASE_STORAGE_BUCKET"]="tyson-3341f.firebasestorage.app"
)

# 各環境変数をVercelに設定（Production環境）
for VAR_NAME in "${!ENV_VARS[@]}"; do
  VAR_VALUE="${ENV_VARS[$VAR_NAME]}"
  echo "📝 設定中: $VAR_NAME = $VAR_VALUE"
  
  # 既存の環境変数を削除（エラーは無視）
  vercel env rm "$VAR_NAME" production --yes 2>/dev/null || true
  
  # 新しい値を設定
  echo "$VAR_VALUE" | vercel env add "$VAR_NAME" production
  
  echo "✅ $VAR_NAME を設定完了"
  echo ""
done

echo "🎉 全ての環境変数を tyson-3341f に同期完了"
echo ""
echo "次のステップ:"
echo "  vercel --prod --force"
