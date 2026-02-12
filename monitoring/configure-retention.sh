#!/bin/bash
# =============================================================================
# EVO Platform - CloudWatch Log Retention Configuration
# Sets retention policies to control costs and comply with data retention rules
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Retention in days per environment
if [ "${ENVIRONMENT}" = "production" ]; then
  RETENTION_DAYS=90
else
  RETENTION_DAYS=30
fi

echo "📦 Configuring CloudWatch Log Retention..."
echo "   Region: ${REGION}"
echo "   Environment: ${ENVIRONMENT}"
echo "   Retention: ${RETENTION_DAYS} days"

LOG_GROUPS=$(aws logs describe-log-groups \
  --region "${REGION}" \
  --log-group-name-prefix "/aws/lambda/evo-" \
  --query 'logGroups[].logGroupName' \
  --output text 2>/dev/null || echo "")

if [ -z "${LOG_GROUPS}" ]; then
  echo "⚠️  No EVO Lambda log groups found."
  exit 0
fi

UPDATED=0
SKIPPED=0

for LOG_GROUP in ${LOG_GROUPS}; do
  CURRENT=$(aws logs describe-log-groups \
    --region "${REGION}" \
    --log-group-name-prefix "${LOG_GROUP}" \
    --query "logGroups[?logGroupName=='${LOG_GROUP}'].retentionInDays | [0]" \
    --output text 2>/dev/null || echo "None")

  if [ "${CURRENT}" = "${RETENTION_DAYS}" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  aws logs put-retention-policy \
    --region "${REGION}" \
    --log-group-name "${LOG_GROUP}" \
    --retention-in-days "${RETENTION_DAYS}" \
    2>/dev/null && UPDATED=$((UPDATED + 1)) || echo "   ⚠️  Failed: ${LOG_GROUP}"
done

echo ""
echo "✅ Retention configured: ${UPDATED} updated, ${SKIPPED} already set."
