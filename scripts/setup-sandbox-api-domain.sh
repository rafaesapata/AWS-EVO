#!/bin/bash
# =============================================================================
# Setup Sandbox API Gateway Custom Domain
#
# Configures the custom domain `api.evo.sandbox.nuevacore.com` on the
# API Gateway HTTP API in the sandbox account. This script is idempotent —
# safe to run multiple times.
#
# Steps:
#   1. Find the wildcard certificate ARN from ACM
#   2. Get the API Gateway HTTP API ID from CloudFormation stack outputs
#   3. Create the custom domain name in API Gateway v2 (if not exists)
#   4. Create API mapping to the HTTP API with stage `prod`
#   5. Create Route53 ALIAS record pointing to the regional endpoint
#
# Usage:
#   ./scripts/setup-sandbox-api-domain.sh
#   ./scripts/setup-sandbox-api-domain.sh --dry-run
#
# Requirements: 4.3, 4.4, 4.5
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
AWS_PROFILE="EVO_SANDBOX"
AWS_REGION="us-east-1"
DOMAIN_NAME="api.evo.sandbox.nuevacore.com"
STACK_NAME="evo-uds-v3-sandbox-lambdas"
STAGE_NAME="prod"
DRY_RUN=false

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run]"
      echo ""
      echo "Options:"
      echo "  --dry-run  Show what would be done without making changes"
      echo "  --help     Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run '$0 --help' for usage."
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
info() { log "INFO  $*"; }
warn() { log "WARN  $*"; }
err()  { log "ERROR $*" >&2; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
info "=== Setup Sandbox API Gateway Custom Domain ==="
info "Profile: $AWS_PROFILE | Region: $AWS_REGION"
info "Domain:  $DOMAIN_NAME"

if $DRY_RUN; then
  info "*** DRY-RUN MODE — no changes will be made ***"
fi

# Verify AWS credentials
if ! aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1; then
  err "Cannot authenticate with profile $AWS_PROFILE. Check your AWS credentials."
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" --query "Account" --output text)
info "Authenticated — Account: $ACCOUNT_ID"

if [[ "$ACCOUNT_ID" != "971354623291" ]]; then
  err "Expected account 971354623291 (sandbox) but got $ACCOUNT_ID. Aborting."
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Find wildcard certificate ARN from ACM
# ---------------------------------------------------------------------------
info ""
info "--- Step 1: Finding wildcard certificate in ACM ---"

CERT_ARN=""

# Try *.evo.sandbox.nuevacore.com first, then *.sandbox.nuevacore.com, then *.nuevacore.com
for CERT_DOMAIN in "*.evo.sandbox.nuevacore.com" "*.sandbox.nuevacore.com" "*.nuevacore.com"; do
  info "Looking for certificate: $CERT_DOMAIN"
  CERT_ARN=$(aws acm list-certificates \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query "CertificateSummaryList[?DomainName=='${CERT_DOMAIN}' && Status=='ISSUED'].CertificateArn | [0]" \
    --output text 2>/dev/null || true)

  if [[ -n "$CERT_ARN" && "$CERT_ARN" != "None" && "$CERT_ARN" != "null" ]]; then
    info "✓ Found certificate: $CERT_ARN ($CERT_DOMAIN)"
    break
  fi
  CERT_ARN=""
done

if [[ -z "$CERT_ARN" ]]; then
  err "No wildcard certificate found for *.evo.sandbox.nuevacore.com, *.sandbox.nuevacore.com or *.nuevacore.com"
  err "Please create a certificate in ACM first."
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Get API Gateway HTTP API ID from CloudFormation stack or direct lookup
# ---------------------------------------------------------------------------
info ""
info "--- Step 2: Getting API Gateway ID ---"

# Try CloudFormation first
API_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='HttpApiId'].OutputValue | [0]" \
  --output text 2>/dev/null || true)

# If not found in CloudFormation, try direct API Gateway lookup
if [[ -z "$API_ID" || "$API_ID" == "None" || "$API_ID" == "null" ]]; then
  info "Stack not found, trying direct API Gateway lookup..."
  API_ID=$(aws apigatewayv2 get-apis \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query "Items[?Name=='evo-uds-v3-sandbox-api'].ApiId | [0]" \
    --output text 2>/dev/null || true)
fi

if [[ -z "$API_ID" || "$API_ID" == "None" || "$API_ID" == "null" ]]; then
  err "Could not find API Gateway (tried stack $STACK_NAME and direct lookup)"
  err "Make sure the API Gateway has been deployed."
  exit 1
fi

info "✓ API Gateway ID: $API_ID"

# ---------------------------------------------------------------------------
# 3. Create custom domain name in API Gateway v2
# ---------------------------------------------------------------------------
info ""
info "--- Step 3: Creating custom domain in API Gateway ---"

DOMAIN_EXISTS=false
DOMAIN_INFO=""

DOMAIN_INFO=$(aws apigatewayv2 get-domain-name \
  --domain-name "$DOMAIN_NAME" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --output json 2>/dev/null || true)

if [[ -n "$DOMAIN_INFO" && "$DOMAIN_INFO" != "" ]]; then
  DOMAIN_EXISTS=true
  info "✓ Custom domain $DOMAIN_NAME already exists — skipping creation"
else
  if $DRY_RUN; then
    info "[DRY-RUN] Would create custom domain: $DOMAIN_NAME"
    info "[DRY-RUN]   Certificate: $CERT_ARN"
    info "[DRY-RUN]   Endpoint type: REGIONAL"
  else
    info "Creating custom domain: $DOMAIN_NAME"
    DOMAIN_INFO=$(aws apigatewayv2 create-domain-name \
      --domain-name "$DOMAIN_NAME" \
      --domain-name-configurations "CertificateArn=$CERT_ARN,EndpointType=REGIONAL,SecurityPolicy=TLS_1_2" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --output json)

    if [[ $? -eq 0 ]]; then
      DOMAIN_EXISTS=true
      info "✓ Custom domain created: $DOMAIN_NAME"
    else
      err "Failed to create custom domain"
      exit 1
    fi
  fi
fi

# Extract the regional endpoint for DNS
if [[ "$DOMAIN_EXISTS" == true ]]; then
  REGIONAL_DOMAIN=$(echo "$DOMAIN_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['DomainNameConfigurations'][0]['ApiGatewayDomainName'])" 2>/dev/null || true)
  REGIONAL_HOSTED_ZONE=$(echo "$DOMAIN_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['DomainNameConfigurations'][0]['HostedZoneId'])" 2>/dev/null || true)

  if [[ -n "$REGIONAL_DOMAIN" ]]; then
    info "  Regional endpoint: $REGIONAL_DOMAIN"
    info "  Hosted zone ID:    $REGIONAL_HOSTED_ZONE"
  fi
fi

# ---------------------------------------------------------------------------
# 4. Create API mapping (HTTP API → Stage prod)
# ---------------------------------------------------------------------------
info ""
info "--- Step 4: Creating API mapping ---"

MAPPING_EXISTS=false

# Check if mapping already exists
EXISTING_MAPPINGS=$(aws apigatewayv2 get-api-mappings \
  --domain-name "$DOMAIN_NAME" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --output json 2>/dev/null || echo '{"Items":[]}')

EXISTING_MAPPING_ID=$(echo "$EXISTING_MAPPINGS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data.get('Items', []):
    if item.get('ApiId') == '$API_ID' and item.get('Stage') == '$STAGE_NAME':
        print(item.get('ApiMappingId', ''))
        break
" 2>/dev/null || true)

if [[ -n "$EXISTING_MAPPING_ID" ]]; then
  MAPPING_EXISTS=true
  info "✓ API mapping already exists (ID: $EXISTING_MAPPING_ID) — skipping"
else
  if $DRY_RUN; then
    info "[DRY-RUN] Would create API mapping:"
    info "[DRY-RUN]   API ID: $API_ID"
    info "[DRY-RUN]   Stage:  $STAGE_NAME"
    info "[DRY-RUN]   Domain: $DOMAIN_NAME"
  else
    info "Creating API mapping: $API_ID → $DOMAIN_NAME (stage: $STAGE_NAME)"
    aws apigatewayv2 create-api-mapping \
      --domain-name "$DOMAIN_NAME" \
      --api-id "$API_ID" \
      --stage "$STAGE_NAME" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --output text > /dev/null

    info "✓ API mapping created"
  fi
fi

# ---------------------------------------------------------------------------
# 5. Create Route53 ALIAS record
# ---------------------------------------------------------------------------
info ""
info "--- Step 5: Creating Route53 DNS record ---"

# Find the hosted zone for evo.sandbox.nuevacore.com, sandbox.nuevacore.com or nuevacore.com
HOSTED_ZONE_ID=""

for ZONE_NAME in "evo.sandbox.nuevacore.com." "sandbox.nuevacore.com." "nuevacore.com."; do
  info "Looking for hosted zone: $ZONE_NAME"
  HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name \
    --dns-name "$ZONE_NAME" \
    --max-items 1 \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query "HostedZones[?Name=='${ZONE_NAME}'].Id | [0]" \
    --output text 2>/dev/null || true)

  if [[ -n "$HOSTED_ZONE_ID" && "$HOSTED_ZONE_ID" != "None" && "$HOSTED_ZONE_ID" != "null" ]]; then
    # Strip /hostedzone/ prefix if present
    HOSTED_ZONE_ID="${HOSTED_ZONE_ID##*/}"
    info "✓ Found hosted zone: $HOSTED_ZONE_ID ($ZONE_NAME)"
    break
  fi
  HOSTED_ZONE_ID=""
done

if [[ -z "$HOSTED_ZONE_ID" ]]; then
  err "No Route53 hosted zone found for evo.sandbox.nuevacore.com, sandbox.nuevacore.com or nuevacore.com"
  err "Please create a hosted zone first."
  exit 1
fi

if $DRY_RUN; then
  info "[DRY-RUN] Would create/update ALIAS record:"
  info "[DRY-RUN]   Name:   $DOMAIN_NAME"
  info "[DRY-RUN]   Target: ${REGIONAL_DOMAIN:-<unknown>}"
  info "[DRY-RUN]   Zone:   $HOSTED_ZONE_ID"
elif [[ -z "$REGIONAL_DOMAIN" || -z "$REGIONAL_HOSTED_ZONE" ]]; then
  err "Cannot create DNS record — regional endpoint information not available"
  err "This can happen if the custom domain was just created. Try running the script again."
  exit 1
else
  info "Creating/updating ALIAS record: $DOMAIN_NAME → $REGIONAL_DOMAIN"

  CHANGE_BATCH=$(cat <<EOF
{
  "Comment": "API Gateway custom domain for sandbox",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "$DOMAIN_NAME",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "$REGIONAL_DOMAIN",
          "HostedZoneId": "$REGIONAL_HOSTED_ZONE",
          "EvaluateTargetHealth": false
        }
      }
    }
  ]
}
EOF
)

  CHANGE_ID=$(aws route53 change-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch "$CHANGE_BATCH" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query "ChangeInfo.Id" \
    --output text)

  info "✓ DNS record created/updated (Change ID: $CHANGE_ID)"
  info "  Note: DNS propagation may take a few minutes"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
info ""
info "=== Done ==="
info "Custom domain setup for $DOMAIN_NAME:"
info "  Certificate:      $CERT_ARN"
info "  API Gateway ID:   $API_ID"
info "  Regional endpoint: ${REGIONAL_DOMAIN:-<pending>}"
info "  Route53 zone:     ${HOSTED_ZONE_ID:-<not set>}"
info ""
info "Verify with:"
info "  aws apigatewayv2 get-domain-name --domain-name $DOMAIN_NAME --profile $AWS_PROFILE --region $AWS_REGION"
info "  curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN_NAME/api/functions/health-check"
