#!/bin/bash

# Script para atualizar .env com credenciais do RDS
# Uso: ./scripts/update-env-with-rds.sh [development|staging|production]

set -e

ENV=${1:-development}
REGION=${AWS_REGION:-us-east-1}

echo "🔍 Obtendo credenciais do RDS para ambiente: $ENV"

# Nome do stack
STACK_NAME="EvoUds$(echo ${ENV:0:1} | tr '[:lower:]' '[:upper:]')${ENV:1}DatabaseStack"

# Obter outputs do CloudFormation
echo "📡 Consultando CloudFormation..."
OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs" \
  --output json)

# Extrair endpoint e secret ARN
ENDPOINT=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="DatabaseEndpoint") | .OutputValue')
SECRET_ARN=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="DatabaseSecretArn") | .OutputValue')

if [ -z "$ENDPOINT" ] || [ -z "$SECRET_ARN" ]; then
  echo "❌ Erro: Não foi possível obter endpoint ou secret ARN"
  exit 1
fi

echo "✅ Endpoint: $ENDPOINT"
echo "✅ Secret ARN: $SECRET_ARN"

# Obter credenciais do Secrets Manager
echo "🔐 Obtendo credenciais do Secrets Manager..."
SECRET_VALUE=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" \
  --region "$REGION" \
  --query SecretString \
  --output text)

USERNAME=$(echo "$SECRET_VALUE" | jq -r '.username')
PASSWORD=$(echo "$SECRET_VALUE" | jq -r '.password')

# URL encode da senha (para caracteres especiais)
ENCODED_PASSWORD=$(node -e "console.log(encodeURIComponent('$PASSWORD'))")

# Construir DATABASE_URL
DATABASE_URL="postgresql://${USERNAME}:${ENCODED_PASSWORD}@${ENDPOINT}:5432/evouds"

echo "✅ Credenciais obtidas com sucesso!"

# Atualizar arquivos .env
ENV_FILES=(".env" ".env.local" ".env.production.local")

for ENV_FILE in "${ENV_FILES[@]}"; do
  if [ -f "$ENV_FILE" ]; then
    echo "📝 Atualizando $ENV_FILE..."
    
    # Backup
    cp "$ENV_FILE" "${ENV_FILE}.backup"
    
    # Atualizar DATABASE_URL
    if grep -q "^DATABASE_URL=" "$ENV_FILE"; then
      sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL|" "$ENV_FILE"
    else
      echo "" >> "$ENV_FILE"
      echo "DATABASE_URL=$DATABASE_URL" >> "$ENV_FILE"
    fi
    
    # Atualizar AWS_RDS_SECRET_ARN
    if grep -q "^AWS_RDS_SECRET_ARN=" "$ENV_FILE"; then
      sed -i.bak "s|^AWS_RDS_SECRET_ARN=.*|AWS_RDS_SECRET_ARN=$SECRET_ARN|" "$ENV_FILE"
    else
      echo "AWS_RDS_SECRET_ARN=$SECRET_ARN" >> "$ENV_FILE"
    fi
    
    # Remover arquivo de backup do sed
    rm -f "${ENV_FILE}.bak"
    
    echo "✅ $ENV_FILE atualizado"
  fi
done

# Salvar credenciais em arquivo JSON
CREDS_FILE=".rds-credentials-${ENV}.json"
cat > "$CREDS_FILE" <<EOF
{
  "environment": "$ENV",
  "endpoint": "$ENDPOINT",
  "database": "evouds",
  "username": "$USERNAME",
  "password": "$PASSWORD",
  "port": 5432,
  "secretArn": "$SECRET_ARN",
  "databaseUrl": "$DATABASE_URL",
  "updatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

echo "✅ Credenciais salvas em: $CREDS_FILE"
echo ""
echo "📋 DATABASE_URL:"
echo "   $DATABASE_URL"
echo ""
echo "⚠️  IMPORTANTE: Não commite arquivos com credenciais!"
echo "✅ Concluído!"
