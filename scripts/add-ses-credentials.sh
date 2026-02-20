#!/bin/bash
# Add SES credentials to email-related Lambdas
PROFILE="EVO_PRODUCTION"
REGION="us-east-1"
PREFIX="evo-uds-v3-production"

# Read SES credentials from SSM or environment
SES_KEY="${AWS_SES_ACCESS_KEY_ID:-}"
SES_SECRET="${AWS_SES_SECRET_ACCESS_KEY:-}"

if [ -z "$SES_KEY" ] || [ -z "$SES_SECRET" ]; then
  echo "Reading SES credentials from SSM..."
  SES_KEY=$(aws ssm get-parameter --name "/evo/production/ses-access-key-id" --with-decryption --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION" 2>/dev/null)
  SES_SECRET=$(aws ssm get-parameter --name "/evo/production/ses-secret-access-key" --with-decryption --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION" 2>/dev/null)
fi

if [ -z "$SES_KEY" ] || [ -z "$SES_SECRET" ]; then
  echo "ERROR: SES credentials not found. Set AWS_SES_ACCESS_KEY_ID and AWS_SES_SECRET_ACCESS_KEY or store in SSM."
  exit 1
fi

LAMBDAS=(
  "send-email"
  "send-notification"
  "send-scheduled-emails"
  "scan-report-generator"
  "check-sla-escalations"
  "check-proactive-notifications"
  "manage-email-preferences"
  "forgot-password"
  "change-password"
  "self-register"
)

for FUNC in "${LAMBDAS[@]}"; do
  FULL_NAME="${PREFIX}-${FUNC}"
  echo "=== Updating $FULL_NAME ==="
  
  # Get current env vars
  CURRENT_ENV=$(aws lambda get-function-configuration \
    --function-name "$FULL_NAME" \
    --query 'Environment.Variables' \
    --output json \
    --profile "$PROFILE" \
    --region "$REGION" 2>&1)
  
  if echo "$CURRENT_ENV" | grep -q "ResourceNotFoundException"; then
    echo "  SKIP: $FULL_NAME not found"
    continue
  fi
  
  if echo "$CURRENT_ENV" | grep -q "error"; then
    echo "  ERROR: $CURRENT_ENV"
    continue
  fi
  
  # Add SES credentials to existing env vars
  NEW_ENV=$(echo "$CURRENT_ENV" | python3 -c "
import sys, json
env = json.load(sys.stdin)
env['AWS_SES_ACCESS_KEY_ID'] = '$SES_KEY'
env['AWS_SES_SECRET_ACCESS_KEY'] = '$SES_SECRET'
print(json.dumps({'Variables': env}))
")
  
  # Update Lambda
  RESULT=$(aws lambda update-function-configuration \
    --function-name "$FULL_NAME" \
    --environment "$NEW_ENV" \
    --profile "$PROFILE" \
    --region "$REGION" \
    --query 'FunctionName' \
    --output text 2>&1)
  
  if echo "$RESULT" | grep -q "$FULL_NAME"; then
    echo "  OK: $RESULT updated"
  else
    echo "  RESULT: $RESULT"
  fi
  
  # Small delay to avoid throttling
  sleep 1
done

echo ""
echo "=== Done ==="
