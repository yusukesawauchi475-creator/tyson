#!/bin/bash
set -e
PROJECT_ID="tyson-3341f"
BUCKET="tyson-3341f.firebasestorage.app"
CORS_FILE="$(dirname "$0")/cors.json"

echo "[CORS] Project: $PROJECT_ID Bucket: $BUCKET"
echo "[CORS] Config: $CORS_FILE"
cat "$CORS_FILE"
echo ""

if command -v gsutil &> /dev/null; then
  gsutil cors set "$CORS_FILE" "gs://${BUCKET}"
  echo "[CORS] OK gsutil applied"
else
  echo "[CORS] gsutil not found. Install Google Cloud SDK, then run:"
  echo "  gsutil cors set $CORS_FILE gs://${BUCKET}"
  exit 1
fi
