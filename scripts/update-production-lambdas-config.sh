#!/bin/bash
set -e

# Script para atualizar configuração de todas as Lambdas de produção
# Adiciona VPC config e environment variables

PROFILE="EVO_PRODUCTION"
REGION="us-east-1"
STACK_NAME="evo-uds-v3-prod-core"

echo "🔍 Obtendo outputs da stack $STACK_NAME..."

# Obter outputs da stack
VPC_ID=$(AWS_PROFILE=$PROFILE aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`VpcId`].OutputValue' \
  --output text)

SUBNET1=$(AWS_PROFILE=$PROFILE aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`PrivateSubnet1Id`].OutputValue' \
  --output text)

SUBNET2=$(AWS_PROFILE=$PROFILE aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`PrivateSubnet2Id`].OutputValue' \
  --output text)

SECURITY_GROUP=$(AWS_PROFILE=$PROFILE aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`LambdaSecurityGroupId`].OutputValue' \
  --output text)

DB_ENDPOINT=$(AWS_PROFILE=$PROFILE aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
  --output text)

USER_POOL_ID=$(AWS_PROFILE=$PROFILE aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

USER_POOL_CLIENT_ID=$(AWS_PROFILE=$PROFILE aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
  --output text)

HTTP_API_ID=$(AWS_PROFILE=$PROFILE aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`HttpApiId`].OutputValue' \
  --output text)

ATTACHMENTS_BUCKET=$(AWS_PROFILE=$PROFILE aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`AttachmentsBucketName`].OutputValue' \
  --output text)

echo "✅ VPC ID: $VPC_ID"
echo "✅ Subnet 1: $SUBNET1"
echo "✅ Subnet 2: $SUBNET2"
echo "✅ Security Group: $SECURITY_GROUP"
echo "✅ Database Endpoint: $DB_ENDPOINT"
echo "✅ User Pool ID: $USER_POOL_ID"
echo "✅ User Pool Client ID: $USER_POOL_CLIENT_ID"
echo "✅ HTTP API ID: $HTTP_API_ID"
echo "✅ Attachments Bucket: $ATTACHMENTS_BUCKET"

# Obter senha do banco do Secrets Manager
echo ""
echo "🔐 Obtendo senha do banco de dados..."
DB_PASSWORD=$(AWS_PROFILE=$PROFILE aws secretsmanager get-secret-value \
  --secret-id evo-uds-v3/production/database \
  --region $REGION \
  --query 'SecretString' \
  --output text | jq -r '.DB_PASSWORD')

# URL-encode da senha
DB_PASSWORD_ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$DB_PASSWORD', safe=''))")

DATABASE_URL="postgresql://evoadmin:${DB_PASSWORD_ENCODED}@${DB_ENDPOINT}:5432/evouds?schema=public"

echo "✅ DATABASE_URL configurada"

# Listar todas as Lambdas de produção
echo ""
echo "📋 Listando Lambdas de produção..."
FUNCTIONS=$(AWS_PROFILE=$PROFILE aws lambda list-functions \
  --region $REGION \
  --query 'Functions[?starts_with(FunctionName, `evo-uds-v3-prod-`)].FunctionName' \
  --output text)

TOTAL=$(echo "$FUNCTIONS" | wc -w | tr -d ' ')
echo "✅ Encontradas $TOTAL Lambdas"

# Contador
COUNT=0
FAILED=0

echo ""
echo "🚀 Atualizando configuração das Lambdas..."
echo ""

for FUNC in $FUNCTIONS; do
  COUNT=$((COUNT + 1))
  echo "[$COUNT/$TOTAL] Atualizando $FUNC..."
  
  # Atualizar VPC config
  if AWS_PROFILE=$PROFILE aws lambda update-function-configuration \
    --function-name "$FUNC" \
    --vpc-config "SubnetIds=$SUBNET1,$SUBNET2,SecurityGroupIds=$SECURITY_GROUP" \
    --region $REGION \
    --no-cli-pager > /dev/null 2>&1; then
    echo "  ✅ VPC config atualizada"
  else
    echo "  ❌ Erro ao atualizar VPC config"
    FAILED=$((FAILED + 1))
    continue
  fi
  
  # Aguardar atualização
  AWS_PROFILE=$PROFILE aws lambda wait function-updated \
    --function-name "$FUNC" \
    --region $REGION 2>/dev/null || true
  
  # Atualizar environment variables
  if AWS_PROFILE=$PROFILE aws lambda update-function-configuration \
    --function-name "$FUNC" \
    --environment "Variables={DATABASE_URL=$DATABASE_URL,COGNITO_USER_POOL_ID=$USER_POOL_ID,COGNITO_CLIENT_ID=$USER_POOL_CLIENT_ID,AWS_ACCOUNT_ID=523115032346,ATTACHMENTS_BUCKET=$ATTACHMENTS_BUCKET,NODE_ENV=production}" \
    --region $REGION \
    --no-cli-pager > /dev/null 2>&1; then
    echo "  ✅ Environment variables atualizadas"
  else
    echo "  ❌ Erro ao atualizar environment variables"
    FAILED=$((FAILED + 1))
    continue
  fi
  
  echo ""
done

echo ""
echo "=========================================="
echo "✅ Atualização concluída!"
echo "Total: $TOTAL Lambdas"
echo "Sucesso: $((TOTAL - FAILED))"
echo "Falhas: $FAILED"
echo "=========================================="
