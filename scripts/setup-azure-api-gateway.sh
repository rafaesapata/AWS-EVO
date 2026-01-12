#!/bin/bash
# Setup API Gateway endpoints for Azure Lambda functions

set -e

REGION="us-east-1"
REST_API_ID="3l66kn0eaj"
PARENT_ID="n9gxy9"  # /api/functions resource ID
AUTHORIZER_ID="joelbs"  # Cognito authorizer
ACCOUNT_ID="383234048592"
PREFIX="evo-uds-v3-production"

# CORS headers
CORS_HEADERS='{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}'
CORS_RESPONSE='{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}'

create_endpoint() {
    local ENDPOINT_NAME=$1
    local LAMBDA_NAME="${PREFIX}-${ENDPOINT_NAME}"
    local LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_NAME}"
    
    echo ""
    echo "=========================================="
    echo "🔧 Creating endpoint: /api/functions/${ENDPOINT_NAME}"
    echo "=========================================="
    
    # Check if resource already exists
    RESOURCE_ID=$(aws apigateway get-resources --rest-api-id "$REST_API_ID" --region "$REGION" \
        --query "items[?pathPart=='${ENDPOINT_NAME}'].id" --output text 2>/dev/null)
    
    if [ -z "$RESOURCE_ID" ] || [ "$RESOURCE_ID" == "None" ]; then
        echo "  → Creating resource..."
        RESOURCE_ID=$(aws apigateway create-resource \
            --rest-api-id "$REST_API_ID" \
            --parent-id "$PARENT_ID" \
            --path-part "$ENDPOINT_NAME" \
            --region "$REGION" \
            --query 'id' --output text)
    else
        echo "  → Resource already exists: $RESOURCE_ID"
    fi
    
    # Create OPTIONS method (CORS)
    echo "  → Setting up OPTIONS method..."
    aws apigateway put-method \
        --rest-api-id "$REST_API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --authorization-type NONE \
        --region "$REGION" > /dev/null 2>&1 || true
    
    aws apigateway put-integration \
        --rest-api-id "$REST_API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --type MOCK \
        --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
        --region "$REGION" > /dev/null 2>&1 || true
    
    aws apigateway put-method-response \
        --rest-api-id "$REST_API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters "$CORS_HEADERS" \
        --region "$REGION" > /dev/null 2>&1 || true
    
    aws apigateway put-integration-response \
        --rest-api-id "$REST_API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters "$CORS_RESPONSE" \
        --region "$REGION" > /dev/null 2>&1 || true
    
    # Create POST method with Cognito auth
    echo "  → Setting up POST method..."
    aws apigateway put-method \
        --rest-api-id "$REST_API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method POST \
        --authorization-type COGNITO_USER_POOLS \
        --authorizer-id "$AUTHORIZER_ID" \
        --region "$REGION" > /dev/null 2>&1 || true
    
    aws apigateway put-integration \
        --rest-api-id "$REST_API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method POST \
        --type AWS_PROXY \
        --integration-http-method POST \
        --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
        --region "$REGION" > /dev/null 2>&1 || true
    
    # Add Lambda permission
    echo "  → Adding Lambda permission..."
    aws lambda add-permission \
        --function-name "$LAMBDA_NAME" \
        --statement-id "apigateway-${ENDPOINT_NAME}-$(date +%s)" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${REST_API_ID}/*/POST/${ENDPOINT_NAME}" \
        --region "$REGION" > /dev/null 2>&1 || true
    
    echo "  ✅ Endpoint created!"
}

echo "🚀 Setting up API Gateway endpoints for Azure..."

# Create all endpoints
create_endpoint "validate-azure-credentials"
create_endpoint "save-azure-credentials"
create_endpoint "list-azure-credentials"
create_endpoint "delete-azure-credentials"
create_endpoint "azure-security-scan"
create_endpoint "start-azure-security-scan"
create_endpoint "azure-fetch-costs"
create_endpoint "azure-resource-inventory"
create_endpoint "azure-activity-logs"
create_endpoint "azure-defender-scan"
create_endpoint "azure-compliance-scan"
create_endpoint "azure-well-architected-scan"
create_endpoint "azure-cost-optimization"
create_endpoint "azure-reservations-analyzer"
create_endpoint "list-cloud-credentials"

# Deploy API
echo ""
echo "=========================================="
echo "🚀 Deploying API Gateway..."
echo "=========================================="
aws apigateway create-deployment \
    --rest-api-id "$REST_API_ID" \
    --stage-name prod \
    --region "$REGION" > /dev/null

echo ""
echo "=========================================="
echo "✅ All API Gateway endpoints configured!"
echo "=========================================="
