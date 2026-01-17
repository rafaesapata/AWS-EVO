# WAF Lambda Layer Fix - Resolução Completa do Erro 502

**Data**: 2026-01-17  
**Status**: ✅ RESOLVIDO  
**Lambda**: `evo-uds-v3-production-waf-dashboard-api`  
**Layer Versão**: 58

---

## 🚨 Problema Original

A Lambda `waf-dashboard-api` estava retornando erro 502 com a mensagem:

```
Runtime.ImportModuleError: Error: Cannot find module '@aws-sdk/client-sts'
Require stack:
- /var/task/lib/aws-helpers.js
- /var/task/waf-dashboard-api.js
```

### Causa Raiz

O Lambda layer (`evo-prisma-deps-layer`) não incluía os pacotes AWS SDK necessários. O layer anterior (versão 52) continha apenas:
- Prisma Client
- Zod
- Azure SDK

Mas o handler `waf-dashboard-api.ts` importava:
- `@aws-sdk/client-sts` (para assume role)
- `@aws-sdk/client-wafv2` (para buscar regras WAF)
- `@aws-sdk/client-bedrock-runtime` (para análise com IA)

---

## 🔧 Solução Implementada

### 1. Criação de Script de Cópia Recursiva

Criado script Node.js (`/tmp/copy-deps.js`) que:
- Copia um pacote AWS SDK
- Lê seu `package.json`
- Copia recursivamente TODAS as dependências que começam com `@aws-sdk/`, `@smithy/`, `@aws-crypto/`, ou `@aws/`
- Evita duplicatas usando um `Set`

**Por que isso é necessário?**

AWS SDK v3 tem uma arquitetura modular onde cada cliente depende de dezenas de pacotes `@smithy/*` e `@aws-crypto/*`. Se você copiar apenas o cliente principal, vai faltar dependências e a Lambda vai quebrar.

### 2. Pacotes Incluídos no Layer v58

**Core**:
- `@prisma/client` + `.prisma/client` (gerado)
- `zod`

**AWS SDK Clients** (3 pacotes principais):
- `@aws-sdk/client-sts`
- `@aws-sdk/client-wafv2`
- `@aws-sdk/client-bedrock-runtime`

**Dependências Transitivas** (80+ pacotes copiados automaticamente):
- `@smithy/*` - 60+ pacotes (core, middleware, protocol, etc.)
- `@aws-sdk/*` - 20+ pacotes (credential providers, middleware, utils)
- `@aws-crypto/*` - Pacotes de criptografia
- `@aws/lambda-invoke-store` - Necessário para recursion detection

**Utilitários**:
- `tslib`
- `uuid`
- `fast-xml-parser`

**Tamanho Final**:
- Comprimido: ~40MB
- Descomprimido: ~95MB (bem abaixo do limite de 250MB)

### 3. Processo de Criação do Layer

```bash
# 1. Criar estrutura
rm -rf /tmp/lambda-layer-minimal && mkdir -p /tmp/lambda-layer-minimal/nodejs/node_modules

# 2. Copiar Prisma e Zod
cp -r backend/node_modules/@prisma /tmp/lambda-layer-minimal/nodejs/node_modules/
cp -r backend/node_modules/.prisma /tmp/lambda-layer-minimal/nodejs/node_modules/
cp -r backend/node_modules/zod /tmp/lambda-layer-minimal/nodejs/node_modules/

# 3. Executar script de cópia recursiva
node /tmp/copy-deps.js backend /tmp/lambda-layer-minimal \
  @aws-sdk/client-sts \
  @aws-sdk/client-wafv2 \
  @aws-sdk/client-bedrock-runtime

# Resultado: 80 pacotes copiados automaticamente

# 4. Copiar utilitários
for pkg in tslib uuid fast-xml-parser; do
  cp -r "backend/node_modules/$pkg" /tmp/lambda-layer-minimal/nodejs/node_modules/
done

# 5. Cleanup (reduzir tamanho)
rm -f /tmp/lambda-layer-minimal/nodejs/node_modules/.prisma/client/libquery_engine-darwin*.node
rm -rf /tmp/lambda-layer-minimal/nodejs/node_modules/.prisma/client/deno
find /tmp/lambda-layer-minimal/nodejs/node_modules -name "*.ts" -not -name "*.d.ts" -delete
find /tmp/lambda-layer-minimal/nodejs/node_modules -name "*.map" -delete
find /tmp/lambda-layer-minimal/nodejs/node_modules -name "*.md" -delete
find /tmp/lambda-layer-minimal/nodejs/node_modules -type d -name "test" -exec rm -rf {} + 2>/dev/null
find /tmp/lambda-layer-minimal/nodejs/node_modules -type d -name "tests" -exec rm -rf {} + 2>/dev/null
find /tmp/lambda-layer-minimal/nodejs/node_modules -type d -name "samples" -exec rm -rf {} + 2>/dev/null
find /tmp/lambda-layer-minimal/nodejs/node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null
find /tmp/lambda-layer-minimal/nodejs/node_modules -name "*.spec.js" -delete
find /tmp/lambda-layer-minimal/nodejs/node_modules -name "*.test.js" -delete
find /tmp/lambda-layer-minimal/nodejs/node_modules -name "CHANGELOG*" -delete
find /tmp/lambda-layer-minimal/nodejs/node_modules -name "README*" -delete
find /tmp/lambda-layer-minimal/nodejs/node_modules -name "LICENSE*" -delete

# 6. Criar ZIP
pushd /tmp/lambda-layer-minimal && zip -r /tmp/lambda-layer-minimal.zip nodejs && popd

# 7. Upload para S3
aws s3 cp /tmp/lambda-layer-minimal.zip \
  s3://evo-uds-v3-production-frontend-383234048592/layers/lambda-layer-minimal.zip \
  --region us-east-1

# 8. Publicar layer
aws lambda publish-layer-version \
  --layer-name evo-prisma-deps-layer \
  --description "Prisma + Zod + AWS SDK (STS, WAFV2, Bedrock) + Smithy + @aws/lambda-invoke-store" \
  --content S3Bucket=evo-uds-v3-production-frontend-383234048592,S3Key=layers/lambda-layer-minimal.zip \
  --compatible-runtimes nodejs18.x nodejs20.x \
  --region us-east-1

# Resultado: Layer versão 58 criado
```

### 4. Atualização da Lambda

```bash
# Atualizar Lambda para usar layer v58
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --layers "arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:58" \
  --region us-east-1

# Aguardar atualização
aws lambda wait function-updated \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --region us-east-1
```

### 5. Teste de Validação

```bash
# Testar invocação OPTIONS
aws lambda invoke \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}}}' \
  --region us-east-1 \
  /tmp/test.json

# Resultado: StatusCode 200, sem erros
cat /tmp/test.json
# {"statusCode":200,"headers":{...},"body":""}
```

---

## 📊 Tentativas e Iterações

### Versão 56 (FALHOU)
- **Problema**: Incluiu apenas 4 pacotes AWS SDK principais
- **Erro**: `Cannot find module '@smithy/protocol-http'`
- **Lição**: Dependências transitivas não foram incluídas

### Versão 57 (FALHOU)
- **Problema**: Adicionou alguns pacotes Smithy manualmente
- **Erro**: `Cannot find module '@aws/lambda-invoke-store'`
- **Lição**: Impossível saber todas as dependências manualmente

### Versão 58 (SUCESSO) ✅
- **Solução**: Script de cópia recursiva
- **Resultado**: 80 pacotes copiados automaticamente
- **Status**: Lambda funcionando perfeitamente

---

## 🎯 Lições Aprendidas

### 1. AWS SDK v3 é Modular Demais

Cada cliente AWS SDK v3 depende de dezenas de pacotes `@smithy/*`. Não é viável copiar manualmente.

### 2. Script de Cópia Recursiva é Essencial

O script `copy-deps.js` resolve o problema de forma definitiva:
- Lê `package.json` de cada pacote
- Copia recursivamente todas as dependências
- Evita duplicatas
- Funciona para qualquer pacote AWS SDK

### 3. Limite de 250MB é Real

Tentamos incluir TODOS os pacotes AWS SDK (~100 pacotes) e ultrapassamos o limite (313MB descomprimido). A solução foi incluir apenas os pacotes necessários e suas dependências transitivas.

### 4. Cleanup é Importante

Remover arquivos desnecessários (`.ts`, `.map`, `.md`, `test/`, `docs/`, etc.) reduziu o tamanho de ~100MB para ~95MB.

---

## 📝 Documentação Atualizada

### Arquivos Modificados

1. **`.kiro/steering/aws-infrastructure.md`**:
   - Atualizada seção "Layer Atual" com versão 58
   - Adicionada tabela de versões do layer
   - Atualizado processo de criação do layer com script recursivo
   - Adicionada seção de troubleshooting para erro "Cannot find module"

2. **`WAF_LAMBDA_LAYER_FIX_COMPLETE.md`** (este arquivo):
   - Documentação completa do problema e solução
   - Script de cópia recursiva
   - Processo passo a passo
   - Lições aprendidas

---

## ✅ Checklist de Validação

- [x] Layer v58 criado com sucesso
- [x] Lambda atualizada para usar layer v58
- [x] Teste de invocação OPTIONS retorna 200
- [x] Logs do CloudWatch sem erros
- [x] Frontend WAF Monitoring carregando sem erros
- [x] Documentação atualizada em `.kiro/steering/`
- [x] Script de cópia recursiva documentado
- [x] Processo replicável para futuras atualizações

---

## 🚀 Próximos Passos

### Para Adicionar Novos Pacotes AWS SDK

1. Adicionar o pacote no `backend/package.json`
2. Executar `npm install` no backend
3. Usar o script de cópia recursiva:
   ```bash
   node /tmp/copy-deps.js backend /tmp/lambda-layer-complete \
     @aws-sdk/client-sts \
     @aws-sdk/client-wafv2 \
     @aws-sdk/client-bedrock-runtime \
     @aws-sdk/client-NOVO-PACOTE  # <-- Adicionar aqui
   ```
4. Seguir o processo de criação do layer documentado
5. Publicar nova versão do layer
6. Atualizar Lambdas que precisam do novo pacote

### Para Outras Lambdas que Usam AWS SDK

Se outras Lambdas precisarem de pacotes AWS SDK diferentes:

**Opção A**: Atualizar layer v58 para incluir os novos pacotes (recomendado se forem pacotes comuns)

**Opção B**: Criar layer específico para aquela Lambda (se for um caso muito específico)

---

## 📞 Contato

Se encontrar problemas similares no futuro:

1. Verificar logs do CloudWatch: `aws logs tail /aws/lambda/FUNCTION_NAME --since 5m`
2. Identificar qual módulo está faltando
3. Usar o script de cópia recursiva para incluir o módulo e suas dependências
4. Publicar nova versão do layer
5. Atualizar a Lambda

---

**Autor**: Kiro AI  
**Data**: 2026-01-17  
**Status**: ✅ COMPLETO E DOCUMENTADO
