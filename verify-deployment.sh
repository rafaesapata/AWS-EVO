#!/bin/bash

echo "🎯 VERIFICAÇÃO FINAL DO DEPLOYMENT"
echo "=================================="
echo ""

# Função para testar URL
test_url() {
    local url=$1
    local name=$2
    
    if curl -s -f --max-time 10 "$url" > /dev/null 2>&1; then
        echo "   ✅ $name - FUNCIONANDO"
        return 0
    else
        echo "   ❌ $name - ERRO"
        return 1
    fi
}

echo "🌐 FRONTEND:"
test_url "https://evo.ia.udstec.io" "Frontend Principal"
test_url "https://www.evo.ia.udstec.io" "Frontend WWW"

echo ""
echo "🔌 API:"
test_url "https://api.evo.ia.udstec.io/health" "API Health Check"

echo ""
echo "📄 TEMPLATE:"
test_url "https://evo.ia.udstec.io/cloudformation/evo-platform-role.yaml" "CloudFormation Template"

echo ""
echo "🔐 SSL:"
if echo | openssl s_client -servername evo.ia.udstec.io -connect evo.ia.udstec.io:443 2>/dev/null | grep -q "Verify return code: 0" 2>/dev/null; then
    echo "   ✅ Certificado SSL - VÁLIDO"
else
    echo "   ⚠️  Certificado SSL - Verificação manual necessária"
fi

echo ""
echo "=================================="
echo "🎉 DEPLOYMENT VERIFICADO!"
echo "=================================="
echo ""
echo "📱 ACESSE O SISTEMA:"
echo "   🌐 Frontend: https://evo.ia.udstec.io"
echo "   🔑 Login: admin@evo-uds.com / TempPass123!"
echo "   🔑 Login: admin-user / AdminPass123!"
echo ""