#!/bin/bash
# Check health of critical Lambda functions
# Usage: ./scripts/check-critical-lambdas-health.sh

set -e

CRITICAL_LAMBDAS=(
  "save-aws-credentials"
  "validate-aws-credentials"
  "save-azure-credentials"
  "validate-azure-credentials"
  "security-scan"
  "compliance-scan"
  "mfa-enroll"
  "mfa-verify-login"
  "webauthn-register"
  "webauthn-authenticate"
)

echo "🔍 Checking critical Lambda health..."
echo ""

ERRORS_FOUND=0
WARNINGS_FOUND=0

for func in "${CRITICAL_LAMBDAS[@]}"; do
  FULL_NAME="evo-uds-v3-production-$func"
  
  # Check if Lambda exists
  if ! aws lambda get-function --function-name "$FULL_NAME" --region us-east-1 &>/dev/null; then
    echo "⚠️  $func: Lambda not found"
    WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
    continue
  fi
  
  # Check for errors in last hour
  ERROR_COUNT=$(aws logs filter-log-events \
    --log-group-name "/aws/lambda/$FULL_NAME" \
    --start-time $(date -v-1H +%s000) \
    --filter-pattern "ERROR" \
    --region us-east-1 \
    --query 'length(events)' \
    --output text 2>/dev/null || echo "0")
  
  # Remove any whitespace/newlines
  ERROR_COUNT=$(echo "$ERROR_COUNT" | tr -d '\n' | tr -d ' ')
  
  # Check for ImportModuleError specifically
  IMPORT_ERRORS=$(aws logs filter-log-events \
    --log-group-name "/aws/lambda/$FULL_NAME" \
    --start-time $(date -v-1H +%s000) \
    --filter-pattern "Runtime.ImportModuleError" \
    --region us-east-1 \
    --query 'length(events)' \
    --output text 2>/dev/null || echo "0")
  
  # Remove any whitespace/newlines
  IMPORT_ERRORS=$(echo "$IMPORT_ERRORS" | tr -d '\n' | tr -d ' ')
  
  if [ "$IMPORT_ERRORS" -gt 0 ]; then
    echo "🔴 $func: CRITICAL - ImportModuleError detected (deploy issue)"
    ERRORS_FOUND=$((ERRORS_FOUND + 1))
    
    # Show last error
    echo "   Last error:"
    aws logs filter-log-events \
      --log-group-name "/aws/lambda/$FULL_NAME" \
      --start-time $(date -v-1H +%s000) \
      --filter-pattern "Runtime.ImportModuleError" \
      --region us-east-1 \
      --query 'events[-1].message' \
      --output text 2>/dev/null | head -3 | sed 's/^/   /'
    echo ""
  elif [ "$ERROR_COUNT" -gt 10 ]; then
    echo "🔴 $func: CRITICAL - $ERROR_COUNT errors in last hour"
    ERRORS_FOUND=$((ERRORS_FOUND + 1))
    
    # Show last error
    echo "   Last error:"
    aws logs filter-log-events \
      --log-group-name "/aws/lambda/$FULL_NAME" \
      --start-time $(date -v-1H +%s000) \
      --filter-pattern "ERROR" \
      --region us-east-1 \
      --query 'events[-1].message' \
      --output text 2>/dev/null | head -3 | sed 's/^/   /'
    echo ""
  elif [ "$ERROR_COUNT" -gt 0 ]; then
    echo "⚠️  $func: $ERROR_COUNT errors in last hour"
    WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
  else
    echo "✅ $func: No errors"
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS_FOUND -eq 0 ] && [ $WARNINGS_FOUND -eq 0 ]; then
  echo "✅ All critical Lambdas are healthy"
  exit 0
elif [ $ERRORS_FOUND -eq 0 ]; then
  echo "⚠️  Found warnings in $WARNINGS_FOUND Lambda(s)"
  echo "   Review logs but system is operational"
  exit 0
else
  echo "🔴 CRITICAL: Found errors in $ERRORS_FOUND Lambda(s)"
  echo "   Immediate action required!"
  exit 1
fi
