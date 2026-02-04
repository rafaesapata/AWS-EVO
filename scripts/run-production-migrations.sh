#!/bin/bash
set -e

# Script para executar migrations no banco de produção via Lambda

PROFILE="EVO_PRODUCTION"
REGION="us-east-1"
LAMBDA_NAME="evo-uds-v3-prod-run-migrations"

echo "🚀 Executando migrations no banco de produção..."
echo "Lambda: $LAMBDA_NAME"
echo ""

# Invocar Lambda
RESPONSE=$(AWS_PROFILE=$PROFILE aws lambda invoke \
  --function-name "$LAMBDA_NAME" \
  --region $REGION \
  --log-type Tail \
  --query 'LogResult' \
  --output text \
  /tmp/migration-response.json | base64 -d)

echo "📋 Logs da execução:"
echo "$RESPONSE"
echo ""

# Verificar resposta
if [ -f /tmp/migration-response.json ]; then
  echo "📄 Resposta da Lambda:"
  cat /tmp/migration-response.json | jq '.'
  echo ""
  
  SUCCESS=$(cat /tmp/migration-response.json | jq -r '.success // false')
  
  if [ "$SUCCESS" = "true" ]; then
    echo "✅ Migrations executadas com sucesso!"
    exit 0
  else
    echo "❌ Erro ao executar migrations"
    exit 1
  fi
else
  echo "❌ Erro: Arquivo de resposta não encontrado"
  exit 1
fi
