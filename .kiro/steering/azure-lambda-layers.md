---
inclusion: always
---

# Azure SDK Lambda Layers - Guia Completo

## 🚨 IMPORTANTE: Leia antes de trabalhar com Azure Lambdas

Este documento contém soluções para problemas comuns ao usar Azure SDK em AWS Lambda.

## Problema: "Azure SDK not installed" ou "Cannot find module '@typespec/ts-http-runtime'"

### Causa Raiz

O Azure SDK tem dependências peer que não são instaladas automaticamente:
- `@typespec/ts-http-runtime` - Runtime do TypeSpec usado pelo Azure SDK
- Outras dependências transitivas que precisam estar no layer

**Problema adicional:** Node.js 18 no AWS Lambda não resolve corretamente os "exports" condicionais do `package.json` do @typespec. O Azure SDK tenta importar de paths como `@typespec/ts-http-runtime/internal/logger`, mas o Node.js não consegue resolver esses paths para `dist/commonjs/logger/internal.js`.

### Sintomas

1. **Erro no CloudWatch Logs:**
```
Error: Cannot find module '@typespec/ts-http-runtime'
Error: Cannot find module '@typespec/ts-http-runtime/internal/logger'
```

2. **CORS Error 500 no Frontend:**
```
Origin https://evo.ai.udstec.io is not allowed by Access-Control-Allow-Origin. Status code: 500
```

3. **Lambda retorna 401/500 sem logs detalhados**

### Solução Completa

#### 1. Criar Layer com TODAS as dependências Azure

```bash
# 1. Instalar dependências no backend
cd backend
npm install

# 2. Gerar Prisma Client
npm run prisma:generate

# 3. Criar estrutura do layer
rm -rf /tmp/lambda-layer-azure
mkdir -p /tmp/lambda-layer-azure/nodejs/node_modules

# 4. Copiar Prisma e Zod
cp -r node_modules/@prisma /tmp/lambda-layer-azure/nodejs/node_modules/
cp -r node_modules/.prisma /tmp/lambda-layer-azure/nodejs/node_modules/
cp -r node_modules/zod /tmp/lambda-layer-azure/nodejs/node_modules/

# 5. Copiar TODOS os pacotes Azure
cp -r node_modules/@azure /tmp/lambda-layer-azure/nodejs/node_modules/

# 6. Copiar @typespec (CRÍTICO!)
cp -r node_modules/@typespec /tmp/lambda-layer-azure/nodejs/node_modules/

# 6.1. Criar arquivos de compatibilidade para exports internos do @typespec
# Node.js 18 no Lambda não resolve bem os "exports" condicionais do package.json
mkdir -p /tmp/lambda-layer-azure/nodejs/node_modules/@typespec/ts-http-runtime/internal

cat > /tmp/lambda-layer-azure/nodejs/node_modules/@typespec/ts-http-runtime/internal/logger.js << 'EOF'
// Re-export from dist/commonjs for Lambda compatibility
module.exports = require('../dist/commonjs/logger/internal.js');
EOF

cat > /tmp/lambda-layer-azure/nodejs/node_modules/@typespec/ts-http-runtime/internal/util.js << 'EOF'
// Re-export from dist/commonjs for Lambda compatibility
module.exports = require('../dist/commonjs/util/internal.js');
EOF

cat > /tmp/lambda-layer-azure/nodejs/node_modules/@typespec/ts-http-runtime/internal/policies.js << 'EOF'
// Re-export from dist/commonjs for Lambda compatibility
module.exports = require('../dist/commonjs/policies/internal.js');
EOF

# 7. Copiar dependências transitivas do Azure SDK
for pkg in tslib uuid ms http-proxy-agent https-proxy-agent agent-base debug events fast-xml-parser strnum; do
  [ -d "node_modules/$pkg" ] && cp -r "node_modules/$pkg" /tmp/lambda-layer-azure/nodejs/node_modules/
done

# 8. Limpar arquivos desnecessários (reduzir tamanho)
rm -f /tmp/lambda-layer-azure/nodejs/node_modules/.prisma/client/libquery_engine-darwin*.node
rm -rf /tmp/lambda-layer-azure/nodejs/node_modules/.prisma/client/deno
find /tmp/lambda-layer-azure/nodejs/node_modules -name "*.ts" -not -name "*.d.ts" -delete
find /tmp/lambda-layer-azure/nodejs/node_modules -name "*.map" -delete
find /tmp/lambda-layer-azure/nodejs/node_modules -name "*.md" -delete
find /tmp/lambda-layer-azure/nodejs/node_modules -type d -name "test" -exec rm -rf {} + 2>/dev/null
find /tmp/lambda-layer-azure/nodejs/node_modules -type d -name "tests" -exec rm -rf {} + 2>/dev/null
find /tmp/lambda-layer-azure/nodejs/node_modules -type d -name "samples" -exec rm -rf {} + 2>/dev/null

# 9. Criar ZIP
cd /tmp/lambda-layer-azure
zip -r /tmp/prisma-azure-layer.zip nodejs
cd -

# 10. Verificar tamanho (deve ser < 250MB descomprimido)
unzip -l /tmp/prisma-azure-layer.zip | tail -1

# 11. Upload para S3
aws s3 cp /tmp/prisma-azure-layer.zip \
  s3://evo-uds-v3-production-frontend-383234048592/layers/prisma-azure-layer.zip \
  --region us-east-1

# 12. Publicar layer
aws lambda publish-layer-version \
  --layer-name evo-prisma-deps-layer \
  --description "Prisma + Zod + Azure SDK + @typespec" \
  --content S3Bucket=evo-uds-v3-production-frontend-383234048592,S3Key=layers/prisma-azure-layer.zip \
  --compatible-runtimes nodejs18.x nodejs20.x \
  --region us-east-1
```

#### 2. Atualizar Lambda com Layer e NODE_PATH

```bash
# Obter ARN do layer (última versão)
LAYER_ARN=$(aws lambda list-layer-versions \
  --layer-name evo-prisma-deps-layer \
  --region us-east-1 \
  --query 'LayerVersions[0].LayerVersionArn' \
  --output text)

echo "Layer ARN: $LAYER_ARN"

# Atualizar Lambda com layer E NODE_PATH
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-validate-azure-credentials \
  --layers "$LAYER_ARN" \
  --environment "Variables={NODE_PATH=/opt/nodejs/node_modules,DATABASE_URL=\$DATABASE_URL}" \
  --region us-east-1

# Aguardar atualização completar
aws lambda wait function-updated \
  --function-name evo-uds-v3-production-validate-azure-credentials \
  --region us-east-1
```

#### 3. Atualizar TODAS as Lambdas Azure

```bash
LAYER_ARN=$(aws lambda list-layer-versions \
  --layer-name evo-prisma-deps-layer \
  --region us-east-1 \
  --query 'LayerVersions[0].LayerVersionArn' \
  --output text)

# Lista de todas as Lambdas Azure
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
    --environment "Variables={NODE_PATH=/opt/nodejs/node_modules,DATABASE_URL=\$DATABASE_URL}" \
    --region us-east-1
  
  # Aguardar antes da próxima atualização
  sleep 2
done

echo "✅ All Azure Lambdas updated!"
```

## Checklist de Verificação

Após atualizar o layer, verifique:

- [ ] Layer contém `@typespec/ts-http-runtime`
```bash
aws lambda get-layer-version \
  --layer-name evo-prisma-deps-layer \
  --version-number VERSAO \
  --region us-east-1 \
  --query 'Content.Location' \
  --output text | xargs curl -s | unzip -l | grep "@typespec"
```

- [ ] Lambda tem NODE_PATH configurado
```bash
aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-validate-azure-credentials \
  --region us-east-1 \
  --query 'Environment.Variables.NODE_PATH'
```

- [ ] Lambda está usando a versão correta do layer
```bash
aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-validate-azure-credentials \
  --region us-east-1 \
  --query 'Layers[0].Arn'
```

- [ ] Handler está correto (não test-azure-import)
```bash
aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-validate-azure-credentials \
  --region us-east-1 \
  --query 'Handler'
```

## Troubleshooting

### Erro persiste após atualizar layer

1. **Verificar se o layer foi realmente atualizado:**
```bash
aws lambda get-function-configuration \
  --function-name FUNCTION_NAME \
  --region us-east-1 \
  --query 'Layers[0].Arn'
```

2. **Verificar logs do CloudWatch:**
```bash
aws logs tail /aws/lambda/evo-uds-v3-production-validate-azure-credentials \
  --follow \
  --region us-east-1
```

3. **Testar importação diretamente:**
Criar handler de teste:
```javascript
exports.handler = async () => {
  try {
    const { ClientSecretCredential } = require('@azure/identity');
    const { ResourceManagementClient } = require('@azure/arm-resources');
    return { statusCode: 200, body: 'Azure SDK loaded successfully' };
  } catch (error) {
    return { statusCode: 500, body: error.message };
  }
};
```

### CORS Error 500

Se o erro é CORS com status 500, significa que a Lambda está falhando ANTES de retornar resposta.

**Diagnóstico:**
1. Verificar CloudWatch Logs para erro real
2. Verificar se handler está correto
3. Verificar se layer tem todas as dependências

**Solução:**
- Sempre usar `error()` function de `response.js` que inclui CORS headers
- Garantir que try/catch capture TODOS os erros
- Verificar que imports dinâmicos têm tratamento de erro

### Layer muito grande (> 250MB descomprimido)

**Sintomas:**
```
Error: Unzipped size must be smaller than 262144000 bytes
```

**Solução:**
1. Remover arquivos desnecessários (já incluído no script acima)
2. Considerar split em múltiplos layers se necessário
3. Verificar se não há duplicatas de pacotes

## Dependências Críticas do Azure SDK

Sempre incluir no layer:

### Pacotes Azure
- `@azure/identity` - Autenticação
- `@azure/arm-resources` - Resource Management
- `@azure/arm-compute` - VMs
- `@azure/arm-storage` - Storage Accounts
- `@azure/arm-network` - Networking
- `@azure/arm-sql` - SQL Servers
- `@azure/arm-costmanagement` - Cost Management
- `@azure/arm-monitor` - Monitoring

### Dependências Peer (CRÍTICO!)
- `@typespec/ts-http-runtime` - **OBRIGATÓRIO** para Azure SDK funcionar
  - **IMPORTANTE:** Criar arquivos de compatibilidade em `internal/` para resolver exports
  - Arquivos necessários: `internal/logger.js`, `internal/util.js`, `internal/policies.js`
- `tslib` - TypeScript runtime
- `uuid` - UUID generation
- `http-proxy-agent` - HTTP proxy support
- `https-proxy-agent` - HTTPS proxy support
- `agent-base` - Base agent class
- `debug` - Debug logging
- `events` - Event emitter
- `fast-xml-parser` - XML parsing
- `strnum` - String/number utilities

### Por que os arquivos de compatibilidade são necessários?

O `package.json` do @typespec define exports condicionais:
```json
{
  "exports": {
    "./internal/logger": {
      "require": "./dist/commonjs/logger/internal.js"
    }
  }
}
```

Node.js 18 no AWS Lambda não resolve esses exports corretamente. A solução é criar arquivos simples que fazem re-export:

```javascript
// @typespec/ts-http-runtime/internal/logger.js
module.exports = require('../dist/commonjs/logger/internal.js');
```

Isso permite que o Azure SDK importe de `@typespec/ts-http-runtime/internal/logger` sem problemas.

## Azure OAuth Integration

### Visão Geral

A integração Azure OAuth permite conexão 1-click com Azure usando OAuth 2.0 + PKCE.

### Lambdas OAuth

| Lambda | Endpoint | Descrição |
|--------|----------|-----------|
| `azure-oauth-initiate` | `POST /api/functions/azure-oauth-initiate` | Inicia fluxo OAuth, gera state/PKCE |
| `azure-oauth-callback` | `POST /api/functions/azure-oauth-callback` | Processa callback, troca code por tokens |
| `azure-oauth-refresh` | `POST /api/functions/azure-oauth-refresh` | Renova access token usando refresh token |
| `azure-oauth-revoke` | `POST /api/functions/azure-oauth-revoke` | Revoga credenciais OAuth |

### Variáveis de Ambiente Necessárias

```bash
AZURE_OAUTH_CLIENT_ID=cb8027cd-877e-458a-8f46-b090312f79aa
AZURE_OAUTH_CLIENT_SECRET=<secret do Azure App Registration>
AZURE_OAUTH_REDIRECT_URI=https://evo.ai.udstec.io/azure/callback
TOKEN_ENCRYPTION_KEY=<chave AES-256 para criptografar refresh tokens>
DATABASE_URL=<connection string PostgreSQL>
NODE_PATH=/opt/nodejs/node_modules
```

### Fluxo OAuth

```
1. Frontend chama POST /azure-oauth-initiate
   ↓
2. Backend gera state + PKCE, salva em oauth_states, retorna authUrl + codeVerifier
   ↓
3. Frontend salva codeVerifier em sessionStorage, redireciona para Azure
   ↓
4. Usuário autoriza no Azure AD
   ↓
5. Azure redireciona para /azure/callback?code=...&state=...
   ↓
6. Frontend chama POST /azure-oauth-callback com code, state, codeVerifier
   ↓
7. Backend valida state, troca code por tokens, lista subscriptions
   ↓
8. Frontend mostra subscriptions para seleção
   ↓
9. Frontend chama POST /save-azure-credentials com subscriptions selecionadas
   ↓
10. Backend salva credenciais com auth_type='oauth'
```

### Modelos Prisma

```prisma
model AzureCredential {
  // ... campos existentes ...
  auth_type               String   @default("service_principal") // 'service_principal' ou 'oauth'
  encrypted_refresh_token String?  // Refresh token criptografado (AES-256-GCM)
  token_expires_at        DateTime? // Expiração do access token
  oauth_tenant_id         String?  // Tenant ID do OAuth
  oauth_user_email        String?  // Email do usuário que autorizou
  last_refresh_at         DateTime? // Último refresh bem-sucedido
  refresh_error           String?  // Erro se refresh falhou
}

model OAuthState {
  id              String   @id @default(uuid())
  organization_id String
  user_id         String
  state           String   @unique // Parâmetro state para CSRF
  code_verifier   String   // PKCE code verifier
  created_at      DateTime @default(now())
  expires_at      DateTime // 10 minutos após criação
  used            Boolean  @default(false)
}
```

### Azure App Registration

O App Registration já está configurado:
- **Client ID**: `cb8027cd-877e-458a-8f46-b090312f79aa`
- **Redirect URIs**: 
  - `https://evo.ai.udstec.io/azure/callback` (produção)
  - `http://localhost:5173/azure/callback` (desenvolvimento)
- **API Permissions**: `Azure Service Management → user_impersonation`
- **Supported Account Types**: Multi-tenant (qualquer Azure AD)

### Segurança

1. **PKCE**: Protege contra interceptação do authorization code
2. **State**: Protege contra CSRF
3. **Token Encryption**: Refresh tokens são criptografados com AES-256-GCM
4. **Rate Limiting**: 5 req/min initiate, 10 req/min callback, 20 req/min refresh
5. **State Expiration**: States expiram em 10 minutos
6. **Single Use**: States são marcados como usados após callback

---

## Histórico de Versões do Layer

| Versão | Data | Descrição | Status |
|--------|------|-----------|--------|
| 47 | 2026-01-13 | Prisma + Zod + Azure SDK + @typespec + OAuthState model | ✅ Atual |
| 46 | 2026-01-12 | Prisma + Zod + Azure SDK + @typespec + debug + ms + tslib + events | ⚠️ Sem OAuthState |
| 45 | 2026-01-12 | Prisma + Zod + Azure SDK + @typespec + proxy-agent deps | ❌ Incompleto |
| 44 | 2026-01-12 | Prisma + Zod + Azure SDK + @typespec + jsonwebtoken deps | ❌ Incompleto |
| 43 | 2026-01-12 | Prisma + Zod + Azure SDK + @typespec + internal exports fix | ❌ Incompleto |
| 42 | 2026-01-12 | Prisma + Zod + Azure SDK + @typespec (sem internal exports) | ❌ Incompleto |
| 41 | 2026-01-12 | Prisma + Zod + Azure SDK (sem @typespec) | ❌ Incompleto |
| 40 | 2026-01-12 | Prisma + Zod + Azure SDK inicial | ❌ Incompleto |
| 39 | 2026-01-12 | Prisma com AzureCredential model | ⚠️ Sem Azure SDK |
| 2 | 2025-xx-xx | Prisma + Zod básico | ⚠️ Sem Azure SDK |

## Referências

- [AWS Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html)
- [Azure SDK for JavaScript](https://github.com/Azure/azure-sdk-for-js)
- [TypeSpec](https://typespec.io/)
- [Node.js Module Resolution](https://nodejs.org/api/modules.html#modules_loading_from_node_modules_folders)

---

## Problema: "crypto is not defined"

### Causa

Em Node.js 18+, o módulo `crypto` precisa ser importado explicitamente. Alguns pacotes (como Azure SDK) esperam que `crypto` esteja disponível globalmente.

### Solução

Adicionar no início do handler Azure (ANTES de qualquer outro import):

```typescript
// Ensure crypto is available globally for Azure SDK
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}
```

### ⚠️ IMPORTANTE: Handlers que DEVEM ter o crypto polyfill

Todos os handlers Azure que usam `AzureProvider` ou `azure-helpers.js` DEVEM ter o crypto polyfill:

| Handler | Status |
|---------|--------|
| `validate-azure-credentials.ts` | ✅ Tem polyfill |
| `save-azure-credentials.ts` | ✅ Tem polyfill |
| `azure-activity-logs.ts` | ✅ Tem polyfill |
| `azure-compliance-scan.ts` | ✅ Tem polyfill |
| `azure-cost-optimization.ts` | ✅ Tem polyfill |
| `azure-defender-scan.ts` | ✅ Tem polyfill |
| `azure-detect-anomalies.ts` | ✅ Tem polyfill |
| `azure-fetch-costs.ts` | ✅ Tem polyfill |
| `azure-fetch-monitor-metrics.ts` | ✅ Tem polyfill |
| `azure-reservations-analyzer.ts` | ✅ Tem polyfill |
| `azure-resource-inventory.ts` | ✅ Tem polyfill |
| `azure-security-scan.ts` | ✅ Tem polyfill |
| `azure-well-architected-scan.ts` | ✅ Tem polyfill |
| `start-azure-security-scan.ts` | ✅ Tem polyfill |

### Exemplo Completo de Handler Azure

```typescript
/**
 * Azure Handler Template
 */

// IMPORTANTE: Crypto polyfill DEVE ser o primeiro import
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { logger } from '../../lib/logging.js';
import { AzureProvider } from '../../lib/cloud-provider/azure-provider.js';

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // ... handler code
}
```

### Histórico de Incidentes

#### 2026-01-29 - save-azure-credentials com erro "crypto is not defined"

**Problema:** Após validar credenciais Azure com sucesso, ao clicar em salvar, erro "crypto is not defined"

**Causa:** O handler `save-azure-credentials.ts` não tinha o crypto polyfill, mas usava `AzureProvider` para validar antes de salvar.

**Solução:** Adicionado crypto polyfill a todos os 14 handlers Azure que usam Azure SDK.

**Lição aprendida:** Ao criar novos handlers Azure, SEMPRE adicionar o crypto polyfill no início do arquivo.

---

**Última atualização:** 2026-01-29  
**Versão:** 1.2  
**Mantido por:** DevOps Team
