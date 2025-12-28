#!/bin/bash
# Script para criar endpoints faltantes no API Gateway
# Execute quando a rede estiver disponível

set -e

REST_API_ID="3l66kn0eaj"
PARENT_ID="n9gxy9"
AUTHORIZER_ID="ez5xqt"
REGION="us-east-1"
ACCOUNT_ID="383234048592"

create_endpoint() {
    local ENDPOINT_NAME=$1
    local LAMBDA_NAME=$2
    
    echo "Creating endpoint: $ENDPOINT_NAME -> $LAMBDA_NAME"
    
    # Create resource
    RESOURCE_ID=$(aws apigateway create-resource \
        --rest-api-id $REST_API_ID \
        --parent-id $PARENT_ID \
        --path-part "$ENDPOINT_NAME" \
        --region $REGION \
        --query 'id' --output text 2>/dev/null || echo "")
    
    if [ -z "$RESOURCE_ID" ]; then
        # Resource may already exist, try to get it
        RESOURCE_ID=$(aws apigateway get-resources \
            --rest-api-id $REST_API_ID \
            --region $REGION \
            --query "items[?pathPart=='$ENDPOINT_NAME'].id" \
            --output text)
    fi
    
    echo "  Resource ID: $RESOURCE_ID"
    
    # Create OPTIONS method (CORS)
    aws apigateway put-method \
        --rest-api-id $REST_API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --authorization-type NONE \
        --region $REGION 2>/dev/null || true
    
    # Create OPTIONS integration
    aws apigateway put-integration \
        --rest-api-id $REST_API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --type MOCK \
        --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
        --region $REGION 2>/dev/null || true
    
    # Create OPTIONS method response
    aws apigateway put-method-response \
        --rest-api-id $REST_API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' \
        --region $REGION 2>/dev/null || true
    
    # Create OPTIONS integration response
    aws apigateway put-integration-response \
        --rest-api-id $REST_API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters "{\"method.response.header.Access-Control-Allow-Headers\":\"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token'\",\"method.response.header.Access-Control-Allow-Methods\":\"'GET,POST,PUT,DELETE,OPTIONS'\",\"method.response.header.Access-Control-Allow-Origin\":\"'*'\"}" \
        --region $REGION 2>/dev/null || true
    
    # Create POST method with Cognito authorizer
    aws apigateway put-method \
        --rest-api-id $REST_API_ID \
        --resource-id $RESOURCE_ID \
        --http-method POST \
        --authorization-type COGNITO_USER_POOLS \
        --authorizer-id $AUTHORIZER_ID \
        --region $REGION 2>/dev/null || true
    
    # Create POST integration
    LAMBDA_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$LAMBDA_NAME"
    aws apigateway put-integration \
        --rest-api-id $REST_API_ID \
        --resource-id $RESOURCE_ID \
        --http-method POST \
        --type AWS_PROXY \
        --integration-http-method POST \
        --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations" \
        --region $REGION 2>/dev/null || true
    
    # Add Lambda permission
    aws lambda add-permission \
        --function-name $LAMBDA_NAME \
        --statement-id "apigateway-$ENDPOINT_NAME-$(date +%s)" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$REST_API_ID/*/POST/api/functions/$ENDPOINT_NAME" \
        --region $REGION 2>/dev/null || true
    
    echo "  ✅ Endpoint $ENDPOINT_NAME configured"
}

echo "=== Creating Missing API Gateway Endpoints ==="

# Create endpoints
create_endpoint "log-audit" "evo-uds-v3-production-log-audit"
create_endpoint "disable-cognito-user" "evo-uds-v3-production-disable-cognito-user"
create_endpoint "increment_article_views" "evo-uds-v3-production-kb-article-tracking"
create_endpoint "increment_article_helpful" "evo-uds-v3-production-kb-article-tracking"
create_endpoint "track_article_view_detailed" "evo-uds-v3-production-kb-article-tracking"

# Deploy API
echo ""
echo "=== Deploying API Gateway ==="
aws apigateway create-deployment \
    --rest-api-id $REST_API_ID \
    --stage-name prod \
    --region $REGION

echo ""
echo "✅ All endpoints created and deployed!"
echo ""
echo "Test endpoints:"
echo "  curl -X OPTIONS https://api-evo.ai.udstec.io/api/functions/log-audit"
echo "  curl -X OPTIONS https://api-evo.ai.udstec.io/api/functions/disable-cognito-user"
