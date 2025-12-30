#!/bin/bash

# Script para buscar dados de custo via API
# Você precisa pegar o JWT token do browser primeiro

if [ -z "$JWT_TOKEN" ]; then
    echo "❌ JWT_TOKEN environment variable is required"
    echo "Get it from browser dev tools:"
    echo "1. Go to https://evo.ai.udstec.io/app"
    echo "2. Open F12 > Network tab"
    echo "3. Refresh page and copy Authorization header"
    exit 1
fi

echo "🚀 Triggering cost data fetch for both accounts..."

# Buscar custos para a primeira conta (103548788372)
echo "📊 Fetching costs for account 447d6499-19f3-4382-9249-5f12a320e835 (103548788372)..."
curl -X POST https://api-evo.ai.udstec.io/api/functions/fetch-daily-costs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Origin: https://evo.ai.udstec.io" \
  -d '{
    "accountId": "447d6499-19f3-4382-9249-5f12a320e835",
    "incremental": false,
    "granularity": "DAILY"
  }' | jq '.'

echo -e "\n📊 Fetching costs for account ea07c7f8-87c8-4e47-93de-deff6a463c31 (563366818355)..."
curl -X POST https://api-evo.ai.udstec.io/api/functions/fetch-daily-costs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Origin: https://evo.ai.udstec.io" \
  -d '{
    "accountId": "ea07c7f8-87c8-4e47-93de-deff6a463c31",
    "incremental": false,
    "granularity": "DAILY"
  }' | jq '.'

echo -e "\n✅ Cost fetch requests sent!"
echo "💡 Wait a few minutes, then refresh the cost analysis page"