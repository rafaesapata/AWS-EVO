#!/bin/bash
# Script para completar a configuração E2E do sistema
# Execute este script quando o terminal estiver disponível

set -e

REST_API_ID="3l66kn0eaj"
PARENT_ID="n9gxy9"
AUTHORIZER_ID="ez5xqt"
REGION="us-east-1"
ACCOUNT_ID="383234048592"
LAYER_ARN="arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:2"
SG_ID="sg-04eb71f681cc651ae"
SUBNETS="subnet-0dbb444e4ef54d211,subnet-05383447666913b7b"
ROLE_ARN="arn:aws:iam::383234048592:role/evo-uds-v3-production-lambda-role"

echo "=== Completando Setup E2E ==="

# Função para criar Lambda se não existir
create_lambda_if_not_exists() {
    local FUNC_NAME=$1
    local HANDLER_PATH=$2
    local HANDLER_NAME=$3
    
    echo "Checking Lambda: $FUNC_NAME"
    
    if ! aws lambda get-function --function-name "$FUNC_NAME" --region $REGION 2>/dev/null; then
        echo "  Creating Lambda: $FUNC_NAME"
        zip -j /tmp/${HANDLER_NAME}.zip backend/dist/handlers/${HANDLER_PATH}/${HANDLER_NAME}.js
        
        aws lambda create-function \
            --function-name "$FUNC_NAME" \
            --runtime nodejs18.x \
            --handler "${HANDLER_NAME}.handler" \
            --role "$ROLE_ARN" \
            --zip-file "fileb:///tmp/${HANDLER_NAME}.zip" \
            --timeout 30 \
            --memory-size 256 \
            --layers "$LAYER_ARN" \
            --environment "Variables={COGNITO_USER_POOL_ID=us-east-1_qGmGkvmpL,NODE_ENV=production}" \
            --vpc-config SubnetIds=$SUBNETS,SecurityGroupIds=$SG_ID \
            --region $REGION
        
        echo "  ✅ Lambda created: $FUNC_NAME"
    else
        echo "  Lambda already exists: $FUNC_NAME"
    fi
}

# Função para criar endpoint completo
create_endpoint() {
    local ENDPOINT_NAME=$1
    local LAMBDA_NAME=$2
    
    echo ""
    echo "=== Creating endpoint: $ENDPOINT_NAME ==="
    
    # Check if resource exists
    RESOURCE_ID=$(aws apigateway get-resources \
        --rest-api-id $REST_API_ID \
        --region $REGION \
        --query "items[?pathPart=='$ENDPOINT_NAME'].id" \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$RESOURCE_ID" ]; then
        echo "  Creating resource..."
        RESOURCE_ID=$(aws apigateway create-resource \
            --rest-api-id $REST_API_ID \
            --parent-id $PARENT_ID \
            --path-part "$ENDPOINT_NAME" \
            --region $REGION \
            --query 'id' --output text)
    fi
    
    echo "  Resource ID: $RESOURCE_ID"
    
    # OPTIONS method
    aws apigateway put-method \
        --rest-api-id $REST_API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --authorization-type NONE \
        --region $REGION 2>/dev/null || true
    
    # OPTIONS integration
    aws apigateway put-integration \
        --rest-api-id $REST_API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --type MOCK \
        --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
        --region $REGION 2>/dev/null || true
    
    # OPTIONS method response
    aws apigateway put-method-response \
        --rest-api-id $REST_API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' \
        --region $REGION 2>/dev/null || true
    
    # OPTIONS integration response
    aws apigateway put-integration-response \
        --rest-api-id $REST_API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters "{\"method.response.header.Access-Control-Allow-Headers\":\"'Content-Type,Authorization,X-Requested-With'\",\"method.response.header.Access-Control-Allow-Methods\":\"'GET,POST,PUT,DELETE,OPTIONS'\",\"method.response.header.Access-Control-Allow-Origin\":\"'*'\"}" \
        --region $REGION 2>/dev/null || true
    
    # POST method
    aws apigateway put-method \
        --rest-api-id $REST_API_ID \
        --resource-id $RESOURCE_ID \
        --http-method POST \
        --authorization-type COGNITO_USER_POOLS \
        --authorizer-id $AUTHORIZER_ID \
        --region $REGION 2>/dev/null || true
    
    # POST integration
    LAMBDA_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$LAMBDA_NAME"
    aws apigateway put-integration \
        --rest-api-id $REST_API_ID \
        --resource-id $RESOURCE_ID \
        --http-method POST \
        --type AWS_PROXY \
        --integration-http-method POST \
        --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations" \
        --region $REGION 2>/dev/null || true
    
    # Lambda permission
    aws lambda add-permission \
        --function-name $LAMBDA_NAME \
        --statement-id "apigateway-${ENDPOINT_NAME}-$(date +%s)" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$REST_API_ID/*/POST/api/functions/$ENDPOINT_NAME" \
        --region $REGION 2>/dev/null || true
    
    echo "  ✅ Endpoint configured: $ENDPOINT_NAME"
}

# 1. Create missing Lambdas
echo ""
echo "=== Step 1: Creating Missing Lambdas ==="

create_lambda_if_not_exists "evo-uds-v3-production-kb-analytics-dashboard" "kb" "kb-analytics-dashboard"
create_lambda_if_not_exists "evo-uds-v3-production-analyze-cloudtrail" "security" "analyze-cloudtrail"
create_lambda_if_not_exists "evo-uds-v3-production-sync-organization-accounts" "organizations" "sync-organization-accounts"

# 2. Create missing endpoints
echo ""
echo "=== Step 2: Creating Missing Endpoints ==="

create_endpoint "kb-analytics-dashboard" "evo-uds-v3-production-kb-analytics-dashboard"
create_endpoint "analyze-cloudtrail" "evo-uds-v3-production-analyze-cloudtrail"
create_endpoint "sync-organization-accounts" "evo-uds-v3-production-sync-organization-accounts"

# 3. Deploy API Gateway
echo ""
echo "=== Step 3: Deploying API Gateway ==="
aws apigateway create-deployment \
    --rest-api-id $REST_API_ID \
    --stage-name prod \
    --region $REGION

echo ""
echo "=== Step 4: Testing Endpoints ==="
ORIGIN="https://evo.ai.udstec.io"

sleep 5

echo "Testing OPTIONS..."
curl -s -o /dev/null -w "kb-analytics-dashboard: %{http_code}\n" --max-time 10 -X OPTIONS "https://api-evo.ai.udstec.io/api/functions/kb-analytics-dashboard" -H "Origin: $ORIGIN"
curl -s -o /dev/null -w "analyze-cloudtrail: %{http_code}\n" --max-time 10 -X OPTIONS "https://api-evo.ai.udstec.io/api/functions/analyze-cloudtrail" -H "Origin: $ORIGIN"
curl -s -o /dev/null -w "sync-organization-accounts: %{http_code}\n" --max-time 10 -X OPTIONS "https://api-evo.ai.udstec.io/api/functions/sync-organization-accounts" -H "Origin: $ORIGIN"

echo ""
echo "=== ✅ Setup Complete ==="
echo ""
echo "All endpoints should now be functional."
echo "Test the frontend at: https://evo.ai.udstec.io"
