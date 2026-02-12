#!/bin/bash
# Create 3 SLOs (latency p99, availability, error rate) for all production lambdas
# SLI period: 600s (10 min), Rolling interval: 7 days
set -uo pipefail
export AWS_PROFILE=EVO_PRODUCTION
REGION="us-east-1"
CREATED=0
SKIPPED=0
FAILED=0

GOAL='{"Interval":{"RollingInterval":{"DurationUnit":"DAY","Duration":7}},"AttainmentGoal":99.5,"WarningThreshold":50.0}'
GOAL_ERR='{"Interval":{"RollingInterval":{"DurationUnit":"DAY","Duration":7}},"AttainmentGoal":99.0,"WarningThreshold":50.0}'

START=$(date -v-24H -u +%s)
END=$(date -u +%s)

SERVICES_FILE=$(mktemp)
aws application-signals list-services \
  --start-time "$START" --end-time "$END" \
  --region "$REGION" --no-cli-pager --output json \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for s in sorted(set(s['KeyAttributes']['Name'] for s in data.get('ServiceSummaries', []))):
    print(s)
" > "$SERVICES_FILE"

TOTAL=$(wc -l < "$SERVICES_FILE" | tr -d ' ')
echo "Found $TOTAL services. Creating 3 SLOs each ($(($TOTAL * 3)) total)..."

create_slo() {
  local name="$1" desc="$2" cfg_type="$3" cfg="$4" goal="$5"
  local result
  result=$(aws application-signals create-service-level-objective \
    --name "$name" --description "$desc" \
    --"$cfg_type" "$cfg" --goal "$goal" \
    --region "$REGION" --no-cli-pager --output json 2>&1) || true

  if echo "$result" | grep -q '"Arn"'; then
    echo "  ✅ $name"
    CREATED=$((CREATED + 1))
  elif echo "$result" | grep -qi 'conflict\|already exists'; then
    echo "  ⏭️  $name (exists)"
    SKIPPED=$((SKIPPED + 1))
  else
    echo "  ❌ $name: $(echo "$result" | tr '\n' ' ' | head -c 120)"
    FAILED=$((FAILED + 1))
  fi
}

COUNT=0
while IFS= read -r SVC; do
  COUNT=$((COUNT + 1))
  SHORT=$(echo "$SVC" | sed 's/evo-uds-v3-production-//')
  echo "[$COUNT/$TOTAL] $SHORT"

  create_slo "evo-production-${SHORT}-latency-p99" "Latency p99 < 5s for ${SHORT}" \
    "sli-config" \
    "{\"SliMetricConfig\":{\"PeriodSeconds\":600,\"MetricDataQueries\":[{\"Id\":\"m1\",\"MetricStat\":{\"Metric\":{\"Namespace\":\"AWS/Lambda\",\"MetricName\":\"Duration\",\"Dimensions\":[{\"Name\":\"FunctionName\",\"Value\":\"${SVC}\"}]},\"Period\":600,\"Stat\":\"p99\"},\"ReturnData\":true}]},\"MetricThreshold\":5000,\"ComparisonOperator\":\"LessThan\"}" \
    "$GOAL"

  create_slo "evo-production-${SHORT}-availability" "Availability 99.5% for ${SHORT}" \
    "request-based-sli-config" \
    "{\"RequestBasedSliMetricConfig\":{\"TotalRequestCountMetric\":[{\"Id\":\"total\",\"MetricStat\":{\"Metric\":{\"Namespace\":\"AWS/Lambda\",\"MetricName\":\"Invocations\",\"Dimensions\":[{\"Name\":\"FunctionName\",\"Value\":\"${SVC}\"}]},\"Period\":600,\"Stat\":\"Sum\"},\"ReturnData\":true}],\"MonitoredRequestCountMetric\":{\"BadCountMetric\":[{\"Id\":\"errors\",\"MetricStat\":{\"Metric\":{\"Namespace\":\"AWS/Lambda\",\"MetricName\":\"Errors\",\"Dimensions\":[{\"Name\":\"FunctionName\",\"Value\":\"${SVC}\"}]},\"Period\":600,\"Stat\":\"Sum\"},\"ReturnData\":true}]}}}" \
    "$GOAL"

  create_slo "evo-production-${SHORT}-error-rate" "Throttle rate < 1% for ${SHORT}" \
    "request-based-sli-config" \
    "{\"RequestBasedSliMetricConfig\":{\"TotalRequestCountMetric\":[{\"Id\":\"total\",\"MetricStat\":{\"Metric\":{\"Namespace\":\"AWS/Lambda\",\"MetricName\":\"Invocations\",\"Dimensions\":[{\"Name\":\"FunctionName\",\"Value\":\"${SVC}\"}]},\"Period\":600,\"Stat\":\"Sum\"},\"ReturnData\":true}],\"MonitoredRequestCountMetric\":{\"BadCountMetric\":[{\"Id\":\"throttles\",\"MetricStat\":{\"Metric\":{\"Namespace\":\"AWS/Lambda\",\"MetricName\":\"Throttles\",\"Dimensions\":[{\"Name\":\"FunctionName\",\"Value\":\"${SVC}\"}]},\"Period\":600,\"Stat\":\"Sum\"},\"ReturnData\":true}]}}}" \
    "$GOAL_ERR"
done < "$SERVICES_FILE"

rm -f "$SERVICES_FILE"
echo ""
echo "=== SUMMARY ==="
echo "Created: $CREATED | Skipped: $SKIPPED | Failed: $FAILED"
echo "Total: $((CREATED + SKIPPED + FAILED)) / $(($TOTAL * 3))"
