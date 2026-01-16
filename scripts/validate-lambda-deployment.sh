#!/bin/bash

# Script de Validação Pós-Deploy de Lambdas
# Valida que uma Lambda foi deployada corretamente antes de considerar o deploy completo
#
# Uso: ./scripts/validate-lambda-deployment.sh <function-name>
# Exemplo: ./scripts/validate-lambda-deployment.sh evo-uds-v3-production-security-scan

set -e

FUNCTION_NAME=$1
REGION=${AWS_REGION:-us-east-1}

if [ -z "$FUNCTION_NAME" ]; then
  echo "❌ Erro: Nome da função não fornecido"
  echo "Uso: $0 <function-name>"
  exit 1
fi

echo "🔍 Validando deploy da Lambda: $FUNCTION_NAME"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Check 1: Function exists
echo "1️⃣ Verificando se a função existe..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" &>/dev/null; then
  echo -e "${GREEN}✅ Função existe${NC}"
else
  echo -e "${RED}❌ Função não encontrada${NC}"
  exit 1
fi

# Check 2: Handler path validation
echo ""
echo "2️⃣ Verificando handler path..."
HANDLER=$(aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'Handler' \
  --output text)

echo "   Handler: $HANDLER"

if [[ "$HANDLER" == *"handlers/"* ]]; then
  echo -e "${RED}❌ Handler path INCORRETO (contém 'handlers/')${NC}"
  echo "   Esperado: <nome>.handler"
  echo "   Encontrado: $HANDLER"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ Handler path correto${NC}"
fi

# Check 3: Test invocation (OPTIONS)
echo ""
echo "3️⃣ Testando invocação (OPTIONS)..."
PAYLOAD='{"requestContext":{"http":{"method":"OPTIONS"}}}'
RESPONSE_FILE="/tmp/lambda-test-$FUNCTION_NAME.json"

if aws lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --cli-binary-format raw-in-base64-out \
  --payload "$PAYLOAD" \
  --region "$REGION" \
  "$RESPONSE_FILE" &>/dev/null; then
  
  STATUS_CODE=$(jq -r '.statusCode // empty' "$RESPONSE_FILE" 2>/dev/null || echo "")
  
  if [ "$STATUS_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Invocação bem-sucedida (200)${NC}"
  else
    echo -e "${RED}❌ Invocação retornou status $STATUS_CODE${NC}"
    echo "   Resposta:"
    cat "$RESPONSE_FILE" | jq '.' 2>/dev/null || cat "$RESPONSE_FILE"
    ERRORS=$((ERRORS + 1))
  fi
  
  rm -f "$RESPONSE_FILE"
else
  echo -e "${RED}❌ Falha ao invocar Lambda${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Check 4: Recent errors in logs
echo ""
echo "4️⃣ Verificando erros recentes nos logs (últimos 5 minutos)..."
LOG_GROUP="/aws/lambda/$FUNCTION_NAME"
FIVE_MIN_AGO=$(($(date +%s) - 300))
FIVE_MIN_AGO_MS=$((FIVE_MIN_AGO * 1000))

ERROR_COUNT=$(aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --start-time "$FIVE_MIN_AGO_MS" \
  --filter-pattern "ERROR" \
  --region "$REGION" \
  --query 'length(events)' \
  --output text 2>/dev/null || echo "0")

if [ "$ERROR_COUNT" = "0" ]; then
  echo -e "${GREEN}✅ Nenhum erro nos últimos 5 minutos${NC}"
elif [ "$ERROR_COUNT" -lt 5 ]; then
  echo -e "${YELLOW}⚠️  $ERROR_COUNT erro(s) nos últimos 5 minutos${NC}"
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${RED}❌ $ERROR_COUNT erros nos últimos 5 minutos${NC}"
  echo "   Últimos erros:"
  aws logs filter-log-events \
    --log-group-name "$LOG_GROUP" \
    --start-time "$FIVE_MIN_AGO_MS" \
    --filter-pattern "ERROR" \
    --region "$REGION" \
    --query 'events[-3:].message' \
    --output text 2>/dev/null | head -10
  ERRORS=$((ERRORS + 1))
fi

# Check 5: Layer validation
echo ""
echo "5️⃣ Verificando layers..."
LAYERS=$(aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'Layers[*].Arn' \
  --output text)

if [ -z "$LAYERS" ]; then
  echo -e "${YELLOW}⚠️  Nenhum layer anexado${NC}"
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}✅ Layers anexados:${NC}"
  echo "$LAYERS" | tr '\t' '\n' | sed 's/^/   - /'
fi

# Check 6: Environment variables
echo ""
echo "6️⃣ Verificando variáveis de ambiente críticas..."
ENV_VARS=$(aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'Environment.Variables' \
  --output json 2>/dev/null || echo "{}")

# Check for DATABASE_URL
if echo "$ENV_VARS" | jq -e '.DATABASE_URL' &>/dev/null; then
  echo -e "${GREEN}✅ DATABASE_URL configurada${NC}"
else
  echo -e "${YELLOW}⚠️  DATABASE_URL não configurada${NC}"
  WARNINGS=$((WARNINGS + 1))
fi

# Check for NODE_PATH (if using layers)
if [ -n "$LAYERS" ]; then
  if echo "$ENV_VARS" | jq -e '.NODE_PATH' &>/dev/null; then
    echo -e "${GREEN}✅ NODE_PATH configurada${NC}"
  else
    echo -e "${YELLOW}⚠️  NODE_PATH não configurada (recomendado com layers)${NC}"
    WARNINGS=$((WARNINGS + 1))
  fi
fi

# Check 7: VPC configuration (if needed)
echo ""
echo "7️⃣ Verificando configuração VPC..."
VPC_ID=$(aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'VpcConfig.VpcId' \
  --output text 2>/dev/null || echo "None")

if [ "$VPC_ID" = "None" ] || [ -z "$VPC_ID" ]; then
  echo -e "${YELLOW}⚠️  Lambda não está em VPC${NC}"
  echo "   (OK se não precisar acessar RDS/ElastiCache)"
else
  echo -e "${GREEN}✅ Lambda em VPC: $VPC_ID${NC}"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESUMO DA VALIDAÇÃO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Função: $FUNCTION_NAME"
echo "Handler: $HANDLER"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}✅ DEPLOY VALIDADO COM SUCESSO!${NC}"
  echo ""
  echo "Todos os checks passaram. A Lambda está pronta para uso."
  exit 0
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}⚠️  DEPLOY VALIDADO COM AVISOS${NC}"
  echo ""
  echo "Avisos: $WARNINGS"
  echo "A Lambda está funcional, mas há avisos que devem ser revisados."
  exit 0
else
  echo -e "${RED}❌ DEPLOY FALHOU NA VALIDAÇÃO${NC}"
  echo ""
  echo "Erros: $ERRORS"
  echo "Avisos: $WARNINGS"
  echo ""
  echo "A Lambda NÃO está funcionando corretamente."
  echo "Revise os erros acima e refaça o deploy seguindo o processo correto."
  exit 1
fi
