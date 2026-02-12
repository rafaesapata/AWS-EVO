#!/bin/bash
# =============================================================================
# EVO Platform - CloudWatch Alarms Deployment
# Creates alarms based on metric filters from deploy-metric-filters.sh
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"
NAMESPACE="EVO/${ENVIRONMENT}"
SNS_TOPIC_ARN="${SNS_TOPIC_ARN:-}"
ALARM_PREFIX="evo-${ENVIRONMENT}"

echo "🚨 Deploying CloudWatch Alarms..."
echo "   Region: ${REGION}"
echo "   Environment: ${ENVIRONMENT}"
echo "   Namespace: ${NAMESPACE}"

if [ -z "${SNS_TOPIC_ARN}" ]; then
  echo "⚠️  SNS_TOPIC_ARN not set. Alarms will be created without notification actions."
  echo "   Set SNS_TOPIC_ARN to enable email notifications."
else
  echo "   SNS Topic: ${SNS_TOPIC_ARN}"
fi

# ---------------------------------------------------------------------------
# Helper: create or update an alarm
# ---------------------------------------------------------------------------
create_alarm() {
  local ALARM_NAME="$1"
  local METRIC_NAME="$2"
  local THRESHOLD="$3"
  local COMPARISON="$4"
  local PERIOD="$5"
  local EVAL_PERIODS="$6"
  local STATISTIC="$7"
  local DESCRIPTION="$8"
  local TREAT_MISSING="${9:-notBreaching}"

  echo "   🔔 ${ALARM_NAME} (${METRIC_NAME} ${COMPARISON} ${THRESHOLD})"

  # Build args array to avoid eval + shell injection
  local -a ARGS=(
    --region "${REGION}"
    --alarm-name "${ALARM_NAME}"
    --namespace "${NAMESPACE}"
    --metric-name "${METRIC_NAME}"
    --threshold "${THRESHOLD}"
    --comparison-operator "${COMPARISON}"
    --period "${PERIOD}"
    --evaluation-periods "${EVAL_PERIODS}"
    --treat-missing-data "${TREAT_MISSING}"
    --alarm-description "${DESCRIPTION}"
  )

  # p* statistics require --extended-statistic instead of --statistic
  if [[ "${STATISTIC}" == p* ]]; then
    ARGS+=(--extended-statistic "${STATISTIC}")
  else
    ARGS+=(--statistic "${STATISTIC}")
  fi

  if [ -n "${SNS_TOPIC_ARN}" ]; then
    ARGS+=(--alarm-actions "${SNS_TOPIC_ARN}" --ok-actions "${SNS_TOPIC_ARN}")
  fi

  aws cloudwatch put-metric-alarm "${ARGS[@]}" 2>/dev/null \
    || echo "     ⚠️  Failed to create alarm: ${ALARM_NAME}"
}

# ---------------------------------------------------------------------------
# 1. Critical Error Alarms
# ---------------------------------------------------------------------------
echo ""
echo "── Critical Error Alarms ──"

create_alarm \
  "${ALARM_PREFIX}-critical-errors" \
  "CriticalErrorCount" \
  1 \
  "GreaterThanOrEqualToThreshold" \
  60 \
  1 \
  "Sum" \
  "CRITICAL: Unhandled exception detected in EVO platform"

create_alarm \
  "${ALARM_PREFIX}-high-error-rate" \
  "ErrorCount" \
  50 \
  "GreaterThanOrEqualToThreshold" \
  300 \
  1 \
  "Sum" \
  "HIGH: More than 50 errors in 5 minutes"

create_alarm \
  "${ALARM_PREFIX}-unhandled-exceptions" \
  "UnhandledExceptionCount" \
  5 \
  "GreaterThanOrEqualToThreshold" \
  300 \
  1 \
  "Sum" \
  "CRITICAL: Multiple unhandled exceptions in 5 minutes"

# ---------------------------------------------------------------------------
# 2. HTTP Status Alarms
# ---------------------------------------------------------------------------
echo ""
echo "── HTTP Status Alarms ──"

create_alarm \
  "${ALARM_PREFIX}-5xx-spike" \
  "Http5xxCount" \
  10 \
  "GreaterThanOrEqualToThreshold" \
  300 \
  1 \
  "Sum" \
  "HIGH: More than 10 server errors (5xx) in 5 minutes"

create_alarm \
  "${ALARM_PREFIX}-4xx-spike" \
  "Http4xxCount" \
  100 \
  "GreaterThanOrEqualToThreshold" \
  300 \
  1 \
  "Sum" \
  "MEDIUM: More than 100 client errors (4xx) in 5 minutes"

# ---------------------------------------------------------------------------
# 3. Performance Alarms
# ---------------------------------------------------------------------------
echo ""
echo "── Performance Alarms ──"

create_alarm \
  "${ALARM_PREFIX}-slow-operations" \
  "SlowOperationCount" \
  20 \
  "GreaterThanOrEqualToThreshold" \
  300 \
  1 \
  "Sum" \
  "MEDIUM: More than 20 slow operations in 5 minutes"

create_alarm \
  "${ALARM_PREFIX}-high-latency" \
  "RequestDuration" \
  10000 \
  "GreaterThanOrEqualToThreshold" \
  300 \
  2 \
  "p99" \
  "HIGH: p99 latency exceeds 10 seconds for 10 minutes"

# ---------------------------------------------------------------------------
# 4. Security Alarms
# ---------------------------------------------------------------------------
echo ""
echo "── Security Alarms ──"

create_alarm \
  "${ALARM_PREFIX}-security-critical" \
  "SecurityCriticalCount" \
  1 \
  "GreaterThanOrEqualToThreshold" \
  60 \
  1 \
  "Sum" \
  "CRITICAL: Critical security event detected"

create_alarm \
  "${ALARM_PREFIX}-security-events-spike" \
  "SecurityEventCount" \
  50 \
  "GreaterThanOrEqualToThreshold" \
  300 \
  1 \
  "Sum" \
  "HIGH: Unusual number of security events in 5 minutes"

echo ""
echo "✅ CloudWatch alarms deployed successfully."
