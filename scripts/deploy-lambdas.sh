#!/bin/bash

# Configurações
REST_API_ID="3l66kn0eaj"
FUNCTIONS_RESOURCE_ID="n9gxy9"
AUTHORIZER_ID="ez5xqt"
ROLE_ARN="arn:aws:iam::383234048592:role/evo-uds-v3-production-lambda-nodejs-role"
LAYER_ARN="arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-layer:1"
VPC_SUBNETS="subnet-0dbb444e4ef54d211,subnet-05383447666913b7b"
VPC_SG="sg-04eb71f681cc651ae"
DB_URL='postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public'

# Lista de funções necessárias (nome-handler:pasta)
FUNCTIONS=(
  "validate-aws-credentials:security"
  "sync-organization-accounts:organizations"
  "validate-permissions:security"
  "validate-license:license"
  "verify-tv-token:auth"
  "check-organization:profiles"
  "create-with-organization:profiles"
  "finops-copilot:cost"
  "ml-waste-detection:cost"
  "ri-sp-analyzer:cost"
  "compliance-scan:security"
  "well-architected-scan:security"
  "fetch-cloudtrail:security"
  "analyze-cloudtrail:security"
  "detect-anomalies:ml"
  "get-communication-logs:notifications"
)

create_lambda() {
  local HANDLER_NAME=$1
  local FOLDER=$2
  local FUNCTION_NAME="evo-uds-v3-production-${HANDLER_NAME}"
  
  echo "Creating Lambda: $FUNCTION_NAME"
  
  # Check if function exists
  if aws lambda get-function --function-name "$FUNCTION_NAME" 2>/dev/null; then
    echo "  Function already exists, updating code..."
    zip -j "/tmp/${HANDLER_NAME}.zip" "backend/dist/handlers/${FOLDER}/${HANDLER_NAME}.js" 2>/dev/null
    aws lambda update-function-code \
      --function-name "$FUNCTION_NAME" \
      --zip-file "fileb:///tmp/${HANDLER_NAME}.zip" > /dev/null
  else
    echo "  Creating new function..."
    zip -j "/tmp/${HANDLER_NAME}.zip" "backend/dist/handlers/${FOLDER}/${HANDLER_NAME}.js" 2>/dev/null
    aws lambda create-function \
      --function-name "$FUNCTION_NAME" \
      --runtime nodejs18.x \
      --handler "${HANDLER_NAME}.handler" \
      --role "$ROLE_ARN" \
      --zip-file "fileb:///tmp/${HANDLER_NAME}.zip" \
      --timeout 30 \
      --memory-size 256 \
      --vpc-config "SubnetIds=${VPC_SUBNETS},SecurityGroupIds=${VPC_SG}" \
      --layers "$LAYER_ARN" \
      --environment "Variables={DATABASE_URL=${DB_URL},NODE_ENV=production,COGNITO_USER_POOL_ID=us-east-1_qGmGkvmpL}" > /dev/null
  fi
  
  rm -f "/tmp/${HANDLER_NAME}.zip"
}

create_api_endpoint() {
  local HANDLER_NAME=$1
  local FUNCTION_NAME="evo-uds-v3-production-${HANDLER_NAME}"
  
  echo "Creating API endpoint: /api/functions/${HANDLER_NAME}"
  
  # Check if resource exists
  RESOURCE_ID=$(aws apigateway get-resources --rest-api-id "$REST_API_ID" \
    --query "items[?pathPart=='${HANDLER_NAME}' && parentId=='${FUNCTIONS_RESOURCE_ID}'].id" \
    --output text 2>/dev/null)
  
  if [ -z "$RESOURCE_ID" ] || [ "$RESOURCE_ID" == "None" ]; then
    echo "  Creating resource..."
    RESOURCE_ID=$(aws apigateway create-resource \
      --rest-api-id "$REST_API_ID" \
      --parent-id "$FUNCTIONS_RESOURCE_ID" \
      --path-part "$HANDLER_NAME" \
      --query 'id' --output text)
  fi
  
  echo "  Resource ID: $RESOURCE_ID"
  
  # Create POST method
  aws apigateway put-method \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method POST \
    --authorization-type COGNITO_USER_POOLS \
    --authorizer-id "$AUTHORIZER_ID" 2>/dev/null || true
  
  # Create POST integration
  aws apigateway put-integration \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:383234048592:function:${FUNCTION_NAME}/invocations" 2>/dev/null || true
  
  # Create OPTIONS method for CORS
  aws apigateway put-method \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --authorization-type NONE 2>/dev/null || true
  
  # Create OPTIONS integration
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
  
  # Create OPTIONS integration response
  aws apigateway put-integration-response \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' 2>/dev/null || true
  
  # Add Lambda permission
  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "apigateway-${HANDLER_NAME}" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:us-east-1:383234048592:${REST_API_ID}/*/POST/api/functions/${HANDLER_NAME}" 2>/dev/null || true
}

echo "=== Deploying Lambdas and API Endpoints ==="

for FUNC in "${FUNCTIONS[@]}"; do
  HANDLER_NAME="${FUNC%%:*}"
  FOLDER="${FUNC##*:}"
  
  if [ -f "backend/dist/handlers/${FOLDER}/${HANDLER_NAME}.js" ]; then
    create_lambda "$HANDLER_NAME" "$FOLDER"
    create_api_endpoint "$HANDLER_NAME"
    echo ""
  else
    echo "SKIP: Handler not found: backend/dist/handlers/${FOLDER}/${HANDLER_NAME}.js"
  fi
done

echo "=== Deploying API Gateway ==="
aws apigateway create-deployment \
  --rest-api-id "$REST_API_ID" \
  --stage-name prod \
  --description "Deployed all Lambda endpoints with CORS"

echo "=== Done ==="
