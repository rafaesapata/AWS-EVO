#!/bin/bash
# Deploy em lote de Lambdas críticas

REGION="us-east-1"
PREFIX="evo-uds-v3-production"

# Preparar base uma vez
echo "📦 Preparando pacote base..."
rm -rf /tmp/lambda-base
mkdir -p /tmp/lambda-base
cp -r backend/dist/lib /tmp/lambda-base/
cp -r backend/dist/types /tmp/lambda-base/

deploy() {
    local handler_path=$1
    local lambda_name=$2
    local handler_file=$(basename "$handler_path" .js)
    
    rm -rf /tmp/lambda-deploy
    mkdir -p /tmp/lambda-deploy
    cp -r /tmp/lambda-base/lib /tmp/lambda-deploy/
    cp -r /tmp/lambda-base/types /tmp/lambda-deploy/
    
    sed 's|require("../../lib/|require("./lib/|g' "backend/dist/handlers/$handler_path" 2>/dev/null | \
    sed 's|require("../lib/|require("./lib/|g' | \
    sed 's|require("../../types/|require("./types/|g' > "/tmp/lambda-deploy/$handler_file.js"
    
    (cd /tmp/lambda-deploy && zip -rq /tmp/lambda.zip .)
    
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
    
    return $?
}

echo ""
echo "🔐 Auth Lambdas..."
deploy "auth/mfa-handlers.js" "mfa-enroll" && echo "  ✅ mfa-enroll" || echo "  ❌ mfa-enroll"
deploy "auth/mfa-handlers.js" "mfa-check" && echo "  ✅ mfa-check" || echo "  ❌ mfa-check"
deploy "auth/mfa-handlers.js" "mfa-challenge-verify" && echo "  ✅ mfa-challenge-verify" || echo "  ❌ mfa-challenge-verify"
deploy "auth/mfa-handlers.js" "mfa-verify-login" && echo "  ✅ mfa-verify-login" || echo "  ❌ mfa-verify-login"
deploy "auth/mfa-handlers.js" "mfa-list-factors" && echo "  ✅ mfa-list-factors" || echo "  ❌ mfa-list-factors"
deploy "auth/mfa-handlers.js" "mfa-unenroll" && echo "  ✅ mfa-unenroll" || echo "  ❌ mfa-unenroll"
deploy "auth/webauthn-register.js" "webauthn-register" && echo "  ✅ webauthn-register" || echo "  ❌ webauthn-register"
deploy "auth/webauthn-authenticate.js" "webauthn-authenticate" && echo "  ✅ webauthn-authenticate" || echo "  ❌ webauthn-authenticate"
deploy "auth/webauthn-check-standalone.js" "webauthn-check" && echo "  ✅ webauthn-check" || echo "  ❌ webauthn-check"
deploy "auth/self-register.js" "self-register" && echo "  ✅ self-register" || echo "  ❌ self-register"

echo ""
echo "🔒 Security Lambdas..."
deploy "security/security-scan.js" "security-scan" && echo "  ✅ security-scan" || echo "  ❌ security-scan"
deploy "security/compliance-scan.js" "compliance-scan" && echo "  ✅ compliance-scan" || echo "  ❌ compliance-scan"
deploy "security/well-architected-scan.js" "well-architected-scan" && echo "  ✅ well-architected-scan" || echo "  ❌ well-architected-scan"
deploy "security/validate-aws-credentials.js" "validate-aws-credentials" && echo "  ✅ validate-aws-credentials" || echo "  ❌ validate-aws-credentials"
deploy "security/waf-dashboard-api.js" "waf-dashboard-api" && echo "  ✅ waf-dashboard-api" || echo "  ❌ waf-dashboard-api"

echo ""
echo "💰 Cost Lambdas..."
deploy "cost/fetch-daily-costs.js" "fetch-daily-costs" && echo "  ✅ fetch-daily-costs" || echo "  ❌ fetch-daily-costs"
deploy "cost/ri-sp-analyzer.js" "ri-sp-analyzer" && echo "  ✅ ri-sp-analyzer" || echo "  ❌ ri-sp-analyzer"
deploy "cost/finops-copilot-v2.js" "finops-copilot" && echo "  ✅ finops-copilot" || echo "  ❌ finops-copilot"

echo ""
echo "☁️ AWS Credentials..."
deploy "aws/save-aws-credentials.js" "save-aws-credentials" && echo "  ✅ save-aws-credentials" || echo "  ❌ save-aws-credentials"
deploy "aws/list-aws-credentials.js" "list-aws-credentials" && echo "  ✅ list-aws-credentials" || echo "  ❌ list-aws-credentials"

echo ""
echo "🔵 Azure Lambdas..."
deploy "azure/validate-azure-credentials.js" "validate-azure-credentials" && echo "  ✅ validate-azure-credentials" || echo "  ❌ validate-azure-credentials"
deploy "azure/save-azure-credentials.js" "save-azure-credentials" && echo "  ✅ save-azure-credentials" || echo "  ❌ save-azure-credentials"
deploy "azure/azure-security-scan.js" "azure-security-scan" && echo "  ✅ azure-security-scan" || echo "  ❌ azure-security-scan"
deploy "azure/azure-fetch-edge-services.js" "azure-fetch-edge-services" && echo "  ✅ azure-fetch-edge-services" || echo "  ❌ azure-fetch-edge-services"

echo ""
echo "📊 Dashboard & Data..."
deploy "dashboard/get-executive-dashboard.js" "get-executive-dashboard" && echo "  ✅ get-executive-dashboard" || echo "  ❌ get-executive-dashboard"
deploy "data/query-table.js" "query-table" && echo "  ✅ query-table" || echo "  ❌ query-table"
deploy "data/mutate-table.js" "mutate-table" && echo "  ✅ mutate-table" || echo "  ❌ mutate-table"

echo ""
echo "🤖 AI Lambdas..."
deploy "ai/bedrock-chat.js" "bedrock-chat" && echo "  ✅ bedrock-chat" || echo "  ❌ bedrock-chat"

echo ""
echo "👤 Admin Lambdas..."
deploy "admin/manage-organizations.js" "manage-organizations" && echo "  ✅ manage-organizations" || echo "  ❌ manage-organizations"
deploy "admin/admin-manage-user.js" "admin-manage-user" && echo "  ✅ admin-manage-user" || echo "  ❌ admin-manage-user"

echo ""
echo "📜 License Lambdas..."
deploy "license/validate-license.js" "validate-license" && echo "  ✅ validate-license" || echo "  ❌ validate-license"
deploy "license/sync-license.js" "sync-license" && echo "  ✅ sync-license" || echo "  ❌ sync-license"

echo ""
echo "🎉 Deploy batch concluído!"
