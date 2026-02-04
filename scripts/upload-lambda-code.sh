#!/bin/bash
# =============================================================================
# EVO Platform - Upload Lambda Code to S3
# =============================================================================
# This script packages and uploads all Lambda handlers to S3 for CloudFormation
# deployment. It adjusts imports from ../../lib/ to ./lib/ and includes all
# necessary dependencies.
#
# Usage: ./scripts/upload-lambda-code.sh <bucket-name> [region]
# =============================================================================

set -e

# Configuration
BUCKET_NAME="${1:-}"
REGION="${2:-us-east-1}"
BACKEND_DIR="backend"
DIST_DIR="$BACKEND_DIR/dist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}" >&2; }

# Validate arguments
if [ -z "$BUCKET_NAME" ]; then
  echo "Usage: $0 <bucket-name> [region]"
  echo ""
  echo "Example:"
  echo "  $0 evo-uds-v3-production-lambda-code-123456789012 us-east-1"
  echo ""
  echo "Get bucket name from CloudFormation outputs:"
  echo "  aws cloudformation describe-stacks --stack-name evo-uds-v3-production \\"
  echo "    --query 'Stacks[0].Outputs[?OutputKey==\`LambdaCodeBucketName\`].OutputValue' --output text"
  exit 1
fi

echo ""
echo "============================================"
echo "  EVO Platform - Lambda Code Upload"
echo "============================================"
echo ""
log_info "Bucket: $BUCKET_NAME"
log_info "Region: $REGION"
echo ""

# Check if backend dist exists
if [ ! -d "$DIST_DIR" ]; then
  log_warn "Backend not built. Building now..."
  npm run build --prefix "$BACKEND_DIR" --silent
fi

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

log_info "Temp directory: $TEMP_DIR"
echo ""

# Define all handlers to upload
# Format: "category/handler-name"
declare -a HANDLERS=(
  # Data handlers
  "data/query-table"
  "data/mutate-table"
  "data/ticket-management"
  
  # Security handlers
  "security/security-scan"
  "security/compliance-scan"
  "security/well-architected-scan"
  "security/validate-aws-credentials"
  "security/validate-permissions"
  "security/guardduty-scan"
  "security/iam-deep-analysis"
  "security/drift-detection"
  "security/analyze-cloudtrail"
  "security/waf-setup-monitoring"
  "security/waf-dashboard-api"
  
  # Cost handlers
  "cost/fetch-daily-costs"
  "cost/ri-sp-analyzer"
  "cost/cost-optimization"
  "cost/budget-forecast"
  "cost/ml-waste-detection"
  "cost/finops-copilot-v2"
  
  # Auth handlers
  "auth/mfa-handlers"
  "auth/webauthn-register"
  "auth/webauthn-authenticate"
  "auth/webauthn-check-standalone"
  "auth/self-register"
  "auth/forgot-password"
  "auth/verify-tv-token"
  
  # AI handlers
  "ai/bedrock-chat"
  "ai/get-ai-notifications"
  "ai/manage-notification-rules"
  
  # AWS handlers
  "aws/save-aws-credentials"
  "aws/list-aws-credentials"
  "aws/update-aws-credentials"
  
  # Azure handlers
  "azure/validate-azure-credentials"
  "azure/save-azure-credentials"
  "azure/list-azure-credentials"
  "azure/azure-security-scan"
  "azure/azure-fetch-costs"
  
  # Dashboard handlers
  "dashboard/get-executive-dashboard"
  "dashboard/get-executive-dashboard-public"
  "dashboard/manage-tv-tokens"
  
  # Admin handlers
  "admin/admin-manage-user"
  "admin/create-user"
  "admin/create-cognito-user"
  "admin/manage-organizations"
  "admin/manage-demo-mode"
  
  # License handlers
  "license/validate-license"
  "license/sync-license"
  "license/manage-seats"
  
  # Notification handlers
  "notifications/send-email"
  "notifications/send-notification"
  "notifications/manage-email-preferences"
  
  # Monitoring handlers
  "monitoring/alerts"
  "monitoring/aws-realtime-metrics"
  "monitoring/fetch-cloudwatch-metrics"
  "monitoring/fetch-edge-services"
  "monitoring/get-platform-metrics"
  "monitoring/get-recent-errors"
  "monitoring/get-lambda-health"
  
  # Profile handlers
  "profiles/check-organization"
  "profiles/get-user-organization"
  
  # Jobs handlers
  "jobs/process-background-jobs"
  "jobs/list-background-jobs"
  "jobs/scheduled-scan-executor"
  
  # Reports handlers
  "reports/generate-pdf-report"
  "reports/generate-security-pdf"
  
  # KB handlers
  "kb/kb-analytics-dashboard"
  "kb/kb-ai-suggestions"
  
  # System handlers
  "system/db-init"
)

# Function to package a single handler
package_handler() {
  local handler_path="$1"
  local handler_name=$(basename "$handler_path")
  local handler_dir=$(dirname "$handler_path")
  local source_file="$DIST_DIR/handlers/$handler_path.js"
  
  # Check if source file exists
  if [ ! -f "$source_file" ]; then
    log_warn "Handler not found: $handler_path (skipping)"
    return 1
  fi
  
  # Create package directory
  local package_dir="$TEMP_DIR/$handler_name"
  mkdir -p "$package_dir"
  
  # Copy handler with adjusted imports
  sed 's|require("../../lib/|require("./lib/|g' "$source_file" | \
  sed 's|require("../lib/|require("./lib/|g' | \
  sed 's|require("../../types/|require("./types/|g' | \
  sed 's|require("../types/|require("./types/|g' > "$package_dir/$handler_name.js"
  
  # Copy lib and types directories
  cp -r "$DIST_DIR/lib" "$package_dir/"
  cp -r "$DIST_DIR/types" "$package_dir/"
  
  # Create zip
  local zip_file="$TEMP_DIR/$handler_name.zip"
  (cd "$package_dir" && zip -qr "$zip_file" .)
  
  # Upload to S3
  aws s3 cp "$zip_file" \
    "s3://$BUCKET_NAME/handlers/$handler_dir/$handler_name.zip" \
    --region "$REGION" \
    --quiet \
    --no-cli-pager
  
  return 0
}

# Upload handlers
log_info "Packaging and uploading handlers..."
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

for handler in "${HANDLERS[@]}"; do
  handler_name=$(basename "$handler")
  printf "  %-40s" "$handler"
  
  if package_handler "$handler"; then
    echo -e "${GREEN}✓${NC}"
    ((SUCCESS_COUNT++))
  else
    echo -e "${YELLOW}⊘${NC}"
    ((SKIP_COUNT++))
  fi
done

echo ""
echo "============================================"
echo "  Upload Summary"
echo "============================================"
echo ""
log_success "Uploaded: $SUCCESS_COUNT handlers"
if [ $SKIP_COUNT -gt 0 ]; then
  log_warn "Skipped: $SKIP_COUNT handlers (not found)"
fi
echo ""

# List uploaded files
log_info "Uploaded files in S3:"
aws s3 ls "s3://$BUCKET_NAME/handlers/" --recursive --region "$REGION" --no-cli-pager | head -20
echo ""

echo "============================================"
echo "  Next Steps"
echo "============================================"
echo ""
echo "1. Update Lambda functions to use the new code:"
echo "   aws cloudformation update-stack --stack-name evo-uds-v3-production ..."
echo ""
echo "2. Or update individual Lambda functions:"
echo "   aws lambda update-function-code \\"
echo "     --function-name evo-uds-v3-production-query-table \\"
echo "     --s3-bucket $BUCKET_NAME \\"
echo "     --s3-key handlers/data/query-table.zip"
echo ""

log_success "Upload complete!"
