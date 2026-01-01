#!/bin/bash
# Script para atualizar variáveis de ambiente de todas as Lambdas
# Centraliza configurações para evitar hardcoding

set -e

# Configurações centralizadas
AWS_REGION="us-east-1"
COGNITO_USER_POOL_ID="us-east-1_cnesJ48lR"
COGNITO_CLIENT_ID="4p0okvsr983v2f8rrvgpls76d6"
DATABASE_URL="postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public"
NODE_ENV="production"
WEBAUTHN_RP_ID="evo.ai.udstec.io"
WEBAUTHN_RP_NAME="EVO UDS Platform"
LICENSE_API_URL="https://mhutjgpipiklepvjrboi.supabase.co/functions/v1/validate-license"

# Prefixo das Lambdas
LAMBDA_PREFIX="evo-uds-v3-production"

echo "🔄 Atualizando variáveis de ambiente das Lambdas..."
echo "   User Pool ID: $COGNITO_USER_POOL_ID"
echo "   Region: $AWS_REGION"
echo ""

# Lista de Lambdas que precisam do COGNITO_USER_POOL_ID
COGNITO_LAMBDAS=(
  "create-cognito-user"
  "disable-cognito-user"
  "admin-manage-user"
  "mfa-enroll"
  "mfa-list-factors"
  "mfa-unenroll"
  "mfa-challenge-verify"
  "webauthn-register"
  "webauthn-authenticate"
  "delete-webauthn-credential"
  "create-organization-account"
  "create-with-organization"
)

# Atualizar Lambdas que precisam do Cognito
for lambda in "${COGNITO_LAMBDAS[@]}"; do
  FUNCTION_NAME="${LAMBDA_PREFIX}-${lambda}"
  
  echo "📦 Atualizando $FUNCTION_NAME..."
  
  # Verificar se a Lambda existe
  if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$AWS_REGION" &>/dev/null; then
    aws lambda update-function-configuration \
      --function-name "$FUNCTION_NAME" \
      --environment "Variables={DATABASE_URL=$DATABASE_URL,NODE_ENV=$NODE_ENV,COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID,WEBAUTHN_RP_ID=$WEBAUTHN_RP_ID,WEBAUTHN_RP_NAME=$WEBAUTHN_RP_NAME}" \
      --region "$AWS_REGION" \
      --output text \
      --query 'FunctionName' 2>/dev/null && echo "   ✅ Atualizado" || echo "   ⚠️ Erro ao atualizar"
  else
    echo "   ⏭️ Lambda não existe, pulando..."
  fi
done

echo ""
echo "✅ Atualização concluída!"
echo ""
echo "📋 Variáveis centralizadas:"
echo "   COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID"
echo "   WEBAUTHN_RP_ID=$WEBAUTHN_RP_ID"
echo "   NODE_ENV=$NODE_ENV"
