#!/bin/bash
# =============================================================================
# Deploy para ambiente de PRODUÇÃO
# Usa o perfil AWS: EVO_PRODUCTION
# =============================================================================

set -e

echo "🚀 Deploy para PRODUÇÃO"
echo "================================"
echo "AWS Profile: EVO_PRODUCTION"
echo "Ambiente: production"
echo ""

# Confirmação de segurança
read -p "⚠️  Você está prestes a fazer deploy em PRODUÇÃO. Continuar? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "❌ Deploy cancelado."
  exit 1
fi

# Exporta variáveis de ambiente
export AWS_PROFILE=EVO_PRODUCTION
export DEPLOY_ENV=production
export NODE_ENV=production

# Build do backend
echo "📦 Building backend..."
npm run build --prefix backend

# Build do frontend
echo "📦 Building frontend..."
npm run build -- --mode production

# Deploy CDK (infraestrutura)
echo "☁️  Deploying infrastructure..."
cd infra
npx cdk deploy --all --context env=production --require-approval broadening --profile EVO_PRODUCTION
cd ..

# Sync frontend para S3
echo "🌐 Syncing frontend to S3..."
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name EvoUdsProdFrontendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
  --output text \
  --profile EVO_PRODUCTION 2>/dev/null || echo "evo-uds-prod-frontend")

aws s3 sync dist/ s3://$BUCKET_NAME --delete --profile EVO_PRODUCTION

# Invalida CloudFront cache
echo "🔄 Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name EvoUdsProdFrontendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text \
  --profile EVO_PRODUCTION 2>/dev/null || echo "")

if [ -n "$DISTRIBUTION_ID" ]; then
  aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*" --profile EVO_PRODUCTION
fi

echo ""
echo "✅ Deploy de PRODUÇÃO concluído!"
echo "🌐 URL: https://evo.ai.udstec.io"
