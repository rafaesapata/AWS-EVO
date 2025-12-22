#!/bin/bash

echo "🎯 VALIDAÇÃO FINAL - PADRÃO MILITAR EVO UDS"
echo "═══════════════════════════════════════════"

# Verificar se há erros de compilação
echo ""
echo "1️⃣ Verificando compilação TypeScript..."
if npm run type-check > /dev/null 2>&1; then
  echo "   ✅ Compilação TypeScript OK"
else
  echo "   ❌ Erros de compilação encontrados"
  npm run type-check
fi

# Verificar mocks restantes
echo ""
echo "2️⃣ Verificando mocks restantes..."
CRITICAL_MOCKS=$(grep -rn "mock\|Mock" --include="*.ts" --include="*.tsx" \
  backend/src/handlers/ src/integrations/ src/services/ \
  | grep -v "test\|Test\|spec\|__tests__" \
  | grep -v "testing-framework" \
  | wc -l)
echo "   Mocks críticos restantes: $CRITICAL_MOCKS"

# Verificar console.log críticos
echo ""
echo "3️⃣ Verificando console.log críticos..."
CRITICAL_CONSOLE=$(grep -rn "console\." backend/src/handlers/ \
  | grep -v "test\|Test" \
  | wc -l)
echo "   Console.log em handlers: $CRITICAL_CONSOLE"

# Verificar se bedrock está usando API real
echo ""
echo "4️⃣ Verificando integração Bedrock..."
if grep -q "API_BASE_URL" src/integrations/aws/bedrock-client.ts && \
   ! grep -q "Mock\|mock" src/integrations/aws/bedrock-client.ts; then
  echo "   ✅ Bedrock usando API real"
else
  echo "   ❌ Bedrock ainda com problemas"
fi

# Verificar tipos any
echo ""
echo "5️⃣ Verificando tipos TypeScript..."
ANY_TYPES=$(grep -rn ": any" src/types/ | grep -v "test" | wc -l)
echo "   Tipos 'any' restantes: $ANY_TYPES"

# Verificar se handlers críticos têm logger
echo ""
echo "6️⃣ Verificando logging nos handlers críticos..."
HANDLERS_WITH_LOGGER=$(grep -l "import.*logger" backend/src/handlers/*/*.ts | wc -l)
TOTAL_HANDLERS=$(find backend/src/handlers -name "*.ts" | wc -l)
echo "   Handlers com logger: $HANDLERS_WITH_LOGGER/$TOTAL_HANDLERS"

# Resultado final
echo ""
echo "═══════════════════════════════════════════"
echo "📊 RESUMO DA VALIDAÇÃO:"
echo "   • Mocks críticos: $CRITICAL_MOCKS (meta: <5)"
echo "   • Console.log: $CRITICAL_CONSOLE (meta: <20)"
echo "   • Tipos any: $ANY_TYPES (meta: 0)"
echo "   • Handlers com logger: $HANDLERS_WITH_LOGGER/$TOTAL_HANDLERS"

if [ $CRITICAL_MOCKS -lt 5 ] && [ $CRITICAL_CONSOLE -lt 20 ] && [ $ANY_TYPES -eq 0 ]; then
  echo ""
  echo "🎖️  PADRÃO MILITAR ATINGIDO!"
  echo "✅ Código aprovado para produção"
else
  echo ""
  echo "⚠️  Melhorias ainda necessárias"
  echo "❌ Revisar itens acima da meta"
fi
echo "═══════════════════════════════════════════"