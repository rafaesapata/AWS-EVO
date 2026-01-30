#!/bin/bash

# Script para deploy de todas as Lambdas do EVO
# Criado em: 2026-01-29

set -e

REGION="us-east-1"
PREFIX="evo-uds-v3-production"

echo "🚀 Iniciando deploy de todas as Lambdas..."

# Preparar base
rm -rf /tmp/lambda-base
mkdir -p /tmp/lambda-base
cp -r backend/dist/lib /tmp/lambda-base/
cp -r backend/dist/types /tmp/lambda-base/

deploy_lambda() {
    local handler_path=$1
    local lambda_name=$2
    local handler_file=$(basename "$handler_path" .js)
    
    rm -rf /tmp/lambda-deploy
    mkdir -p /tmp/lambda-deploy
    
    cp -r /tmp/lambda-base/lib /tmp/lambda-deploy/
    cp -r /tmp/lambda-base/types /tmp/lambda-deploy/
    
    sed 's|require("../../lib/|require("./lib/|g' "backend/dist/handlers/$handler_path" | \
    sed 's|require("../lib/|require("./lib/|g' | \
    sed 's|require("../../types/|require("./types/|g' | \
    sed 's|require("../types/|require("./types/|g' > "/tmp/lambda-deploy/$handler_file.js"
    
    (cd /tmp/lambda-deploy && zip -rq ../lambda.zip .)
    
    aws lambda update-function-code \
        --function-name "$PREFIX-$lambda_name" \
        --zip-file fileb:///tmp/lambda.zip \
        --region "$REGION" \
        --no-cli-pager > /dev/null 2>&1
    
    aws lambda update-function-configuration \
        --function-name "$PREFIX-$lambda_name" \
        --handler "$handler_file.handler" \
        --region "$REGION" \
        --no-cli-pager > /dev/null 2>&1
}

# Auth
echo "🔐 Auth..."
for l in mfa-enroll mfa-check mfa-challenge-verify mfa-verify-login mfa-list-factors mfa-unenroll; do
    deploy_lambda "auth/mfa-handlers.js" "$l" && echo "  ✅ $l" || echo "  ❌ $l"
done
deploy_lambda "auth/webauthn-register.js" "webauthn-register" && echo "  ✅ webauthn-register" || echo "  ❌ webauthn-register"
deploy_lambda "auth/webauthn-authenticate.js" "webauthn-authenticate" && echo "  ✅ webauthn-authenticate" || echo "  ❌ webauthn-authenticate"
deploy_lambda "auth/webauthn-check-standalone.js" "webauthn-check" && echo "  ✅ webauthn-check" || echo "  ❌ webauthn-check"
deploy_lambda "auth/delete-webauthn-credential.js" "delete-webauthn-credential" && echo "  ✅ delete-webauthn-credential" || echo "  ❌ delete-webauthn-credential"
deploy_lambda "auth/verify-tv-token.js" "verify-tv-token" && echo "  ✅ verify-tv-token" || echo "  ❌ verify-tv-token"
deploy_lambda "auth/self-register.js" "self-register" && echo "  ✅ self-register" || echo "  ❌ self-register"

# Admin
echo "👤 Admin..."
deploy_lambda "admin/admin-manage-user.js" "admin-manage-user" && echo "  ✅ admin-manage-user" || echo "  ❌ admin-manage-user"
deploy_lambda "admin/create-cognito-user.js" "create-cognito-user" && echo "  ✅ create-cognito-user" || echo "  ❌ create-cognito-user"
deploy_lambda "admin/disable-cognito-user.js" "disable-cognito-user" && echo "  ✅ disable-cognito-user" || echo "  ❌ disable-cognito-user"
deploy_lambda "admin/manage-organizations.js" "manage-organizations" && echo "  ✅ manage-organizations" || echo "  ❌ manage-organizations"
deploy_lambda "admin/deactivate-demo-mode.js" "deactivate-demo-mode" && echo "  ✅ deactivate-demo-mode" || echo "  ❌ deactivate-demo-mode"
deploy_lambda "admin/log-audit.js" "log-audit" && echo "  ✅ log-audit" || echo "  ❌ log-audit"

# Security
echo "🔒 Security..."
deploy_lambda "security/security-scan.js" "security-scan" && echo "  ✅ security-scan" || echo "  ❌ security-scan"
deploy_lambda "security/start-security-scan.js" "start-security-scan" && echo "  ✅ start-security-scan" || echo "  ❌ start-security-scan"
deploy_lambda "security/compliance-scan.js" "compliance-scan" && echo "  ✅ compliance-scan" || echo "  ❌ compliance-scan"
deploy_lambda "security/start-compliance-scan.js" "start-compliance-scan" && echo "  ✅ start-compliance-scan" || echo "  ❌ start-compliance-scan"
deploy_lambda "security/get-compliance-scan-status.js" "get-compliance-scan-status" && echo "  ✅ get-compliance-scan-status" || echo "  ❌ get-compliance-scan-status"
deploy_lambda "security/get-compliance-history.js" "get-compliance-history" && echo "  ✅ get-compliance-history" || echo "  ❌ get-compliance-history"
deploy_lambda "security/well-architected-scan.js" "well-architected-scan" && echo "  ✅ well-architected-scan" || echo "  ❌ well-architected-scan"
deploy_lambda "security/guardduty-scan.js" "guardduty-scan" && echo "  ✅ guardduty-scan" || echo "  ❌ guardduty-scan"
deploy_lambda "security/get-findings.js" "get-findings" && echo "  ✅ get-findings" || echo "  ❌ get-findings"
deploy_lambda "security/get-security-posture.js" "get-security-posture" && echo "  ✅ get-security-posture" || echo "  ❌ get-security-posture"
deploy_lambda "security/validate-aws-credentials.js" "validate-aws-credentials" && echo "  ✅ validate-aws-credentials" || echo "  ❌ validate-aws-credentials"
deploy_lambda "security/validate-permissions.js" "validate-permissions" && echo "  ✅ validate-permissions" || echo "  ❌ validate-permissions"
deploy_lambda "security/iam-deep-analysis.js" "iam-deep-analysis" && echo "  ✅ iam-deep-analysis" || echo "  ❌ iam-deep-analysis"
deploy_lambda "security/lateral-movement-detection.js" "lateral-movement-detection" && echo "  ✅ lateral-movement-detection" || echo "  ❌ lateral-movement-detection"
deploy_lambda "security/drift-detection.js" "drift-detection" && echo "  ✅ drift-detection" || echo "  ❌ drift-detection"
deploy_lambda "security/analyze-cloudtrail.js" "analyze-cloudtrail" && echo "  ✅ analyze-cloudtrail" || echo "  ❌ analyze-cloudtrail"
deploy_lambda "security/start-cloudtrail-analysis.js" "start-cloudtrail-analysis" && echo "  ✅ start-cloudtrail-analysis" || echo "  ❌ start-cloudtrail-analysis"
deploy_lambda "security/fetch-cloudtrail.js" "fetch-cloudtrail" && echo "  ✅ fetch-cloudtrail" || echo "  ❌ fetch-cloudtrail"
deploy_lambda "security/waf-setup-monitoring.js" "waf-setup-monitoring" && echo "  ✅ waf-setup-monitoring" || echo "  ❌ waf-setup-monitoring"
deploy_lambda "security/waf-dashboard-api.js" "waf-dashboard-api" && echo "  ✅ waf-dashboard-api" || echo "  ❌ waf-dashboard-api"
deploy_lambda "security/waf-unblock-expired.js" "waf-unblock-expired" && echo "  ✅ waf-unblock-expired" || echo "  ❌ waf-unblock-expired"

echo "🎉 Deploy concluído!"
