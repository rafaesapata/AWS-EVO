#!/bin/bash
# Deploy Executive Dashboard Lambda
# This script creates and deploys the new get-executive-dashboard Lambda

set -e

REGION="us-east-1"
FUNCTION_NAME="evo-uds-v3-production-get-executive-dashboard"
REST_API_ID="3l66kn0eaj"
PARENT_RESOURCE_ID="n9gxy9"  # /api/functions
AUTHORIZER_ID="ez5xqt"
LAYER_ARN="arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:2"
ACCOUNT_ID="383234048592"

echo "🚀 Deploying Executive Dashboard Lambda..."

# 1. Build backend
echo "📦 Building backend..."
npm run build --prefix backend

# 2. Create deployment package
echo "📦 Creating deployment package..."
rm -rf /tmp/executive-dashboard-lambda
mkdir -p /tmp/executive-dashboard-lambda

# Copy handler
cp backend/dist/handlers/dashboard/get-executive-dashboard.js /tmp/executive-dashboard-lambda/

# Copy lib dependencies
cp -r backend/dist/lib /tmp/executive-dashboard-lambda/
cp -r backend/dist/types /tmp/executive-dashboard-lambda/

# Create zip
pushd /tmp/executive-dashboard-lambda
zip -r /tmp/executive-dashboard-lambda.zip .
popd

# 3. Check if Lambda exists
echo "🔍 Checking if Lambda exists..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null; then
    echo "📝 Updating existing Lambda..."
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --zip-file fileb:///tmp/executive-dashboard-lambda.zip \
        --region "$REGION"
else
    echo "🆕 Creating new Lambda..."
    
    # Get VPC config from existing Lambda
    VPC_CONFIG=$(aws lambda get-function-configuration \
        --function-name "evo-uds-v3-production-security-scan" \
        --region "$REGION" \
        --query 'VpcConfig' \
        --output json)
    
    SUBNET_IDS=$(echo "$VPC_CONFIG" | jq -r '.SubnetIds | join(",")')
    SECURITY_GROUP_IDS=$(echo "$VPC_CONFIG" | jq -r '.SecurityGroupIds | join(",")')
    
    # Get role from existing Lambda
    ROLE_ARN=$(aws lambda get-function-configuration \
        --function-name "evo-uds-v3-production-security-scan" \
        --region "$REGION" \
        --query 'Role' \
        --output text)
    
    # Get environment from existing Lambda
    ENV_VARS=$(aws lambda get-function-configuration \
        --function-name "evo-uds-v3-production-security-scan" \
        --region "$REGION" \
        --query 'Environment.Variables' \
        --output json)
    
    aws lambda create-function \
        --function-name "$FUNCTION_NAME" \
        --runtime nodejs20.x \
        --handler get-executive-dashboard.handler \
        --role "$ROLE_ARN" \
        --zip-file fileb:///tmp/executive-dashboard-lambda.zip \
        --timeout 30 \
        --memory-size 1024 \
        --layers "$LAYER_ARN" \
        --vpc-config "SubnetIds=$SUBNET_IDS,SecurityGroupIds=$SECURITY_GROUP_IDS" \
        --environment "Variables=$ENV_VARS" \
        --region "$REGION"
fi

# Wait for Lambda to be ready
echo "⏳ Waiting for Lambda to be ready..."
aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null || true

# 4. Create API Gateway resource
echo "🌐 Setting up API Gateway..."

# Check if resource exists
RESOURCE_ID=$(aws apigateway get-resources \
    --rest-api-id "$REST_API_ID" \
    --region "$REGION" \
    --query "items[?pathPart=='get-executive-dashboard'].id" \
    --output text)

if [ -z "$RESOURCE_ID" ] || [ "$RESOURCE_ID" == "None" ]; then
    echo "🆕 Creating API Gateway resource..."
    RESOURCE_ID=$(aws apigateway create-resource \
        --rest-api-id "$REST_API_ID" \
        --parent-id "$PARENT_RESOURCE_ID" \
        --path-part "get-executive-dashboard" \
        --region "$REGION" \
        --query 'id' \
        --output text)
    
    # Create OPTIONS method (CORS)
    echo "📝 Creating OPTIONS method..."
    aws apigateway put-method \
        --rest-api-id "$REST_API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --authorization-type NONE \
        --region "$REGION"
    
    aws apigateway put-integration \
        --rest-api-id "$REST_API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --type MOCK \
        --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
        --region "$REGION"
    
    aws apigateway put-method-response \
        --rest-api-id "$REST_API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' \
        --region "$REGION"
    
    aws apigateway put-integration-response \
        --rest-api-id "$REST_API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \
        --region "$REGION"
    
    # Create POST method with Cognito
    echo "📝 Creating POST method..."
    aws apigateway put-method \
        --rest-api-id "$REST_API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method POST \
        --authorization-type COGNITO_USER_POOLS \
        --authorizer-id "$AUTHORIZER_ID" \
        --region "$REGION"
    
    aws apigateway put-integration \
        --rest-api-id "$REST_API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method POST \
        --type AWS_PROXY \
        --integration-http-method POST \
        --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FUNCTION_NAME/invocations" \
        --region "$REGION"
    
    # Add Lambda permission
    echo "🔐 Adding Lambda permission..."
    aws lambda add-permission \
        --function-name "$FUNCTION_NAME" \
        --statement-id "apigateway-invoke-$(date +%s)" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$REST_API_ID/*/POST/api/functions/get-executive-dashboard" \
        --region "$REGION" 2>/dev/null || true
fi

# 5. Deploy API
echo "🚀 Deploying API Gateway..."
aws apigateway create-deployment \
    --rest-api-id "$REST_API_ID" \
    --stage-name prod \
    --region "$REGION"

echo "✅ Executive Dashboard Lambda deployed successfully!"
echo ""
echo "Endpoint: POST https://api-evo.ai.udstec.io/api/functions/get-executive-dashboard"
