#!/bin/bash
# Script para atualizar variáveis SES em todas as Lambdas do EVO Platform
# Uso: ./scripts/update-ses-env-vars.sh [environment]
# Exemplo: ./scripts/update-ses-env-vars.sh sandbox
#          ./scripts/update-ses-env-vars.sh production

set -euo pipefail

PREFIX="${1:-evo-platform-sandbox-}"
PROFILE="${2:-}"
PROFILE_ARG=""
if [ -n "$PROFILE" ]; then
  PROFILE_ARG="--profile $PROFILE"
fi

# Novas variáveis SES
SES_REGION="us-east-1"
SES_FROM_EMAIL="evo@nuevacore.com"
SES_FROM_NAME="EVO Platform"
SES_DOMAIN="nuevacore.com"

echo "🔍 Buscando Lambdas com prefixo: ${PREFIX}"

# Listar todas as funções do projeto
FUNCTIONS=$(aws lambda list-functions $PROFILE_ARG \
  --query "Functions[?starts_with(FunctionName, '${PREFIX}')].FunctionName" \
  --output text --no-cli-pager)

TOTAL=$(echo "$FUNCTIONS" | wc -w | tr -d ' ')
echo "📦 Encontradas ${TOTAL} funções"
echo ""

UPDATED=0
ERRORS=0

for FUNC in $FUNCTIONS; do
  # Pegar variáveis atuais
  CURRENT_ENV=$(aws lambda get-function-configuration $PROFILE_ARG \
    --function-name "$FUNC" \
    --query "Environment.Variables" \
    --output json --no-cli-pager 2>/dev/null || echo "{}")

  # Adicionar/atualizar variáveis SES usando jq
  NEW_ENV=$(echo "$CURRENT_ENV" | jq \
    --arg ses_region "$SES_REGION" \
    --arg ses_from "$SES_FROM_EMAIL" \
    --arg ses_name "$SES_FROM_NAME" \
    --arg ses_domain "$SES_DOMAIN" \
    '. + {
      "AWS_SES_REGION": $ses_region,
      "AWS_SES_FROM_EMAIL": $ses_from,
      "AWS_SES_FROM_NAME": $ses_name,
      "AWS_SES_DOMAIN": $ses_domain
    }')

  # Atualizar a função
  if aws lambda update-function-configuration $PROFILE_ARG \
    --function-name "$FUNC" \
    --environment "{\"Variables\": $NEW_ENV}" \
    --no-cli-pager > /dev/null 2>&1; then
    echo "✅ ${FUNC}"
    UPDATED=$((UPDATED + 1))
  else
    echo "❌ ${FUNC}"
    ERRORS=$((ERRORS + 1))
  fi

  # Pequeno delay para evitar throttling
  sleep 0.3
done

echo ""
echo "📊 Resultado: ${UPDATED} atualizadas, ${ERRORS} erros de ${TOTAL} total"
echo ""
echo "⚠️  As variáveis AWS_SES_ACCESS_KEY_ID e AWS_SES_SECRET_ACCESS_KEY"
echo "   NÃO são atualizadas por este script (segurança)."
echo "   Se precisar, configure manualmente ou via Secrets Manager."
