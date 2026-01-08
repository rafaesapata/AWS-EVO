#!/bin/bash

# Script para corrigir erros 502 nas Lambdas WAF e MFA
# Problema: Lambdas deployadas sem a pasta lib/ necessária

set -e

REGION="us-east-1"
TEMP_DIR="/tmp/lambda-deploy-fix"

echo "🔧 Fixing Lambda 502 errors - Missing lib/ dependencies"
echo "=================================================="

# Limpar diretório temporário
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Lista de Lambdas afetadas
LAMBDAS=(
  "evo-uds-v3-production-waf-dashboard-api:security"
  "evo-uds-v3-production-mfa-list-factors:auth"
  "evo-uds-v3-production-mfa-enroll:auth"
  "evo-uds-v3-production-mfa-challenge-verify:auth"
  "evo-uds-v3-production-mfa-unenroll:auth"
)

for LAMBDA_INFO in "${LAMBDAS[@]}"; do
  IFS=':' read -r LAMBDA_NAME CATEGORY <<< "$LAMBDA_INFO"
  
  echo ""
  echo "📦 Processing: $LAMBDA_NAME"
  echo "   Category: $CATEGORY"
  
  # Criar diretório para esta Lambda
  LAMBDA_DIR="$TEMP_DIR/$LAMBDA_NAME"
  mkdir -p "$LAMBDA_DIR"
  
  # Copiar o handler específico
  if [ "$LAMBDA_NAME" == "evo-uds-v3-production-waf-dashboard-api" ]; then
    cp backend/dist/handlers/security/waf-dashboard-api.js "$LAMBDA_DIR/"
    cp backend/dist/handlers/security/waf-dashboard-api.d.ts "$LAMBDA_DIR/" 2>/dev/null || true
  elif [[ "$LAMBDA_NAME" == *"mfa"* ]]; then
    cp backend/dist/handlers/auth/mfa-handlers.js "$LAMBDA_DIR/"
    cp backend/dist/handlers/auth/mfa-handlers.d.ts "$LAMBDA_DIR/" 2>/dev/null || true
  fi
  
  # Copiar TODA a pasta lib/ (dependências compartilhadas)
  echo "   Copying lib/ directory..."
  cp -r backend/dist/lib "$LAMBDA_DIR/"
  
  # Copiar TODA a pasta types/ (tipos TypeScript)
  echo "   Copying types/ directory..."
  cp -r backend/dist/types "$LAMBDA_DIR/"
  
  # Criar package.json mínimo
  cat > "$LAMBDA_DIR/package.json" <<EOF
{
  "name": "$LAMBDA_NAME",
  "version": "1.0.0",
  "type": "commonjs",
  "dependencies": {}
}
EOF
  
  # Criar ZIP
  echo "   Creating deployment package..."
  pushd "$LAMBDA_DIR" > /dev/null
  zip -q -r "../${LAMBDA_NAME}.zip" .
  popd > /dev/null
  
  # Upload para Lambda
  echo "   Uploading to AWS Lambda..."
  aws lambda update-function-code \
    --function-name "$LAMBDA_NAME" \
    --zip-file "fileb://$TEMP_DIR/${LAMBDA_NAME}.zip" \
    --region "$REGION" \
    --no-cli-pager \
    > /dev/null
  
  echo "   ✅ $LAMBDA_NAME updated successfully"
done

echo ""
echo "🎉 All Lambdas updated successfully!"
echo ""
echo "⏳ Waiting 10 seconds for Lambda updates to propagate..."
sleep 10

echo ""
echo "🧪 Testing Lambdas..."
echo ""

# Testar WAF Dashboard API
echo "Testing waf-dashboard-api..."
aws lambda invoke \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}},"headers":{}}' \
  --region "$REGION" \
  /tmp/waf-test-response.json \
  --no-cli-pager \
  > /dev/null 2>&1 && echo "✅ waf-dashboard-api: OK" || echo "❌ waf-dashboard-api: FAILED"

# Testar MFA List Factors
echo "Testing mfa-list-factors..."
aws lambda invoke \
  --function-name evo-uds-v3-production-mfa-list-factors \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}},"headers":{}}' \
  --region "$REGION" \
  /tmp/mfa-test-response.json \
  --no-cli-pager \
  > /dev/null 2>&1 && echo "✅ mfa-list-factors: OK" || echo "❌ mfa-list-factors: FAILED"

echo ""
echo "🧹 Cleaning up..."
rm -rf "$TEMP_DIR"
rm -f /tmp/waf-test-response.json /tmp/mfa-test-response.json

echo ""
echo "✨ Done! The 502 errors should be fixed now."
echo ""
echo "Next steps:"
echo "1. Refresh your browser"
echo "2. Check the WAF Monitoring page"
echo "3. Check the MFA settings page"
