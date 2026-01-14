# Azure SDK Lambda Fix - Solução Completa

## 🎯 Problema Resolvido

**Erro:** "Cannot find module '@typespec/ts-http-runtime'" ao validar credenciais Azure  
**Sintoma:** CORS Error 500 no frontend ao chamar `/api/functions/validate-azure-credentials`  
**Causa:** Lambda layer não incluía dependência peer `@typespec/ts-http-runtime` do Azure SDK

## ✅ Solução Implementada

### 1. Layer Versão 43 Publicado

**ARN:** `arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:43`

**Conteúdo:**
- ✅ `@prisma/client` + `.prisma/client` (gerado)
- ✅ `zod` (validação)
- ✅ `@azure/*` (todos os pacotes Azure SDK)
- ✅ `@typespec/ts-http-runtime` (CRÍTICO - dependência peer)
- ✅ **Arquivos de compatibilidade `internal/*.js`** (NOVO - resolve exports do @typespec)
- ✅ Dependências transitivas: `tslib`, `uuid`, `ms`, `http-proxy-agent`, `https-proxy-agent`, `agent-base`, `debug`, `events`, `fast-xml-parser`, `strnum`

**Tamanho:** ~45MB comprimido, ~172MB descomprimido (dentro do limite de 250MB)

**Fix aplicado:** Criados arquivos `internal/logger.js`, `internal/util.js`, `internal/policies.js` que fazem re-export dos módulos corretos do `dist/commonjs/`, resolvendo problema de resolução de exports condicionais no Node.js 18 Lambda.

### 2. Lambda validate-azure-credentials Atualizada

**Configuração:**
- ✅ Handler: `validate-azure-credentials.handler` (restaurado do test handler)
- ✅ Layer: versão 43 (com @typespec + internal exports fix)
- ✅ NODE_PATH: `/opt/nodejs/node_modules` (para resolver módulos do layer)
- ✅ Código: handler correto com imports ajustados

**Status:** Pronta para teste

### 3. Documentação Atualizada

**Arquivos atualizados:**
- ✅ `.kiro/steering/azure-lambda-layers.md` - Guia completo criado
- ✅ `.kiro/steering/aws-infrastructure.md` - Layer versão 42 documentada

## 📋 Próximos Passos

### 1. Testar Lambda validate-azure-credentials

Teste no frontend em https://evo.ai.udstec.io/cloud-credentials:
1. Clicar em "Add Azure Account"
2. Preencher credenciais Azure válidas
3. Clicar em "Validate"
4. Verificar se validação funciona sem erro CORS

### 2. Atualizar Todas as Lambdas Azure

Execute o script para atualizar todas as 15 Lambdas Azure com o layer 42:

```bash
DB_URL='postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public'

LAYER_ARN="arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:43"

AZURE_LAMBDAS=(
  "validate-azure-credentials"
  "save-azure-credentials"
  "list-azure-credentials"
  "delete-azure-credentials"
  "azure-security-scan"
  "start-azure-security-scan"
  "azure-defender-scan"
  "azure-compliance-scan"
  "azure-well-architected-scan"
  "azure-cost-optimization"
  "azure-reservations-analyzer"
  "azure-fetch-costs"
  "azure-resource-inventory"
  "azure-activity-logs"
  "list-cloud-credentials"
)

for func in "${AZURE_LAMBDAS[@]}"; do
  echo "Updating evo-uds-v3-production-$func..."
  
  aws lambda update-function-configuration \
    --function-name "evo-uds-v3-production-$func" \
    --layers "$LAYER_ARN" \
    --environment "Variables={NODE_PATH=/opt/nodejs/node_modules,DATABASE_URL=$DB_URL}" \
    --region us-east-1
  
  sleep 2
done

echo "✅ All Azure Lambdas updated!"
```

### 3. Verificar Logs

Após teste, verificar logs do CloudWatch:

```bash
aws logs tail /aws/lambda/evo-uds-v3-production-validate-azure-credentials \
  --follow \
  --region us-east-1
```

## 🔍 Checklist de Verificação

- [x] Layer 43 publicado com @typespec + internal exports fix
- [x] Lambda validate-azure-credentials atualizada
- [x] Handler correto restaurado
- [x] NODE_PATH configurado
- [x] Documentação atualizada
- [ ] Teste funcional no frontend
- [ ] Todas as 15 Lambdas Azure atualizadas
- [ ] Logs verificados sem erros

## 📚 Referências

- **Guia Completo:** `.kiro/steering/azure-lambda-layers.md`
- **Infraestrutura:** `.kiro/steering/aws-infrastructure.md`
- **Layer ARN:** `arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:43`

## 🎓 Lições Aprendidas

### Problema Identificado

O Azure SDK para JavaScript usa `@typespec/ts-http-runtime` como dependência peer, mas:
1. O npm não instala dependências peer automaticamente
2. Node.js 18 no AWS Lambda não resolve corretamente os "exports" condicionais do `package.json`
3. O Azure SDK tenta importar de `@typespec/ts-http-runtime/internal/logger`, mas o Node.js não consegue resolver para `dist/commonjs/logger/internal.js`

### Solução

1. **Identificar dependências peer:** Verificar `peerDependencies` no `package.json` dos pacotes Azure
2. **Incluir no layer:** Copiar explicitamente `@typespec` para o layer
3. **Criar arquivos de compatibilidade:** Adicionar `internal/*.js` que fazem re-export dos módulos corretos
4. **Configurar NODE_PATH:** Garantir que Lambda encontre módulos em `/opt/nodejs/node_modules`
5. **Documentar:** Criar guia completo para evitar problemas futuros

### Prevenção Futura

- ✅ Guia `.kiro/steering/azure-lambda-layers.md` criado
- ✅ Checklist de verificação documentado
- ✅ Script de atualização em massa disponível
- ✅ Histórico de versões do layer mantido

## 🚀 Status Final

**Layer 43:** ✅ Publicado e pronto  
**Lambda validate-azure-credentials:** ✅ Atualizada e pronta para teste  
**Documentação:** ✅ Completa e atualizada  
**Próximo passo:** Teste funcional no frontend

---

**Data:** 2026-01-12  
**Versão do Layer:** 43  
**Status:** Pronto para teste
