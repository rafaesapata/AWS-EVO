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

### ✅ PROCESSO CORRETO DE DEPLOY:

```bash
# 1. Compilar o backend
npm run build --prefix backend

# 2. Criar diretório temporário
rm -rf /tmp/lambda-deploy && mkdir -p /tmp/lambda-deploy

# 3. Copiar handler E AJUSTAR IMPORTS (de ../../lib/ para ./lib/)
sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/{categoria}/{handler}.js | \
sed 's|require("../../types/|require("./types/|g' > /tmp/lambda-deploy/{handler}.js

# 4. Copiar lib/ e types/
cp -r backend/dist/lib /tmp/lambda-deploy/
cp -r backend/dist/types /tmp/lambda-deploy/

# 5. Criar ZIP
pushd /tmp/lambda-deploy && zip -r ../lambda.zip . && popd

# 6. Deploy
aws lambda update-function-code \
  --function-name {nome-da-lambda} \
  --zip-file fileb:///tmp/lambda.zip \
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
│   └── ...
└── types/                # Tipos TypeScript compilados
    └── lambda.js
```

### ❌ ERROS COMUNS A EVITAR:

1. **Copiar apenas o .js do handler** → Erro: Cannot find module '../../lib/xxx.js'
2. **Não ajustar os imports** → Erro: Cannot find module '../../lib/xxx.js'
3. **Estrutura de diretórios errada no ZIP** → Erro: Cannot find module

### 🔧 Script Disponível:

Use o script `scripts/fix-lambda-imports-v2.sh` para deploy correto de múltiplas Lambdas.

