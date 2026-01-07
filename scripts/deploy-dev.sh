#!/bin/bash
# =============================================================================
# Deploy para ambiente de DESENVOLVIMENTO
# Usa o perfil AWS: default
# =============================================================================

set -e

echo "🚀 Deploy para DESENVOLVIMENTO"
echo "================================"
echo "AWS Profile: default"
echo "Ambiente: development"
echo ""

# Exporta variáveis de ambiente
export AWS_PROFILE=default
export DEPLOY_ENV=development
export NODE_ENV=development

# Build do backend
echo "📦 Building backend..."
npm run build --prefix backend

# Build do frontend
echo "📦 Building frontend..."
npm run build -- --mode development

# Deploy CDK (infraestrutura)
echo "☁️  Deploying infrastructure..."
cd infra
npx cdk deploy --all --context env=development --require-approval never --profile default
cd ..

# Sync frontend para S3
echo "🌐 Syncing frontend to S3..."
# Obtém o bucket name do output do CDK ou usa o padrão
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name EvoUdsDevFrontendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
  --output text \
  --profile default 2>/dev/null || echo "evo-uds-dev-frontend")

aws s3 sync dist/ s3://$BUCKET_NAME --delete --profile default

# Invalida CloudFront cache
echo "🔄 Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name EvoUdsDevFrontendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text \
  --profile default 2>/dev/null || echo "")

if [ -n "$DISTRIBUTION_ID" ]; then
  aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*" --profile default
fi

echo ""
echo "✅ Deploy de DESENVOLVIMENTO concluído!"
echo "🌐 URL: https://dev-evo.ai.udstec.io"
