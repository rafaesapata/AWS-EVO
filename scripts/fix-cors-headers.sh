#!/bin/bash
set -e

REST_API_ID="3l66kn0eaj"

# Headers permitidos incluindo X-Correlation-ID
ALLOWED_HEADERS="'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token'"

# Get all function resources
RESOURCE_IDS=$(aws apigateway get-resources --rest-api-id "$REST_API_ID" --query "items[?contains(path, '/api/functions/')].id" --output text)

echo "Updating CORS headers for all /api/functions/* endpoints..."

for RESOURCE_ID in $RESOURCE_IDS; do
  echo "Updating resource: $RESOURCE_ID"
  
  # Update OPTIONS integration response with new headers
  aws apigateway put-integration-response \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters "{\"method.response.header.Access-Control-Allow-Headers\":${ALLOWED_HEADERS},\"method.response.header.Access-Control-Allow-Methods\":\"'GET,POST,PUT,DELETE,OPTIONS'\",\"method.response.header.Access-Control-Allow-Origin\":\"'*'\"}" 2>/dev/null || echo "  Skipped (no OPTIONS method)"
done

echo ""
echo "Deploying API Gateway..."
aws apigateway create-deployment \
  --rest-api-id "$REST_API_ID" \
  --stage-name prod \
  --description "Updated CORS headers to include X-Correlation-ID"

echo "Done!"
