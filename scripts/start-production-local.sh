#!/bin/bash

# Script para iniciar ambiente de produção local
echo "🏭 Configurando Ambiente de Produção Local..."

# Fazer backup do .env atual se existir
if [ -f ".env" ]; then
    cp .env .env.backup
    echo "✅ Backup do .env atual criado"
fi

# Copiar configurações de produção
cp .env.production.local .env
echo "✅ Configurações de produção aplicadas"

# Limpar cache
rm -rf node_modules/.vite dist
echo "✅ Cache limpo"

# Build de produção
echo "📦 Fazendo build de produção..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build de produção concluído"
else
    echo "❌ Erro no build de produção"
    exit 1
fi

echo ""
echo "🚀 Iniciando servidor de produção local..."
echo "📍 URL: http://localhost:4173"
echo "🛡️  Modo: Produção"
echo "🔒 Segurança: Military-Grade"
echo ""
echo "⚠️  IMPORTANTE: Este é um ambiente de PRODUÇÃO local"
echo "   - Todas as APIs apontam para produção"
echo "   - Dados reais serão utilizados"
echo "   - Autenticação real do AWS Cognito"
echo ""
echo "🧪 Para testar:"
echo "1. Acesse: http://localhost:4173"
echo "2. Teste login com credenciais reais"
echo "3. Verifique console do navegador"
echo "4. Teste funcionalidades críticas"
echo ""
echo "🔄 Para parar: Ctrl+C"
echo "🔄 Para voltar ao desenvolvimento: npm run dev:restore"
echo ""

# Função para cleanup ao sair
cleanup() {
    echo ""
    echo "🛑 Parando servidor de produção local..."
    
    # Restaurar .env original se existir backup
    if [ -f ".env.backup" ]; then
        mv .env.backup .env
        echo "✅ Configurações originais restauradas"
    fi
    
    exit 0
}

# Capturar sinais para cleanup
trap cleanup SIGINT SIGTERM

# Iniciar servidor de preview
npm run preview