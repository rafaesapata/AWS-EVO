---
inclusion: always
---

# 🚨 ARQUITETURA DO PROJETO - LEIA ANTES DE QUALQUER ALTERAÇÃO

## Stack Tecnológica OBRIGATÓRIA

### Backend
- **Runtime**: Node.js 18.x (AWS Lambda)
- **Linguagem**: TypeScript (CommonJS)
- **ORM**: Prisma
- **Banco de Dados**: PostgreSQL (AWS RDS)
- **Localização**: `backend/`

### Frontend
- **Framework**: React 18 + Vite
- **Linguagem**: TypeScript
- **UI**: shadcn/ui + Tailwind CSS
- **Localização**: `src/`

### Infraestrutura
- **IaC**: AWS CDK (TypeScript)
- **Localização**: `infra/`

## ⛔ PROIBIÇÕES ABSOLUTAS

1. **NÃO criar Lambdas em Python** - Todo backend DEVE ser Node.js/TypeScript
2. **NÃO usar DynamoDB** - O banco de dados é PostgreSQL via Prisma
3. **NÃO criar arquivos .py** no projeto
4. **NÃO mudar a arquitetura** sem aprovação explícita do usuário
5. **JAMAIS usar mocks em testes** - Testes DEVEM usar dados e serviços reais, nunca mocks ou stubs

## ✅ Padrões Obrigatórios

### Criar novo Lambda Handler:
```typescript
// backend/src/handlers/{categoria}/{nome}.ts
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  const prisma = getPrismaClient();
  
  // Implementação...
}
```

### Adicionar Lambda ao CDK:
```typescript
// infra/lib/api-stack.ts
const novaFunction = new lambda.Function(this, 'NovaFunction', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'nome-handler.handler',
  code: lambda.Code.fromAsset('backend/dist/handlers/{categoria}'),
  environment: lambdaEnvironment,
  role: lambdaRole,
  vpc: props.vpc,
  layers: [commonLayer],
  timeout: cdk.Duration.seconds(30),
  memorySize: 256,
});
```

### Build Commands:
```bash
# Frontend
npm run build

# Backend
npm run build --prefix backend

# TypeScript check
npx tsc --noEmit -p backend/tsconfig.json

# Deploy frontend
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

## Estrutura de Diretórios

```
├── backend/                 # Backend Node.js/TypeScript
│   ├── src/
│   │   ├── handlers/       # Lambda handlers por categoria
│   │   ├── lib/            # Bibliotecas compartilhadas
│   │   └── types/          # Tipos TypeScript
│   ├── prisma/
│   │   └── schema.prisma   # Schema do banco PostgreSQL
│   └── tsconfig.json
├── src/                     # Frontend React/TypeScript
├── infra/                   # AWS CDK (TypeScript)
└── .kiro/steering/          # Instruções para IA
```

## Banco de Dados

- **Tipo**: PostgreSQL 15.10
- **ORM**: Prisma
- **Schema**: `backend/prisma/schema.prisma`
- **Migrações**: `npx prisma migrate dev --name {nome}`
- **Stack CloudFormation**: `evo-uds-v3-nodejs-infra`

## Autenticação

- **Provider**: AWS Cognito
- **User Pool**: us-east-1_cnesJ48lR
- **Tokens**: JWT via Authorization header

## Multi-tenancy

- Todas as queries DEVEM filtrar por `organization_id`
- Usar `getOrganizationId(user)` para obter o ID da organização
- NUNCA expor dados de outras organizações

## 🚨 Deploy de Lambda Handlers - PROCESSO OBRIGATÓRIO

### ⚠️ PROBLEMA COMUM: Erro 502 "Cannot find module '../../lib/xxx.js'"

O código TypeScript compilado usa imports relativos como `../../lib/middleware.js` porque os handlers estão em `backend/dist/handlers/{categoria}/`. 

**NUNCA** faça deploy apenas copiando o arquivo .js do handler. Isso causa erro 502!

### ✅ PROCESSO CORRETO DE DEPLOY (Passo a Passo):

```bash
# 1. Compilar o backend
npm run build --prefix backend

# 2. Criar diretório temporário limpo
rm -rf /tmp/lambda-deploy && mkdir -p /tmp/lambda-deploy

# 3. Copiar handler E AJUSTAR IMPORTS (de ../../lib/ para ./lib/)
sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/{categoria}/{handler}.js | \
sed 's|require("../../types/|require("./types/|g' > /tmp/lambda-deploy/{handler}.js

# 4. Copiar lib/ e types/
cp -r backend/dist/lib /tmp/lambda-deploy/
cp -r backend/dist/types /tmp/lambda-deploy/

# 5. Criar ZIP
pushd /tmp/lambda-deploy
zip -r ../lambda.zip .
popd

# 6. Deploy do código
aws lambda update-function-code \
  --function-name evo-uds-v3-production-{nome} \
  --zip-file fileb:///tmp/lambda.zip \
  --region us-east-1

# 7. ⚠️ CRÍTICO: Atualizar o handler path na configuração
# O handler DEVE apontar para o arquivo na RAIZ do ZIP, não para handlers/{categoria}/
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-{nome} \
  --handler {handler}.handler \
  --region us-east-1

# 8. Aguardar atualização completar
aws lambda wait function-updated \
  --function-name evo-uds-v3-production-{nome} \
  --region us-east-1
```

### 📋 Estrutura Correta do ZIP:

```
lambda.zip
├── {handler}.js          # Handler com imports ajustados (./lib/)
├── lib/                  # Todas as bibliotecas compartilhadas
│   ├── middleware.js
│   ├── response.js
│   ├── auth.js
│   ├── database.js
│   ├── aws-helpers.js
│   ├── logging.js
│   ├── audit-service.js
│   └── ...
└── types/                # Tipos TypeScript compilados
    └── lambda.js
```

### ⚠️ Handler Path - MUITO IMPORTANTE

| Situação | Handler Path | Resultado |
|----------|--------------|-----------|
| ❌ ERRADO | `handlers/auth/mfa-handlers.handler` | Erro 502 - arquivo não encontrado |
| ✅ CORRETO | `mfa-handlers.handler` | Funciona - arquivo na raiz do ZIP |

O handler path na configuração da Lambda DEVE corresponder à localização do arquivo DENTRO do ZIP, não à estrutura original do projeto.

### ❌ ERROS COMUNS A EVITAR:

1. **Copiar apenas o .js do handler** → Erro: Cannot find module '../../lib/xxx.js'
2. **Não ajustar os imports** → Erro: Cannot find module '../../lib/xxx.js'
3. **Estrutura de diretórios errada no ZIP** → Erro: Cannot find module
4. **Handler path incorreto** → Erro 502: Runtime.ImportModuleError
5. **Não atualizar handler path após deploy** → Lambda continua usando path antigo

### 🔍 Como Diagnosticar Erro 502

```bash
# 1. Verificar logs do CloudWatch
aws logs tail /aws/lambda/evo-uds-v3-production-{nome} --since 5m --region us-east-1

# 2. Procurar por "Runtime.ImportModuleError" ou "Cannot find module"
# Se aparecer: problema de imports ou handler path

# 3. Verificar configuração atual da Lambda
aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-{nome} \
  --region us-east-1 \
  --query '{Handler: Handler, Layers: Layers[*].Arn}'

# 4. Testar invocação direta
aws lambda invoke \
  --function-name evo-uds-v3-production-{nome} \
  --cli-binary-format raw-in-base64-out \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}}}' \
  --region us-east-1 \
  /tmp/test-output.json

cat /tmp/test-output.json
```

### 📝 Exemplo Completo: Deploy do mfa-handlers

```bash
# Build
npm run build --prefix backend

# Preparar deploy
rm -rf /tmp/lambda-deploy-mfa && mkdir -p /tmp/lambda-deploy-mfa

# Copiar e ajustar imports
sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/auth/mfa-handlers.js | \
sed 's|require("../../types/|require("./types/|g' > /tmp/lambda-deploy-mfa/mfa-handlers.js

# Copiar dependências
cp -r backend/dist/lib /tmp/lambda-deploy-mfa/
cp -r backend/dist/types /tmp/lambda-deploy-mfa/

# Criar ZIP
pushd /tmp/lambda-deploy-mfa
zip -r ../mfa-handlers.zip .
popd

# Deploy para TODAS as Lambdas que usam este handler
for func in mfa-enroll mfa-check mfa-challenge-verify mfa-list-factors mfa-unenroll; do
  echo "Deploying evo-uds-v3-production-$func..."
  
  aws lambda update-function-code \
    --function-name "evo-uds-v3-production-$func" \
    --zip-file fileb:///tmp/mfa-handlers.zip \
    --region us-east-1
  
  aws lambda update-function-configuration \
    --function-name "evo-uds-v3-production-$func" \
    --handler mfa-handlers.handler \
    --region us-east-1
  
  sleep 2
done

echo "✅ Deploy completo!"
```

### 🔧 Script Disponível:

Use o script `scripts/fix-lambda-imports-v2.sh` para deploy correto de múltiplas Lambdas.

### 📊 Checklist de Deploy

Antes de considerar o deploy completo:

- [ ] Backend compilado (`npm run build --prefix backend`)
- [ ] Imports ajustados de `../../lib/` para `./lib/`
- [ ] Imports ajustados de `../../types/` para `./types/`
- [ ] Diretório `lib/` incluído no ZIP
- [ ] Diretório `types/` incluído no ZIP
- [ ] Handler path atualizado na configuração da Lambda
- [ ] `aws lambda wait function-updated` executado
- [ ] Teste de invocação bem-sucedido
- [ ] Logs do CloudWatch sem erros de import



---

## 📜 Histórico de Incidentes de Deploy

### 2026-01-15 - save-aws-credentials com erro 502 (Quick Connect falhando)

**Problema:** Usuário reportou erro ao conectar nova conta AWS via Quick Connect. Lambda `save-aws-credentials` retornando erro 502 "Cannot find module '../../lib/response.js'"

**Impacto:** CRÍTICO - Quick Connect completamente quebrado, impossível adicionar novas contas AWS

**Causa:** Deploy incorreto - apenas o arquivo .js do handler foi copiado, sem o diretório `lib/` e sem ajustar os imports.

**Sintomas nos logs:**
```
Runtime.ImportModuleError: Error: Cannot find module '../../lib/response.js'
Require stack:
- /var/task/save-aws-credentials.js
- /var/runtime/index.mjs
```

**Diagnóstico:**
```bash
# Logs mostraram erro desde 2026-01-15T16:26:18.406Z
aws logs filter-log-events \
  --log-group-name "/aws/lambda/evo-uds-v3-production-save-aws-credentials" \
  --start-time $(date -v-24H +%s000) \
  --filter-pattern "ERROR" \
  --region us-east-1

# Handler path estava incorreto
aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-save-aws-credentials \
  --region us-east-1 \
  --query 'Handler'
# Output: "handlers/aws/save-aws-credentials.handler" (ERRADO)
```

**Solução aplicada:**
1. Recompilar backend: `npm run build --prefix backend`
2. Criar ZIP com estrutura correta (handler + lib/ + types/)
3. Ajustar imports de `../../lib/` para `./lib/`
4. Deploy do código: `aws lambda update-function-code`
5. Atualizar handler path de `handlers/aws/save-aws-credentials.handler` para `save-aws-credentials.handler`
6. Testar invocação: Lambda respondendo corretamente

**Lambda afetada:**
- `evo-uds-v3-production-save-aws-credentials`

**Lição aprendida:** 
- Quick Connect é funcionalidade CRÍTICA - erros aqui bloqueiam onboarding de novos clientes
- SEMPRE verificar logs de Lambdas críticas após deploys
- SEMPRE seguir o processo de deploy documentado
- Considerar adicionar health checks automáticos para Lambdas críticas

**Prevenção futura:**
- [ ] Adicionar testes automatizados de integração para Quick Connect
- [ ] Criar script de validação pós-deploy para Lambdas críticas
- [ ] Adicionar alertas CloudWatch para erros em save-aws-credentials

---

### 2026-01-15 - MFA Lambdas com erro 502

**Problema:** Todas as Lambdas MFA retornando erro 502 "Cannot find module '../../lib/middleware.js'"

**Causa:** Deploy incorreto - apenas o arquivo .js do handler foi copiado, sem o diretório `lib/` e sem ajustar os imports.

**Sintomas nos logs:**
```
Runtime.ImportModuleError: Error: Cannot find module '../../lib/middleware.js'
Require stack:
- /var/task/mfa-handlers.js
```

**Solução:**
1. Recompilar backend: `npm run build --prefix backend`
2. Criar ZIP com estrutura correta (handler + lib/ + types/)
3. Ajustar imports de `../../lib/` para `./lib/`
4. Atualizar handler path de `handlers/auth/mfa-handlers.handler` para `mfa-handlers.handler`
5. Deploy em todas as 5 Lambdas MFA

**Lambdas afetadas:**
- `evo-uds-v3-production-mfa-enroll`
- `evo-uds-v3-production-mfa-check`
- `evo-uds-v3-production-mfa-challenge-verify`
- `evo-uds-v3-production-mfa-list-factors`
- `evo-uds-v3-production-mfa-unenroll`

**Lição aprendida:** SEMPRE seguir o processo de deploy documentado. Nunca fazer deploy "rápido" copiando apenas o handler.

---

**Última atualização:** 2026-01-15
**Versão:** 1.1
