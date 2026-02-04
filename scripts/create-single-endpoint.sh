#!/bin/bash
# Usage: ./scripts/create-single-endpoint.sh <endpoint-name>

ENDPOINT="$1"
if [ -z "$ENDPOINT" ]; then
  echo "Usage: $0 <endpoint-name>"
  exit 1
fi

PROFILE="EVO_PRODUCTION"
API_ID="s516304ta7"
PARENT_ID="wywdrc"
AUTHORIZER_ID="v2uegl"
ACCOUNT_ID="523115032346"
LAMBDA_NAME="evo-uds-v3-prod-${ENDPOINT}"

echo "Creating endpoint: $ENDPOINT"

# Create resource
resource_id=$(aws apigateway create-resource \
  --rest-api-id "$API_ID" \
  --parent-id "$PARENT_ID" \
  --path-part "$ENDPOINT" \
  --profile "$PROFILE" \
  --region us-east-1 \
  --no-cli-pager \
  --query 'id' \
  --output text 2>/dev/null)

if [ -z "$resource_id" ]; then
  echo "Failed to create resource or already exists"
  exit 1
fi

echo "Resource ID: $resource_id"

# OPTIONS method
aws apigateway put-method \
  --rest-api-id "$API_ID" \
  --resource-id "$resource_id" \
  --http-method OPTIONS \
  --authorization-type NONE \
  --profile "$PROFILE" \
  --region us-east-1 \
  --no-cli-pager > /dev/null

# OPTIONS integration
aws apigateway put-integration \
  --rest-api-id "$API_ID" \
  --resource-id "$resource_id" \
  --http-method OPTIONS \
  --type MOCK \
  --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
  --profile "$PROFILE" \
  --region us-east-1 \
  --no-cli-pager > /dev/null

# OPTIONS method response
aws apigateway put-method-response \
  --rest-api-id "$API_ID" \
  --resource-id "$resource_id" \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' \
  --profile "$PROFILE" \
  --region us-east-1 \
  --no-cli-pager > /dev/null

# OPTIONS integration response
aws apigateway put-integration-response \
  --rest-api-id "$API_ID" \
  --resource-id "$resource_id" \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters "{\"method.response.header.Access-Control-Allow-Headers\":\"'Content-Type,Authorization,X-Impersonate-Organization'\",\"method.response.header.Access-Control-Allow-Methods\":\"'POST,OPTIONS'\",\"method.response.header.Access-Control-Allow-Origin\":\"'*'\"}" \
  --profile "$PROFILE" \
  --region us-east-1 \
  --no-cli-pager > /dev/null

# POST method
aws apigateway put-method \
  --rest-api-id "$API_ID" \
  --resource-id "$resource_id" \
  --http-method POST \
  --authorization-type COGNITO_USER_POOLS \
  --authorizer-id "$AUTHORIZER_ID" \
  --profile "$PROFILE" \
  --region us-east-1 \
  --no-cli-pager > /dev/null

# POST integration
aws apigateway put-integration \
  --rest-api-id "$API_ID" \
  --resource-id "$resource_id" \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:${ACCOUNT_ID}:function:${LAMBDA_NAME}/invocations" \
  --profile "$PROFILE" \
  --region us-east-1 \
  --no-cli-pager > /dev/null

# Lambda permission
aws lambda add-permission \
  --function-name "$LAMBDA_NAME" \
  --statement-id "apigateway-${ENDPOINT}" \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:${ACCOUNT_ID}:${API_ID}/*/POST/api/functions/${ENDPOINT}" \
  --profile "$PROFILE" \
  --region us-east-1 \
  --no-cli-pager > /dev/null 2>&1 || true

echo "✅ $ENDPOINT created successfully"
