#!/bin/bash
# Script para criar endpoints restantes no API Gateway
# Criado em: 27/12/2024

set -e

REGION="us-east-1"
ACCOUNT_ID="383234048592"
REST_API_ID="3l66kn0eaj"
AUTHORIZER_ID="ez5xqt"
FUNCTIONS_RESOURCE_ID="n9gxy9"

echo "🔧 Criando endpoints restantes no API Gateway..."
echo ""

create_endpoint() {
  local ENDPOINT_NAME=$1
  local LAMBDA_NAME=$2
  local HTTP_METHOD=${3:-POST}
  
  # Verificar se resource já existe
  EXISTING=$(aws apigateway get-resources --rest-api-id "$REST_API_ID" --region "$REGION" \
    --query "items[?pathPart=='${ENDPOINT_NAME}'].id" --output text 2>/dev/null)
  
  if [ -n "$EXISTING" ]; then
    echo "⏭️  $ENDPOINT_NAME já existe"
    return 0
  fi
  
  echo "📍 Criando: ${ENDPOINT_NAME}"
  
  RESOURCE_ID=$(aws apigateway create-resource \
    --rest-api-id "$REST_API_ID" \
    --parent-id "$FUNCTIONS_RESOURCE_ID" \
    --path-part "$ENDPOINT_NAME" \
    --region "$REGION" \
    --query 'id' --output text 2>/dev/null)
  
  # OPTIONS (CORS)
  aws apigateway put-method --rest-api-id "$REST_API_ID" --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS --authorization-type NONE --region "$REGION" > /dev/null 2>&1
  
  aws apigateway put-integration --rest-api-id "$REST_API_ID" --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS --type MOCK \
    --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
    --region "$REGION" > /dev/null 2>&1
  
  aws apigateway put-method-response --rest-api-id "$REST_API_ID" --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' \
    --region "$REGION" > /dev/null 2>&1
  
  aws apigateway put-integration-response --rest-api-id "$REST_API_ID" --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \
    --region "$REGION" > /dev/null 2>&1
  
  # POST com Cognito
  aws apigateway put-method --rest-api-id "$REST_API_ID" --resource-id "$RESOURCE_ID" \
    --http-method "$HTTP_METHOD" --authorization-type COGNITO_USER_POOLS \
    --authorizer-id "$AUTHORIZER_ID" --region "$REGION" > /dev/null 2>&1
  
  LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:evo-uds-v3-production-${LAMBDA_NAME}"
  
  aws apigateway put-integration --rest-api-id "$REST_API_ID" --resource-id "$RESOURCE_ID" \
    --http-method "$HTTP_METHOD" --type AWS_PROXY --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
    --region "$REGION" > /dev/null 2>&1
  
  aws lambda add-permission --function-name "evo-uds-v3-production-${LAMBDA_NAME}" \
    --statement-id "apigateway-${ENDPOINT_NAME}" --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${REST_API_ID}/*/${HTTP_METHOD}/api/functions/${ENDPOINT_NAME}" \
    --region "$REGION" > /dev/null 2>&1 || true
  
  echo "  ✅ ${ENDPOINT_NAME}"
}

# Admin
create_endpoint "admin-manage-user" "admin-manage-user"

# Cost
create_endpoint "budget-forecast" "budget-forecast"
create_endpoint "cost-optimization" "cost-optimization"
create_endpoint "generate-cost-forecast" "generate-cost-forecast"

# Integrations
create_endpoint "create-jira-ticket" "create-jira-ticket"

# Jobs
create_endpoint "execute-scheduled-job" "execute-scheduled-job"
create_endpoint "process-background-jobs" "process-background-jobs"
create_endpoint "scheduled-scan-executor" "scheduled-scan-executor"

# KB
create_endpoint "kb-ai-suggestions" "kb-ai-suggestions"

# License
create_endpoint "daily-license-validation" "daily-license-validation"

# ML
create_endpoint "anomaly-detection" "anomaly-detection"
create_endpoint "intelligent-alerts-analyzer" "intelligent-alerts-analyzer"

# Monitoring
create_endpoint "auto-alerts" "auto-alerts"
create_endpoint "check-alert-rules" "check-alert-rules"
create_endpoint "endpoint-monitor-check" "endpoint-monitor-check"
create_endpoint "aws-realtime-metrics" "aws-realtime-metrics"

# Notifications
create_endpoint "send-email" "send-email"
create_endpoint "send-notification" "send-notification"

# Organizations
create_endpoint "create-organization-account" "create-organization-account"

# Reports
create_endpoint "generate-excel-report" "generate-excel-report"
create_endpoint "generate-pdf-report" "generate-pdf-report"
create_endpoint "generate-remediation-script" "generate-remediation-script"
create_endpoint "generate-security-pdf" "generate-security-pdf"
create_endpoint "security-scan-pdf-export" "security-scan-pdf-export"

# Security
create_endpoint "drift-detection" "drift-detection"
create_endpoint "get-findings" "get-findings"
create_endpoint "get-security-posture" "get-security-posture"
create_endpoint "guardduty-scan" "guardduty-scan"
create_endpoint "iam-deep-analysis" "iam-deep-analysis"
create_endpoint "lateral-movement-detection" "lateral-movement-detection"

echo ""
echo "🚀 Deployando API Gateway..."
aws apigateway create-deployment --rest-api-id "$REST_API_ID" --stage-name prod \
  --description "Deploy endpoints restantes - $(date +%Y-%m-%d)" --region "$REGION"

echo ""
echo "🎉 Concluído!"
