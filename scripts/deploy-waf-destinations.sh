#!/bin/bash
# Deploy WAF Logs Destination to all supported regions
# This creates the CloudWatch Logs Destination in each region so that
# customers with WAFs in any region can stream logs to EVO.
#
# Prerequisites:
# - AWS CLI configured with EVO account credentials
# - The waf-log-processor Lambda must exist in us-east-1
#
# Usage: ./scripts/deploy-waf-destinations.sh [--dry-run]

set -euo pipefail

PROJECT_NAME="evo-uds-v3"
ENVIRONMENT="production"
EVO_ACCOUNT_ID="523115032346"
STACK_NAME="${PROJECT_NAME}-${ENVIRONMENT}-waf-logs-destination"
TEMPLATE="cloudformation/waf-logs-destination-stack.yaml"
WAF_LOG_PROCESSOR_ARN="arn:aws:lambda:us-east-1:${EVO_ACCOUNT_ID}:function:${PROJECT_NAME}-${ENVIRONMENT}-waf-log-processor"
DEST_NAME="${PROJECT_NAME}-${ENVIRONMENT}-waf-logs-destination"
LOG_FILE="/tmp/deploy-waf-destinations-$(date +%Y%m%d-%H%M%S).log"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "=== DRY RUN MODE ==="
fi

echo "Log file: ${LOG_FILE}"

# All regions where customers may have WAF resources
REGIONS=(
  us-east-1
  us-east-2
  us-west-1
  us-west-2
  ca-central-1
  eu-west-1
  eu-west-2
  eu-west-3
  eu-central-1
  eu-north-1
  eu-south-1
  ap-southeast-1
  ap-southeast-2
  ap-northeast-1
  ap-northeast-2
  ap-northeast-3
  ap-south-1
  sa-east-1
  me-south-1
  af-south-1
)

echo "Deploying WAF Logs Destination to ${#REGIONS[@]} regions..."
echo ""

SUCCESS=0
FAILED=0
SKIPPED=0

for REGION in "${REGIONS[@]}"; do
  REGIONAL_STACK="${STACK_NAME}-${REGION}"
  echo -n "[$REGION] "

  if $DRY_RUN; then
    echo "Would deploy stack: ${REGIONAL_STACK}"
    continue
  fi

  # Check if stack already exists
  STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "$REGIONAL_STACK" \
    --region "$REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "DOES_NOT_EXIST")

  if [[ "$STACK_STATUS" == "CREATE_COMPLETE" || "$STACK_STATUS" == "UPDATE_COMPLETE" || "$STACK_STATUS" == "UPDATE_ROLLBACK_COMPLETE" ]]; then
    echo "Already deployed (${STACK_STATUS})"
    ((SKIPPED++))
    continue
  fi

  # Deploy
  echo -n "Deploying... "
  if aws cloudformation deploy \
    --template-file "$TEMPLATE" \
    --stack-name "$REGIONAL_STACK" \
    --region "$REGION" \
    --parameter-overrides \
      "Environment=${ENVIRONMENT}" \
      "ProjectName=${PROJECT_NAME}" \
      "WafLogProcessorArn=${WAF_LOG_PROCESSOR_ARN}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    2>>"$LOG_FILE"; then

    # Add destination policy (CloudFormation doesn't support Principal:"*" inline)
    # The handler's updateDestinationPolicyForCustomer will add customer accounts dynamically
    DEST_ARN="arn:aws:logs:${REGION}:${EVO_ACCOUNT_ID}:destination:${DEST_NAME}"
    POLICY="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"AllowCrossAccountSubscription\",\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"${EVO_ACCOUNT_ID}\"},\"Action\":\"logs:PutSubscriptionFilter\",\"Resource\":\"${DEST_ARN}\"}]}"

    if aws logs put-destination-policy \
      --destination-name "$DEST_NAME" \
      --access-policy "$POLICY" \
      --region "$REGION" \
      2>>"$LOG_FILE"; then
      echo "OK (with policy)"
    else
      echo "OK (policy failed — will be set by handler)"
    fi
    ((SUCCESS++))
  else
    echo "FAILED"
    ((FAILED++))
  fi
done

echo ""
echo "=== Summary ==="
echo "Success: $SUCCESS | Skipped: $SKIPPED | Failed: $FAILED"
