#!/bin/bash
# Script para atualizar CORS headers em todos os endpoints do API Gateway
# Adiciona X-Impersonate-Organization aos headers permitidos

REST_API_ID="3l66kn0eaj"
REGION="us-east-1"
NEW_HEADERS="'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization'"

echo "Buscando recursos com OPTIONS..."

# Get all resource IDs
RESOURCES=$(aws apigateway get-resources --rest-api-id $REST_API_ID --region $REGION --query "items[].id" --output text)

COUNT=0
UPDATED=0

for RESOURCE_ID in $RESOURCES; do
  COUNT=$((COUNT + 1))
  
  # Check if resource has OPTIONS method
  HAS_OPTIONS=$(aws apigateway get-resource --rest-api-id $REST_API_ID --resource-id $RESOURCE_ID --region $REGION --query "resourceMethods.OPTIONS" --output text 2>/dev/null)
  
  if [ "$HAS_OPTIONS" != "None" ] && [ -n "$HAS_OPTIONS" ]; then
    # Update the integration response
    aws apigateway update-integration-response \
      --rest-api-id $REST_API_ID \
      --resource-id $RESOURCE_ID \
      --http-method OPTIONS \
      --status-code 200 \
      --patch-operations "op=replace,path=/responseParameters/method.response.header.Access-Control-Allow-Headers,value=$NEW_HEADERS" \
      --region $REGION > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
      UPDATED=$((UPDATED + 1))
      echo "✓ Updated: $RESOURCE_ID"
    fi
  fi
done

echo ""
echo "Total resources: $COUNT"
echo "Updated: $UPDATED"
echo ""
echo "Deploying changes..."

aws apigateway create-deployment --rest-api-id $REST_API_ID --stage-name prod --region $REGION

echo "Done!"
