#!/bin/bash
# =============================================================================
# EVO DB Tunnel — SSH port forwarding para RDS via bastion existente
#
# Pré-requisitos:
#   1. Key pair ~/.ssh/evo-production-bastion.pem (ou path via $BASTION_KEY)
#   2. AWS CLI v2 com profile EVO_PRODUCTION configurado
#
# Uso:
#   ./backend/scripts/db-tunnel.sh              # production (default)
#   ./backend/scripts/db-tunnel.sh 5433         # porta local customizada
#   BASTION_KEY=~/keys/bastion.pem ./backend/scripts/db-tunnel.sh
#
# Depois de conectar, em outro terminal:
#   DATABASE_URL="postgresql://evoadmin:<password>@localhost:5432/evouds?schema=public" \
#   npx tsx backend/scripts/invoke-local.ts monitoring/health-check -m GET
# =============================================================================

set -e

LOCAL_PORT="${1:-5432}"
BASTION_IP="44.213.112.31"
BASTION_USER="ec2-user"
BASTION_KEY="${BASTION_KEY:-$HOME/.ssh/evo-production-bastion.pem}"
RDS_HOST="evo-uds-v3-production-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com"
RDS_PORT="5432"

# Verificar key
if [ ! -f "$BASTION_KEY" ]; then
  echo "❌ Key não encontrada: $BASTION_KEY"
  echo ""
  echo "   Opções:"
  echo "   1. Copie a key para ~/.ssh/evo-production-bastion.pem"
  echo "   2. Ou defina: BASTION_KEY=/path/to/key.pem ./backend/scripts/db-tunnel.sh"
  echo ""
  exit 1
fi

# Verificar permissões da key
KEY_PERMS=$(stat -f "%Lp" "$BASTION_KEY" 2>/dev/null || stat -c "%a" "$BASTION_KEY" 2>/dev/null)
if [ "$KEY_PERMS" != "400" ] && [ "$KEY_PERMS" != "600" ]; then
  echo "⚠️  Corrigindo permissões da key..."
  chmod 400 "$BASTION_KEY"
fi

echo "🔗 Tunnel: localhost:${LOCAL_PORT} → ${RDS_HOST}:${RDS_PORT}"
echo "   Via bastion: ${BASTION_USER}@${BASTION_IP}"
echo ""
echo "📋 Em outro terminal, use:"
echo "   DATABASE_URL=\"postgresql://evoadmin:<password>@localhost:${LOCAL_PORT}/evouds?schema=public\" \\"
echo "   npx tsx backend/scripts/invoke-local.ts <handler> [options]"
echo ""
echo "🛑 Ctrl+C para encerrar o tunnel"
echo ""

ssh -N -L "${LOCAL_PORT}:${RDS_HOST}:${RDS_PORT}" \
  -i "$BASTION_KEY" \
  -o StrictHostKeyChecking=no \
  -o ServerAliveInterval=60 \
  -o ServerAliveCountMax=3 \
  "${BASTION_USER}@${BASTION_IP}"
