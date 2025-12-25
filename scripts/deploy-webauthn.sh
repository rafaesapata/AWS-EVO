#!/bin/bash
set -e

# Configurações
REST_API_ID="3l66kn0eaj"
FUNCTIONS_RESOURCE_ID="n9gxy9"
AUTHORIZER_ID="ez5xqt"
ROLE_ARN="arn:aws:iam::383234048592:role/evo-uds-v3-production-lambda-nodejs-role"
LAYER_ARN="arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-layer:1"
VPC_SUBNETS="subnet-0dbb444e4ef54d211,subnet-05383447666913b7b"
VPC_SG="sg-04eb71f681cc651ae"
DB_URL='postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public'

deploy_lambda() {
  local HANDLER_NAME=$1
  local FUNCTION_NAME="evo-uds-v3-production-${HANDLER_NAME}"
  
  echo "=== Deploying Lambda: $FUNCTION_NAME ==="
  
  # Create zip
  cd backend/dist/handlers/auth
  zip -j "/tmp/${HANDLER_NAME}.zip" "${HANDLER_NAME}.js"
  cd - > /dev/null
  
  # Check if function exists
  if aws lambda get-function --function-name "$FUNCTION_NAME" 2>/dev/null; then
    echo "Updating existing function..."
    aws lambda update-function-code \
      --function-name "$FUNCTION_NAME" \
      --zip-file "fileb:///tmp/${HANDLER_NAME}.zip" \
      --output text --query 'FunctionArn'
  else
    echo "Creating new function..."
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
      --environment "Variables={DATABASE_URL=${DB_URL},NODE_ENV=production,COGNITO_USER_POOL_ID=us-east-1_qGmGkvmpL}" \
      --output text --query 'FunctionArn'
  fi
  
  rm -f "/tmp/${HANDLER_NAME}.zip"
}

create_api_endpoint() {
  local HANDLER_NAME=$1
  local FUNCTION_NAME="evo-uds-v3-production-${HANDLER_NAME}"
  
  echo "=== Creating API endpoint: /api/functions/${HANDLER_NAME} ==="
  
  # Check if resource exists
  RESOURCE_ID=$(aws apigateway get-resources --rest-api-id "$REST_API_ID" \
    --query "items[?pathPart=='${HANDLER_NAME}' && parentId=='${FUNCTIONS_RESOURCE_ID}'].id" \
    --output text 2>/dev/null)
  
  if [ -z "$RESOURCE_ID" ] || [ "$RESOURCE_ID" == "None" ]; then
    echo "Creating resource..."
    RESOURCE_ID=$(aws apigateway create-resource \
      --rest-api-id "$REST_API_ID" \
      --parent-id "$FUNCTIONS_RESOURCE_ID" \
      --path-part "$HANDLER_NAME" \
      --query 'id' --output text)
  fi
  
  echo "Resource ID: $RESOURCE_ID"
  
  # Create POST method with Cognito auth
  echo "Creating POST method..."
  aws apigateway put-method \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method POST \
    --authorization-type COGNITO_USER_POOLS \
    --authorizer-id "$AUTHORIZER_ID" 2>/dev/null || true
  
  # Create POST integration
  echo "Creating POST integration..."
  aws apigateway put-integration \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:383234048592:function:${FUNCTION_NAME}/invocations" 2>/dev/null || true
  
  # Create OPTIONS method for CORS
  echo "Creating OPTIONS method..."
  aws apigateway put-method \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --authorization-type NONE 2>/dev/null || true
  
  # Create OPTIONS integration (MOCK)
  echo "Creating OPTIONS integration..."
  aws apigateway put-integration \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --type MOCK \
    --request-templates '{"application/json":"{\"statusCode\":200}"}' 2>/dev/null || true
  
  # Create OPTIONS method response
  echo "Creating OPTIONS method response..."
  aws apigateway put-method-response \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' 2>/dev/null || true
  
  # Create OPTIONS integration response
  echo "Creating OPTIONS integration response..."
  aws apigateway put-integration-response \
    --rest-api-id "$REST_API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' 2>/dev/null || true
  
  # Add Lambda permission
  echo "Adding Lambda permission..."
  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "apigateway-${HANDLER_NAME}-$(date +%s)" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:us-east-1:383234048592:${REST_API_ID}/*/POST/api/functions/${HANDLER_NAME}" 2>/dev/null || true
}

# Deploy both WebAuthn functions
deploy_lambda "webauthn-register"
create_api_endpoint "webauthn-register"

deploy_lambda "webauthn-authenticate"
create_api_endpoint "webauthn-authenticate"

# Deploy API Gateway
echo "=== Deploying API Gateway ==="
aws apigateway create-deployment \
  --rest-api-id "$REST_API_ID" \
  --stage-name prod \
  --description "Added WebAuthn endpoints with CORS"

echo "=== Done ==="
