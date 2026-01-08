#!/bin/bash

# Script para atualizar Lambdas que usam Bedrock com o novo código

set -e

REGION="us-east-1"
ACCOUNT_ID="383234048592"

echo "🚀 Atualizando Lambdas do Bedrock..."

# Lista de Lambdas que usam Bedrock
BEDROCK_LAMBDAS=(
  "evo-uds-v3-production-bedrock-chat"
  "evo-uds-v3-production-finops-copilot"
)

# Compilar backend
echo "📦 Compilando backend..."
cd backend
npm run build
cd ..

# Atualizar cada Lambda
for LAMBDA_NAME in "${BEDROCK_LAMBDAS[@]}"; do
  echo ""
  echo "📤 Atualizando $LAMBDA_NAME..."
  
  # Verificar se a Lambda existe
  if aws lambda get-function --function-name "$LAMBDA_NAME" --region "$REGION" &>/dev/null; then
    
    # Determinar o handler baseado no nome
    if [[ "$LAMBDA_NAME" == *"bedrock-chat"* ]]; then
      HANDLER_DIR="backend/dist/handlers/ai"
      HANDLER_FILE="bedrock-chat.js"
    elif [[ "$LAMBDA_NAME" == *"finops-copilot"* ]]; then
      HANDLER_DIR="backend/dist/handlers/cost"
      HANDLER_FILE="finops-copilot-v2.js"
    fi
    
    # Criar zip temporário
    TEMP_ZIP="/tmp/${LAMBDA_NAME}.zip"
    rm -f "$TEMP_ZIP"
    
    pushd "$HANDLER_DIR" > /dev/null
    zip -q "$TEMP_ZIP" "$HANDLER_FILE"
    popd > /dev/null
    
    # Atualizar código da Lambda
    aws lambda update-function-code \
      --function-name "$LAMBDA_NAME" \
      --zip-file "fileb://$TEMP_ZIP" \
      --region "$REGION" \
      --no-cli-pager
    
    echo "✅ $LAMBDA_NAME atualizada"
    
    # Limpar
    rm -f "$TEMP_ZIP"
  else
    echo "⚠️  Lambda $LAMBDA_NAME não encontrada, pulando..."
  fi
done

echo ""
echo "✅ Todas as Lambdas do Bedrock foram atualizadas!"
echo ""
echo "📝 Modelos atualizados:"
echo "  - Claude 3.5 Sonnet: anthropic.claude-3-5-sonnet-20241022-v2:0"
echo ""
echo "🧪 Teste o Copilot em: https://evo.ai.udstec.io"
