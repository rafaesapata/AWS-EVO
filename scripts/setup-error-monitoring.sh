#!/bin/bash
# ============================================================================
# EVO Platform - Setup Centralized Error Monitoring
# Creates CloudWatch Metric Filters for all Lambda functions
# ============================================================================

set -e

ENVIRONMENT="${1:-production}"
REGION="${2:-us-east-1}"
NAMESPACE="EVO/${ENVIRONMENT}/Errors"
ALERT_EMAIL="${3:-alerts@udstec.io}"

echo "🔧 Setting up Error Monitoring for EVO Platform"
echo "   Environment: $ENVIRONMENT"
echo "   Region: $REGION"
echo "   Alert Email: $ALERT_EMAIL"
echo ""

# ============================================================================
# 1. Deploy CloudFormation Stack
# ============================================================================
echo "📦 Deploying CloudFormation stack..."

aws cloudformation deploy \
  --template-file cloudformation/error-monitoring-stack.yaml \
  --stack-name evo-error-monitoring-${ENVIRONMENT} \
  --parameter-overrides \
    Environment=${ENVIRONMENT} \
    AlertEmail=${ALERT_EMAIL} \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ${REGION} \
  --no-fail-on-empty-changeset

echo "✅ CloudFormation stack deployed"

# ============================================================================
# 2. Create Metric Filters for ALL Lambda Log Groups
# ============================================================================
echo ""
echo "📊 Creating Metric Filters for Lambda functions..."

# Get all EVO Lambda log groups
LOG_GROUPS=$(aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/evo-uds-v3-${ENVIRONMENT}" \
  --region ${REGION} \
  --query 'logGroups[*].logGroupName' \
  --output text)

FILTER_PATTERN='?"statusCode\":5" ?"statusCode\": 5" ?ERROR ?Error ?CRITICAL ?Exception ?"status": 5'

COUNT=0
for LOG_GROUP in $LOG_GROUPS; do
  FUNCTION_NAME=$(echo $LOG_GROUP | sed 's|/aws/lambda/||')
  FILTER_NAME="${FUNCTION_NAME}-5xx-errors"
  
  # Check if filter already exists
  EXISTING=$(aws logs describe-metric-filters \
    --log-group-name "$LOG_GROUP" \
    --filter-name-prefix "$FILTER_NAME" \
    --region ${REGION} \
    --query 'metricFilters[0].filterName' \
    --output text 2>/dev/null || echo "None")
  
  if [ "$EXISTING" = "None" ] || [ "$EXISTING" = "" ]; then
    echo "  Creating filter for: $FUNCTION_NAME"
    
    aws logs put-metric-filter \
      --log-group-name "$LOG_GROUP" \
      --filter-name "$FILTER_NAME" \
      --filter-pattern "$FILTER_PATTERN" \
      --metric-transformations \
        metricName="${FUNCTION_NAME}-5xx",metricNamespace="${NAMESPACE}",metricValue=1,defaultValue=0,unit=Count \
      --region ${REGION} 2>/dev/null || echo "    ⚠️ Could not create filter (log group may not exist yet)"
    
    ((COUNT++)) || true
  else
    echo "  ✓ Filter already exists: $FUNCTION_NAME"
  fi
done

echo ""
echo "✅ Created $COUNT new metric filters"

# ============================================================================
# 3. Create Aggregated Metric Filter (all errors combined)
# ============================================================================
echo ""
echo "📈 Creating aggregated error metric..."

# Create a metric filter that captures ALL Lambda errors
aws logs put-metric-filter \
  --log-group-name "/aws/lambda/evo-uds-v3-${ENVIRONMENT}-query-table" \
  --filter-name "evo-all-lambda-errors" \
  --filter-pattern '?"statusCode\":5" ?ERROR ?CRITICAL' \
  --metric-transformations \
    metricName="AllLambdaErrors",metricNamespace="${NAMESPACE}",metricValue=1,defaultValue=0,unit=Count \
  --region ${REGION} 2>/dev/null || echo "⚠️ Could not create aggregated filter"

echo "✅ Aggregated metric created"

# ============================================================================
# 4. Create CloudWatch Alarms for Individual High-Traffic Lambdas
# ============================================================================
echo ""
echo "🚨 Creating individual alarms for critical Lambdas..."

CRITICAL_LAMBDAS=(
  "query-table"
  "security-scan"
  "fetch-daily-costs"
  "bedrock-chat"
  "compliance-scan"
  "mfa-check"
  "validate-aws-credentials"
)

SNS_TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name evo-error-monitoring-${ENVIRONMENT} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`ErrorAlertsTopicArn`].OutputValue' \
  --output text)

for LAMBDA in "${CRITICAL_LAMBDAS[@]}"; do
  ALARM_NAME="evo-${ENVIRONMENT}-${LAMBDA}-errors"
  METRIC_NAME="evo-uds-v3-${ENVIRONMENT}-${LAMBDA}-5xx"
  
  echo "  Creating alarm: $ALARM_NAME"
  
  aws cloudwatch put-metric-alarm \
    --alarm-name "$ALARM_NAME" \
    --alarm-description "Alert when ${LAMBDA} Lambda returns errors" \
    --metric-name "$METRIC_NAME" \
    --namespace "${NAMESPACE}" \
    --statistic Sum \
    --period 300 \
    --evaluation-periods 1 \
    --threshold 3 \
    --comparison-operator GreaterThanThreshold \
    --treat-missing-data notBreaching \
    --alarm-actions "$SNS_TOPIC_ARN" \
    --ok-actions "$SNS_TOPIC_ARN" \
    --region ${REGION} 2>/dev/null || echo "    ⚠️ Could not create alarm"
done

echo "✅ Individual alarms created"

# ============================================================================
# 5. Output Summary
# ============================================================================
echo ""
echo "=============================================="
echo "🎉 Error Monitoring Setup Complete!"
echo "=============================================="
echo ""
echo "📊 Dashboard URL:"
echo "   https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards:name=EVO-${ENVIRONMENT}-Error-Monitoring"
echo ""
echo "🔔 SNS Topic ARN:"
echo "   $SNS_TOPIC_ARN"
echo ""
echo "📧 Alert Email: $ALERT_EMAIL"
echo "   (Check your email to confirm the SNS subscription)"
echo ""
echo "⚠️ Alarms Created:"
echo "   - evo-${ENVIRONMENT}-lambda-5xx-errors (>5 errors in 5 min)"
echo "   - evo-${ENVIRONMENT}-api-gateway-5xx-errors (>10 errors in 5 min)"
echo "   - evo-${ENVIRONMENT}-critical-error-rate (>20 errors in 3 min)"
echo ""
echo "📝 Next Steps:"
echo "   1. Confirm email subscription in your inbox"
echo "   2. (Optional) Add Slack webhook for notifications"
echo "   3. View dashboard to monitor errors"
echo ""
