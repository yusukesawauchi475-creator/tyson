#!/bin/bash
set -e
cd "$(dirname "$0")/.."
echo "[deploy-and-prove] build"
npm run build
echo "[deploy-and-prove] vercel --prod --force"
OUT=$(mktemp)
vercel --prod --force 2>&1 | tee "$OUT"
URL=$(grep -oE 'Production: https://[^[:space:]]+' "$OUT" | head -1 | sed 's/Production: //')
rm -f "$OUT"
if [ -z "$URL" ]; then
  echo "[deploy-and-prove] could not detect Production URL"
  exit 1
fi
echo "[deploy-and-prove] Production URL: $URL"
echo "[deploy-and-prove] GET $URL/api/storage-upload-test"
RESP=$(curl -sS -w "\n%{http_code}" "$URL/api/storage-upload-test")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "$BODY" | jq -r . 2>/dev/null || echo "$BODY"
if [ "$HTTP" != "200" ]; then
  echo "[deploy-and-prove] storage-upload-test HTTP $HTTP"
  exit 1
fi
SUCCESS=$(echo "$BODY" | jq -r '.success // false')
PROOF_URL=$(echo "$BODY" | jq -r '.url // empty')
if [ "$SUCCESS" != "true" ] || [ -z "$PROOF_URL" ]; then
  echo "[deploy-and-prove] success=$SUCCESS url=$PROOF_URL"
  exit 1
fi
echo ""
echo "[deploy-and-prove] PROOF: Storage URL = $PROOF_URL"
echo "[deploy-and-prove] configCheck: $(echo "$BODY" | jq -c '.configCheck')"
