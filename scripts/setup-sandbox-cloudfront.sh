#!/bin/bash
# =============================================================================
# Setup Sandbox CloudFront Custom Domain
#
# Configures the alias `evo.sandbox.nuevacore.com` on the CloudFront
# distribution in the sandbox account. This script is idempotent —
# safe to run multiple times.
#
# Steps:
#   1. Find the wildcard certificate ARN from ACM (must be in us-east-1)
#   2. Get the current CloudFront distribution config
#   3. Add the alias and associate the certificate (if not already configured)
#   4. Create Route53 ALIAS record pointing to the CloudFront distribution
#
# Usage:
#   ./scripts/setup-sandbox-cloudfront.sh
#   ./scripts/setup-sandbox-cloudfront.sh --dry-run
#
# Requirements: 5.3, 5.5
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
AWS_PROFILE="EVO_SANDBOX"
AWS_REGION="us-east-1"
DOMAIN_NAME="evo.sandbox.nuevacore.com"
DISTRIBUTION_ID="E93EL7AJZ6QAQ"
CLOUDFRONT_DOMAIN="dikd2ie8x3ihv.cloudfront.net"
CLOUDFRONT_HOSTED_ZONE_ID="Z2FDTNDATAQYW2"  # Global CloudFront hosted zone ID (constant)
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
info "=== Setup Sandbox CloudFront Custom Domain ==="
info "Profile:      $AWS_PROFILE | Region: $AWS_REGION"
info "Domain:       $DOMAIN_NAME"
info "Distribution: $DISTRIBUTION_ID"

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
# 1. Find wildcard certificate ARN from ACM (must be in us-east-1)
# ---------------------------------------------------------------------------
info ""
info "--- Step 1: Finding wildcard certificate in ACM (us-east-1) ---"

CERT_ARN=""

# Try *.sandbox.nuevacore.com first, then *.nuevacore.com
for CERT_DOMAIN in "*.sandbox.nuevacore.com" "*.nuevacore.com"; do
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
  err "No wildcard certificate found for *.sandbox.nuevacore.com or *.nuevacore.com"
  err "CloudFront requires the certificate to be in us-east-1."
  err "Please create a certificate in ACM (us-east-1) first."
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Get current CloudFront distribution config
# ---------------------------------------------------------------------------
info ""
info "--- Step 2: Getting CloudFront distribution config ---"

DIST_CONFIG=$(aws cloudfront get-distribution-config \
  --id "$DISTRIBUTION_ID" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --output json 2>/dev/null || true)

if [[ -z "$DIST_CONFIG" ]]; then
  err "Could not get distribution config for $DISTRIBUTION_ID"
  err "Make sure the distribution exists and you have permissions."
  exit 1
fi

ETAG=$(echo "$DIST_CONFIG" | python3 -c "import sys,json; print(json.load(sys.stdin)['ETag'])")
info "✓ Distribution found (ETag: $ETAG)"

# Check if alias is already configured
ALIAS_EXISTS=$(echo "$DIST_CONFIG" | python3 -c "
import sys, json
config = json.load(sys.stdin)['DistributionConfig']
aliases = config.get('Aliases', {}).get('Items', [])
print('true' if '$DOMAIN_NAME' in aliases else 'false')
" 2>/dev/null || echo "false")

CURRENT_CERT=$(echo "$DIST_CONFIG" | python3 -c "
import sys, json
config = json.load(sys.stdin)['DistributionConfig']
cert = config.get('ViewerCertificate', {})
print(cert.get('ACMCertificateArn', 'none'))
" 2>/dev/null || echo "none")

if [[ "$ALIAS_EXISTS" == "true" ]]; then
  info "✓ Alias $DOMAIN_NAME already configured on distribution"
  info "  Current certificate: $CURRENT_CERT"
else
  info "Alias $DOMAIN_NAME NOT yet configured on distribution"
fi

# ---------------------------------------------------------------------------
# 3. Update CloudFront distribution with alias and certificate
# ---------------------------------------------------------------------------
info ""
info "--- Step 3: Updating CloudFront distribution ---"

if [[ "$ALIAS_EXISTS" == "true" ]]; then
  info "✓ Alias already configured — skipping distribution update"
else
  if $DRY_RUN; then
    info "[DRY-RUN] Would update distribution $DISTRIBUTION_ID:"
    info "[DRY-RUN]   Add alias: $DOMAIN_NAME"
    info "[DRY-RUN]   Certificate: $CERT_ARN"
    info "[DRY-RUN]   SSL method: sni-only"
    info "[DRY-RUN]   Min protocol: TLSv1.2_2021"
  else
    info "Updating distribution $DISTRIBUTION_ID with alias $DOMAIN_NAME"

    # Build the updated distribution config using python3
    UPDATED_CONFIG=$(echo "$DIST_CONFIG" | python3 -c "
import sys, json

data = json.load(sys.stdin)
config = data['DistributionConfig']

# Update Aliases
aliases = config.get('Aliases', {'Quantity': 0, 'Items': []})
items = aliases.get('Items', [])
if '$DOMAIN_NAME' not in items:
    items.append('$DOMAIN_NAME')
aliases['Items'] = items
aliases['Quantity'] = len(items)
config['Aliases'] = aliases

# Update ViewerCertificate to use the ACM certificate with SNI
config['ViewerCertificate'] = {
    'ACMCertificateArn': '$CERT_ARN',
    'SSLSupportMethod': 'sni-only',
    'MinimumProtocolVersion': 'TLSv1.2_2021',
    'Certificate': '$CERT_ARN',
    'CertificateSource': 'acm'
}

print(json.dumps(config))
")

    # Write config to temp file to avoid shell escaping issues
    TEMP_CONFIG=$(mktemp)
    echo "$UPDATED_CONFIG" > "$TEMP_CONFIG"

    aws cloudfront update-distribution \
      --id "$DISTRIBUTION_ID" \
      --if-match "$ETAG" \
      --distribution-config "file://$TEMP_CONFIG" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --output text > /dev/null

    rm -f "$TEMP_CONFIG"

    info "✓ Distribution updated with alias $DOMAIN_NAME"
    info "  Note: Distribution update may take 5-15 minutes to propagate"
  fi
fi

# ---------------------------------------------------------------------------
# 4. Create Route53 ALIAS record
# ---------------------------------------------------------------------------
info ""
info "--- Step 4: Creating Route53 DNS record ---"

# Find the hosted zone for sandbox.nuevacore.com or nuevacore.com
HOSTED_ZONE_ID=""

for ZONE_NAME in "sandbox.nuevacore.com." "nuevacore.com."; do
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
  err "No Route53 hosted zone found for sandbox.nuevacore.com or nuevacore.com"
  err "Please create a hosted zone first."
  exit 1
fi

if $DRY_RUN; then
  info "[DRY-RUN] Would create/update ALIAS record:"
  info "[DRY-RUN]   Name:   $DOMAIN_NAME"
  info "[DRY-RUN]   Target: $CLOUDFRONT_DOMAIN"
  info "[DRY-RUN]   Zone:   $HOSTED_ZONE_ID"
  info "[DRY-RUN]   CloudFront Hosted Zone: $CLOUDFRONT_HOSTED_ZONE_ID"
else
  info "Creating/updating ALIAS record: $DOMAIN_NAME → $CLOUDFRONT_DOMAIN"

  CHANGE_BATCH=$(cat <<EOF
{
  "Comment": "CloudFront custom domain for sandbox frontend",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "$DOMAIN_NAME",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "$CLOUDFRONT_DOMAIN",
          "HostedZoneId": "$CLOUDFRONT_HOSTED_ZONE_ID",
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
info "CloudFront custom domain setup for $DOMAIN_NAME:"
info "  Distribution:     $DISTRIBUTION_ID"
info "  Certificate:      $CERT_ARN"
info "  CloudFront DNS:   $CLOUDFRONT_DOMAIN"
info "  Route53 zone:     ${HOSTED_ZONE_ID:-<not set>}"
info ""
info "Verify with:"
info "  aws cloudfront get-distribution --id $DISTRIBUTION_ID --profile $AWS_PROFILE --query 'Distribution.DistributionConfig.Aliases'"
info "  curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN_NAME"
