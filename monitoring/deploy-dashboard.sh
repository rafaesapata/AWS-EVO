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
        "query": "__SOURCE_CLAUSE__| fields @timestamp, coalesce(handler, functionName) as src_handler, message, errorMessage\n| filter level = 'ERROR' or level = 'CRITICAL'\n| sort @timestamp desc\n| limit 20",
        "region": "__REGION__",
        "view": "table"
      }
    }
  ]
}
DASHBOARD_EOF
)

# Build SOURCE clause for Logs Insights query (max 50 log groups)
SOURCE_CLAUSE=$(aws logs describe-log-groups \
  --region "${REGION}" \
  --log-group-name-prefix "/aws/lambda/evo-" \
  --query 'logGroups[].logGroupName' \
  --output json 2>/dev/null | python3 -c "
import sys, json
groups = json.load(sys.stdin)[:50]
clause = ' | '.join([\"SOURCE '\" + g + \"'\" for g in groups])
print(clause)
" 2>/dev/null || echo "SOURCE '/aws/lambda/evo-placeholder'")

if [ -z "${SOURCE_CLAUSE}" ]; then
  SOURCE_CLAUSE="SOURCE '/aws/lambda/evo-placeholder'"
fi

# Replace placeholders using python for safe JSON substitution
# Pass SOURCE_CLAUSE via env var to avoid quote escaping issues
export SOURCE_CLAUSE NAMESPACE REGION ENVIRONMENT
DASHBOARD_BODY=$(python3 -c "
import sys, os
body = sys.stdin.read()
body = body.replace('__NAMESPACE__', os.environ.get('NAMESPACE', 'EVO/production'))
body = body.replace('__REGION__', os.environ.get('REGION', 'us-east-1'))
body = body.replace('__ENVIRONMENT__', os.environ.get('ENVIRONMENT', 'production'))
body = body.replace('__SOURCE_CLAUSE__', os.environ.get('SOURCE_CLAUSE', '') + ' ')
print(body)
" <<< "${DASHBOARD_BODY}")

aws cloudwatch put-dashboard \
  --region "${REGION}" \
  --dashboard-name "${DASHBOARD_NAME}" \
  --dashboard-body "${DASHBOARD_BODY}" \
  2>/dev/null

echo "✅ Dashboard '${DASHBOARD_NAME}' deployed successfully."
echo "   View: https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards:name=${DASHBOARD_NAME}"
