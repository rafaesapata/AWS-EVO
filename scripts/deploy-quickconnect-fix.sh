#!/bin/bash

# Script para fazer deploy da correção do QuickConnect
# Uso: ./scripts/deploy-quickconnect-fix.sh

set -e

echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                            ║"
echo "║        🚀 Deploy da Correção do QuickConnect                              ║"
echo "║                                                                            ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Verificar conta AWS
echo "🔍 Verificando conta AWS..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>&1)

if [ $? -ne 0 ]; then
    echo "❌ Erro: Não foi possível obter informações da conta AWS"
    echo "   Configure suas credenciais: aws configure"
    exit 1
fi

echo "✅ Conta AWS: $ACCOUNT_ID"

if [ "$ACCOUNT_ID" != "418272799411" ]; then
    echo ""
    echo "⚠️  ATENÇÃO: Você está usando a conta ERRADA!"
    echo "   Cont