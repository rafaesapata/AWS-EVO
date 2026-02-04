#!/bin/bash
# Deploy Azure Lambda Functions
# This script creates and deploys all Azure-related Lambda functions

set -e

REGION="us-east-1"
ROLE_ARN="arn:aws:iam::971354623291:role/evo-uds-v3-sandbox-lambda-nodejs-role"
LAYER_ARN="arn:aws:lambda:us-east-1:971354623291:layer:evo-prisma-deps-layer:92"
SUBNET_IDS="subnet-0dbb444e4ef54d211,subnet-05383447666913b7b"
SECURITY_GROUP="sg-04eb71f681cc651ae"
PREFIX="evo-uds-v3-sandbox"

# Environment variables
DATABASE_URL='postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public'
COGNITO_USER_POOL_ID="us-east-1_qGmGkvmpL"

echo "🚀 Starting Azure Lambda deployment..."

# Create temp directory
rm -rf /tmp/azure-lambda-deploy
mkdir -p /tmp/azure-lambda-deploy

# Copy lib and types
echo "📦 Copying shared libraries..."
cp -r backend/dist/lib /tmp/azure-lambda-deploy/
cp -r backend/dist/types /tmp/azure-lambda-deploy/

deploy_lambda() {
    local LAMBDA_NAME=$1
    local HANDLER_PATH=$2
    local FULL_NAME="${PREFIX}-${LAMBDA_NAME}"
    local HANDLER_FILE=$(basename "$HANDLER_PATH")
    
    echo ""
    echo "=========================================="
    echo "📦 Processing: ${FULL_NAME}"
    echo "=========================================="
    
    # Copy and fix imports
    echo "  → Fixing imports for ${HANDLER_FILE}.js..."
    sed 's|require("../../lib/|require("./lib/|g' "backend/dist/handlers/${HANDLER_PATH}.js" | \
    sed 's|require("../../types/|require("./types/|g' > "/tmp/azure-lambda-deploy/${HANDLER_FILE}.js"
    
    # Create ZIP
    echo "  → Creating ZIP..."
    rm -f /tmp/azure-lambda.zip
    pushd /tmp/azure-lambda-deploy > /dev/null
    zip -r /tmp/azure-lambda.zip . -x "*.DS_Store" > /dev/null
    popd > /dev/null
    
    # Check if Lambda exists
    if aws lambda get-function --function-name "$FULL_NAME" --region "$REGION" > /dev/null 2>&1; then
        echo "  → Updating existing Lambda..."
        aws lambda update-function-code \
            --function-name "$FULL_NAME" \
            --zip-file fileb:///tmp/azure-lambda.zip \
            --region "$REGION" > /dev/null
    else
        echo "  → Creating new Lambda..."
        aws lambda create-function \
            --function-name "$FULL_NAME" \
            --runtime nodejs18.x \
            --role "$ROLE_ARN" \
            --handler "${HANDLER_FILE}.handler" \
            --zip-file fileb:///tmp/azure-lambda.zip \
            --timeout 30 \
            --memory-size 256 \
            --vpc-config "SubnetIds=${SUBNET_IDS},SecurityGroupIds=${SECURITY_GROUP}" \
            --layers "$LAYER_ARN" \
            --environment "Variables={DATABASE_URL=${DATABASE_URL},NODE_ENV=production,COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}}" \
            --region "$REGION" > /dev/null
    fi
    
    # Remove handler file for next iteration
    rm -f "/tmp/azure-lambda-deploy/${HANDLER_FILE}.js"
    
    echo "  ✅ ${FULL_NAME} deployed!"
}

# Deploy all lambdas
deploy_lambda "validate-azure-credentials" "azure/validate-azure-credentials"
deploy_lambda "save-azure-credentials" "azure/save-azure-credentials"
deploy_lambda "list-azure-credentials" "azure/list-azure-credentials"
deploy_lambda "delete-azure-credentials" "azure/delete-azure-credentials"
deploy_lambda "azure-security-scan" "azure/azure-security-scan"
deploy_lambda "azure-fetch-costs" "azure/azure-fetch-costs"
deploy_lambda "azure-resource-inventory" "azure/azure-resource-inventory"
deploy_lambda "azure-activity-logs" "azure/azure-activity-logs"
deploy_lambda "list-cloud-credentials" "cloud/list-cloud-credentials"
deploy_lambda "start-azure-security-scan" "azure/start-azure-security-scan"
deploy_lambda "azure-defender-scan" "azure/azure-defender-scan"
deploy_lambda "azure-compliance-scan" "azure/azure-compliance-scan"
deploy_lambda "azure-well-architected-scan" "azure/azure-well-architected-scan"
deploy_lambda "azure-cost-optimization" "azure/azure-cost-optimization"
deploy_lambda "azure-reservations-analyzer" "azure/azure-reservations-analyzer"

echo ""
echo "=========================================="
echo "✅ All Azure Lambdas deployed successfully!"
echo "=========================================="
