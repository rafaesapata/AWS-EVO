#!/bin/bash
# =============================================================================
# EVO DB Tunnel — SSM port forwarding para RDS via bastion
#
# Pré-requisitos:
#   1. AWS CLI v2 instalado
#   2. Session Manager plugin: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html
#   3. Credenciais AWS configuradas (~/.aws/credentials ou env vars)
#   4. Bastion stack deployada (cloudformation/bastion-ssm-stack.yaml)
#
# Uso:
#   ./backend/scripts/db-tunnel.sh              # production (default)
#   ./backend/scripts/db-tunnel.sh sandbox      # sandbox
#   ./backend/scripts/db-tunnel.sh production 5433  # porta local customizada
#
# Depois de conectar, em outro terminal:
#   DATABASE_URL="postgresql://evoadmin:<password>@localhost:5432/evouds?schema=public" \
#   npx tsx backend/scripts/invoke-local.ts monitoring/health-check -m GET
# =============================================================================

set -e

ENV="${1:-production}"
LOCAL_PORT="${2:-5432}"
PROJECT="evo-uds-v3"

echo "🔍 Buscando bastion instance para ${PROJECT}-${ENV}..."

INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=${PROJECT}-${ENV}-ssm-bastion" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null)

if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
  echo "❌ Bastion não encontrado. Deploy a stack primeiro:"
  echo ""
  echo "   aws cloudformation deploy \\"
  echo "     --template-file cloudformation/bastion-ssm-stack.yaml \\"
  echo "     --stack-name ${PROJECT}-${ENV}-bastion \\"
  echo "     --parameter-overrides \\"
  echo "       Environment=${ENV} \\"
  echo "       VpcId=<VPC_ID> \\"
  echo "       PublicSubnetId=<PUBLIC_SUBNET_ID> \\"
  echo "       DatabaseSecurityGroupId=<DB_SG_ID> \\"
  echo "     --capabilities CAPABILITY_NAMED_IAM"
  echo ""
  exit 1
fi

echo "✅ Bastion: ${INSTANCE_ID}"

# Detectar RDS endpoint
if [ "$ENV" = "production" ]; then
  RDS_HOST="evo-uds-v3-production-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com"
else
  RDS_HOST="evo-uds-v3-sandbox-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com"
fi

echo "🔗 Tunnel: localhost:${LOCAL_PORT} → ${RDS_HOST}:5432"
echo ""
echo "📋 Em outro terminal, use:"
echo "   DATABASE_URL=\"postgresql://evoadmin:<password>@localhost:${LOCAL_PORT}/evouds?schema=public\""
echo ""
echo "   Ou para invoke-local:"
echo "   DATABASE_URL=\"postgresql://evoadmin:<password>@localhost:${LOCAL_PORT}/evouds?schema=public\" \\"
echo "   npx tsx backend/scripts/invoke-local.ts <handler> [options]"
echo ""
echo "🛑 Ctrl+C para encerrar o tunnel"
echo ""

aws ssm start-session \
  --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"${RDS_HOST}\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}"
