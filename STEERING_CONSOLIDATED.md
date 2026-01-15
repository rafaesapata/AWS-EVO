# 📚 Steering Rules - Consolidated Documentation

> **Versão:** 2.0  
> **Data:** 2026-01-15  
> **Propósito:** Documentação consolidada de todas as regras, padrões e boas práticas do projeto EVO

---

## 📑 Índice

1. [Arquitetura do Projeto](#1-arquitetura-do-projeto)
2. [Política de Proibição de Mocks](#2-política-de-proibição-de-mocks)
3. [Infraestrutura AWS](#3-infraestrutura-aws)
4. [Configuração de Banco de Dados](#4-configuração-de-banco-de-dados)
5. [Lambda Functions Reference](#5-lambda-functions-reference)
6. [API Gateway Endpoints](#6-api-gateway-endpoints)
7. [Deploy de Lambda Handlers](#7-deploy-de-lambda-handlers)
8. [CloudFormation Deployment](#8-cloudformation-deployment)
9. [Azure SDK Lambda Layers](#9-azure-sdk-lambda-layers)
10. [MFA Implementation](#10-mfa-implementation)
11. [Frontend Page Standards](#11-frontend-page-standards)
12. [Audit Logging](#12-audit-logging)
13. [Error Monitoring](#13-error-monitoring)
14. [Bash Command Guidelines](#14-bash-command-guidelines)

---


## 1. Arquitetura do Projeto

### Stack Tecnológica OBRIGATÓRIA

#### Backend
- **Runtime**: Node.js 18.x (AWS Lambda)
- **Linguagem**: TypeScript (CommonJS)
- **ORM**: Prisma
- **Banco de Dados**: PostgreSQL (AWS RDS)
- **Localização**: `backend/`

#### Frontend
- **Framework**: React 18 + Vite
- **Linguagem**: TypeScript
- **UI**: shadcn/ui + Tailwind CSS
- **Localização**: `src/`

#### Infraestrutura
- **IaC**: AWS CDK (TypeScript)
- **Localização**: `infra/`

### ⛔ PROIBIÇÕES ABSOLUTAS

1. **NÃO criar Lambdas em Python** - Todo backend DEVE ser Node.js/TypeScript
2. **NÃO usar DynamoDB** - O banco de dados é PostgreSQL via Prisma
3. **NÃO criar arquivos .py** no projeto
4. **NÃO mudar a arquitetura** sem aprovação explícita
5. **JAMAIS usar mocks em testes** - Testes DEVEM usar dados e serviços reais

### Estrutura de Diretórios

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

### Padrão de Lambda Handler

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

### Build Commands

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

---


## 2. Política de Proibição de Mocks

### Regra Absoluta

**NUNCA usar dados mockados, stubs, ou dados de teste em código de produção.**

### ⛔ PROIBIÇÕES

#### 1. Dados Mockados em Handlers/APIs
```typescript
// ❌ PROIBIDO - Dados mockados
const mockData = {
  tenantId: 'test-tenant-id',
  clientId: 'mock-client-id',
  subscriptionId: '00000000-0000-0000-0000-000000000000',
};

// ❌ PROIBIDO - Retornar dados fake
return success({
  valid: true,
  data: mockData, // NUNCA!
});
```

#### 2. Mocks em Testes de Integração
```typescript
// ❌ PROIBIDO - Mockar serviços reais em testes
jest.mock('@azure/identity');
jest.mock('aws-sdk');

// ❌ PROIBIDO - Usar stubs
const mockClient = {
  listResourceGroups: jest.fn().mockResolvedValue([]),
};
```

#### 3. Dados de Teste Hardcoded
```typescript
// ❌ PROIBIDO - Credenciais de teste hardcoded
const testCredentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

// ❌ PROIBIDO - IDs de teste
const testOrgId = 'test-org-123';
const testUserId = 'test-user-456';
```

### ✅ O QUE FAZER

#### 1. Usar Dados Reais
```typescript
// ✅ CORRETO - Buscar dados reais do banco/API
const credentials = await prisma.azureCredential.findFirst({
  where: { organizationId },
});

if (!credentials) {
  return error('No credentials found', 404);
}
```

#### 2. Validar Dados de Entrada
```typescript
// ✅ CORRETO - Validar dados do usuário
const validation = schema.safeParse(body);
if (!validation.success) {
  return error('Invalid input', 400);
}

const { tenantId, clientId } = validation.data;
```

#### 3. Retornar Erros Reais
```typescript
// ✅ CORRETO - Retornar erro real quando algo falha
try {
  const result = await azureProvider.validateCredentials();
  return success(result);
} catch (err) {
  return error(err.message, 500);
}
```

### Por Que Esta Política?

1. **Segurança** - Mocks podem esconder vulnerabilidades reais
2. **Confiabilidade** - Mocks não testam o comportamento real do sistema
3. **Qualidade** - Código com mocks é mais difícil de manter
4. **Debugging** - Mocks dificultam identificar problemas reais

### Exceção (MUITO RARA)

Única exceção permitida: **Testes Unitários Isolados** de lógica pura

```typescript
// ⚠️ EXCEÇÃO - Apenas para testes unitários de lógica pura
describe('calculateDiscount', () => {
  it('should apply 10% discount', () => {
    const result = calculateDiscount(100, 0.1);
    expect(result).toBe(90);
  });
});
```

**NUNCA** usar mocks para:
- Testes de integração
- Testes E2E
- Código de produção
- Handlers de API
- Validação de credenciais

---


## 3. Infraestrutura AWS

### API Gateway

- **REST API ID**: `3l66kn0eaj`
- **Stage**: `prod` (único stage em uso)
- **Custom Domain**: `api-evo.ai.udstec.io`
- **Regional Endpoint**: `d-lh5c9lpit7.execute-api.us-east-1.amazonaws.com`
- **Authorizer ID**: `joelbs` (Cognito User Pools)
- **Functions Resource ID**: `n9gxy9` (parent de `/api/functions/*`)

#### Deploy Commands
```bash
# Deploy API Gateway changes (SEMPRE usar stage 'prod')
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1

# Flush cache se necessário
aws apigateway flush-stage-cache --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1
```

### Lambda Layers

#### Layer Atual (com Azure SDK)
- **Prisma + Zod + Azure SDK Layer**: `arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:47`
- **Contém**: `@prisma/client`, `.prisma/client`, `zod`, `@azure/*`, `@typespec/ts-http-runtime`
- **Tamanho**: ~45MB comprimido, ~172MB descomprimido

### Cognito

#### Development Environment
- **User Pool ID**: `us-east-1_cnesJ48lR`
- **User Pool Client ID**: `4p0okvsr983v2f8rrvgpls76d6`
- **Region**: `us-east-1`
- **Custom Attributes**: `organization_id`, `organization_name`, `roles`, `tenant_id`
- **MFA**: Optional

### CloudFront

- **Frontend Distribution ID**: `E1PY7U3VNT6P1R`
- **Frontend Domain**: `evo.ai.udstec.io`
- **S3 Bucket**: `evo-uds-v3-production-frontend-383234048592`

### VPC & Networking

- **VPC ID**: `vpc-09773244a2156129c`
- **VPC CIDR**: `10.0.0.0/16`
- **Region**: `us-east-1`

#### Subnets
| Tipo | Subnet ID | CIDR | AZ |
|------|-----------|------|-----|
| Public | `subnet-0c7857d8ca2b5a4e0` | 10.0.1.0/24 | us-east-1a |
| Private | `subnet-0dbb444e4ef54d211` | 10.0.3.0/24 | us-east-1a |
| Private | `subnet-05383447666913b7b` | 10.0.4.0/24 | us-east-1b |

#### NAT Gateway
- **NAT Gateway ID**: `nat-071801f85e8109355`
- **Elastic IP**: `54.165.51.84`
- **Subnet**: Public Subnet 1

### Troubleshooting

#### Lambda 504 Timeout (VPC)
Lambdas em VPC precisam de NAT Gateway para acessar APIs AWS.

```bash
# Verificar se NAT Gateway está ativo
aws ec2 describe-nat-gateways --filter "Name=state,Values=available" --region us-east-1

# Verificar se Lambda está nas private subnets corretas
aws lambda get-function-configuration --function-name FUNCTION_NAME --query 'VpcConfig' --region us-east-1
```

#### Azure SDK "not installed" Error
```bash
# Atualizar para layer versão 47 (com Azure SDK)
aws lambda update-function-configuration \
  --function-name FUNCTION_NAME \
  --layers "arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:47" \
  --region us-east-1
```

---


## 4. Configuração de Banco de Dados

### RDS PostgreSQL - PRODUÇÃO

| Propriedade | Valor |
|-------------|-------|
| **Instance Identifier** | `evo-uds-v3-production-postgres` |
| **Endpoint** | `evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com` |
| **Port** | `5432` |
| **Database Name** | `evouds` |
| **Schema** | `public` |
| **Username** | `evoadmin` |
| **Engine** | PostgreSQL 15.10 |
| **Region** | `us-east-1` |

### DATABASE_URL Correta (URL-encoded)

```
postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public
```

### ⛔ ENDPOINTS INCORRETOS - NUNCA USAR

```
❌ evo-uds-v3-nodejs-infra-rdsinstance-1ixbvtqhqhqhq.c8ywqzqzqzqz.us-east-1.rds.amazonaws.com
❌ Qualquer endpoint com "nodejs-infra-rdsinstance" no nome
```

### Variáveis de Ambiente Obrigatórias para Lambdas

```bash
DATABASE_URL="postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public"
NODE_PATH="/opt/nodejs/node_modules"
```

### Atualizar DATABASE_URL de uma Lambda

```bash
aws lambda update-function-configuration \
  --function-name NOME_DA_LAMBDA \
  --environment 'Variables={DATABASE_URL="postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public",NODE_PATH="/opt/nodejs/node_modules"}' \
  --region us-east-1
```

### VPC Configuration para Lambdas

| Propriedade | Valor |
|-------------|-------|
| **VPC ID** | `vpc-09773244a2156129c` |
| **Private Subnets** | `subnet-0dbb444e4ef54d211`, `subnet-05383447666913b7b` |
| **Security Group** | `sg-04eb71f681cc651ae` |

### Troubleshooting

#### Erro: "Can't reach database server"

**Diagnóstico:**
```bash
# 1. Verificar DATABASE_URL da Lambda
aws lambda get-function-configuration \
  --function-name NOME_DA_LAMBDA \
  --region us-east-1 \
  --query 'Environment.Variables.DATABASE_URL'

# 2. Verificar VPC da Lambda
aws lambda get-function-configuration \
  --function-name NOME_DA_LAMBDA \
  --region us-east-1 \
  --query 'VpcConfig'

# 3. Verificar status do RDS
aws rds describe-db-instances \
  --region us-east-1 \
  --query 'DBInstances[?DBInstanceIdentifier==`evo-uds-v3-production-postgres`].[DBInstanceStatus]'
```

---

