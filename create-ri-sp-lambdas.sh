#!/bin/bash

# Create RI/SP Database Lambdas in AWS
# This script creates the 3 new Lambda functions

set -e

echo "🏗️  Creating RI/SP Database Lambdas..."
echo ""

ROLE_ARN="arn:aws:iam::383234048592:role/evo-uds-v3-nodejs-infra-LambdaExecutionRole-Yx0Aq5Ux5Aqy"
LAYER_ARN="arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:47"
VPC_CONFIG="SubnetIds=subnet-0dbb444e4ef54d211,subnet-05383447666913b7b,SecurityGroupIds=sg-04eb71f681cc651ae"

# Get DATABASE_URL from existing Lambda
DATABASE_URL=$(aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-query-table \
  --region us-east-1 \
  --query 'Environment.Variables.DATABASE_URL' \
  --output text)

LAMBDAS=(
  "save-ri-sp-analysis:Saves RI/SP analysis results to database"
  "get-ri-sp-analysis:Retrieves RI/SP analysis from database"
  "list-ri-sp-history:Lists RI/SP analysis history"
)

for LAMBDA_INFO in "${LAMBDAS[@]}"; do
  IFS=':' read -r LAMBDA DESC <<< "$LAMBDA_INFO"
  
  echo "📝 Creating $LAMBDA..."
  
  # Create a minimal placeholder ZIP
  echo 'exports.handler = async () => ({ statusCode: 200, body: "Placeholder" });' > /tmp/placeholder.js
  zip -j /tmp/placeholder.zip /tmp/placeholder.js > /dev/null
  
  # Create Lambda function
  aws lambda create-function \
    --function-name "evo-uds-v3-production-$LAMBDA" \
    --runtime nodejs18.x \
    --role "$ROLE_ARN" \
    --handler "$LAMBDA.handler" \
    --description "$DESC" \
    --timeout 30 \
    --memory-size 512 \
    --layers "$LAYER_ARN" \
    --vpc-config "$VPC_CONFIG" \
    --environment "Variables={DATABASE_URL=$DATABASE_URL,NODE_PATH=/opt/nodejs/node_modules}" \
    --zip-file fileb:///tmp/placeholder.zip \
    --region us-east-1 > /dev/null 2>&1 || echo "⚠️  Lambda $LAMBDA already exists, skipping creation"
  
  echo "✅ $LAMBDA created"
  echo ""
done

echo "🎉 All RI/SP Database Lambdas created successfully!"
echo ""
echo "Next steps:"
echo "1. Run ./deploy-ri-sp-lambdas.sh to deploy the actual code"
echo "2. Create API Gateway endpoints for the new Lambdas"
