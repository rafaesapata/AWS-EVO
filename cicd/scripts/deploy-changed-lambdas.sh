#!/bin/bash
# =============================================================================
# EVO Lambda Deployment Script
# Faz deploy apenas das Lambdas que foram alteradas
# =============================================================================

set -euo pipefail

# =============================================================================
# Constants
# =============================================================================
readonly DEFAULT_REGION="us-east-1"
readonly DEFAULT_LAMBDA_PREFIX="evo-uds-v3-production"

# Cores para output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# =============================================================================
# Logging Functions
# =============================================================================
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}" >&2; }

# =============================================================================
# Configuration
# =============================================================================
LAMBDA_PREFIX="${LAMBDA_PREFIX:-$DEFAULT_LAMBDA_PREFIX}"
REGION="${REGION:-$DEFAULT_REGION}"
DEPLOY_ALL="${DEPLOY_ALL:-false}"
CHANGED_HANDLERS="${CHANGED_HANDLERS:-}"

# =============================================================================
# Handler to Lambda Mapping
# =============================================================================
declare -A HANDLER_MAP=(
  # Auth
  ["auth/mfa-handlers"]="mfa-enroll mfa-check mfa-challenge-verify mfa-verify-login mfa-list-factors mfa-unenroll"
  ["auth/webauthn-register"]="webauthn-register"
  ["auth/webauthn-authenticate"]="webauthn-authenticate"
  ["auth/webauthn-check-standalone"]="webauthn-check"
  ["auth/delete-webauthn-credential"]="delete-webauthn-credential"
  ["auth/delete-webauthn-credential-admin"]="delete-webauthn-credential-admin"
  ["auth/verify-tv-token"]="verify-tv-token"
  ["auth/self-register"]="self-register"
  ["auth/forgot-password"]="forgot-password"
  
  # Admin
  ["admin/admin-manage-user"]="admin-manage-user"
  ["admin/create-cognito-user"]="create-cognito-user"
  ["admin/create-user"]="create-user"
  ["admin/disable-cognito-user"]="disable-cognito-user"
  ["admin/manage-organizations"]="manage-organizations"
  ["admin/deactivate-demo-mode"]="deactivate-demo-mode"
  ["admin/manage-demo-mode"]="manage-demo-mode"
  ["admin/log-audit"]="log-audit"
  ["admin/manage-email-templates"]="manage-email-templates"
  ["admin/run-sql"]="run-sql"
  ["admin/cleanup-stuck-scans"]="cleanup-stuck-scans"
  ["admin/automated-cleanup-stuck-scans"]="automated-cleanup-stuck-scans"
  ["admin/check-cloudtrail-status"]="check-cloudtrail-status"
  ["admin/check-costs"]="check-costs"
  ["admin/debug-cloudtrail"]="debug-cloudtrail"
  ["admin/direct-cleanup"]="direct-cleanup"
  ["admin/fix-role-arn-migration"]="fix-role-arn-migration"
  ["admin/run-migration"]="run-migration"
  ["admin/run-migration-standalone"]="run-migration-standalone"
  ["admin/setup-license-config"]="setup-license-config"
  
  # AWS
  ["aws/list-aws-credentials"]="list-aws-credentials"
  ["aws/save-aws-credentials"]="save-aws-credentials"
  ["aws/update-aws-credentials"]="update-aws-credentials"
  
  # Security
  ["security/security-scan"]="security-scan"
  ["security/start-security-scan"]="start-security-scan"
  ["security/compliance-scan"]="compliance-scan"
  ["security/start-compliance-scan"]="start-compliance-scan"
  ["security/get-compliance-scan-status"]="get-compliance-scan-status"
  ["security/get-compliance-history"]="get-compliance-history"
  ["security/well-architected-scan"]="well-architected-scan"
  ["security/guardduty-scan"]="guardduty-scan"
  ["security/get-findings"]="get-findings"
  ["security/get-security-posture"]="get-security-posture"
  ["security/validate-aws-credentials"]="validate-aws-credentials"
  ["security/validate-permissions"]="validate-permissions"
  ["security/iam-deep-analysis"]="iam-deep-analysis"
  ["security/iam-behavior-analysis"]="iam-behavior-analysis"
  ["security/lateral-movement-detection"]="lateral-movement-detection"
  ["security/drift-detection"]="drift-detection"
  ["security/analyze-cloudtrail"]="analyze-cloudtrail"
  ["security/start-cloudtrail-analysis"]="start-cloudtrail-analysis"
  ["security/start-analyze-cloudtrail"]="start-analyze-cloudtrail"
  ["security/fetch-cloudtrail"]="fetch-cloudtrail"
  ["security/waf-setup-monitoring"]="waf-setup-monitoring"
  ["security/waf-dashboard-api"]="waf-dashboard-api"
  ["security/waf-unblock-expired"]="waf-unblock-expired"
  ["security/waf-log-forwarder"]="waf-log-forwarder"
  ["security/waf-log-processor"]="waf-log-processor"
  ["security/waf-threat-analyzer"]="waf-threat-analyzer"
  ["security/validate-waf-security"]="validate-waf-security"
  ["security/create-remediation-ticket"]="create-remediation-ticket"
  
  # Cost
  ["cost/fetch-daily-costs"]="fetch-daily-costs"
  ["cost/ri-sp-analyzer"]="ri-sp-analyzer"
  ["cost/get-ri-sp-data"]="get-ri-sp-data"
  ["cost/get-ri-sp-analysis"]="get-ri-sp-analysis"
  ["cost/list-ri-sp-history"]="list-ri-sp-history"
  ["cost/analyze-ri-sp"]="analyze-ri-sp"
  ["cost/save-ri-sp-analysis"]="save-ri-sp-analysis"
  ["cost/cost-optimization"]="cost-optimization"
  ["cost/budget-forecast"]="budget-forecast"
  ["cost/generate-cost-forecast"]="generate-cost-forecast"
  ["cost/finops-copilot-v2"]="finops-copilot"
  ["cost/ml-waste-detection"]="ml-waste-detection"
  
  # AI
  ["ai/bedrock-chat"]="bedrock-chat"
  ["ai/get-ai-notifications"]="get-ai-notifications"
  ["ai/update-ai-notification"]="update-ai-notification"
  ["ai/send-ai-notification"]="send-ai-notification"
  ["ai/list-ai-notifications-admin"]="list-ai-notifications-admin"
  ["ai/manage-notification-rules"]="manage-notification-rules"
  ["ai/check-proactive-notifications"]="check-proactive-notifications"
  ["ai/generate-response"]="generate-response"
  
  # ML
  ["ml/intelligent-alerts-analyzer"]="intelligent-alerts-analyzer"
  ["ml/predict-incidents"]="predict-incidents"
  ["ml/detect-anomalies"]="detect-anomalies"
  ["ml/ai-prioritization"]="ai-prioritization"
  ["ml/generate-ai-insights"]="generate-ai-insights"
  
  # Dashboard
  ["dashboard/get-executive-dashboard"]="get-executive-dashboard"
  ["dashboard/get-executive-dashboard-public"]="get-executive-dashboard-public"
  ["dashboard/manage-tv-tokens"]="manage-tv-tokens"
  
  # Monitoring
  ["monitoring/alerts"]="alerts"
  ["monitoring/auto-alerts"]="auto-alerts"
  ["monitoring/check-alert-rules"]="check-alert-rules"
  ["monitoring/aws-realtime-metrics"]="aws-realtime-metrics"
  ["monitoring/fetch-cloudwatch-metrics"]="fetch-cloudwatch-metrics"
  ["monitoring/fetch-edge-services"]="fetch-edge-services"
  ["monitoring/endpoint-monitor-check"]="endpoint-monitor-check"
  ["monitoring/monitored-endpoints"]="monitored-endpoints"
  ["monitoring/generate-error-fix-prompt"]="generate-error-fix-prompt"
  ["monitoring/get-platform-metrics"]="get-platform-metrics"
  ["monitoring/get-recent-errors"]="get-recent-errors"
  ["monitoring/get-lambda-health"]="get-lambda-health"
  ["monitoring/log-frontend-error"]="log-frontend-error"
  ["monitoring/error-aggregator"]="error-aggregator"
  ["monitoring/health-check"]="health-check"
  ["monitoring/lambda-health-check"]="lambda-health-check"
  ["monitoring/test-lambda-metrics"]="test-lambda-metrics"
  
  # License
  ["license/validate-license"]="validate-license"
  ["license/configure-license"]="configure-license"
  ["license/sync-license"]="sync-license"
  ["license/admin-sync-license"]="admin-sync-license"
  ["license/manage-seats"]="manage-seats"
  ["license/manage-seat-assignments"]="manage-seat-assignments"
  ["license/daily-license-validation"]="daily-license-validation"
  ["license/scheduled-license-sync"]="scheduled-license-sync"
  ["license/cleanup-seats"]="cleanup-seats"
  ["jobs/retry-fallback-licenses"]="retry-fallback-licenses"
  
  # Profiles
  ["profiles/check-organization"]="check-organization"
  ["profiles/create-with-organization"]="create-with-organization"
  ["profiles/get-user-organization"]="get-user-organization"
  
  # Data
  ["data/query-table"]="query-table"
  ["data/mutate-table"]="mutate-table"
  ["data/ticket-management"]="ticket-management"
  ["data/ticket-attachments"]="ticket-attachments"
  ["data/cleanup-cost-data"]="cleanup-cost-data"
  
  # KB
  ["kb/kb-analytics-dashboard"]="kb-analytics-dashboard"
  ["kb/kb-ai-suggestions"]="kb-ai-suggestions"
  ["kb/kb-export-pdf"]="kb-export-pdf"
  ["kb/increment-article-views"]="increment-article-views"
  ["kb/increment-article-helpful"]="increment-article-helpful"
  ["kb/track-article-view-detailed"]="track-article-view-detailed"
  ["kb/kb-article-tracking"]="kb-article-tracking"
  
  # Reports
  ["reports/generate-pdf-report"]="generate-pdf-report"
  ["reports/generate-excel-report"]="generate-excel-report"
  ["reports/generate-security-pdf"]="generate-security-pdf"
  ["reports/security-scan-pdf-export"]="security-scan-pdf-export"
  ["reports/generate-remediation-script"]="generate-remediation-script"
  
  # Notifications
  ["notifications/send-email"]="send-email"
  ["notifications/send-notification"]="send-notification"
  ["notifications/get-communication-logs"]="get-communication-logs"
  ["notifications/manage-email-preferences"]="manage-email-preferences"
  
  # Jobs
  ["jobs/process-background-jobs"]="process-background-jobs"
  ["jobs/list-background-jobs"]="list-background-jobs"
  ["jobs/execute-scheduled-job"]="execute-scheduled-job"
  ["jobs/scheduled-scan-executor"]="scheduled-scan-executor"
  ["jobs/send-scheduled-emails"]="send-scheduled-emails"
  ["jobs/cleanup-expired-oauth-states"]="cleanup-expired-oauth-states"
  ["jobs/cleanup-expired-external-ids"]="cleanup-expired-external-ids"
  ["jobs/cleanup-stuck-scans"]="cleanup-stuck-scans"
  ["jobs/auto-cleanup-stuck-scans"]="auto-cleanup-stuck-scans"
  ["jobs/initial-data-load"]="initial-data-load"
  ["jobs/process-events"]="process-events"
  ["jobs/scheduled-view-refresh"]="scheduled-view-refresh"
  ["jobs/sync-resource-inventory"]="sync-resource-inventory"
  
  # Organizations
  ["organizations/create-organization-account"]="create-organization-account"
  ["organizations/sync-organization-accounts"]="sync-organization-accounts"
  
  # Integrations
  ["integrations/create-jira-ticket"]="create-jira-ticket"
  ["integrations/cloudformation-webhook"]="cloudformation-webhook"
  
  # Cloud
  ["cloud/list-cloud-credentials"]="list-cloud-credentials"
  
  # Azure
  ["azure/azure-oauth-initiate"]="azure-oauth-initiate"
  ["azure/azure-oauth-callback"]="azure-oauth-callback"
  ["azure/azure-oauth-refresh"]="azure-oauth-refresh"
  ["azure/azure-oauth-revoke"]="azure-oauth-revoke"
  ["azure/validate-azure-credentials"]="validate-azure-credentials"
  ["azure/validate-azure-permissions"]="validate-azure-permissions"
  ["azure/save-azure-credentials"]="save-azure-credentials"
  ["azure/list-azure-credentials"]="list-azure-credentials"
  ["azure/delete-azure-credentials"]="delete-azure-credentials"
  ["azure/azure-security-scan"]="azure-security-scan"
  ["azure/start-azure-security-scan"]="start-azure-security-scan"
  ["azure/azure-defender-scan"]="azure-defender-scan"
  ["azure/azure-compliance-scan"]="azure-compliance-scan"
  ["azure/azure-well-architected-scan"]="azure-well-architected-scan"
  ["azure/azure-cost-optimization"]="azure-cost-optimization"
  ["azure/azure-reservations-analyzer"]="azure-reservations-analyzer"
  ["azure/azure-fetch-costs"]="azure-fetch-costs"
  ["azure/azure-resource-inventory"]="azure-resource-inventory"
  ["azure/azure-activity-logs"]="azure-activity-logs"
  ["azure/azure-fetch-monitor-metrics"]="azure-fetch-monitor-metrics"
  ["azure/azure-detect-anomalies"]="azure-detect-anomalies"
  ["azure/azure-fetch-edge-services"]="azure-fetch-edge-services"
  ["azure/debug-azure-costs"]="debug-azure-costs"
  
  # Storage
  ["storage/storage-handlers"]="storage-download storage-delete upload-attachment"
  
  # Debug
  ["debug/check-daily-costs"]="check-daily-costs"
  ["debug/diagnose-cost-dashboard"]="diagnose-cost-dashboard"
  ["debug/investigate-data-mismatch"]="investigate-data-mismatch"
  
  # Maintenance
  ["maintenance/auto-cleanup-stuck-scans"]="maintenance-auto-cleanup-stuck-scans"
  ["maintenance/cleanup-stuck-scans-simple"]="cleanup-stuck-scans-simple"
  
  # System
  ["system/add-status-column"]="add-status-column"
  ["system/db-init"]="db-init"
  ["system/debug-org-query"]="debug-org-query"
  ["system/fix-azure-constraints"]="fix-azure-constraints"
  ["system/run-migrations"]="run-migrations"
  ["system/run-sql-migration"]="run-sql-migration"
  
  # User
  ["user/notification-settings"]="notification-settings"
  
  # WebSocket
  ["websocket/connect"]="websocket-connect"
  ["websocket/disconnect"]="websocket-disconnect"
)

# =============================================================================
# Deploy Function
# =============================================================================
deploy_lambda() {
  local handler_path=$1
  local lambda_name=$2
  local handler_file
  handler_file=$(basename "$handler_path")
  
  local full_name="${LAMBDA_PREFIX}-${lambda_name}"
  local handler_source="backend/dist/handlers/${handler_path}.js"
  
  # Validar que o arquivo fonte existe
  if [ ! -f "$handler_source" ]; then
    log_error "Handler not found: $handler_source"
    return 1
  fi
  
  # ==========================================================================
  # SAFETY CHECK: Block incremental deploy for handlers that import @aws-sdk
  # @aws-sdk is NOT in the Lambda Layer — it must be bundled by esbuild (FULL_SAM)
  # Incremental deploy copies .js without bundling → runtime crash
  # ==========================================================================
  local handler_ts="backend/src/handlers/${handler_path}.ts"
  local handler_js="backend/dist/handlers/${handler_path}.js"
  if [ -f "$handler_ts" ] && grep -qE '^\s*(import|require).*@aws-sdk/' "$handler_ts"; then
    log_error "BLOCKED: $full_name imports @aws-sdk/* — incremental deploy would break it. Use FULL_SAM."
    return 1
  fi
  # Fallback: also check compiled .js in case .ts is unavailable
  if grep -qE 'require\("@aws-sdk/' "$handler_source" 2>/dev/null; then
    log_error "BLOCKED: $full_name compiled output requires @aws-sdk/* — incremental deploy would break it. Use FULL_SAM."
    return 1
  fi
  # ==========================================================================
  # SAFETY CHECK: Block incremental deploy for handlers with dynamic import() of lib/
  # Dynamic imports compile to require('../../lib/...') with single quotes
  # which may not be rewritten correctly by sed path substitution
  # ==========================================================================
  if [ -f "$handler_ts" ] && grep -qE "import\s*\(\s*['\"]\.\.\/\.\.\/lib\/" "$handler_ts"; then
    log_error "BLOCKED: $full_name has dynamic import() of lib/ — incremental deploy is unreliable. Use FULL_SAM."
    return 1
  fi
  # Fallback: check compiled .js for dynamic require of lib/ with single quotes
  if grep -qE "require\('\.\.\/\.\.\/lib\/" "$handler_source" 2>/dev/null; then
    log_error "BLOCKED: $full_name compiled output has unrewritten lib/ require paths. Use FULL_SAM."
    return 1
  fi
  # ==========================================================================
  
  # Criar diretório temporário
  local temp_dir
  temp_dir=$(mktemp -d)
  trap "rm -rf '$temp_dir'" RETURN
  
  # Copiar handler e ajustar imports (both single and double quotes from tsc output)
  sed 's|require("../../lib/|require("./lib/|g' "$handler_source" | \
  sed "s|require('../../lib/|require('./lib/|g" | \
  sed 's|require("../lib/|require("./lib/|g' | \
  sed "s|require('../lib/|require('./lib/|g" | \
  sed 's|require("../../types/|require("./types/|g' | \
  sed "s|require('../../types/|require('./types/|g" > "${temp_dir}/${handler_file}.js"
  
  # Copiar lib e types
  cp -r backend/dist/lib "${temp_dir}/"
  cp -r backend/dist/types "${temp_dir}/"
  
  # Criar ZIP
  (cd "${temp_dir}" && zip -rq lambda.zip .)
  
  # Verificar se Lambda existe e atualizar
  if aws lambda get-function --function-name "$full_name" --region "$REGION" > /dev/null 2>&1; then
    if aws lambda update-function-code \
      --function-name "$full_name" \
      --zip-file "fileb://${temp_dir}/lambda.zip" \
      --region "$REGION" \
      --no-cli-pager > /dev/null; then
      
      aws lambda wait function-updated --function-name "$full_name" --region "$REGION"
      log_success "$full_name"
      return 0
    else
      log_error "Failed: $full_name"
      return 1
    fi
  else
    log_warning "$full_name not found - skipping"
    return 0
  fi
}

# =============================================================================
# Main
# =============================================================================
main() {
  log_info "Lambda Deployment - Prefix: $LAMBDA_PREFIX | Region: $REGION"

  local deployed=0 skipped=0 failed=0

  if [ "$DEPLOY_ALL" = "true" ]; then
    log_warning "Deploying ALL Lambdas"
    
    for handler in "${!HANDLER_MAP[@]}"; do
      for lambda in ${HANDLER_MAP[$handler]}; do
        if [ -f "backend/dist/handlers/${handler}.js" ]; then
          if deploy_lambda "$handler" "$lambda"; then
            deployed=$((deployed + 1))
          else
            failed=$((failed + 1))
          fi
        else
          skipped=$((skipped + 1))
        fi
      done
    done
  else
    log_info "Deploying changed handlers: $CHANGED_HANDLERS"
    
    for handler in $CHANGED_HANDLERS; do
      handler="${handler%.ts}"
      handler="${handler%.js}"
      
      local lambdas="${HANDLER_MAP[$handler]:-}"
      if [ -n "$lambdas" ]; then
        for lambda in $lambdas; do
          if [ -f "backend/dist/handlers/${handler}.js" ]; then
            if deploy_lambda "$handler" "$lambda"; then
              deployed=$((deployed + 1))
            else
              failed=$((failed + 1))
            fi
          else
            skipped=$((skipped + 1))
          fi
        done
      else
        log_warning "No mapping for: $handler"
        skipped=$((skipped + 1))
      fi
    done
  fi

  echo ""
  log_info "Results: Deployed=$deployed Skipped=$skipped Failed=$failed"
  
  [ "$failed" -eq 0 ] || exit 1
}

main "$@"
