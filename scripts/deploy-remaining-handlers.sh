#!/bin/bash
# Deploy script para handlers restantes
# Criado em: 27/12/2024

set -e

REGION="us-east-1"
ACCOUNT_ID="383234048592"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/evo-uds-v3-production-lambda-nodejs-role"
LAYER_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:layer:evo-prisma-deps-layer:2"
VPC_SUBNETS="subnet-0dbb444e4ef54d211,subnet-05383447666913b7b"
SECURITY_GROUP="sg-04eb71f681cc651ae"
PREFIX="evo-uds-v3-production"

DATABASE_URL="postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public"
COGNITO_USER_POOL_ID="us-east-1_qGmGkvmpL"

echo "🚀 Deployando handlers restantes..."
echo ""

create_lambda() {
  local NAME=$1
  local HANDLER=$2
  local CATEGORY=$3
  local TIMEOUT=${4:-30}
  local MEMORY=${5:-256}
  
  FUNCTION_NAME="${PREFIX}-${NAME}"
  
  # Verificar se já existe
  if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null; then
    echo "⏭️  $NAME já existe, pulando..."
    return 0
  fi
  
  echo "📦 Criando: ${NAME}"
  
  ZIP_FILE="/tmp/${NAME}.zip"
  rm -f "$ZIP_FILE"
  
  TEMP_DIR="/tmp/lambda-${NAME}"
  rm -rf "$TEMP_DIR"
  mkdir -p "$TEMP_DIR/handlers/${CATEGORY}"
  mkdir -p "$TEMP_DIR/lib"
  
  cp backend/dist/handlers/${CATEGORY}/*.js "$TEMP_DIR/handlers/${CATEGORY}/" 2>/dev/null || true
  cp backend/dist/lib/*.js "$TEMP_DIR/lib/" 2>/dev/null || true
  
  pushd "$TEMP_DIR" > /dev/null
  zip -r "$ZIP_FILE" . > /dev/null
  popd > /dev/null
  
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs18.x \
    --role "$ROLE_ARN" \
    --handler "handlers/${CATEGORY}/${HANDLER}.handler" \
    --zip-file "fileb://${ZIP_FILE}" \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY" \
    --vpc-config "SubnetIds=${VPC_SUBNETS},SecurityGroupIds=${SECURITY_GROUP}" \
    --layers "$LAYER_ARN" \
    --environment "Variables={DATABASE_URL=${DATABASE_URL},NODE_ENV=production,COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}}" \
    --region "$REGION" > /dev/null 2>&1
  
  rm -rf "$TEMP_DIR" "$ZIP_FILE"
  echo "  ✅ ${NAME} criado!"
}

# Admin handlers
echo "=== Admin ==="
create_lambda "admin-manage-user" "admin-manage-user" "admin" 30 256

# Cost handlers
echo "=== Cost ==="
create_lambda "budget-forecast" "budget-forecast" "cost" 60 512
create_lambda "cost-optimization" "cost-optimization" "cost" 120 512
create_lambda "generate-cost-forecast" "generate-cost-forecast" "cost" 60 512

# Integrations
echo "=== Integrations ==="
create_lambda "create-jira-ticket" "create-jira-ticket" "integrations" 30 256

# Jobs
echo "=== Jobs ==="
create_lambda "execute-scheduled-job" "execute-scheduled-job" "jobs" 300 512
create_lambda "process-background-jobs" "process-background-jobs" "jobs" 300 512
create_lambda "scheduled-scan-executor" "scheduled-scan-executor" "jobs" 300 512

# Knowledge Base
echo "=== Knowledge Base ==="
create_lambda "kb-ai-suggestions" "kb-ai-suggestions" "kb" 30 256

# License
echo "=== License ==="
create_lambda "daily-license-validation" "daily-license-validation" "license" 30 256

# ML
echo "=== ML ==="
create_lambda "anomaly-detection" "anomaly-detection" "ml" 60 512
create_lambda "intelligent-alerts-analyzer" "intelligent-alerts-analyzer" "ml" 60 512

# Monitoring
echo "=== Monitoring ==="
create_lambda "auto-alerts" "auto-alerts" "monitoring" 60 256
create_lambda "check-alert-rules" "check-alert-rules" "monitoring" 30 256
create_lambda "endpoint-monitor-check" "endpoint-monitor-check" "monitoring" 60 256
create_lambda "aws-realtime-metrics" "aws-realtime-metrics" "monitoring" 60 512

# Notifications
echo "=== Notifications ==="
create_lambda "send-email" "send-email" "notifications" 30 256
create_lambda "send-notification" "send-notification" "notifications" 30 256

# Organizations
echo "=== Organizations ==="
create_lambda "create-organization-account" "create-organization-account" "organizations" 30 256

# Reports
echo "=== Reports ==="
create_lambda "generate-excel-report" "generate-excel-report" "reports" 120 1024
create_lambda "generate-pdf-report" "generate-pdf-report" "reports" 120 1024
create_lambda "generate-remediation-script" "generate-remediation-script" "reports" 30 256
create_lambda "generate-security-pdf" "generate-security-pdf" "reports" 120 1024
create_lambda "security-scan-pdf-export" "security-scan-pdf-export" "reports" 120 1024

# Security
echo "=== Security ==="
create_lambda "drift-detection" "drift-detection" "security" 120 512
create_lambda "get-findings" "get-findings" "security" 30 256
create_lambda "get-security-posture" "get-security-posture" "security" 60 512
create_lambda "guardduty-scan" "guardduty-scan" "security" 120 512
create_lambda "iam-deep-analysis" "iam-deep-analysis" "security" 120 512
create_lambda "lateral-movement-detection" "lateral-movement-detection" "security" 120 512

echo ""
echo "🎉 Deploy de handlers concluído!"
