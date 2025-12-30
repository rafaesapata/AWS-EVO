#!/bin/bash
# Setup License API Endpoints

REST_API_ID="3l66kn0eaj"
AUTHORIZER_ID="ez5xqt"
REGION="us-east-1"
ACCOUNT_ID="383234048592"

# Resource IDs (created above)
CONFIGURE_LICENSE_ID="twi6xr"
SYNC_LICENSE_ID="kaf7e9"
MANAGE_SEATS_ID="by24d9"
ADMIN_SYNC_LICENSE_ID="jgmgzc"

setup_cors() {
  local RESOURCE_ID=$1
  
  # Create OPTIONS method
  aws apigateway put-method \
    --rest-api-id $REST_API_ID \
    --resource-id $RESOURCE_ID \
    --http-method OPTIONS \
    --authorization-type NONE \
    --region $REGION

  # Create OPTIONS integration (MOCK)
  aws apigateway put-integration \
    --rest-api-id $REST_API_ID \
    --resource-id $RESOURCE_ID \
    --http-method OPTIONS \
    --type MOCK \
    --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
    --region $REGION

  # Create OPTIONS method response
  aws apigateway put-method-response \
    --rest-api-id $REST_API_ID \
    --resource-id $RESOURCE_ID \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' \
    --region $REGION

  # Create OPTIONS integration response
  aws apigateway put-integration-response \
    --rest-api-id $REST_API_ID \
    --resource-id $RESOURCE_ID \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \
    --region $REGION
}

setup_method() {
  local RESOURCE_ID=$1
  local HTTP_METHOD=$2
  local LAMBDA_NAME=$3
  
  # Create method with Cognito auth
  aws apigateway put-method \
    --rest-api-id $REST_API_ID \
    --resource-id $RESOURCE_ID \
    --http-method $HTTP_METHOD \
    --authorization-type COGNITO_USER_POOLS \
    --authorizer-id $AUTHORIZER_ID \
    --region $REGION

  # Create Lambda integration
  aws apigateway put-integration \
    --rest-api-id $REST_API_ID \
    --resource-id $RESOURCE_ID \
    --http-method $HTTP_METHOD \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_NAME}/invocations" \
    --region $REGION

  # Add Lambda permission
  aws lambda add-permission \
    --function-name $LAMBDA_NAME \
    --statement-id "apigateway-${HTTP_METHOD}-$(date +%s)" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${REST_API_ID}/*/${HTTP_METHOD}/*" \
    --region $REGION 2>/dev/null || true
}

echo "Setting up configure-license endpoint..."
setup_cors $CONFIGURE_LICENSE_ID
setup_method $CONFIGURE_LICENSE_ID "GET" "evo-uds-v3-production-configure-license"
setup_method $CONFIGURE_LICENSE_ID "POST" "evo-uds-v3-production-configure-license"

echo "Setting up sync-license endpoint..."
setup_cors $SYNC_LICENSE_ID
setup_method $SYNC_LICENSE_ID "POST" "evo-uds-v3-production-sync-license"

echo "Setting up manage-seats endpoint..."
setup_cors $MANAGE_SEATS_ID
setup_method $MANAGE_SEATS_ID "GET" "evo-uds-v3-production-manage-seats"
setup_method $MANAGE_SEATS_ID "POST" "evo-uds-v3-production-manage-seats"

echo "Setting up admin-sync-license endpoint..."
setup_cors $ADMIN_SYNC_LICENSE_ID
setup_method $ADMIN_SYNC_LICENSE_ID "GET" "evo-uds-v3-production-admin-sync-license"
setup_method $ADMIN_SYNC_LICENSE_ID "POST" "evo-uds-v3-production-admin-sync-license"

echo "Deploying API..."
aws apigateway create-deployment --rest-api-id $REST_API_ID --stage-name prod --region $REGION

echo "Done!"
