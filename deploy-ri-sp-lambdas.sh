#!/bin/bash

# Deploy RI/SP Database Lambdas
# This script deploys the 3 new Lambdas for RI/SP database persistence

set -e

echo "🚀 Deploying RI/SP Database Lambdas..."
echo ""

LAMBDAS=(
  "save-ri-sp-analysis"
  "get-ri-sp-analysis"
  "list-ri-sp-history"
)

LAYER_ARN="arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:47"

for LAMBDA in "${LAMBDAS[@]}"; do
  echo "📦 Deploying $LAMBDA..."
  
  # Create temp directory
  rm -rf /tmp/lambda-deploy-$LAMBDA
  mkdir -p /tmp/lambda-deploy-$LAMBDA
  
  # Copy handler and adjust imports
  sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/cost/$LAMBDA.js | \
  sed 's|require("../../types/|require("./types/|g' > /tmp/lambda-deploy-$LAMBDA/$LAMBDA.js
  
  # Copy dependencies
  cp -r backend/dist/lib /tmp/lambda-deploy-$LAMBDA/
  cp -r backend/dist/types /tmp/lambda-deploy-$LAMBDA/
  
  # Create ZIP
  pushd /tmp/lambda-deploy-$LAMBDA > /dev/null
  zip -r /tmp/$LAMBDA.zip . > /dev/null
  popd > /dev/null
  
  # Deploy code
  aws lambda update-function-code \
    --function-name "evo-uds-v3-production-$LAMBDA" \
    --zip-file fileb:///tmp/$LAMBDA.zip \
    --region us-east-1 > /dev/null
  
  # Update configuration
  aws lambda update-function-configuration \
    --function-name "evo-uds-v3-production-$LAMBDA" \
    --handler "$LAMBDA.handler" \
    --layers "$LAYER_ARN" \
    --region us-east-1 > /dev/null
  
  # Wait for update
  aws lambda wait function-updated \
    --function-name "evo-uds-v3-production-$LAMBDA" \
    --region us-east-1
  
  echo "✅ $LAMBDA deployed successfully"
  echo ""
done

echo "🎉 All RI/SP Database Lambdas deployed successfully!"
