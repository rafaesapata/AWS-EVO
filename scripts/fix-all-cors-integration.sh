#!/bin/bash
set -e

REST_API_ID="3l66kn0eaj"

# Get all function resources
RESOURCE_IDS=$(aws apigateway get-resources --rest-api-id "$REST_API_ID" --query "items[?contains(path, '/api/functions/')].id" --output text)

echo "Fixing CORS integration responses for all /api/functions/* endpoints..."

for RESOURCE_ID in $RESOURCE_IDS; do
  echo -n "Fixing $RESOURCE_ID... "
  
  # Create integration response for OPTIONS with proper headers
  aws apigateway put-integration-response \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' 2>/dev/null && echo "OK" || echo "SKIP"
done

echo ""
echo "Deploying API Gateway..."
aws apigateway create-deployment \
  --rest-api-id "$REST_API_ID" \
  --stage-name prod \
  --description "Fixed CORS integration responses"

echo "Done!"
