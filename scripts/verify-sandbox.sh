#!/bin/bash
# =============================================================================
# Verify Sandbox Environment
#
# Validates the complete sandbox environment by checking all critical
# infrastructure components. This script is read-only — it never modifies
# any resources.
#
# Checks performed:
#   1. All Lambdas with prefix evo-uds-v3-sandbox-* are Active
#   2. All Lambdas have ARM64 architecture
#   3. All Lambdas are in the correct VPC (subnets + security group)
#   4. No Lambda env vars reference production domains
#   5. API Gateway health check responds (HTTP 200)
#   6. CloudFront frontend responds (HTTP 200)
#   7. RDS connectivity (if psql available)
#   8. SSM parameters exist under /evo/sandbox/
#
# Usage:
#   ./scripts/verify-sandbox.sh
#   ./scripts/verify-sandbox.sh --dry-run
#   ./scripts/verify-sandbox.sh --verbose
#   ./scripts/verify-sandbox.sh --dry-run --verbose
#
# Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
AWS_PROFILE="EVO_SANDBOX"
AWS_REGION="us-east-1"
LAMBDA_PREFIX="evo-uds-v3-sandbox"
EXPECTED_SUBNETS="subnet-0edbe4968ff3a5a9e subnet-01931c820b0b0e864"
EXPECTED_SG="sg-0f14fd661fc5c41ba"
API_HEALTH_URL="https://api.evo.sandbox.nuevacore.com/api/functions/health-check"
FRONTEND_URL="https://evo.sandbox.nuevacore.com"
RDS_HOST="evo-uds-v3-sandbox-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com"
RDS_DB="evouds"
RDS_USER="evoadmin"
SSM_PREFIX="/evo/sandbox"
EXPECTED_SSM_PARAMS="token-encryption-key azure-oauth-client-secret webauthn-rp-id webauthn-rp-name"

# Production domains that should NOT appear in sandbox env vars.
# WEBAUTHN_RP_ID=nuevacore.com is OK (shared registrable domain).
PROD_DOMAIN_PATTERN="evo\\.nuevacore\\.com"

DRY_RUN=false
VERBOSE=false

# Counters
PASS=0
FAIL=0
SKIP=0

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--verbose]"
      echo ""
      echo "Options:"
      echo "  --dry-run   Show what checks would be performed without executing them"
      echo "  --verbose   Show detailed output for each check"
      echo "  --help      Show this help message"
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
log()     { echo "[$(date '+%H:%M:%S')] $*"; }
info()    { log "INFO  $*"; }
warn()    { log "WARN  $*"; }
err()     { log "ERROR $*" >&2; }
verbose() { $VERBOSE && log "      $*" || true; }

check_pass() {
  PASS=$((PASS + 1))
  info "✅ PASS — $*"
}

check_fail() {
  FAIL=$((FAIL + 1))
  info "❌ FAIL — $*"
}

check_skip() {
  SKIP=$((SKIP + 1))
  info "⏭️  SKIP — $*"
}

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
info "=========================================="
info "  Sandbox Environment Verification"
info "=========================================="
info "Profile: $AWS_PROFILE | Region: $AWS_REGION"
info ""

if $DRY_RUN; then
  info "*** DRY-RUN MODE — checks will be listed but not executed ***"
  info ""
  info "Checks that would be performed:"
  info "  1. List Lambdas with prefix ${LAMBDA_PREFIX}-* and verify state Active"
  info "  2. Verify ARM64 architecture on all Lambdas"
  info "  3. Verify VPC config (subnets + SG) on all Lambdas"
  info "  4. Verify no env vars reference production domains"
  info "  5. HTTP GET ${API_HEALTH_URL}"
  info "  6. HTTP GET ${FRONTEND_URL}"
  info "  7. Test RDS connectivity to ${RDS_HOST}"
  info "  8. Verify SSM parameters under ${SSM_PREFIX}/"
  info ""
  info "Run without --dry-run to execute."
  exit 0
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

info ""
# ===========================================================================
# CHECK 1: Lambda Functions — State Active
# ===========================================================================
info "--- Check 1: Lambda Functions State ---"

LAMBDA_NAMES=$(aws lambda list-functions \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query "Functions[?starts_with(FunctionName, '${LAMBDA_PREFIX}-')].FunctionName" \
  --output text)

if [[ -z "$LAMBDA_NAMES" ]]; then
  check_fail "No Lambda functions found with prefix ${LAMBDA_PREFIX}-*"
else
  LAMBDA_COUNT=$(echo "$LAMBDA_NAMES" | wc -w | tr -d ' ')
  info "Found $LAMBDA_COUNT Lambda functions with prefix ${LAMBDA_PREFIX}-*"

  INACTIVE_COUNT=0
  for fn in $LAMBDA_NAMES; do
    STATE=$(aws lambda get-function \
      --function-name "$fn" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --query "Configuration.State" \
      --output text 2>/dev/null || echo "UNKNOWN")

    if [[ "$STATE" != "Active" ]]; then
      INACTIVE_COUNT=$((INACTIVE_COUNT + 1))
      verbose "$fn — State: $STATE (expected Active)"
    else
      verbose "$fn — Active ✓"
    fi
  done

  if [[ $INACTIVE_COUNT -eq 0 ]]; then
    check_pass "All $LAMBDA_COUNT Lambdas are Active"
  else
    check_fail "$INACTIVE_COUNT/$LAMBDA_COUNT Lambdas are NOT Active"
  fi
fi

info ""

# ===========================================================================
# CHECK 2: Lambda Functions — ARM64 Architecture
# ===========================================================================
info "--- Check 2: Lambda Architecture (ARM64) ---"

if [[ -z "$LAMBDA_NAMES" ]]; then
  check_skip "No Lambdas to check architecture"
else
  NON_ARM_COUNT=0
  for fn in $LAMBDA_NAMES; do
    ARCH=$(aws lambda get-function-configuration \
      --function-name "$fn" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --query "Architectures[0]" \
      --output text 2>/dev/null || echo "UNKNOWN")

    if [[ "$ARCH" != "arm64" ]]; then
      NON_ARM_COUNT=$((NON_ARM_COUNT + 1))
      verbose "$fn — Architecture: $ARCH (expected arm64)"
    else
      verbose "$fn — arm64 ✓"
    fi
  done

  if [[ $NON_ARM_COUNT -eq 0 ]]; then
    check_pass "All $LAMBDA_COUNT Lambdas have ARM64 architecture"
  else
    check_fail "$NON_ARM_COUNT/$LAMBDA_COUNT Lambdas do NOT have ARM64 architecture"
  fi
fi

info ""

# ===========================================================================
# CHECK 3: Lambda Functions — VPC Configuration
# ===========================================================================
info "--- Check 3: Lambda VPC Configuration ---"

if [[ -z "$LAMBDA_NAMES" ]]; then
  check_skip "No Lambdas to check VPC config"
else
  VPC_FAIL_COUNT=0
  for fn in $LAMBDA_NAMES; do
    VPC_CONFIG=$(aws lambda get-function-configuration \
      --function-name "$fn" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --query "VpcConfig" \
      --output json 2>/dev/null || echo "{}")

    FN_SUBNETS=$(echo "$VPC_CONFIG" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(' '.join(sorted(d.get('SubnetIds', []))))
except: print('')
" 2>/dev/null || echo "")

    FN_SGS=$(echo "$VPC_CONFIG" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(' '.join(sorted(d.get('SecurityGroupIds', []))))
except: print('')
" 2>/dev/null || echo "")

    EXPECTED_SORTED=$(echo "$EXPECTED_SUBNETS" | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ $//')
    FN_SUBNETS_SORTED=$(echo "$FN_SUBNETS" | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ $//')

    SUBNET_OK=true
    SG_OK=true

    if [[ "$FN_SUBNETS_SORTED" != "$EXPECTED_SORTED" ]]; then
      SUBNET_OK=false
    fi

    if ! echo "$FN_SGS" | grep -q "$EXPECTED_SG"; then
      SG_OK=false
    fi

    if ! $SUBNET_OK || ! $SG_OK; then
      VPC_FAIL_COUNT=$((VPC_FAIL_COUNT + 1))
      verbose "$fn — Subnets: $FN_SUBNETS (expected: $EXPECTED_SUBNETS)"
      verbose "$fn — SGs: $FN_SGS (expected: $EXPECTED_SG)"
    else
      verbose "$fn — VPC config ✓"
    fi
  done

  if [[ $VPC_FAIL_COUNT -eq 0 ]]; then
    check_pass "All $LAMBDA_COUNT Lambdas are in the correct VPC"
  else
    check_fail "$VPC_FAIL_COUNT/$LAMBDA_COUNT Lambdas have incorrect VPC configuration"
  fi
fi

info ""
# ===========================================================================
# CHECK 4: Lambda Functions — No Production Domain References
# ===========================================================================
info "--- Check 4: No Production Domain References ---"

if [[ -z "$LAMBDA_NAMES" ]]; then
  check_skip "No Lambdas to check env vars"
else
  PROD_REF_COUNT=0
  for fn in $LAMBDA_NAMES; do
    ENV_VARS=$(aws lambda get-function-configuration \
      --function-name "$fn" \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --query "Environment.Variables" \
      --output json 2>/dev/null || echo "{}")

    # Check each env var for production domain references.
    # Allow WEBAUTHN_RP_ID=nuevacore.com (shared registrable domain).
    PROD_REFS=$(echo "$ENV_VARS" | python3 -c "
import sys, json, re
try:
    d = json.load(sys.stdin)
    if not d: sys.exit(0)
    pattern = re.compile(r'(?<!sandbox\.)evo\.nuevacore\.com')
    hits = []
    for k, v in d.items():
        if k == 'WEBAUTHN_RP_ID':
            continue
        if pattern.search(str(v)):
            hits.append(f'{k}={v}')
    if hits:
        print('\n'.join(hits))
except:
    pass
" 2>/dev/null || echo "")

    if [[ -n "$PROD_REFS" ]]; then
      PROD_REF_COUNT=$((PROD_REF_COUNT + 1))
      verbose "$fn — Production domain references found:"
      while IFS= read -r ref; do
        verbose "  $ref"
      done <<< "$PROD_REFS"
    else
      verbose "$fn — No production domain references ✓"
    fi
  done

  if [[ $PROD_REF_COUNT -eq 0 ]]; then
    check_pass "No Lambdas reference production domains"
  else
    check_fail "$PROD_REF_COUNT/$LAMBDA_COUNT Lambdas reference production domains"
  fi
fi

info ""

# ===========================================================================
# CHECK 5: API Gateway Health Check
# ===========================================================================
info "--- Check 5: API Gateway Health Check ---"

if ! command -v curl &> /dev/null; then
  check_skip "curl not available — cannot test API health check"
else
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$API_HEALTH_URL" 2>/dev/null || echo "000")
  verbose "GET $API_HEALTH_URL → HTTP $HTTP_STATUS"

  if [[ "$HTTP_STATUS" == "200" ]]; then
    check_pass "API health check returned HTTP 200"
  elif [[ "$HTTP_STATUS" == "000" ]]; then
    check_fail "API health check — connection failed (timeout or DNS resolution error)"
  else
    check_fail "API health check returned HTTP $HTTP_STATUS (expected 200)"
  fi
fi

info ""

# ===========================================================================
# CHECK 6: CloudFront Frontend
# ===========================================================================
info "--- Check 6: CloudFront Frontend ---"

if ! command -v curl &> /dev/null; then
  check_skip "curl not available — cannot test frontend"
else
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$FRONTEND_URL" 2>/dev/null || echo "000")
  verbose "GET $FRONTEND_URL → HTTP $HTTP_STATUS"

  if [[ "$HTTP_STATUS" == "200" ]]; then
    check_pass "Frontend returned HTTP 200"
  elif [[ "$HTTP_STATUS" == "000" ]]; then
    check_fail "Frontend — connection failed (timeout or DNS resolution error)"
  else
    # CloudFront may return 403 if no index.html yet, or 301/302 redirects
    if [[ "$HTTP_STATUS" =~ ^(301|302|303|307|308)$ ]]; then
      check_pass "Frontend returned HTTP $HTTP_STATUS (redirect — CloudFront is responding)"
    else
      check_fail "Frontend returned HTTP $HTTP_STATUS (expected 200)"
    fi
  fi
fi

info ""

# ===========================================================================
# CHECK 7: RDS Connectivity
# ===========================================================================
info "--- Check 7: RDS Connectivity ---"

if ! command -v psql &> /dev/null; then
  check_skip "psql not available — cannot test RDS connectivity (install postgresql-client to enable)"
else
  verbose "Testing connection to $RDS_HOST:5432/$RDS_DB as $RDS_USER"

  if PGPASSWORD="${PGPASSWORD:-}" psql \
    -h "$RDS_HOST" \
    -U "$RDS_USER" \
    -d "$RDS_DB" \
    -p 5432 \
    -c "SELECT 1;" \
    --no-psqlrc \
    -q \
    > /dev/null 2>&1; then
    check_pass "RDS connection successful ($RDS_HOST)"
  else
    check_fail "RDS connection failed ($RDS_HOST) — check credentials, SG, and network access"
  fi
fi

info ""

# ===========================================================================
# CHECK 8: SSM Parameters
# ===========================================================================
info "--- Check 8: SSM Parameters ---"

SSM_MISSING=0
for param in $EXPECTED_SSM_PARAMS; do
  FULL_PATH="${SSM_PREFIX}/${param}"
  if aws ssm get-parameter \
    --name "$FULL_PATH" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query "Parameter.Name" \
    --output text > /dev/null 2>&1; then
    verbose "$FULL_PATH — exists ✓"
  else
    SSM_MISSING=$((SSM_MISSING + 1))
    verbose "$FULL_PATH — MISSING"
  fi
done

TOTAL_SSM=$(echo "$EXPECTED_SSM_PARAMS" | wc -w | tr -d ' ')
if [[ $SSM_MISSING -eq 0 ]]; then
  check_pass "All $TOTAL_SSM SSM parameters exist under ${SSM_PREFIX}/"
else
  check_fail "$SSM_MISSING/$TOTAL_SSM SSM parameters are missing"
fi

info ""
# ===========================================================================
# Summary
# ===========================================================================
TOTAL=$((PASS + FAIL + SKIP))

info "=========================================="
info "  Verification Summary"
info "=========================================="
info "  ✅ Passed:  $PASS"
info "  ❌ Failed:  $FAIL"
info "  ⏭️  Skipped: $SKIP"
info "  📊 Total:   $TOTAL"
info "=========================================="

if [[ $FAIL -eq 0 ]]; then
  info ""
  info "🎉 All checks passed! Sandbox environment is healthy."
  exit 0
else
  info ""
  info "⚠️  $FAIL check(s) failed. Review the output above for details."
  info "Run with --verbose for detailed per-Lambda output."
  exit 1
fi
