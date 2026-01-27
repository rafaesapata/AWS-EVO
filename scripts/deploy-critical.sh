#!/bin/bash
set -e

LAMBDAS=(
    "cost/fetch-daily-costs:fetch-daily-costs"
    "cost/ri-sp-analyzer:ri-sp-analyzer"
    "security/security-scan:security-scan"
    "security/compliance-scan:compliance-scan"
    "security/well-architected-scan:well-architected-scan"
    "security/validate-aws-credentials:validate-aws-credentials"
    "security/waf-dashboard-api:waf-dashboard-api"
    "monitoring/aws-realtime-metrics:aws-realtime-metrics"
)

for entry in "${LAMBDAS[@]}"; do
    HANDLER_PATH="${entry%%:*}"
    LAMBDA_NAME="${entry##*:}"
    HANDLER_FILE=$(basename "$HANDLER_PATH")
    FULL_NAME="evo-uds-v3-production-${LAMBDA_NAME}"
    
    echo "Deploying: $LAMBDA_NAME"
    
    rm -rf /tmp/lambda-deploy-temp
    mkdir -p /tmp/lambda-deploy-temp
    
    sed 's|require("../../lib/|require("./lib/|g' "backend/dist/handlers/${HANDLER_PATH}.js" | \
    sed 's|require("../lib/|require("./lib/|g' | \
    sed 's|require("../../types/|require("./types/|g' > "/tmp/lambda-deploy-temp/${HANDLER_FILE}.js"
    
    cp -r backend/dist/lib /tmp/lambda-deploy-temp/
    cp -r backend/dist/types /tmp/lambda-deploy-temp/
    
    pushd /tmp/lambda-deploy-temp > /dev/null
    zip -r /tmp/lambda-temp.zip . > /dev/null
    popd > /dev/null
    
    aws lambda update-function-code \
        --function-name "$FULL_NAME" \
        --zip-file fileb:///tmp/lambda-temp.zip \
        --region us-east-1 \
        --no-cli-pager > /dev/null 2>&1
    
    aws lambda update-function-configuration \
        --function-name "$FULL_NAME" \
        --handler "${HANDLER_FILE}.handler" \
        --region us-east-1 \
        --no-cli-pager > /dev/null 2>&1
    
    echo "  Done"
    sleep 1
done

echo "All critical Lambdas deployed!"
