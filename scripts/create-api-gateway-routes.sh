#!/bin/bash
set -e

# Script para criar rotas no API Gateway HTTP e conectar com Lambdas

PROFILE="EVO_PRODUCTION"
REGION="us-east-1"
ACCOUNT_ID="523115032346"

# Obter API Gateway ID da stack
echo "🔍 Obtendo API Gateway ID..."
API_ID=$(AWS_PROFILE=$PROFILE aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-prod-core \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`HttpApiId`].OutputValue' \
  --output text)

AUTHORIZER_ID=$(AWS_PROFILE=$PROFILE aws cloudformation describe-stacks \
  --stack-name evo-uds-v3-prod-core \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`HttpApiAuthorizerId`].OutputValue' \
  --output text)

echo "✅ API Gateway ID: $API_ID"
echo "✅ Authorizer ID: $AUTHORIZER_ID"

# Definir rotas (método, path, lambda-name, auth-required)
# Formato: "METHOD|PATH|LAMBDA_NAME|AUTH"
ROUTES=(
  # Auth
  "POST|/api/auth/login|login|false"
  "POST|/api/auth/register|register|false"
  "POST|/api/auth/logout|logout|true"
  "POST|/api/auth/refresh|refresh-token|false"
  "POST|/api/auth/change-password|change-password|true"
  "GET|/api/auth/me|get-user|true"
  
  # MFA
  "POST|/api/auth/mfa/enroll|mfa-enroll|true"
  "POST|/api/auth/mfa/verify|mfa-verify-login|false"
  "POST|/api/auth/mfa/challenge/verify|mfa-challenge-verify|true"
  "GET|/api/auth/mfa/check|mfa-check|true"
  "GET|/api/auth/mfa/factors|mfa-list-factors|true"
  "DELETE|/api/auth/mfa/unenroll|mfa-unenroll|true"
  
  # AWS Credentials
  "POST|/api/aws/credentials|save-aws-credentials|true"
  "POST|/api/aws/credentials/validate|validate-aws-credentials|true"
  "GET|/api/aws/credentials|list-aws-credentials|true"
  "DELETE|/api/aws/credentials/{id}|delete-aws-credentials|true"
  
  # Azure Credentials
  "POST|/api/azure/credentials|save-azure-credentials|true"
  "POST|/api/azure/credentials/validate|validate-azure-credentials|true"
  "GET|/api/azure/credentials|list-azure-credentials|true"
  "DELETE|/api/azure/credentials/{id}|delete-azure-credentials|true"
  
  # Cloud Credentials (multi-cloud)
  "GET|/api/cloud/credentials|list-cloud-credentials|true"
  
  # Security Scans
  "POST|/api/security/scan|security-scan|true"
  "GET|/api/security/scans|list-security-scans|true"
  "GET|/api/security/scans/{id}|get-security-scan|true"
  "DELETE|/api/security/scans/{id}|delete-security-scan|true"
  
  # Compliance
  "POST|/api/compliance/scan|compliance-scan|true"
  "GET|/api/compliance/scans|list-compliance-scans|true"
  
  # Cost Analysis
  "POST|/api/cost/fetch|fetch-daily-costs|true"
  "GET|/api/cost/daily|get-daily-costs|true"
  "GET|/api/cost/monthly|get-monthly-costs|true"
  
  # Dashboard
  "GET|/api/dashboard/metrics|dashboard-metrics|true"
  "GET|/api/dashboard/executive|executive-dashboard|true"
  
  # Organizations
  "GET|/api/organizations|list-organizations|true"
  "POST|/api/organizations|create-organization|true"
  "PUT|/api/organizations/{id}|update-organization|true"
  
  # Users
  "GET|/api/users|list-users|true"
  "POST|/api/users|create-user|true"
  "PUT|/api/users/{id}|update-user|true"
  "DELETE|/api/users/{id}|delete-user|true"
  
  # Health Check
  "GET|/api/health|health-check|false"
)

echo ""
echo "📋 Total de rotas a criar: ${#ROUTES[@]}"
echo ""

COUNT=0
FAILED=0

for ROUTE in "${ROUTES[@]}"; do
  COUNT=$((COUNT + 1))
  
  IFS='|' read -r METHOD PATH LAMBDA_NAME AUTH <<< "$ROUTE"
  
  echo "[$COUNT/${#ROUTES[@]}] Criando rota: $METHOD $PATH -> $LAMBDA_NAME"
  
  # Criar integração Lambda
  LAMBDA_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:evo-uds-v3-prod-$LAMBDA_NAME"
  
  INTEGRATION_ID=$(AWS_PROFILE=$PROFILE aws apigatewayv2 create-integration \
    --api-id "$API_ID" \
    --integration-type AWS_PROXY \
    --integration-uri "$LAMBDA_ARN" \
    --payload-format-version 2.0 \
    --region $REGION \
    --query 'IntegrationId' \
    --output text 2>/dev/null)
  
  if [ -z "$INTEGRATION_ID" ]; then
    echo "  ❌ Erro ao criar integração"
    FAILED=$((FAILED + 1))
    continue
  fi
  
  echo "  ✅ Integração criada: $INTEGRATION_ID"
  
  # Criar rota
  if [ "$AUTH" = "true" ]; then
    ROUTE_ID=$(AWS_PROFILE=$PROFILE aws apigatewayv2 create-route \
      --api-id "$API_ID" \
      --route-key "$METHOD $PATH" \
      --target "integrations/$INTEGRATION_ID" \
      --authorization-type JWT \
      --authorizer-id "$AUTHORIZER_ID" \
      --region $REGION \
      --query 'RouteId' \
      --output text 2>/dev/null)
  else
    ROUTE_ID=$(AWS_PROFILE=$PROFILE aws apigatewayv2 create-route \
      --api-id "$API_ID" \
      --route-key "$METHOD $PATH" \
      --target "integrations/$INTEGRATION_ID" \
      --authorization-type NONE \
      --region $REGION \
      --query 'RouteId' \
      --output text 2>/dev/null)
  fi
  
  if [ -z "$ROUTE_ID" ]; then
    echo "  ❌ Erro ao criar rota"
    FAILED=$((FAILED + 1))
    continue
  fi
  
  echo "  ✅ Rota criada: $ROUTE_ID"
  
  # Adicionar permissão para API Gateway invocar Lambda
  AWS_PROFILE=$PROFILE aws lambda add-permission \
    --function-name "evo-uds-v3-prod-$LAMBDA_NAME" \
    --statement-id "apigateway-$LAMBDA_NAME-$(date +%s)" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/*" \
    --region $REGION \
    --no-cli-pager > /dev/null 2>&1 || echo "  ⚠️  Permissão já existe ou erro ao adicionar"
  
  echo ""
done

echo ""
echo "=========================================="
echo "✅ Criação de rotas concluída!"
echo "Total: ${#ROUTES[@]} rotas"
echo "Sucesso: $((${#ROUTES[@]} - FAILED))"
echo "Falhas: $FAILED"
echo "=========================================="
echo ""
echo "🌐 API Endpoint:"
AWS_PROFILE=$PROFILE aws apigatewayv2 get-api \
  --api-id "$API_ID" \
  --region $REGION \
  --query 'ApiEndpoint' \
  --output text
