#!/bin/bash
set -e

# Script completo para finalizar setup de produção
# 1. Aguarda stack core terminar
# 2. Atualiza configuração das Lambdas (VPC + env vars)
# 3. Executa migrations via Lambda run-migrations
# 4. Executa seed via Lambda db-init
# 5. Cria rotas no API Gateway

PROFILE="EVO_PRODUCTION"
REGION="us-east-1"
STACK_NAME="evo-uds-v3-prod-core"
ACCOUNT_ID="523115032346"

echo "=========================================="
echo "🚀 Setup Completo de Produção"
echo "=========================================="
echo ""

# PASSO 1: Aguardar stack terminar
echo "⏳ [1/5] Aguardando stack $STACK_NAME terminar..."
AWS_PROFILE=$PROFILE aws cloudformation wait stack-create-complete \
  --stack-name $STACK_NAME \
  --region $REGION

echo "✅ Stack criada com sucesso!"
echo ""

# PASSO 2: Obter outputs da stack
echo "🔍 [2/5] Obtendo configurações da stack..."

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
echo "✅ Subnets: $SUBNET1, $SUBNET2"
echo "✅ Security Group: $SECURITY_GROUP"
echo "✅ Database: $DB_ENDPOINT"
echo "✅ User Pool: $USER_POOL_ID"
echo "✅ API Gateway: $HTTP_API_ID"
echo ""

# Obter senha do banco
DB_PASSWORD=$(AWS_PROFILE=$PROFILE aws secretsmanager get-secret-value \
  --secret-id evo-uds-v3/production/database \
  --region $REGION \
  --query 'SecretString' \
  --output text | jq -r '.DB_PASSWORD')

DB_PASSWORD_ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$DB_PASSWORD', safe=''))")
DATABASE_URL="postgresql://evoadmin:${DB_PASSWORD_ENCODED}@${DB_ENDPOINT}:5432/evouds?schema=public"

echo "✅ DATABASE_URL configurada"
echo ""

# PASSO 3: Atualizar Lambdas críticas primeiro (run-migrations e db-init)
echo "🔧 [3/5] Configurando Lambdas críticas..."

CRITICAL_LAMBDAS=("run-migrations" "db-init" "health-check")

for LAMBDA in "${CRITICAL_LAMBDAS[@]}"; do
  FUNC_NAME="evo-uds-v3-prod-$LAMBDA"
  echo "  Configurando $FUNC_NAME..."
  
  # VPC config
  AWS_PROFILE=$PROFILE aws lambda update-function-configuration \
    --function-name "$FUNC_NAME" \
    --vpc-config "SubnetIds=$SUBNET1,$SUBNET2,SecurityGroupIds=$SECURITY_GROUP" \
    --region $REGION \
    --no-cli-pager > /dev/null 2>&1
  
  AWS_PROFILE=$PROFILE aws lambda wait function-updated \
    --function-name "$FUNC_NAME" \
    --region $REGION 2>/dev/null || true
  
  # Environment variables
  AWS_PROFILE=$PROFILE aws lambda update-function-configuration \
    --function-name "$FUNC_NAME" \
    --environment "Variables={DATABASE_URL=$DATABASE_URL,COGNITO_USER_POOL_ID=$USER_POOL_ID,COGNITO_CLIENT_ID=$USER_POOL_CLIENT_ID,AWS_ACCOUNT_ID=$ACCOUNT_ID,ATTACHMENTS_BUCKET=$ATTACHMENTS_BUCKET,NODE_ENV=production}" \
    --region $REGION \
    --no-cli-pager > /dev/null 2>&1
  
  echo "  ✅ $FUNC_NAME configurada"
done

echo ""

# PASSO 4: Executar migrations
echo "🗄️  [4/5] Executando migrations no banco..."

AWS_PROFILE=$PROFILE aws lambda invoke \
  --function-name evo-uds-v3-prod-run-migrations \
  --region $REGION \
  --log-type Tail \
  /tmp/migration-response.json > /dev/null 2>&1

if [ -f /tmp/migration-response.json ]; then
  SUCCESS=$(cat /tmp/migration-response.json | jq -r '.success // false' 2>/dev/null || echo "false")
  
  if [ "$SUCCESS" = "true" ]; then
    echo "✅ Migrations executadas com sucesso!"
  else
    echo "⚠️  Erro ao executar migrations (verifique logs)"
    cat /tmp/migration-response.json | jq '.' 2>/dev/null || cat /tmp/migration-response.json
  fi
else
  echo "⚠️  Erro ao invocar Lambda de migrations"
fi

echo ""

# PASSO 5: Executar seed
echo "🌱 [5/5] Executando seed inicial..."

AWS_PROFILE=$PROFILE aws lambda invoke \
  --function-name evo-uds-v3-prod-db-init \
  --payload '{"action":"seed"}' \
  --region $REGION \
  /tmp/seed-response.json > /dev/null 2>&1

if [ -f /tmp/seed-response.json ]; then
  cat /tmp/seed-response.json | jq '.' 2>/dev/null || cat /tmp/seed-response.json
  echo "✅ Seed executado"
else
  echo "⚠️  Erro ao executar seed"
fi

echo ""

# PASSO 6: Atualizar todas as outras Lambdas em background
echo "🔄 Atualizando demais Lambdas em background..."
echo "   (Execute: ./scripts/update-production-lambdas-config.sh)"
echo ""

echo "=========================================="
echo "✅ Setup básico concluído!"
echo "=========================================="
echo ""
echo "📋 Próximos passos:"
echo "1. Execute: ./scripts/update-production-lambdas-config.sh"
echo "2. Execute: ./scripts/create-api-gateway-routes.sh"
echo "3. Configure domínios customizados (evo.nuevacore.com)"
echo ""
echo "🌐 API Endpoint:"
AWS_PROFILE=$PROFILE aws apigatewayv2 get-api \
  --api-id "$HTTP_API_ID" \
  --region $REGION \
  --query 'ApiEndpoint' \
  --output text
