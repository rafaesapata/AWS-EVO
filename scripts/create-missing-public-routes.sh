#!/bin/bash
# Script to create missing public API routes in production
# These routes don't require JWT authentication

set -e

API_ID="w5gyvgfskh"
REGION="us-east-1"
ACCOUNT_ID="523115032346"

echo "Creating missing public routes..."

# Array of public routes (no JWT auth)
declare -a PUBLIC_ROUTES=(
  "self-register"
)

for ROUTE in "${PUBLIC_ROUTES[@]}"; do
  LAMBDA_NAME="evo-uds-v3-production-${ROUTE}"
  
  echo ""
  echo "Processing: $ROUTE"
  
  # Check if Lambda exists
  if ! AWS_PROFILE=EVO_PRODUCTION aws lambda get-function \
    --function-name "$LAMBDA_NAME" \
    --region "$REGION" \
    --no-cli-pager > /dev/null 2>&1; then
    echo "  ⚠️  Lambda $LAMBDA_NAME not found, skipping..."
    continue
  fi
  
  # Check if route already exists
  EXISTING=$(AWS_PROFILE=EVO_PRODUCTION aws apigatewayv2 get-routes \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query "Items[?RouteKey=='POST /api/functions/${ROUTE}'].RouteId" \
    --output text \
    --no-cli-pager)
  
  if [ -n "$EXISTING" ]; then
    echo "  ✓ Route already exists (ID: $EXISTING)"
    continue
  fi
  
  # Create integration
  echo "  Creating integration..."
  INT_ID=$(AWS_PROFILE=EVO_PRODUCTION aws apigatewayv2 create-integration \
    --api-id "$API_ID" \
    --integration-type AWS_PROXY \
    --integration-uri "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_NAME}" \
    --payload-format-version 2.0 \
    --region "$REGION" \
    --query 'IntegrationId' \
    --output text \
    --no-cli-pager)
  
  echo "  Integration created: $INT_ID"
  
  # Create route (NO JWT auth for public routes)
  echo "  Creating route..."
  ROUTE_ID=$(AWS_PROFILE=EVO_PRODUCTION aws apigatewayv2 create-route \
    --api-id "$API_ID" \
    --route-key "POST /api/functions/${ROUTE}" \
    --target "integrations/$INT_ID" \
    --authorization-type NONE \
    --region "$REGION" \
    --query 'RouteId' \
    --output text \
    --no-cli-pager)
  
  echo "  Route created: $ROUTE_ID"
  
  # Add Lambda permission
  echo "  Adding Lambda permission..."
  AWS_PROFILE=EVO_PRODUCTION aws lambda add-permission \
    --function-name "$LAMBDA_NAME" \
    --statement-id "apigateway-${ROUTE}" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*/api/functions/${ROUTE}" \
    --region "$REGION" \
    --no-cli-pager > /dev/null 2>&1 || echo "  (Permission may already exist)"
  
  echo "  ✅ Route created successfully"
done

echo ""
echo "✅ All public routes processed!"
echo ""
echo "Testing self-register endpoint:"
curl -s -o /dev/null -w "Status: %{http_code}\n" \
  -X POST https://api.evo.nuevacore.com/api/functions/self-register \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
