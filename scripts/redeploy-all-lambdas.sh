#!/bin/bash

# Script para redeployar todas as Lambdas com a estrutura correta

set -e

TEMP_DIR="/tmp/lambda-deploy"
LAMBDAS=(
  "fetch-daily-costs:cost"
  "validate-aws-credentials:security"
  "update-aws-credentials:aws"
  "list-aws-credentials:aws"
  "save-aws-credentials:aws"
  "query-table:data"
  "health:monitoring"
  "validate-permissions:security"
  "validate-license:license"
  "finops-copilot:cost"
  "check-organization:profiles"
  "analyze-cloudtrail:security"
  "ml-waste-detection:cost"
  "fetch-cloudtrail:security"
  "verify-tv-token:auth"
  "detect-anomalies:ml"
  "compliance-scan:security"
  "sync-organization-accounts:organizations"
  "ri-sp-analyzer:cost"
  "well-architected-scan:security"
  "get-communication-logs:notifications"
  "create-with-organization:profiles"
  "run-migrations:system"
)

echo "=== Preparando estrutura base ==="
rm -rf $TEMP_DIR /tmp/*.zip
mkdir -p $TEMP_DIR/lib $TEMP_DIR/types $TEMP_DIR/node_modules

# Copiar libs
cp backend/dist/lib/*.js $TEMP_DIR/lib/
cp backend/dist/types/*.js $TEMP_DIR/types/

# Copiar node_modules necessários (apenas zod, NÃO @aws-sdk)
cp -r backend/node_modules/zod $TEMP_DIR/node_modules/ 2>/dev/null || true

echo "=== Deployando Lambdas ==="
for LAMBDA_INFO in "${LAMBDAS[@]}"; do
  HANDLER_NAME="${LAMBDA_INFO%%:*}"
  FOLDER="${LAMBDA_INFO##*:}"
  FUNCTION_NAME="evo-uds-v3-production-${HANDLER_NAME}"
  
  # Verificar se o handler existe
  if [ ! -f "backend/dist/handlers/${FOLDER}/${HANDLER_NAME}.js" ]; then
    echo "SKIP: $HANDLER_NAME (handler não encontrado)"
    continue
  fi
  
  # Verificar se a Lambda existe
  if ! aws lambda get-function --function-name "$FUNCTION_NAME" &>/dev/null; then
    echo "SKIP: $HANDLER_NAME (Lambda não existe)"
    continue
  fi
  
  echo "Deployando: $HANDLER_NAME"
  
  # Criar estrutura de handlers
  mkdir -p "$TEMP_DIR/handlers/${FOLDER}"
  cp "backend/dist/handlers/${FOLDER}/${HANDLER_NAME}.js" "$TEMP_DIR/handlers/${FOLDER}/"
  
  # Criar zip
  pushd $TEMP_DIR > /dev/null
  rm -f "/tmp/${HANDLER_NAME}.zip"
  zip -r "/tmp/${HANDLER_NAME}.zip" . -x "*.map" -x "*.d.ts" > /dev/null
  popd > /dev/null
  
  # Atualizar Lambda
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb:///tmp/${HANDLER_NAME}.zip" \
    --query 'LastModified' --output text
  
  # Limpar handler para próxima iteração
  rm -rf "$TEMP_DIR/handlers"
  
  echo "  ✓ $HANDLER_NAME atualizado"
done

echo "=== Concluído ==="
