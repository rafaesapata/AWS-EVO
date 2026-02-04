#!/bin/bash
set -euo pipefail

REGION="us-east-1"
PROFILE="EVO_PRODUCTION"
API_ID="s516304ta7"
PARENT_ID="wywdrc"
AUTHORIZER_ID="v2uegl"
ACCOUNT_ID="523115032346"
LAMBDA_PREFIX="evo-uds-v3-prod"

# Remaining endpoints
ENDPOINTS=(
  "predict-incidents"
  "detect-anomalies"
  "get-ai-notifications"
  "update-ai-notification"
  "send-ai-notification"
  "list-ai-notifications-admin"
  "manage-notification-rules"
  "get-executive-dashboard"
  "get-executive-dashboard-public"
  "manage-tv-tokens"
  "alerts"
  "auto-alerts"
  "check-alert-rules"
  "aws-realtime-metrics"
  "fetch-cloudwatch-metrics"
  "fetch-edge-services"
  "endpoint-monitor-check"
  "monitored-endpoints"
  "generate-error-fix-prompt"
  "get-platform-metrics"
  "get-recent-errors"
  "list-aws-credentials"
  "save-aws-credentials"
  "update-aws-credentials"
  "azure-oauth-initiate"
  "azure-oauth-callback"
  "azure-oauth-refresh"
  "azure-oauth-revoke"
  "validate-azure-credentials"
  "save-azure-credentials"
  "list-azure-credentials"
  "delete-azure-credentials"
  "azure-security-scan"
  "start-azure-security-scan"
  "azure-defender-scan"
  "azure-compliance-scan"
  "azure-well-architected-scan"
  "azure-cost-optimization"
  "azure-reservations-analyzer"
  "azure-fetch-costs"
  "azure-resource-inventory"
  "azure-activity-logs"
  "azure-fetch-monitor-metrics"
  "azure-detect-anomalies"
  "azure-fetch-edge-services"
  "list-cloud-credentials"
  "validate-license"
  "configure-license"
  "sync-license"
  "admin-sync-license"
  "manage-seats"
  "daily-license-validation"
  "kb-analytics-dashboard"
  "kb-ai-suggestions"
  "kb-export-pdf"
  "increment-article-views"
  "increment-article-helpful"
  "track-article-view-detailed"
  "generate-pdf-report"
  "generate-excel-report"
  "generate-security-pdf"
  "security-scan-pdf-export"
  "generate-remediation-script"
  "query-table"
  "mutate-table"
  "ticket-management"
  "ticket-attachments"
  "create-organization-account"
  "sync-organization-accounts"
  "check-organization"
  "create-with-organization"
  "get-user-organization"
  "send-email"
  "send-notification"
  "get-communication-logs"
  "manage-email-preferences"
  "send-scheduled-emails"
  "storage-download"
  "storage-delete"
  "upload-attachment"
  "process-background-jobs"
  "list-background-jobs"
  "execute-scheduled-job"
  "scheduled-scan-executor"
  "create-jira-ticket"
)

create_endpoint() {
  local endpoint=$1
  local lambda_name="${LAMBDA_PREFIX}-${endpoint}"
  local lambda_arn="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${lambda_name}"
  
  # Check if exists
  if aws apigateway get-resources --rest-api-id "$API_ID" --profile "$PROFILE" --region "$REGION" --no-cli-pager 2>/dev/null | grep -q "\"path\": \"/api/functions/${endpoint}\""; then
    echo "⏭️  $endpoint already exists"
    return 0
  fi
  
  echo "Creating $endpoint..."
  
  resource_id=$(aws apigateway create-resource --rest-api-id "$API_ID" --parent-id "$PARENT_ID" --path-part "$endpoint" --profile "$PROFILE" --region "$REGION" --no-cli-pager --query 'id' --output text 2>/dev/null) || return 1
  
  # OPTIONS
  aws apigateway put-method --rest-api-id "$API_ID" --resource-id "$resource_id" --http-method OPTIONS --authorization-type NONE --profile "$PROFILE" --region "$REGION" --no-cli-pager >/dev/null 2>&1
  aws apigateway put-integration --rest-api-id "$API_ID" --resource-id "$resource_id" --http-method OPTIONS --type MOCK --request-templates '{"application/json": "{\"statusCode\": 200}"}' --profile "$PROFILE" --region "$REGION" --no-cli-pager >/dev/null 2>&1
  aws apigateway put-method-response --rest-api-id "$API_ID" --resource-id "$resource_id" --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' --profile "$PROFILE" --region "$REGION" --no-cli-pager >/dev/null 2>&1
  aws apigateway put-integration-response --rest-api-id "$API_ID" --resource-id "$resource_id" --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' --profile "$PROFILE" --region "$REGION" --no-cli-pager >/dev/null 2>&1
  
  # POST
  aws apigateway put-method --rest-api-id "$API_ID" --resource-id "$resource_id" --http-method POST --authorization-type COGNITO_USER_POOLS --authorizer-id "$AUTHORIZER_ID" --profile "$PROFILE" --region "$REGION" --no-cli-pager >/dev/null 2>&1
  aws apigateway put-integration --rest-api-id "$API_ID" --resource-id "$resource_id" --http-method POST --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${lambda_arn}/invocations" --profile "$PROFILE" --region "$REGION" --no-cli-pager >/dev/null 2>&1
  
  # Lambda permission
  aws lambda add-permission --function-name "$lambda_name" --statement-id "apigateway-${endpoint}" --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/POST/api/functions/${endpoint}" --profile "$PROFILE" --region "$REGION" --no-cli-pager >/dev/null 2>&1 || true
  
  echo "✅ $endpoint created"
}

for endpoint in "${ENDPOINTS[@]}"; do
  create_endpoint "$endpoint" || echo "❌ Failed: $endpoint"
done

echo "Deploying API..."
aws apigateway create-deployment --rest-api-id "$API_ID" --stage-name prod --profile "$PROFILE" --region "$REGION" --no-cli-pager >/dev/null 2>&1
echo "✅ Done"
