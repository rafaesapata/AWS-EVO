#!/bin/bash
# =============================================================================
# Update environment variables across all EVO Lambda functions
# 
# Usage:
#   ./scripts/update-lambda-env-vars.sh [environment]
#
# Examples:
#   ./scripts/update-lambda-env-vars.sh production
#   ./scripts/update-lambda-env-vars.sh sandbox
#
# This script:
# 1. Lists all Lambda functions matching the project prefix
# 2. For each function, reads current env vars
# 3. Merges/updates the specified variables
# 4. Updates the function configuration
# =============================================================================

set -euo pipefail

ENV="${1:-production}"
PREFIX="evo-uds-v3-${ENV}"
REGION="us-east-1"
PROFILE="${2:-EVO_PRODUCTION}"

# Variables to update — read from environment or .env file, never hardcode secrets
TOKEN_ENCRYPTION_KEY="${TOKEN_ENCRYPTION_KEY:?ERROR: TOKEN_ENCRYPTION_KEY not set. Export it or source .env first.}"
AZURE_OAUTH_REDIRECT_URI="${AZURE_OAUTH_REDIRECT_URI:-https://evo.nuevacore.com/azure/callback}"

echo "=== Updating Lambda env vars for prefix: ${PREFIX} ==="
echo "Region: ${REGION}"
echo "Profile: ${PROFILE}"
echo "TOKEN_ENCRYPTION_KEY: ${TOKEN_ENCRYPTION_KEY:0:10}..."
echo "AZURE_OAUTH_REDIRECT_URI: ${AZURE_OAUTH_REDIRECT_URI}"
echo ""

# List all Lambda functions with our prefix (handles pagination)
FUNCTIONS=""
NEXT_MARKER=""
while true; do
  if [ -z "$NEXT_MARKER" ]; then
    RESPONSE=$(aws lambda list-functions \
      --region "${REGION}" \
      --profile "${PROFILE}" \
      --max-items 200 \
      --output json 2>/dev/null)
  else
    RESPONSE=$(aws lambda list-functions \
      --region "${REGION}" \
      --profile "${PROFILE}" \
      --max-items 200 \
      --starting-token "${NEXT_MARKER}" \
      --output json 2>/dev/null)
  fi
  
  PAGE_FUNCTIONS=$(echo "$RESPONSE" | jq -r ".Functions[] | select(.FunctionName | startswith(\"${PREFIX}\")) | .FunctionName")
  FUNCTIONS="${FUNCTIONS} ${PAGE_FUNCTIONS}"
  
  NEXT_MARKER=$(echo "$RESPONSE" | jq -r '.NextMarker // empty')
  if [ -z "$NEXT_MARKER" ]; then
    break
  fi
done

FUNCTIONS=$(echo "$FUNCTIONS" | xargs)

if [ -z "$FUNCTIONS" ]; then
  echo "ERROR: No Lambda functions found with prefix '${PREFIX}'"
  exit 1
fi

TOTAL=$(echo "$FUNCTIONS" | wc -w | tr -d ' ')
echo "Found ${TOTAL} Lambda functions"
echo ""

UPDATED=0
FAILED=0

for FUNC in $FUNCTIONS; do
  echo -n "Updating ${FUNC}... "
  
  # Get current environment variables
  CURRENT_ENV=$(aws lambda get-function-configuration \
    --function-name "${FUNC}" \
    --region "${REGION}" \
    --profile "${PROFILE}" \
    --query "Environment.Variables" \
    --output json 2>/dev/null)
  
  if [ "$CURRENT_ENV" = "null" ] || [ -z "$CURRENT_ENV" ]; then
    CURRENT_ENV="{}"
  fi
  
  # Merge new variables using jq
  UPDATED_ENV=$(echo "$CURRENT_ENV" | jq \
    --arg tek "$TOKEN_ENCRYPTION_KEY" \
    --arg aori "$AZURE_OAUTH_REDIRECT_URI" \
    '. + {
      "TOKEN_ENCRYPTION_KEY": $tek,
      "AZURE_OAUTH_REDIRECT_URI": $aori
    }')
  
  # Update the function
  if aws lambda update-function-configuration \
    --function-name "${FUNC}" \
    --region "${REGION}" \
    --profile "${PROFILE}" \
    --environment "{\"Variables\": ${UPDATED_ENV}}" \
    --output text \
    --query "FunctionName" > /dev/null 2>&1; then
    echo "OK"
    UPDATED=$((UPDATED + 1))
  else
    echo "FAILED"
    FAILED=$((FAILED + 1))
  fi
  
  # Small delay to avoid API throttling
  sleep 0.3
done

echo ""
echo "=== Summary ==="
echo "Total:   ${TOTAL}"
echo "Updated: ${UPDATED}"
echo "Failed:  ${FAILED}"

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "WARNING: Some functions failed to update. Check AWS credentials and permissions."
  exit 1
fi

echo ""
echo "All Lambda functions updated successfully."
