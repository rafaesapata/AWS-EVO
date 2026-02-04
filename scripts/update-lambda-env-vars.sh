#!/bin/bash
# Script to update environment variables for all production Lambda functions
# This adds missing Cognito configuration

set -e

REGION="us-east-1"
COGNITO_USER_POOL_ID="us-east-1_BUJecylbm"
COGNITO_CLIENT_ID="a761ofnfjjo7u5mhpe2r54b7j"

echo "Updating Lambda environment variables..."
echo "User Pool: $COGNITO_USER_POOL_ID"
echo "Client ID: $COGNITO_CLIENT_ID"
echo ""

# Get all production Lambda functions
FUNCTIONS=$(AWS_PROFILE=EVO_PRODUCTION aws lambda list-functions \
  --region "$REGION" \
  --query 'Functions[?starts_with(FunctionName, `evo-uds-v3-production`)].FunctionName' \
  --output text \
  --no-cli-pager | tr '\t' '\n')

TOTAL=$(echo "$FUNCTIONS" | wc -l | tr -d ' ')
CURRENT=0
UPDATED=0
SKIPPED=0

echo "Found $TOTAL Lambda functions"
echo ""

for FUNC in $FUNCTIONS; do
  CURRENT=$((CURRENT + 1))
  echo "[$CURRENT/$TOTAL] Processing $FUNC..."
  
  # Get current environment variables
  CURRENT_ENV=$(AWS_PROFILE=EVO_PRODUCTION aws lambda get-function-configuration \
    --function-name "$FUNC" \
    --region "$REGION" \
    --query 'Environment.Variables' \
    --output json \
    --no-cli-pager 2>/dev/null)
  
  if [ -z "$CURRENT_ENV" ] || [ "$CURRENT_ENV" = "null" ]; then
    echo "  ⚠️  No environment variables found, skipping..."
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  
  # Add Cognito variables to existing environment
  NEW_ENV=$(echo "$CURRENT_ENV" | jq \
    --arg pool "$COGNITO_USER_POOL_ID" \
    --arg client "$COGNITO_CLIENT_ID" \
    '. + {COGNITO_USER_POOL_ID: $pool, COGNITO_CLIENT_ID: $client}')
  
  # Update Lambda configuration
  AWS_PROFILE=EVO_PRODUCTION aws lambda update-function-configuration \
    --function-name "$FUNC" \
    --environment "Variables=$NEW_ENV" \
    --region "$REGION" \
    --no-cli-pager > /dev/null 2>&1
  
  echo "  ✅ Updated"
  UPDATED=$((UPDATED + 1))
  
  # Small delay to avoid throttling
  sleep 0.3
done

echo ""
echo "✅ Update complete!"
echo "   Total: $TOTAL"
echo "   Updated: $UPDATED"
echo "   Skipped: $SKIPPED"
echo ""
echo "Verifying self-register Lambda:"
AWS_PROFILE=EVO_PRODUCTION aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-self-register \
  --region "$REGION" \
  --query 'Environment.Variables.{COGNITO_USER_POOL_ID: COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID: COGNITO_CLIENT_ID}' \
  --output json \
  --no-cli-pager | jq .
