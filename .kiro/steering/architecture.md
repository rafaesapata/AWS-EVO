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

- **Tipo**: PostgreSQL 15
- **ORM**: Prisma
- **Schema**: `backend/prisma/schema.prisma`
- **Migrações**: `npx prisma migrate dev --name {nome}`

## Autenticação

- **Provider**: AWS Cognito
- **User Pool**: us-east-1_qGmGkvmpL
- **Tokens**: JWT via Authorization header

## Multi-tenancy

- Todas as queries DEVEM filtrar por `organization_id`
- Usar `getOrganizationId(user)` para obter o ID da organização
- NUNCA expor dados de outras organizações
