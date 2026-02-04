#!/bin/bash
# Script to configure environment variables for production Lambdas
# Adds Cognito configuration to Lambdas that need it

set -e

REGION="us-east-1"
USER_POOL_ID="us-east-1_BUJecylbm"
CLIENT_ID="a761ofnfjjo7u5mhpe2r54b7j"

echo "Configuring Lambda environment variables..."

# Lambdas that need Cognito configuration
declare -a COGNITO_LAMBDAS=(
  "self-register"
  "login"
  "logout"
  "refresh-token"
  "change-password"
  "forgot-password"
  "confirm-forgot-password"
  "mfa-enroll"
  "mfa-verify-login"
  "mfa-check"
  "mfa-challenge-verify"
  "mfa-list-factors"
  "mfa-unenroll"
)

for LAMBDA in "${COGNITO_LAMBDAS[@]}"; do
  LAMBDA_NAME="evo-uds-v3-production-${LAMBDA}"
  
  echo ""
  echo "Processing: $LAMBDA_NAME"
  
  # Check if Lambda exists
  if ! AWS_PROFILE=EVO_PRODUCTION aws lambda get-function \
    --function-name "$LAMBDA_NAME" \
    --region "$REGION" \
    --no-cli-pager > /dev/null 2>&1; then
    echo "  ⚠️  Lambda not found, skipping..."
    continue
  fi
  
  # Get current environment variables
  CURRENT_ENV=$(AWS_PROFILE=EVO_PRODUCTION aws lambda get-function-configuration \
    --function-name "$LAMBDA_NAME" \
    --region "$REGION" \
    --query 'Environment.Variables' \
    --output json \
    --no-cli-pager)
  
  # Add Cognito variables (wrap in Variables key)
  UPDATED_ENV=$(echo "$CURRENT_ENV" | jq -c \
    --arg pool "$USER_POOL_ID" \
    --arg client "$CLIENT_ID" \
    '{Variables: (. + {
      "COGNITO_USER_POOL_ID": $pool,
      "COGNITO_CLIENT_ID": $client,
      "AWS_REGION_COGNITO": "us-east-1"
    })}')
  
  # Save to temp file
  echo "$UPDATED_ENV" > /tmp/lambda-env-$$.json
  
  # Update Lambda configuration
  echo "  Updating environment variables..."
  AWS_PROFILE=EVO_PRODUCTION aws lambda update-function-configuration \
    --function-name "$LAMBDA_NAME" \
    --environment file:///tmp/lambda-env-$$.json \
    --region "$REGION" \
    --no-cli-pager > /dev/null
  
  rm -f /tmp/lambda-env-$$.json
  
  echo "  ✅ Updated"
  
  # Small delay to avoid throttling
  sleep 1
done

echo ""
echo "✅ All Lambdas configured!"
echo ""
echo "Verification - checking self-register Lambda:"
AWS_PROFILE=EVO_PRODUCTION aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-self-register \
  --region "$REGION" \
  --query 'Environment.Variables' \
  --output json \
  --no-cli-pager | jq 'to_entries[] | select(.key | contains("COGNITO")) | "\(.key)=\(.value)"' -r
