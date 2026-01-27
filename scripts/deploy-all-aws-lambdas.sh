#!/bin/bash
# =============================================================================
# Script de Deploy em Massa - Lambdas que usam aws-helpers.js
# =============================================================================
# Este script faz deploy de todas as Lambdas que usam aws-helpers.js
# para garantir que todas estejam com o código atualizado.
#
# Uso:
#   ./scripts/deploy-all-aws-lambdas.sh
#
# =============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGION="us-east-1"

# Lista de handlers que usam aws-helpers.js
# Formato: "handler-path:lambda-name"
HANDLERS=(
    # Cost handlers
    "cost/fetch-daily-costs:fetch-daily-costs"
    "cost/ri-sp-analyzer:ri-sp-analyzer"
    "cost/cost-optimization:cost-optimization"
    "cost/budget-forecast:budget-forecast"
    "cost/ml-waste-detection:ml-waste-detection"
    
    # Security handlers
    "security/security-scan:security-scan"
    "security/compliance-scan:compliance-scan"
    "security/well-architected-scan:well-architected-scan"
    "security/guardduty-scan:guardduty-scan"
    "security/iam-deep-analysis:iam-deep-analysis"
    "security/drift-detection:drift-detection"
    "security/lateral-movement-detection:lateral-movement-detection"
    "security/validate-aws-credentials:validate-aws-credentials"
    "security/validate-permissions:validate-permissions"
    "security/analyze-cloudtrail:analyze-cloudtrail"
    
    # WAF handlers
    "security/waf-setup-monitoring:waf-setup-monitoring"
    "security/waf-dashboard-api:waf-dashboard-api"
    "security/waf-unblock-expired:waf-unblock-expired"
    
    # Monitoring handlers
    "monitoring/aws-realtime-metrics:aws-realtime-metrics"
    "monitoring/fetch-cloudwatch-metrics:fetch-cloudwatch-metrics"
    "monitoring/fetch-edge-services:fetch-edge-services"
    
    # ML handlers
    "ml/detect-anomalies:detect-anomalies"
)

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Deploying all AWS-related Lambdas${NC}"
echo -e "${YELLOW}Total: ${#HANDLERS[@]} handlers${NC}"
echo -e "${YELLOW}========================================${NC}"

# Build backend once
echo -e "\n${GREEN}Building backend...${NC}"
npm run build --prefix backend

FAILED=()
SUCCESS=()

for entry in "${HANDLERS[@]}"; do
    HANDLER_PATH="${entry%%:*}"
    LAMBDA_NAME="${entry##*:}"
    
    echo -e "\n${YELLOW}----------------------------------------${NC}"
    echo -e "${YELLOW}Deploying: ${LAMBDA_NAME}${NC}"
    echo -e "${YELLOW}----------------------------------------${NC}"
    
    # Check if compiled file exists
    COMPILED_FILE="backend/dist/handlers/${HANDLER_PATH}.js"
    if [ ! -f "$COMPILED_FILE" ]; then
        echo -e "${RED}⚠️  Skipping: File not found: ${COMPILED_FILE}${NC}"
        FAILED+=("$LAMBDA_NAME (file not found)")
        continue
    fi
    
    # Deploy
    HANDLER_FILE=$(basename "$HANDLER_PATH")
    DEPLOY_DIR="/tmp/lambda-deploy-${LAMBDA_NAME}"
    FULL_LAMBDA_NAME="evo-uds-v3-production-${LAMBDA_NAME}"
    
    rm -rf "$DEPLOY_DIR"
    mkdir -p "$DEPLOY_DIR"
    
    # Adjust imports
    sed 's|require("../../lib/|require("./lib/|g' "$COMPILED_FILE" | \
    sed 's|require("../lib/|require("./lib/|g' | \
    sed 's|require("../../types/|require("./types/|g' | \
    sed 's|require("../types/|require("./types/|g' > "$DEPLOY_DIR/${HANDLER_FILE}.js"
    
    # Copy dependencies
    cp -r backend/dist/lib "$DEPLOY_DIR/"
    cp -r backend/dist/types "$DEPLOY_DIR/"
    
    # Create ZIP
    pushd "$DEPLOY_DIR" > /dev/null
    zip -r "/tmp/${LAMBDA_NAME}.zip" . > /dev/null
    popd > /dev/null
    
    # Deploy to AWS
    if aws lambda update-function-code \
        --function-name "$FULL_LAMBDA_NAME" \
        --zip-file "fileb:///tmp/${LAMBDA_NAME}.zip" \
        --region "$REGION" \
        --no-cli-pager > /dev/null 2>&1; then
        
        # Update handler path
        aws lambda update-function-configuration \
            --function-name "$FULL_LAMBDA_NAME" \
            --handler "${HANDLER_FILE}.handler" \
            --region "$REGION" \
            --no-cli-pager > /dev/null 2>&1
        
        # Wait for update
        aws lambda wait function-updated \
            --function-name "$FULL_LAMBDA_NAME" \
            --region "$REGION" 2>/dev/null || true
        
        echo -e "${GREEN}✅ ${LAMBDA_NAME}${NC}"
        SUCCESS+=("$LAMBDA_NAME")
    else
        echo -e "${RED}❌ ${LAMBDA_NAME}${NC}"
        FAILED+=("$LAMBDA_NAME")
    fi
    
    # Cleanup
    rm -rf "$DEPLOY_DIR"
    
    # Small delay to avoid rate limiting
    sleep 1
done

echo -e "\n${YELLOW}========================================${NC}"
echo -e "${YELLOW}DEPLOYMENT SUMMARY${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "${GREEN}Success: ${#SUCCESS[@]}${NC}"
echo -e "${RED}Failed: ${#FAILED[@]}${NC}"

if [ ${#FAILED[@]} -gt 0 ]; then
    echo -e "\n${RED}Failed deployments:${NC}"
    for f in "${FAILED[@]}"; do
        echo -e "  - $f"
    done
fi

echo -e "\n${GREEN}Done!${NC}"
