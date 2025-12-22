#!/bin/bash
# Script de validação - execute após todas as correções

echo "🔍 Verificando correções..."

# 1. Verificar mocks removidos
echo ""
echo "1️⃣ Verificando mocks no código de produção:"
MOCKS=$(grep -rn "mock\|Mock\|MOCK" --include="*.ts" --include="*.tsx" \
  | grep -v "test\|Test\|spec\|__tests__" \
  | grep -v "node_modules" \
  | wc -l)
echo "   Encontrados: $MOCKS ocorrências"

# 2. Verificar tipos any
echo ""
echo "2️⃣ Verificando tipos 'any':"
ANYS=$(grep -rn ": any" src/types/database.ts | wc -l)
echo "   Encontrados em database.ts: $ANYS"

# 3. Verificar console.log no backend
echo ""
echo "3️⃣ Verificando console.* no backend:"
CONSOLES=$(grep -rn "console\." backend/src/handlers --include="*.ts" | wc -l)
echo "   Encontrados: $CONSOLES"

# 4. Verificar se bedrock frontend usa API
echo ""
echo "4️⃣ Verificando bedrock frontend:"
if grep -q "fetch.*API_BASE_URL" src/integrations/aws/bedrock-client.ts; then
  echo "   ✅ Usa chamadas de API"
else
  echo "   ❌ Ainda mockado!"
fi

# Resultado final
echo ""
echo "═══════════════════════════════════"
if [ $MOCKS -lt 10 ] && [ $ANYS -eq 0 ] && [ $CONSOLES -lt 50 ]; then
  echo "✅ CÓDIGO APROVADO PARA PRODUÇÃO"
else
  echo "❌ CORREÇÕES AINDA NECESSÁRIAS"
fi
echo "═══════════════════════════════════"