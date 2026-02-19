#!/bin/bash
# Find all endpoints returning 500 in production
# Usage: bash scripts/find-500s.sh

API="https://api.evo.nuevacore.com"
POOL_ID="us-east-1_BUJecylbm"
CLIENT_ID="a761ofnfjjo7u5mhpe2r54b7j"
REGION="us-east-1"

# Read credentials from cypress.env.json
EMAIL=$(python3 -c "import json; print(json.load(open('cypress.env.json'))['TEST_USER_EMAIL'])")
PASS=$(python3 -c "import json; print(json.load(open('cypress.env.json'))['TEST_USER_PASSWORD'])")

echo "Authenticating..."
TOKEN=$(aws cognito-idp initiate-auth \
  --region "$REGION" \
  --client-id "$CLIENT_ID" \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$EMAIL",PASSWORD="$PASS" \
  --query 'AuthenticationResult.IdToken' \
  --output text 2>/dev/null)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "None" ]; then
  echo "Auth failed, trying curl..."
  RESP=$(curl -s -X POST "https://cognito-idp.${REGION}.amazonaws.com/" \
    -H "Content-Type: application/x-amz-json-1.1" \
    -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
    -d "{\"AuthFlow\":\"USER_PASSWORD_AUTH\",\"ClientId\":\"${CLIENT_ID}\",\"AuthParameters\":{\"USERNAME\":\"${EMAIL}\",\"PASSWORD\":\"${PASS}\"}}")
  TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['AuthenticationResult']['IdToken'])" 2>/dev/null)
fi

if [ -z "$TOKEN" ] || [ "$TOKEN" = "None" ]; then
  echo "FATAL: Could not authenticate"
  exit 1
fi
echo "Authenticated OK"
echo ""

# All HTTP endpoints from lambda-registry
ENDPOINTS_AUTH=(
mfa-enroll mfa-check mfa-challenge-verify mfa-verify-login mfa-list-factors mfa-unenroll
webauthn-register webauthn-authenticate webauthn-check delete-webauthn-credential verify-tv-token
check-organization create-with-organization get-user-organization notification-settings
admin-manage-user create-cognito-user create-user disable-cognito-user manage-organizations
deactivate-demo-mode manage-demo-mode log-audit manage-email-templates
list-aws-credentials save-aws-credentials update-aws-credentials
security-scan start-security-scan compliance-scan start-compliance-scan
get-compliance-scan-status get-compliance-history well-architected-scan guardduty-scan
get-findings get-security-posture validate-aws-credentials validate-permissions
iam-deep-analysis lateral-movement-detection drift-detection analyze-cloudtrail
start-cloudtrail-analysis fetch-cloudtrail waf-setup-monitoring waf-dashboard-api
fetch-daily-costs ri-sp-analyzer get-ri-sp-data get-ri-sp-analysis list-ri-sp-history
analyze-ri-sp cost-optimization budget-forecast generate-cost-forecast finops-copilot ml-waste-detection
intelligent-alerts-analyzer predict-incidents detect-anomalies
bedrock-chat get-ai-notifications update-ai-notification send-ai-notification
list-ai-notifications-admin manage-notification-rules
kb-analytics-dashboard kb-ai-suggestions kb-export-pdf
increment-article-views increment-article-helpful track-article-view-detailed
generate-pdf-report generate-excel-report generate-security-pdf security-scan-pdf-export generate-remediation-script
get-executive-dashboard manage-tv-tokens
alerts auto-alerts check-alert-rules aws-realtime-metrics fetch-cloudwatch-metrics
fetch-edge-services endpoint-monitor-check monitored-endpoints generate-error-fix-prompt
get-platform-metrics get-recent-errors get-lambda-health
azure-oauth-initiate azure-oauth-callback azure-oauth-refresh azure-oauth-revoke
validate-azure-credentials validate-azure-permissions save-azure-credentials
list-azure-credentials delete-azure-credentials azure-security-scan start-azure-security-scan
azure-defender-scan azure-compliance-scan azure-well-architected-scan
azure-cost-optimization azure-reservations-analyzer azure-fetch-costs
azure-resource-inventory azure-activity-logs azure-fetch-monitor-metrics
azure-detect-anomalies azure-fetch-edge-services
list-cloud-credentials
validate-license configure-license sync-license admin-sync-license manage-seats
query-table mutate-table ticket-management ticket-attachments
send-email send-notification get-communication-logs manage-email-preferences
process-background-jobs list-background-jobs execute-scheduled-job scheduled-scan-executor
cancel-background-job retry-background-job
create-organization-account sync-organization-accounts
create-jira-ticket
storage-download storage-delete upload-attachment
db-init
)

ENDPOINTS_PUBLIC=(
self-register forgot-password get-executive-dashboard-public log-frontend-error
)

echo "=== CHECKING AUTH ENDPOINTS ==="
FAIL_COUNT=0
for ep in "${ENDPOINTS_AUTH[@]}"; do
  STATUS=$(curl -s -o /tmp/ep_body.json -w "%{http_code}" \
    -X POST "$API/api/functions/$ep" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "Origin: https://api.evo.nuevacore.com" \
    -d '{}')
  if [ "$STATUS" = "500" ]; then
    BODY=$(cat /tmp/ep_body.json | head -c 200)
    echo "500 $ep => $BODY"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

echo ""
echo "=== CHECKING PUBLIC ENDPOINTS ==="
for ep in "${ENDPOINTS_PUBLIC[@]}"; do
  STATUS=$(curl -s -o /tmp/ep_body.json -w "%{http_code}" \
    -X POST "$API/api/functions/$ep" \
    -H "Content-Type: application/json" \
    -H "Origin: https://api.evo.nuevacore.com" \
    -d '{}')
  if [ "$STATUS" = "500" ]; then
    BODY=$(cat /tmp/ep_body.json | head -c 200)
    echo "500 $ep => $BODY"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

echo ""
echo "=== TOTAL 500s: $FAIL_COUNT ==="
