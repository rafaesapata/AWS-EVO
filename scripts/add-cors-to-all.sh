#!/bin/bash
set -e

REST_API_ID="3l66kn0eaj"

# Headers permitidos incluindo X-Correlation-ID
ALLOWED_HEADERS="'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token'"

# Get all function resources
RESOURCE_IDS=$(aws apigateway get-resources --rest-api-id "$REST_API_ID" --query "items[?contains(path, '/api/functions/')].id" --output text)

echo "Adding CORS OPTIONS method to all /api/functions/* endpoints..."

for RESOURCE_ID in $RESOURCE_IDS; do
  echo "Processing resource: $RESOURCE_ID"
  
  # Create OPTIONS method
  aws apigateway put-method \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --authorization-type NONE 2>/dev/null || echo "  OPTIONS method exists"
  
  # Create OPTIONS integration (MOCK)
  aws apigateway put-integration \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --type MOCK \
    --request-templates '{"application/json":"{\"statusCode\":200}"}' 2>/dev/null || true
  
  # Create OPTIONS method response
  aws apigateway put-method-response \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' 2>/dev/null || true
  
  # Create OPTIONS integration response with proper headers
  aws apigateway put-integration-response \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters "{\"method.response.header.Access-Control-Allow-Headers\":${ALLOWED_HEADERS},\"method.response.header.Access-Control-Allow-Methods\":\"'GET,POST,PUT,DELETE,OPTIONS'\",\"method.response.header.Access-Control-Allow-Origin\":\"'*'\"}" 2>/dev/null || true
  
  echo "  Done"
done

echo ""
echo "Deploying API Gateway..."
aws apigateway create-deployment \
  --rest-api-id "$REST_API_ID" \
  --stage-name prod \
  --description "Added CORS OPTIONS to all endpoints with X-Correlation-ID"

echo "All done!"
