#!/bin/bash

# Script para corrigir imports nas Lambdas e fazer redeploy
# Problema: Imports relativos ../../lib/ não funcionam quando deployamos flat

set -e

REGION="us-east-1"
TEMP_DIR="/tmp/lambda-fix-imports"

echo "🔧 Fixing Lambda imports and redeploying"
echo "=========================================="

# Limpar
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Função para processar uma Lambda
process_lambda() {
  local LAMBDA_NAME=$1
  local HANDLER_FILE=$2
  local HANDLER_NAME=$3
  
  echo ""
  echo "📦 Processing: $LAMBDA_NAME"
  
  LAMBDA_DIR="$TEMP_DIR/$LAMBDA_NAME"
  mkdir -p "$LAMBDA_DIR"
  
  # Copiar handler e ajustar imports
  echo "   Fixing imports in handler..."
  sed 's|require("../../lib/|require("./lib/|g' "$HANDLER_FILE" | \
  sed 's|require("../../types/|require("./types/|g' > "$LAMBDA_DIR/$HANDLER_NAME"
  
  # Copiar lib/ e types/
  cp -r backend/dist/lib "$LAMBDA_DIR/"
  cp -r backend/dist/types "$LAMBDA_DIR/"
  
  # Criar ZIP
  echo "   Creating deployment package..."
  pushd "$LAMBDA_DIR" > /dev/null
  zip -q -r "../${LAMBDA_NAME}.zip" .
  popd > /dev/null
  
  # Upload
  echo "   Uploading to AWS..."
  aws lambda update-function-code \
    --function-name "$LAMBDA_NAME" \
    --zip-file "fileb://$TEMP_DIR/${LAMBDA_NAME}.zip" \
    --region "$REGION" \
    --no-cli-pager \
    > /dev/null
  
  # Atualizar handler
  echo "   Updating handler configuration..."
  aws lambda update-function-configuration \
    --function-name "$LAMBDA_NAME" \
    --handler "$HANDLER_NAME.handler" \
    --region "$REGION" \
    --no-cli-pager \
    > /dev/null
  
  echo "   ✅ Done"
}

# Processar WAF Dashboard API
process_lambda \
  "evo-uds-v3-production-waf-dashboard-api" \
  "backend/dist/handlers/security/waf-dashboard-api.js" \
  "waf-dashboard-api"

# Processar MFA Handlers
for mfa_func in mfa-list-factors mfa-enroll mfa-challenge-verify mfa-unenroll; do
  process_lambda \
    "evo-uds-v3-production-$mfa_func" \
    "backend/dist/handlers/auth/mfa-handlers.js" \
    "mfa-handlers"
done

echo ""
echo "⏳ Waiting for Lambda updates to propagate..."
sleep 5

echo ""
echo "🧪 Testing WAF Dashboard API..."
aws lambda invoke \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --cli-binary-format raw-in-base64-out \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}},"headers":{}}' \
  --region "$REGION" \
  /tmp/test-waf.json \
  --no-cli-pager \
  > /dev/null 2>&1

if grep -q '"statusCode":200' /tmp/test-waf.json; then
  echo "✅ WAF Dashboard API: Working!"
else
  echo "❌ WAF Dashboard API: Still has issues"
  cat /tmp/test-waf.json
fi

echo ""
echo "🧪 Testing MFA List Factors..."
aws lambda invoke \
  --function-name evo-uds-v3-production-mfa-list-factors \
  --cli-binary-format raw-in-base64-out \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}},"headers":{}}' \
  --region "$REGION" \
  /tmp/test-mfa.json \
  --no-cli-pager \
  > /dev/null 2>&1

if grep -q '"statusCode":200' /tmp/test-mfa.json; then
  echo "✅ MFA List Factors: Working!"
else
  echo "❌ MFA List Factors: Still has issues"
  cat /tmp/test-mfa.json
fi

echo ""
echo "🧹 Cleaning up..."
rm -rf "$TEMP_DIR"
rm -f /tmp/test-waf.json /tmp/test-mfa.json

echo ""
echo "✨ Done! Refresh your browser to see the fixes."
