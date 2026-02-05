#!/bin/bash

# Monitor CodePipeline execution
# Usage: ./scripts/monitor-pipeline.sh [pipeline-name]

PIPELINE_NAME="${1:-evo-sam-pipeline-production}"
PROFILE="${AWS_PROFILE:-EVO_PRODUCTION}"
REGION="us-east-1"

echo "Monitoring pipeline: $PIPELINE_NAME"
echo "AWS Profile: $PROFILE"
echo "Region: $REGION"
echo ""

while true; do
  clear
  echo "=== Pipeline Status - $(date) ==="
  echo ""
  
  aws codepipeline get-pipeline-state \
    --name "$PIPELINE_NAME" \
    --region "$REGION" \
    --profile "$PROFILE" \
    --no-cli-pager 2>&1 | jq -r '
    .stageStates[] | 
    "\(.stageName): \(.latestExecution.status // "Not Started") - \(.latestExecution.lastStatusChange // "N/A")"
  '
  
  echo ""
  echo "Press Ctrl+C to stop monitoring"
  echo "Refreshing in 30 seconds..."
  
  sleep 30
done
