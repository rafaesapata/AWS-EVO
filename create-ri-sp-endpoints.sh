#!/bin/bash

# Create API Gateway endpoints for RI/SP Database Lambdas

set -e

API_ID="3l66kn0eaj"
PARENT_ID="n9gxy9"  # /api/functions
AUTHORIZER_ID="joelbs"
REGION="us-east-1"
ACCOUNT_ID="383234048592"

ENDPOINTS=(
  "get-ri-sp-analysis"
  "list-ri-sp-history"
)

echo "🔗 Creating API Gateway endpoints for RI/SP Database Lambdas..."
echo ""

for ENDPOINT in "${ENDPOINTS[@]}"; do
  echo "📝 Creating endpoint: /api/functions/$ENDPOINT"
  
  # 1. Create resource
  RESOURCE_ID=$(aws apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $PARENT_ID \
    --path-part $ENDPOINT \
    --region $REGION \
    --query 'id' \
    --output text 2>/dev/null || echo "exists")
  
  if [ "$RESOURCE_ID" = "exists" ]; then
    echo "⚠️  Resource already exists, getting ID..."
    RESOURCE_ID=$(aws apigateway get-resources \
      --rest-api-id $API_ID \
      --region $REGION \
      --query "items[?path=='/api/functions/$ENDPOINT'].id" \
      --output text)
  fi
  
  echo "   Resource ID: $RESOURCE_ID"
  
  # 2. Create OPTIONS method
  aws apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method OPTIONS \
    --authorization-type NONE \
    --region $REGION > /dev/null 2>&1 || true
  
  aws apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method OPTIONS \
    --type MOCK \
    --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
    --region $REGION > /dev/null 2>&1 || true
  
  aws apigateway put-method-response \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' \
    --region $REGION > /dev/null 2>&1 || true
  
  aws apigateway put-integration-response \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \
    --region $REGION > /dev/null 2>&1 || true
  
  # 3. Create POST method with Cognito
  aws apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method POST \
    --authorization-type COGNITO_USER_POOLS \
    --authorizer-id $AUTHORIZER_ID \
    --region $REGION > /dev/null 2>&1 || true
  
  aws apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/arn:aws:lambda:$REGION:$ACCOUNT_ID:function:evo-uds-v3-production-$ENDPOINT/invocations" \
    --region $REGION > /dev/null 2>&1 || true
  
  # 4. Add Lambda permission
  aws lambda add-permission \
    --function-name "evo-uds-v3-production-$ENDPOINT" \
    --statement-id "apigateway-$ENDPOINT" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/POST/api/functions/$ENDPOINT" \
    --region $REGION > /dev/null 2>&1 || echo "   Permission already exists"
  
  echo "✅ Endpoint created: /api/functions/$ENDPOINT"
  echo ""
done

# Deploy API Gateway
echo "🚀 Deploying API Gateway..."
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION > /dev/null

echo ""
echo "🎉 All endpoints created and deployed successfully!"
echo ""
echo "Endpoints available at:"
for ENDPOINT in "${ENDPOINTS[@]}"; do
  echo "  POST https://api-evo.ai.udstec.io/api/functions/$ENDPOINT"
done
