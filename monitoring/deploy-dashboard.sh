#!/bin/bash
# =============================================================================
# EVO Platform - CloudWatch Dashboard Deployment
# Creates a unified operational dashboard
# =============================================================================

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"
NAMESPACE="EVO/${ENVIRONMENT}"
DASHBOARD_NAME="EVO-${ENVIRONMENT}-Operations"

echo "📊 Deploying CloudWatch Dashboard: ${DASHBOARD_NAME}"
echo "   Region: ${REGION}"
echo "   Environment: ${ENVIRONMENT}"

DASHBOARD_BODY=$(cat <<'DASHBOARD_EOF'
{
  "widgets": [
    {
      "type": "text",
      "x": 0, "y": 0, "width": 24, "height": 1,
      "properties": {
        "markdown": "# EVO Platform - __ENVIRONMENT__ Operations Dashboard"
      }
    },
    {
      "type": "metric",
      "x": 0, "y": 1, "width": 8, "height": 6,
      "properties": {
        "title": "Error Rate",
        "metrics": [
          ["__NAMESPACE__", "ErrorCount", {"stat": "Sum", "period": 300, "color": "#d62728"}],
          ["__NAMESPACE__", "CriticalErrorCount", {"stat": "Sum", "period": 300, "color": "#ff0000"}],
          ["__NAMESPACE__", "UnhandledExceptionCount", {"stat": "Sum", "period": 300, "color": "#8b0000"}]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "__REGION__",
        "period": 300
      }
    },
    {
      "type": "metric",
      "x": 8, "y": 1, "width": 8, "height": 6,
      "properties": {
        "title": "HTTP Status Codes",
        "metrics": [
          ["__NAMESPACE__", "Http5xxCount", {"stat": "Sum", "period": 300, "color": "#d62728"}],
          ["__NAMESPACE__", "Http4xxCount", {"stat": "Sum", "period": 300, "color": "#ff7f0e"}]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "__REGION__",
        "period": 300
      }
    },
    {
      "type": "metric",
      "x": 16, "y": 1, "width": 8, "height": 6,
      "properties": {
        "title": "Request Latency (ms)",
        "metrics": [
          ["__NAMESPACE__", "RequestDuration", {"stat": "p50", "period": 300, "label": "p50", "color": "#2ca02c"}],
          ["__NAMESPACE__", "RequestDuration", {"stat": "p90", "period": 300, "label": "p90", "color": "#ff7f0e"}],
          ["__NAMESPACE__", "RequestDuration", {"stat": "p99", "period": 300, "label": "p99", "color": "#d62728"}]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "__REGION__",
        "period": 300
      }
    },
    {
      "type": "metric",
      "x": 0, "y": 7, "width": 8, "height": 6,
      "properties": {
        "title": "Security Events",
        "metrics": [
          ["__NAMESPACE__", "SecurityEventCount", {"stat": "Sum", "period": 300, "color": "#ff7f0e"}],
          ["__NAMESPACE__", "SecurityCriticalCount", {"stat": "Sum", "period": 300, "color": "#d62728"}]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "__REGION__",
        "period": 300
      }
    },
    {
      "type": "metric",
      "x": 8, "y": 7, "width": 8, "height": 6,
      "properties": {
        "title": "Slow Operations",
        "metrics": [
          ["__NAMESPACE__", "SlowOperationCount", {"stat": "Sum", "period": 300, "color": "#ff7f0e"}]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "__REGION__",
        "period": 300
      }
    },
    {
      "type": "metric",
      "x": 16, "y": 7, "width": 8, "height": 6,
      "properties": {
        "title": "Audit Events",
        "metrics": [
          ["__NAMESPACE__", "AuditEventCount", {"stat": "Sum", "period": 300, "color": "#1f77b4"}]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "__REGION__",
        "period": 300
      }
    },
    {
      "type": "log",
      "x": 0, "y": 13, "width": 24, "height": 6,
      "properties": {
        "title": "Recent Errors (Logs Insights)",
        "query": "fields @timestamp, handler, message, errorMessage, meta.errorType\n| filter level = 'ERROR' or level = 'CRITICAL'\n| sort @timestamp desc\n| limit 20",
        "region": "__REGION__",
        "stacked": false,
        "view": "table"
      }
    }
  ]
}
DASHBOARD_EOF
)

# Replace placeholders
DASHBOARD_BODY=$(echo "${DASHBOARD_BODY}" | sed \
  -e "s/__NAMESPACE__/${NAMESPACE//\//\\/}/g" \
  -e "s/__REGION__/${REGION}/g" \
  -e "s/__ENVIRONMENT__/${ENVIRONMENT}/g")

aws cloudwatch put-dashboard \
  --region "${REGION}" \
  --dashboard-name "${DASHBOARD_NAME}" \
  --dashboard-body "${DASHBOARD_BODY}" \
  2>/dev/null

echo "✅ Dashboard '${DASHBOARD_NAME}' deployed successfully."
echo "   View: https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards:name=${DASHBOARD_NAME}"
