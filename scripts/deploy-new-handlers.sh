#!/bin/bash
# Deploy script para novos handlers Lambda
# Criado em: 27/12/2024

set -e

REGION="us-east-1"
ACCOUNT_ID="383234048592"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/evo-uds-v3-production-lambda-nodejs-role"
LAYER_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:layer:evo-prisma-deps-layer:2"
VPC_SUBNETS="subnet-0dbb444e4ef54d211,subnet-05383447666913b7b"
SECURITY_GROUP="sg-04eb71f681cc651ae"
PREFIX="evo-uds-v3-production"

# Environment variables
DATABASE_URL="postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public"
COGNITO_USER_POOL_ID="us-east-1_cnesJ48lR"

echo "🚀 Iniciando deploy de novos handlers..."
echo ""

# Função para criar Lambda
create_lambda() {
  local NAME=$1
  local HANDLER=$2
  local CATEGORY=$3
  local TIMEOUT=${4:-30}
  local MEMORY=${5:-256}
  
  FUNCTION_NAME="${PREFIX}-${NAME}"
  
  echo "📦 Criando Lambda: ${FUNCTION_NAME}"
  
  # Criar zip do handler
  ZIP_FILE="/tmp/${NAME}.zip"
  rm -f "$ZIP_FILE"
  
  # Criar estrutura do zip
  TEMP_DIR="/tmp/lambda-${NAME}"
  rm -rf "$TEMP_DIR"
  mkdir -p "$TEMP_DIR/handlers/${CATEGORY}"
  mkdir -p "$TEMP_DIR/lib"
  
  # Copiar handler e dependências
  cp backend/dist/handlers/${CATEGORY}/*.js "$TEMP_DIR/handlers/${CATEGORY}/"
  cp backend/dist/lib/*.js "$TEMP_DIR/lib/" 2>/dev/null || true
  
  # Criar zip
  pushd "$TEMP_DIR" > /dev/null
  zip -r "$ZIP_FILE" . > /dev/null
  popd > /dev/null
  
  # Verificar se Lambda já existe
  if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null; then
    echo "  ⚠️  Lambda já existe, atualizando código..."
    aws lambda update-function-code \
      --function-name "$FUNCTION_NAME" \
      --zip-file "fileb://${ZIP_FILE}" \
      --region "$REGION" > /dev/null
  else
    echo "  ✨ Criando nova Lambda..."
    aws lambda create-function \
      --function-name "$FUNCTION_NAME" \
      --runtime nodejs18.x \
      --role "$ROLE_ARN" \
      --handler "handlers/${CATEGORY}/${HANDLER}.handler" \
      --zip-file "fileb://${ZIP_FILE}" \
      --timeout "$TIMEOUT" \
      --memory-size "$MEMORY" \
      --vpc-config "SubnetIds=${VPC_SUBNETS},SecurityGroupIds=${SECURITY_GROUP}" \
      --layers "$LAYER_ARN" \
      --environment "Variables={DATABASE_URL=${DATABASE_URL},NODE_ENV=production,COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}}" \
      --region "$REGION" > /dev/null
  fi
  
  # Cleanup
  rm -rf "$TEMP_DIR" "$ZIP_FILE"
  
  echo "  ✅ ${FUNCTION_NAME} deployado!"
  echo ""
}

# Deploy dos novos handlers
echo "=== Deployando handlers de Security ==="
create_lambda "start-security-scan" "start-security-scan" "security" 300 512

echo "=== Deployando handlers de Profiles ==="
create_lambda "get-user-organization" "get-user-organization" "profiles" 30 256

echo "=== Deployando handlers de Knowledge Base ==="
create_lambda "increment-article-helpful" "increment-article-helpful" "kb" 30 256
create_lambda "increment-article-views" "increment-article-views" "kb" 30 256
create_lambda "track-article-view-detailed" "track-article-view-detailed" "kb" 30 256

echo "=== Deployando handlers de Auth (MFA) ==="
create_lambda "mfa-list-factors" "mfa-handlers" "auth" 30 256
create_lambda "mfa-enroll" "mfa-handlers" "auth" 30 256
create_lambda "mfa-challenge-verify" "mfa-handlers" "auth" 30 256
create_lambda "mfa-unenroll" "mfa-handlers" "auth" 30 256

echo "=== Deployando handlers de Storage ==="
create_lambda "upload-attachment" "storage-handlers" "storage" 60 512
create_lambda "storage-download" "storage-handlers" "storage" 30 256
create_lambda "storage-delete" "storage-handlers" "storage" 30 256

echo ""
echo "🎉 Deploy concluído!"
echo ""
echo "Próximo passo: Criar endpoints no API Gateway"
