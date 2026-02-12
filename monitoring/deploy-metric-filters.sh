#!/bin/bash
# =============================================================================
# EVO Platform - CloudWatch Metric Filters Deployment
# Extracts structured metrics from Lambda log groups via JSON patterns
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"
NAMESPACE="EVO/${ENVIRONMENT}"

echo "🔧 Deploying CloudWatch Metric Filters..."
echo "   Region: ${REGION}"
echo "   Environment: ${ENVIRONMENT}"
echo "   Namespace: ${NAMESPACE}"

# Get all EVO Lambda log groups
LOG_GROUPS=$(aws logs describe-log-groups \
  --region "${REGION}" \
  --log-group-name-prefix "/aws/lambda/evo-" \
  --query 'logGroups[].logGroupName' \
  --output text 2>/dev/null || echo "")

if [ -z "${LOG_GROUPS}" ]; then
  echo "⚠️  No EVO Lambda log groups found. Deploy Lambdas first."
  exit 0
fi

GROUP_COUNT=$(echo "${LOG_GROUPS}" | wc -w | tr -d ' ')
echo "   Found ${GROUP_COUNT} log group(s)"

# ---------------------------------------------------------------------------
# Helper: create or update a metric filter on all log groups
# ---------------------------------------------------------------------------
create_filter() {
  local FILTER_NAME="$1"
  local FILTER_PATTERN="$2"
  local METRIC_NAME="$3"
  local METRIC_VALUE="${4:-1}"
  local DEFAULT_VALUE="${5:-0}"

  echo "   📊 ${FILTER_NAME} → ${METRIC_NAME}"

  for LOG_GROUP in ${LOG_GROUPS}; do
    aws logs put-metric-filter \
      --region "${REGION}" \
      --log-group-name "${LOG_GROUP}" \
      --filter-name "${FILTER_NAME}" \
      --filter-pattern "${FILTER_PATTERN}" \
      --metric-transformations \
        "metricName=${METRIC_NAME},metricNamespace=${NAMESPACE},metricValue=${METRIC_VALUE},defaultValue=${DEFAULT_VALUE}" \
      2>/dev/null || echo "     ⚠️  Failed: ${LOG_GROUP}"
  done
}

# ---------------------------------------------------------------------------
# 1. Error-level logs
# ---------------------------------------------------------------------------
echo ""
echo "── Error Metrics ──"

create_filter \
  "evo-errors" \
  '{ $.level = "ERROR" }' \
  "ErrorCount"

create_filter \
  "evo-critical" \
  '{ $.level = "CRITICAL" }' \
  "CriticalErrorCount"

create_filter \
  "evo-unhandled-exceptions" \
  '{ $.meta.errorType = "UNHANDLED_EXCEPTION" }' \
  "UnhandledExceptionCount"

# ---------------------------------------------------------------------------
# 2. HTTP Status Metrics
# ---------------------------------------------------------------------------
echo ""
echo "── HTTP Status Metrics ──"

create_filter \
  "evo-5xx" \
  '{ $.statusCode >= 500 }' \
  "Http5xxCount"

create_filter \
  "evo-4xx" \
  '{ $.statusCode >= 400 && $.statusCode < 500 }' \
  "Http4xxCount"

# ---------------------------------------------------------------------------
# 3. Performance Metrics
# ---------------------------------------------------------------------------
echo ""
echo "── Performance Metrics ──"

create_filter \
  "evo-slow-operations" \
  '{ $.meta.type = "slow_operation" }' \
  "SlowOperationCount"

create_filter \
  "evo-duration" \
  '{ $.durationMs >= 0 }' \
  "RequestDuration" \
  '$.durationMs' \
  "0"

# ---------------------------------------------------------------------------
# 4. Security Metrics
# ---------------------------------------------------------------------------
echo ""
echo "── Security Metrics ──"

create_filter \
  "evo-security-events" \
  '{ $.meta.type = "security_event" }' \
  "SecurityEventCount"

create_filter \
  "evo-security-critical" \
  '{ $.meta.type = "security_event" && $.meta.securitySeverity = "CRITICAL" }' \
  "SecurityCriticalCount"

# ---------------------------------------------------------------------------
# 5. Audit Metrics
# ---------------------------------------------------------------------------
echo ""
echo "── Audit Metrics ──"

create_filter \
  "evo-audit-events" \
  '{ $.meta.type = "audit" }' \
  "AuditEventCount"

echo ""
echo "✅ Metric filters deployed successfully."
