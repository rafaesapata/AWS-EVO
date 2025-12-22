#!/bin/bash

echo "🔍 EVO UDS - Verificação de Limpeza Supabase/Lovable"
echo "=================================================="
echo ""

ERRORS=0

# Check for supabase directory
echo -n "Verificando diretório supabase/... "
if [ -d "supabase" ]; then
    echo "❌ AINDA EXISTE"
    ((ERRORS++))
else
    echo "✅ REMOVIDO"
fi

# Check for migration scripts
echo -n "Verificando scripts de migração... "
MIGRATION_FILES=$(ls -1 *supabase*.js 2>/dev/null | wc -l)
if [ "$MIGRATION_FILES" -gt 0 ]; then
    echo "❌ $MIGRATION_FILES ARQUIVOS ENCONTRADOS"
    ((ERRORS++))
else
    echo "✅ REMOVIDOS"
fi

# Check for supabase references in code
echo -n "Verificando referências 'supabase' em código... "
SUPABASE_REFS=$(grep -rn "supabase" --include="*.ts" --include="*.tsx" --include="*.js" --exclude-dir=node_modules --exclude-dir=backups --exclude="*.md" . 2>/dev/null | grep -v "verify-cleanup" | wc -l)
if [ "$SUPABASE_REFS" -gt 0 ]; then
    echo "❌ $SUPABASE_REFS REFERÊNCIAS"
    ((ERRORS++))
else
    echo "✅ ZERO"
fi

# Check for lovable references
echo -n "Verificando referências 'lovable' em código... "
LOVABLE_REFS=$(grep -rn "lovable\|Lovable\|LOVABLE" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.html" --exclude-dir=node_modules --exclude-dir=backups --exclude="*.md" . 2>/dev/null | grep -v "verify-cleanup" | wc -l)
if [ "$LOVABLE_REFS" -gt 0 ]; then
    echo "❌ $LOVABLE_REFS REFERÊNCIAS"
    ((ERRORS++))
else
    echo "✅ ZERO"
fi

# Check for supabase dependencies
echo -n "Verificando dependência @supabase em package.json... "
SUPABASE_DEP=$(grep -r "@supabase" package.json */package.json 2>/dev/null | wc -l)
if [ "$SUPABASE_DEP" -gt 0 ]; then
    echo "❌ ENCONTRADA"
    ((ERRORS++))
else
    echo "✅ REMOVIDA"
fi

# Check for global-aws.ts
echo -n "Verificando src/lib/global-aws.ts... "
if [ -f "src/lib/global-aws.ts" ]; then
    echo "❌ AINDA EXISTE"
    ((ERRORS++))
else
    echo "✅ REMOVIDO"
fi

# Check environment variables in code
echo -n "Verificando variáveis SUPABASE_* em código... "
SUPABASE_ENV=$(grep -rn "SUPABASE_URL\|SUPABASE_ANON_KEY\|SUPABASE_SERVICE_ROLE_KEY" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=backups --exclude="*.md" --exclude="*.env*" . 2>/dev/null | wc -l)
if [ "$SUPABASE_ENV" -gt 0 ]; then
    echo "❌ $SUPABASE_ENV REFERÊNCIAS"
    ((ERRORS++))
else
    echo "✅ ZERO"
fi

# Check for LOVABLE_API_KEY
echo -n "Verificando LOVABLE_API_KEY em código... "
LOVABLE_ENV=$(grep -rn "LOVABLE_API_KEY\|LOVABLE_AI_KEY" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=backups --exclude="*.md" . 2>/dev/null | wc -l)
if [ "$LOVABLE_ENV" -gt 0 ]; then
    echo "❌ $LOVABLE_ENV REFERÊNCIAS"
    ((ERRORS++))
else
    echo "✅ ZERO"
fi

# Check for ai.gateway.lovable.dev
echo -n "Verificando ai.gateway.lovable.dev... "
LOVABLE_GATEWAY=$(grep -rn "ai.gateway.lovable.dev" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=backups . 2>/dev/null | wc -l)
if [ "$LOVABLE_GATEWAY" -gt 0 ]; then
    echo "❌ $LOVABLE_GATEWAY REFERÊNCIAS"
    ((ERRORS++))
else
    echo "✅ ZERO"
fi

echo ""
echo "=================================================="
if [ "$ERRORS" -gt 0 ]; then
    echo "❌ VERIFICAÇÃO FALHOU: $ERRORS problemas encontrados"
    exit 1
else
    echo "✅ VERIFICAÇÃO PASSOU: Limpeza completa!"
    exit 0
fi