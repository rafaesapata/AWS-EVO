#!/bin/bash

# Script to fix Lambda handlers with incorrect paths

LAMBDAS=(
  "validate-permissions:security"
  "update-aws-credentials:aws"
  "create-with-organization:profiles"
  "validate-license:license"
  "finops-copilot:cost"
  "check-organization:profiles"
  "analyze-cloudtrail:security"
  "validate-aws-credentials:security"
  "ml-waste-detection:cost"
  "fetch-cloudtrail:security"
  "verify-tv-token:auth"
  "detect-anomalies:ml"
  "compliance-scan:security"
  "sync-organization-accounts:organizations"
  "ri-sp-analyzer:cost"
  "well-architected-scan:security"
  "get-communication-logs:notifications"
)

cd backend/dist

for ITEM in "${LAMBDAS[@]}"; do
  HANDLER_NAME="${ITEM%%:*}"
  FOLDER="${ITEM##*:}"
  FUNCTION_NAME="evo-uds-v3-production-${HANDLER_NAME}"
  
  echo "Updating $FUNCTION_NAME..."
  
  if [ -f "handlers/${FOLDER}/${HANDLER_NAME}.js" ]; then
    rm -f /tmp/${HANDLER_NAME}.zip
    zip -r /tmp/${HANDLER_NAME}.zip handlers/${FOLDER}/${HANDLER_NAME}.js lib types -x "*.map" -x "*.d.ts" > /dev/null 2>&1
    
    aws lambda update-function-configuration \
      --function-name "$FUNCTION_NAME" \
      --handler "handlers/${FOLDER}/${HANDLER_NAME}.handler" \
      --no-cli-pager > /dev/null 2>&1
    
    sleep 2
    
    aws lambda update-function-code \
      --function-name "$FUNCTION_NAME" \
      --zip-file "fileb:///tmp/${HANDLER_NAME}.zip" \
      --no-cli-pager > /dev/null 2>&1
    
    echo "  Done"
  else
    echo "  SKIP: handlers/${FOLDER}/${HANDLER_NAME}.js not found"
  fi
done

echo "All done!"
