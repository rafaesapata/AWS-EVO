#!/bin/bash
# Script para criar endpoints no API Gateway para os novos handlers
# Criado em: 27/12/2024

set -e

REGION="us-east-1"
ACCOUNT_ID="383234048592"
REST_API_ID="3l66kn0eaj"
AUTHORIZER_ID="ez5xqt"
FUNCTIONS_RESOURCE_ID="n9gxy9"  # Parent de /api/functions/*

echo "🔧 Criando endpoints no API Gateway..."
echo ""

# Função para criar endpoint completo
create_endpoint() {
  local ENDPOINT_NAME=$1
  local LAMBDA_NAME=$2
  local HTTP_METHOD=${3:-POST}
  
  echo "📍 Criando endpoint: ${ENDPOINT_NAME}"
  
  # 1. Criar resource
  RESOURCE_ID=$(aws apigateway create-resource \
    --rest-api-id "$REST_API_ID" \
    --parent-id "$FUNCTIONS_RESOURCE_ID" \
    --path-part "$ENDPOINT_NAME" \
    --region "$REGION" \
    --query 'id' --output text 2>/dev/null || echo "")
  
  if [ -z "$RESOURCE_ID" ]; then
    # Resource pode já existir, tentar buscar
    RESOURCE_ID=$(aws apigateway get-resources \
      --rest-api-id "$REST_API_ID" \
      --region "$REGION" \
      --query "items[?pathPart=='${ENDPOINT_NAME}'].id" --output text 2>/dev/null)
    
    if [ -z "$RESOURCE_ID" ]; then
      echo "  ❌ Erro ao criar/encontrar resource"
      return 1
    fi
    echo "  ℹ️  Resource já existe: ${RESOURCE_ID}"
  else
    echo "  ✅ Resource criado: ${RESOURCE_ID}"
  fi
  
  # 2. Criar OPTIONS (CORS)
  echo "  📝 Configurando CORS (OPTIONS)..."
  aws apigateway put-method \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --authorization-type NONE \
    --region "$REGION" 2>/dev/null || true
  
  aws apigateway put-integration \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --type MOCK \
    --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
    --region "$REGION" 2>/dev/null || true
  
  aws apigateway put-method-response \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' \
    --region "$REGION" 2>/dev/null || true
  
  aws apigateway put-integration-response \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \
    --region "$REGION" 2>/dev/null || true
  
  # 3. Criar método principal com Cognito
  echo "  📝 Configurando ${HTTP_METHOD} com Cognito..."
  aws apigateway put-method \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method "$HTTP_METHOD" \
    --authorization-type COGNITO_USER_POOLS \
    --authorizer-id "$AUTHORIZER_ID" \
    --region "$REGION" 2>/dev/null || true
  
  # 4. Integração com Lambda
  LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:evo-uds-v3-production-${LAMBDA_NAME}"
  
  aws apigateway put-integration \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method "$HTTP_METHOD" \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region "$REGION" 2>/dev/null || true
  
  # 5. Adicionar permissão para API Gateway invocar Lambda
  aws lambda add-permission \
    --function-name "evo-uds-v3-production-${LAMBDA_NAME}" \
    --statement-id "apigateway-${ENDPOINT_NAME}-${HTTP_METHOD}" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${REST_API_ID}/*/${HTTP_METHOD}/api/functions/${ENDPOINT_NAME}" \
    --region "$REGION" 2>/dev/null || true
  
  echo "  ✅ Endpoint ${ENDPOINT_NAME} configurado!"
  echo ""
}

# Criar endpoints para os novos handlers
echo "=== Security Endpoints ==="
create_endpoint "start-security-scan" "start-security-scan" "POST"

echo "=== Profile Endpoints ==="
create_endpoint "get-user-organization" "get-user-organization" "POST"

echo "=== Knowledge Base Endpoints ==="
create_endpoint "increment-article-helpful" "increment-article-helpful" "POST"
create_endpoint "increment-article-views" "increment-article-views" "POST"
create_endpoint "track-article-view-detailed" "track-article-view-detailed" "POST"

echo "=== MFA Endpoints ==="
create_endpoint "mfa-list-factors" "mfa-list-factors" "POST"
create_endpoint "mfa-enroll" "mfa-enroll" "POST"
create_endpoint "mfa-challenge-verify" "mfa-challenge-verify" "POST"
create_endpoint "mfa-unenroll" "mfa-unenroll" "POST"

echo "=== Storage Endpoints ==="
create_endpoint "upload-attachment" "upload-attachment" "POST"
create_endpoint "storage-download" "storage-download" "POST"
create_endpoint "storage-delete" "storage-delete" "POST"

# Deploy das mudanças
echo "🚀 Deployando API Gateway (stage: prod)..."
aws apigateway create-deployment \
  --rest-api-id "$REST_API_ID" \
  --stage-name prod \
  --description "Deploy novos endpoints - $(date +%Y-%m-%d)" \
  --region "$REGION"

echo ""
echo "🎉 Todos os endpoints criados e deployados!"
echo ""
echo "Endpoints disponíveis em:"
echo "  https://api-evo.ai.udstec.io/api/functions/{endpoint-name}"
