#!/bin/bash
# =============================================================================
# EVO Platform - Email Notification Setup via SNS
# Creates SNS topic and subscribes email addresses for alarm notifications
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"
TOPIC_NAME="evo-${ENVIRONMENT}-alarms"

echo "📧 Configuring Email Notifications..."
echo "   Region: ${REGION}"
echo "   Environment: ${ENVIRONMENT}"
echo "   Topic: ${TOPIC_NAME}"

# ---------------------------------------------------------------------------
# 1. Create or get SNS Topic
# ---------------------------------------------------------------------------
TOPIC_ARN=$(aws sns create-topic \
  --region "${REGION}" \
  --name "${TOPIC_NAME}" \
  --query 'TopicArn' \
  --output text 2>/dev/null)

if [ -z "${TOPIC_ARN}" ]; then
  echo "❌ Failed to create SNS topic"
  exit 1
fi

echo "   Topic ARN: ${TOPIC_ARN}"

# ---------------------------------------------------------------------------
# 2. Subscribe email addresses
# ---------------------------------------------------------------------------
# Pass emails as arguments: ./configure-email-notifications.sh email1@example.com email2@example.com
# Or set EMAIL_ADDRESSES env var (comma-separated)

# Default notification recipients
DEFAULT_EMAILS=("rafael@uds.com.br" "infra@uds.com.br")

EMAILS=("$@")

if [ ${#EMAILS[@]} -eq 0 ] && [ -n "${EMAIL_ADDRESSES:-}" ]; then
  IFS=',' read -ra EMAILS <<< "${EMAIL_ADDRESSES}"
fi

# Use defaults if no emails provided via args or env var
if [ ${#EMAILS[@]} -eq 0 ]; then
  EMAILS=("${DEFAULT_EMAILS[@]}")
  echo "   Using default recipients: ${EMAILS[*]}"
fi

echo ""
echo "── Subscribing emails ──"

for EMAIL in "${EMAILS[@]}"; do
  EMAIL=$(echo "${EMAIL}" | tr -d ' ')
  
  # Check if already subscribed
  EXISTING=$(aws sns list-subscriptions-by-topic \
    --region "${REGION}" \
    --topic-arn "${TOPIC_ARN}" \
    --query "Subscriptions[?Endpoint=='${EMAIL}' && Protocol=='email'].SubscriptionArn | [0]" \
    --output text 2>/dev/null || echo "None")

  if [ "${EXISTING}" != "None" ] && [ "${EXISTING}" != "PendingConfirmation" ] && [ -n "${EXISTING}" ]; then
    echo "   ✓ ${EMAIL} (already subscribed)"
    continue
  fi

  aws sns subscribe \
    --region "${REGION}" \
    --topic-arn "${TOPIC_ARN}" \
    --protocol email \
    --notification-endpoint "${EMAIL}" \
    2>/dev/null

  echo "   📨 ${EMAIL} (confirmation email sent — check inbox)"
done

echo ""
echo "✅ Email notifications configured."
echo ""
echo "IMPORTANT: Each email must confirm the subscription by clicking the link in the confirmation email."
echo ""
echo "Next step — deploy alarms with this topic:"
echo "  SNS_TOPIC_ARN=${TOPIC_ARN} ./monitoring/deploy-alarms.sh"
