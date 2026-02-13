#!/bin/bash
# =============================================================================
# Update API_DOMAIN environment variable on all Lambda functions
# Usage: ./scripts/update-api-domain.sh [--dry-run]
# =============================================================================

set -euo pipefail

CORRECT_DOMAIN="api.evo.nuevacore.com"
REGION="${AWS_REGION:-us-east-1}"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "=== DRY RUN MODE ==="
fi

echo "Region: $REGION"
echo "Target API_DOMAIN: $CORRECT_DOMAIN"
echo ""

# Get all Lambda functions with evo prefix
FUNCTIONS=$(aws lambda list-functions --region "$REGION" --query "Functions[?starts_with(FunctionName, 'evo-')].FunctionName" --output text)

if [[ -z "$FUNCTIONS" ]]; then
  echo "No evo-* Lambda functions found."
  exit 0
fi

TOTAL=0
UPDATED=0
SKIPPED=0
ERRORS=0

for FUNC in $FUNCTIONS; do
  TOTAL=$((TOTAL + 1))
  
  # Get current API_DOMAIN value
  CURRENT=$(aws lambda get-function-configuration \
    --function-name "$FUNC" \
    --region "$REGION" \
    --query "Environment.Variables.API_DOMAIN" \
    --output text 2>/dev/null || echo "NONE")

  if [[ "$CURRENT" == "$CORRECT_DOMAIN" ]]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "[$FUNC] $CURRENT -> $CORRECT_DOMAIN"

  if [[ "$DRY_RUN" == "true" ]]; then
    UPDATED=$((UPDATED + 1))
    continue
  fi

  # Get all current env vars and update API_DOMAIN
  ENV_JSON=$(aws lambda get-function-configuration \
    --function-name "$FUNC" \
    --region "$REGION" \
    --query "Environment" \
    --output json 2>/dev/null)

  if [[ -z "$ENV_JSON" || "$ENV_JSON" == "null" ]]; then
    echo "  WARN: No environment variables found, skipping"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Update API_DOMAIN in the env vars JSON
  UPDATED_ENV=$(echo "$ENV_JSON" | python3 -c "
import sys, json
env = json.load(sys.stdin)
env['Variables']['API_DOMAIN'] = '$CORRECT_DOMAIN'
print(json.dumps(env))
")

  aws lambda update-function-configuration \
    --function-name "$FUNC" \
    --region "$REGION" \
    --environment "$UPDATED_ENV" \
    --no-cli-pager > /dev/null 2>&1

  if [[ $? -eq 0 ]]; then
    UPDATED=$((UPDATED + 1))
    echo "  OK"
  else
    ERRORS=$((ERRORS + 1))
    echo "  FAILED"
  fi
done

echo ""
echo "=== Done ==="
echo "Total: $TOTAL | Updated: $UPDATED | Already correct: $SKIPPED | Errors: $ERRORS"
