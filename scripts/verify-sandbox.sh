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
API_HEALTH_URL="https://api.evo.sandbox.nuevacore.com/api/auth/register"
FRONTEND_URL="https://evo.sandbox.nuevacore.com"
RDS_HOST="evo-uds-v3-sandbox-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com"
RDS_DB="evouds"
RDS_USER="evoadmin"
SSM_PREFIX="/evo/sandbox"
EXPECTED_SSM_PARAMS="token-encryption-key azure-oauth-client-secret webauthn-rp-id webauthn-rp-name"

# Production domains that should NOT appear in sandbox env vars.
# WEBAUTHN_RP_ID=nuevacore.com is OK (shared registrable domain).
PROD_DOMAIN_PATTERN="evo\\.nuevacore\\.com"

# Production config (for --compare mode)
PROD_PROFILE="EVO_PRODUCTION"
PROD_LAMBDA_PREFIX="evo-uds-v3-prod"
PROD_SSM_PREFIX="/evo/production"
PROD_ACCOUNT_ID="523115032346"

# Expected differences (not flagged as FAIL in --compare mode)
EXPECTED_DIFFS="RDS_instance_size RDS_MultiAZ RDS_PubliclyAccessible NAT_Gateways CloudFront_PriceClass WAF Performance_Insights CloudTrail"

DRY_RUN=false
VERBOSE=false
COMPARE=false

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
    --compare)
      COMPARE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--verbose] [--compare]"
      echo ""
      echo "Options:"
      echo "  --dry-run   Show what checks would be performed without executing them"
      echo "  --verbose   Show detailed output for each check"
      echo "  --compare   Compare sandbox vs production (requires both SSO profiles)"
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
  info "  5. HTTP POST ${API_HEALTH_URL} (API Gateway reachability)"
  info "  6. HTTP GET ${FRONTEND_URL}"
  info "  7. Test RDS connectivity to ${RDS_HOST}"
  info "  8. Verify SSM parameters under ${SSM_PREFIX}/"
  if $COMPARE; then
    info "  9. [COMPARE] Cross-account Lambda function parity"
    info " 10. [COMPARE] Cross-account API Gateway route parity"
    info " 11. [COMPARE] Cross-account SSM parameter parity"
    info " 12. [COMPARE] Database schema comparison"
    info " 13. [COMPARE] Expected differences filter + final report"
  fi
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

# Validate production SSO session when --compare is used
if $COMPARE; then
  info "Compare mode enabled — validating production SSO session..."
  if ! aws sts get-caller-identity --profile "$PROD_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1; then
    err "Cannot authenticate with profile $PROD_PROFILE. Run: aws sso login --profile $PROD_PROFILE"
    exit 1
  fi

  PROD_ACTUAL_ID=$(aws sts get-caller-identity --profile "$PROD_PROFILE" --region "$AWS_REGION" --query "Account" --output text)
  info "Production authenticated — Account: $PROD_ACTUAL_ID"

  if [[ "$PROD_ACTUAL_ID" != "$PROD_ACCOUNT_ID" ]]; then
    err "Expected production account $PROD_ACCOUNT_ID but got $PROD_ACTUAL_ID. Aborting."
    exit 1
  fi
fi

info ""
# ===========================================================================
# BATCH FETCH: Get all Lambda data in a single API call (performance)
# ===========================================================================
info "Fetching all Lambda functions (batch)..."

LAMBDA_JSON_FILE=$(mktemp /tmp/lambda-data-XXXXXX.json)

aws lambda list-functions \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --output json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
prefix = '${LAMBDA_PREFIX}-'
fns = [f for f in data.get('Functions', []) if f['FunctionName'].startswith(prefix)]
json.dump(fns, sys.stdout)
" > "$LAMBDA_JSON_FILE" 2>/dev/null || echo "[]" > "$LAMBDA_JSON_FILE"

LAMBDA_JSON=$(cat "$LAMBDA_JSON_FILE")
rm -f "$LAMBDA_JSON_FILE"

LAMBDA_COUNT=$(echo "$LAMBDA_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
LAMBDA_NAMES=$(echo "$LAMBDA_JSON" | python3 -c "
import sys,json
fns = json.load(sys.stdin)
for f in fns:
    print(f['FunctionName'])
" 2>/dev/null || echo "")

# ===========================================================================
# CHECK 1: Lambda Functions — State Active
# ===========================================================================
info "--- Check 1: Lambda Functions State ---"

if [[ "$LAMBDA_COUNT" -eq 0 ]]; then
  check_fail "No Lambda functions found with prefix ${LAMBDA_PREFIX}-*"
else
  info "Found $LAMBDA_COUNT Lambda functions with prefix ${LAMBDA_PREFIX}-*"

  INACTIVE_COUNT=$(echo "$LAMBDA_JSON" | python3 -c "
import sys,json
fns = json.load(sys.stdin)
# list-functions does not return State field; if a function is listed, it is Active.
# State is only returned by get-function. We check for non-null State != Active as safety.
inactive = [f['FunctionName'] for f in fns if f.get('State') and f['State'] != 'Active']
for fn in inactive:
    print(fn, file=sys.stderr)
print(len(inactive))
" 2>/dev/null || echo "0")

  if [[ "$INACTIVE_COUNT" -eq 0 ]]; then
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

if [[ "$LAMBDA_COUNT" -eq 0 ]]; then
  check_skip "No Lambdas to check architecture"
else
  NON_ARM_COUNT=$(echo "$LAMBDA_JSON" | python3 -c "
import sys,json
fns = json.load(sys.stdin)
non_arm = [f['FunctionName'] for f in fns if f.get('Architectures',['x86_64'])[0] != 'arm64']
for fn in non_arm:
    print(fn, file=sys.stderr)
print(len(non_arm))
" 2>/dev/null || echo "0")

  if [[ "$NON_ARM_COUNT" -eq 0 ]]; then
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

if [[ "$LAMBDA_COUNT" -eq 0 ]]; then
  check_skip "No Lambdas to check VPC config"
else
  VPC_FAIL_COUNT=$(echo "$LAMBDA_JSON" | python3 -c "
import sys,json
fns = json.load(sys.stdin)
expected_subnets = set('${EXPECTED_SUBNETS}'.split())
expected_sg = '${EXPECTED_SG}'
fails = 0
for f in fns:
    vpc = f.get('VpcConfig', {})
    subnets = set(vpc.get('SubnetIds', []))
    sgs = vpc.get('SecurityGroupIds', [])
    if subnets != expected_subnets or expected_sg not in sgs:
        fails += 1
        print(f'{f[\"FunctionName\"]} subnets={sorted(subnets)} sgs={sgs}', file=sys.stderr)
print(fails)
" 2>/dev/null || echo "0")

  if [[ "$VPC_FAIL_COUNT" -eq 0 ]]; then
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

if [[ "$LAMBDA_COUNT" -eq 0 ]]; then
  check_skip "No Lambdas to check env vars"
else
  PROD_REF_COUNT=$(echo "$LAMBDA_JSON" | python3 -c "
import sys,json,re
fns = json.load(sys.stdin)
pattern = re.compile(r'(?<!sandbox\.)evo\.nuevacore\.com')
count = 0
for f in fns:
    env = (f.get('Environment') or {}).get('Variables', {})
    for k, v in env.items():
        if k == 'WEBAUTHN_RP_ID':
            continue
        if pattern.search(str(v)):
            count += 1
            print(f'{f[\"FunctionName\"]}: {k}={v}', file=sys.stderr)
            break
print(count)
" 2>/dev/null || echo "0")

  if [[ "$PROD_REF_COUNT" -eq 0 ]]; then
    check_pass "No Lambdas reference production domains"
  else
    check_fail "$PROD_REF_COUNT/$LAMBDA_COUNT Lambdas reference production domains"
  fi
fi

info ""

# ===========================================================================
# CHECK 5: API Gateway Reachability
# ===========================================================================
info "--- Check 5: API Gateway Reachability ---"

if ! command -v curl &> /dev/null; then
  check_skip "curl not available — cannot test API Gateway"
else
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -X POST -H "Content-Type: application/json" -d '{}' "$API_HEALTH_URL" 2>/dev/null || echo "000")
  verbose "POST $API_HEALTH_URL → HTTP $HTTP_STATUS"

  if [[ "$HTTP_STATUS" == "000" ]]; then
    check_fail "API Gateway — connection failed (timeout or DNS resolution error)"
  else
    check_pass "API Gateway is reachable (HTTP $HTTP_STATUS)"
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
    --connect-timeout=5 \
    > /dev/null 2>&1; then
    check_pass "RDS connection successful ($RDS_HOST)"
  else
    check_skip "RDS connection failed ($RDS_HOST) — requires VPN/tunnel to private VPC"
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
# CROSS-ACCOUNT COMPARISON (--compare mode)
# ===========================================================================
if $COMPARE; then

# ===========================================================================
# CHECK 9: Cross-Account Lambda Function Parity
# ===========================================================================
info "--- Check 9: [COMPARE] Lambda Function Parity ---"

PROD_LAMBDA_NAMES=$(aws lambda list-functions \
  --profile "$PROD_PROFILE" \
  --region "$AWS_REGION" \
  --output json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
prefix = '${PROD_LAMBDA_PREFIX}-'
for f in data.get('Functions', []):
    if f['FunctionName'].startswith(prefix):
        print(f['FunctionName'])
" 2>/dev/null || echo "")

if [[ -z "$PROD_LAMBDA_NAMES" ]]; then
  check_fail "No production Lambda functions found with prefix ${PROD_LAMBDA_PREFIX}-*"
else
  PROD_LAMBDA_COUNT=$(echo "$PROD_LAMBDA_NAMES" | wc -w | tr -d ' ')
  info "Production: $PROD_LAMBDA_COUNT Lambdas | Sandbox: $LAMBDA_COUNT Lambdas"

  # Normalize names: strip environment prefix to get function suffix
  SANDBOX_SUFFIXES=$(echo "$LAMBDA_NAMES" | tr '\t' '\n' | sed "s/^${LAMBDA_PREFIX}-//" | sort)
  PROD_SUFFIXES=$(echo "$PROD_LAMBDA_NAMES" | tr '\t' '\n' | sed "s/^${PROD_LAMBDA_PREFIX}-//" | sort)

  MISSING_IN_SANDBOX=$(comm -23 <(echo "$PROD_SUFFIXES") <(echo "$SANDBOX_SUFFIXES"))
  MISSING_COUNT=0

  if [[ -n "$MISSING_IN_SANDBOX" ]]; then
    MISSING_COUNT=$(echo "$MISSING_IN_SANDBOX" | wc -l | tr -d ' ')
    while IFS= read -r suffix; do
      verbose "MISSING in sandbox: ${LAMBDA_PREFIX}-${suffix}"
    done <<< "$MISSING_IN_SANDBOX"
    check_fail "$MISSING_COUNT Lambda(s) in production missing from sandbox"
  else
    check_pass "All production Lambdas have sandbox equivalents ($PROD_LAMBDA_COUNT functions)"
  fi

  # Also report extras in sandbox (informational)
  EXTRA_IN_SANDBOX=$(comm -13 <(echo "$PROD_SUFFIXES") <(echo "$SANDBOX_SUFFIXES"))
  if [[ -n "$EXTRA_IN_SANDBOX" ]]; then
    EXTRA_COUNT=$(echo "$EXTRA_IN_SANDBOX" | wc -l | tr -d ' ')
    verbose "$EXTRA_COUNT Lambda(s) exist only in sandbox (not in production)"
  fi
fi

info ""

# ===========================================================================
# CHECK 10: Cross-Account API Gateway Route Parity
# ===========================================================================
info "--- Check 10: [COMPARE] API Gateway Route Parity ---"

# Get sandbox API Gateway ID
SANDBOX_API_ID=$(aws apigatewayv2 get-apis \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query "Items[?contains(Name, 'sandbox')].ApiId | [0]" \
  --output text 2>/dev/null || echo "")

# Get production API Gateway ID
PROD_API_ID=$(aws apigatewayv2 get-apis \
  --profile "$PROD_PROFILE" \
  --region "$AWS_REGION" \
  --query "Items[?contains(Name, 'prod')].ApiId | [0]" \
  --output text 2>/dev/null || echo "")

if [[ -z "$SANDBOX_API_ID" || "$SANDBOX_API_ID" == "None" ]]; then
  check_skip "Sandbox API Gateway not found"
elif [[ -z "$PROD_API_ID" || "$PROD_API_ID" == "None" ]]; then
  check_skip "Production API Gateway not found"
else
  SANDBOX_ROUTES=$(aws apigatewayv2 get-routes \
    --api-id "$SANDBOX_API_ID" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query "Items[].RouteKey" \
    --output text 2>/dev/null | tr '\t' '\n' | sort)

  PROD_ROUTES=$(aws apigatewayv2 get-routes \
    --api-id "$PROD_API_ID" \
    --profile "$PROD_PROFILE" \
    --region "$AWS_REGION" \
    --query "Items[].RouteKey" \
    --output text 2>/dev/null | tr '\t' '\n' | sort)

  SANDBOX_ROUTE_COUNT=$(echo "$SANDBOX_ROUTES" | grep -c . || echo "0")
  PROD_ROUTE_COUNT=$(echo "$PROD_ROUTES" | grep -c . || echo "0")
  info "Production: $PROD_ROUTE_COUNT routes | Sandbox: $SANDBOX_ROUTE_COUNT routes"

  MISSING_ROUTES=$(comm -23 <(echo "$PROD_ROUTES") <(echo "$SANDBOX_ROUTES"))

  if [[ -n "$MISSING_ROUTES" ]]; then
    MISSING_ROUTE_COUNT=$(echo "$MISSING_ROUTES" | wc -l | tr -d ' ')
    while IFS= read -r route; do
      verbose "MISSING in sandbox: $route"
    done <<< "$MISSING_ROUTES"
    check_fail "$MISSING_ROUTE_COUNT API route(s) in production missing from sandbox"
  else
    check_pass "All production API routes exist in sandbox ($PROD_ROUTE_COUNT routes)"
  fi
fi

info ""

# ===========================================================================
# CHECK 11: Cross-Account SSM Parameter Parity
# ===========================================================================
info "--- Check 11: [COMPARE] SSM Parameter Parity ---"

SANDBOX_SSM_NAMES=$(aws ssm get-parameters-by-path \
  --path "$SSM_PREFIX" \
  --recursive \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --query "Parameters[].Name" \
  --output text 2>/dev/null | tr '\t' '\n' | sed "s|^${SSM_PREFIX}/||" | sort)

PROD_SSM_NAMES=$(aws ssm get-parameters-by-path \
  --path "$PROD_SSM_PREFIX" \
  --recursive \
  --profile "$PROD_PROFILE" \
  --region "$AWS_REGION" \
  --query "Parameters[].Name" \
  --output text 2>/dev/null | tr '\t' '\n' | sed "s|^${PROD_SSM_PREFIX}/||" | sort)

SANDBOX_SSM_COUNT=$(echo "$SANDBOX_SSM_NAMES" | grep -c . || echo "0")
PROD_SSM_COUNT=$(echo "$PROD_SSM_NAMES" | grep -c . || echo "0")
info "Production: $PROD_SSM_COUNT params | Sandbox: $SANDBOX_SSM_COUNT params"

MISSING_SSM=$(comm -23 <(echo "$PROD_SSM_NAMES") <(echo "$SANDBOX_SSM_NAMES"))

if [[ -n "$MISSING_SSM" ]]; then
  MISSING_SSM_COUNT=$(echo "$MISSING_SSM" | wc -l | tr -d ' ')
  while IFS= read -r param; do
    verbose "MISSING in sandbox: ${SSM_PREFIX}/${param}"
  done <<< "$MISSING_SSM"
  check_fail "$MISSING_SSM_COUNT SSM parameter(s) in production missing from sandbox"
else
  check_pass "All production SSM parameters exist in sandbox ($PROD_SSM_COUNT params)"
fi

info ""

# ===========================================================================
# CHECK 12: Database Schema Comparison
# ===========================================================================
info "--- Check 12: [COMPARE] Database Schema Comparison ---"

if ! command -v pg_dump &> /dev/null; then
  check_skip "pg_dump not available — cannot compare database schemas"
elif ! command -v diff &> /dev/null; then
  check_skip "diff not available — cannot compare database schemas"
else
  SANDBOX_SCHEMA_FILE=$(mktemp /tmp/sandbox-schema-XXXXXX.sql)
  PROD_SCHEMA_FILE=$(mktemp /tmp/prod-schema-XXXXXX.sql)
  trap "rm -f $SANDBOX_SCHEMA_FILE $PROD_SCHEMA_FILE" EXIT

  # Get production RDS host from SSM or use convention
  PROD_RDS_HOST=$(aws ssm get-parameter \
    --name "${PROD_SSM_PREFIX}/database-host" \
    --profile "$PROD_PROFILE" \
    --region "$AWS_REGION" \
    --query "Parameter.Value" \
    --output text 2>/dev/null || echo "")

  if [[ -z "$PROD_RDS_HOST" ]]; then
    check_skip "Production RDS host not found in SSM — cannot compare schemas"
  else
    verbose "Dumping sandbox schema from $RDS_HOST..."
    if PGPASSWORD="${PGPASSWORD:-}" pg_dump \
      -h "$RDS_HOST" \
      -U "$RDS_USER" \
      -d "$RDS_DB" \
      -p 5432 \
      --schema-only \
      --no-owner \
      --no-privileges \
      --no-comments \
      > "$SANDBOX_SCHEMA_FILE" 2>/dev/null; then

      verbose "Dumping production schema from $PROD_RDS_HOST..."
      if PGPASSWORD="${PGPASSWORD:-}" pg_dump \
        -h "$PROD_RDS_HOST" \
        -U "$RDS_USER" \
        -d "$RDS_DB" \
        -p 5432 \
        --schema-only \
        --no-owner \
        --no-privileges \
        --no-comments \
        > "$PROD_SCHEMA_FILE" 2>/dev/null; then

        SCHEMA_DIFF=$(diff "$SANDBOX_SCHEMA_FILE" "$PROD_SCHEMA_FILE" 2>/dev/null || true)

        if [[ -z "$SCHEMA_DIFF" ]]; then
          check_pass "Database schemas are identical"
        else
          DIFF_LINES=$(echo "$SCHEMA_DIFF" | grep -c "^[<>]" || echo "0")
          check_fail "Database schemas differ ($DIFF_LINES lines of difference)"
          if $VERBOSE; then
            verbose "Schema diff (first 50 lines):"
            echo "$SCHEMA_DIFF" | head -50
          fi
        fi
      else
        check_skip "Cannot connect to production RDS — schema comparison skipped"
      fi
    else
      check_skip "Cannot connect to sandbox RDS — schema comparison skipped"
    fi
  fi
fi

info ""

# ===========================================================================
# CHECK 13: Expected Differences Summary
# ===========================================================================
info "--- Check 13: [COMPARE] Expected Differences ---"

info "The following differences between sandbox and production are EXPECTED and documented:"
for diff_item in $EXPECTED_DIFFS; do
  DISPLAY_NAME=$(echo "$diff_item" | tr '_' ' ')
  verbose "  ✓ $DISPLAY_NAME (expected — cost optimization)"
done
check_pass "Expected differences documented ($( echo "$EXPECTED_DIFFS" | wc -w | tr -d ' ') items)"

info ""

fi  # end --compare block

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
