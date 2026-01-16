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


## 5. Lambda Functions Reference

### 🚨 IMPORTANTE: Consulte antes de criar novas Lambdas

**Total de Lambdas**: ~114 funções  
**Total de Endpoints**: ~104 endpoints  
**Categorias**: 15 categorias principais

### Principais Categorias

#### 🔐 Autenticação & MFA (11 Lambdas)
- `mfa-enroll`, `mfa-check`, `mfa-challenge-verify`, `mfa-verify-login`
- `mfa-list-factors`, `mfa-unenroll`
- `webauthn-register`, `webauthn-authenticate`, `webauthn-check`
- `delete-webauthn-credential`, `verify-tv-token`

#### 👤 Administração (5 Lambdas)
- `admin-manage-user`, `create-cognito-user`, `disable-cognito-user`
- `manage-organizations`, `log-audit`

#### 🔒 Segurança (15 Lambdas)
- `security-scan`, `start-security-scan`
- `compliance-scan`, `start-compliance-scan`, `get-compliance-scan-status`, `get-compliance-history`
- `well-architected-scan`, `guardduty-scan`
- `get-findings`, `get-security-posture`
- `validate-aws-credentials`, `validate-permissions`
- `iam-deep-analysis`, `lateral-movement-detection`, `drift-detection`

#### 🛡️ WAF Monitoring (2 Lambdas)
- `waf-setup-monitoring`, `waf-dashboard-api`

#### 💰 Custos & FinOps (7 Lambdas)
- `fetch-daily-costs`, `ri-sp-analyzer`, `cost-optimization`
- `budget-forecast`, `generate-cost-forecast`
- `finops-copilot`, `ml-waste-detection`

#### 🤖 IA & Machine Learning (5 Lambdas)
- `bedrock-chat`, `intelligent-alerts-analyzer`
- `predict-incidents`, `detect-anomalies`, `anomaly-detection`

#### 🔵 Azure Multi-Cloud (19 Lambdas)
- OAuth: `azure-oauth-initiate`, `azure-oauth-callback`, `azure-oauth-refresh`, `azure-oauth-revoke`
- Credentials: `validate-azure-credentials`, `save-azure-credentials`, `list-azure-credentials`, `delete-azure-credentials`
- Security: `azure-security-scan`, `start-azure-security-scan`, `azure-defender-scan`
- Compliance: `azure-compliance-scan`, `azure-well-architected-scan`
- Cost: `azure-cost-optimization`, `azure-reservations-analyzer`, `azure-fetch-costs`
- Resources: `azure-resource-inventory`, `azure-activity-logs`
- Monitoring: `azure-fetch-monitor-metrics`, `azure-detect-anomalies`

#### 📜 Licenciamento (6 Lambdas)
- `validate-license`, `configure-license`, `sync-license`
- `admin-sync-license`, `manage-seats`, `daily-license-validation`

### Checklist para Novas Lambdas

- [ ] Verificar se funcionalidade similar já existe
- [ ] Verificar se pode ser adicionada a um handler existente
- [ ] Seguir padrão de nomenclatura: `evo-uds-v3-production-{nome}`
- [ ] Criar endpoint no API Gateway com CORS
- [ ] Adicionar entrada em `lambda-functions-reference.md`
- [ ] Atualizar contagem total

---


## 6. API Gateway Endpoints

### Configuração

- **REST API ID**: `3l66kn0eaj`
- **Stage**: `prod` (único stage em uso)
- **Custom Domain**: `api-evo.ai.udstec.io`
- **Authorizer ID**: `joelbs` (Cognito User Pools)
- **Functions Resource ID**: `n9gxy9`

### CORS Headers Padrão

```
Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
Access-Control-Allow-Origin: *
```

### ⛔ REGRAS OBRIGATÓRIAS

1. **Verificar se já existe** - Consulte a lista completa
2. **Usar kebab-case** - Ex: `my-new-endpoint` (NÃO `my_new_endpoint`)
3. **Criar OPTIONS com CORS** - Sempre incluir método OPTIONS
4. **Incluir X-Impersonate-Organization** - Nos headers CORS
5. **Atualizar documentação** - Adicionar em `api-gateway-endpoints.md`
6. **Deploy no stage `prod`** - NUNCA usar outro stage

### Como Criar Novo Endpoint

```bash
# 1. Criar resource
aws apigateway create-resource \
  --rest-api-id 3l66kn0eaj \
  --parent-id n9gxy9 \
  --path-part NOME-ENDPOINT \
  --region us-east-1

# 2. Criar OPTIONS (CORS)
aws apigateway put-method \
  --rest-api-id 3l66kn0eaj \
  --resource-id RESOURCE_ID \
  --http-method OPTIONS \
  --authorization-type NONE \
  --region us-east-1

# 3. Criar POST com Cognito
aws apigateway put-method \
  --rest-api-id 3l66kn0eaj \
  --resource-id RESOURCE_ID \
  --http-method POST \
  --authorization-type COGNITO_USER_POOLS \
  --authorizer-id joelbs \
  --region us-east-1

# 4. Adicionar permissão Lambda (CRÍTICO!)
aws lambda add-permission \
  --function-name LAMBDA_NAME \
  --statement-id apigateway-NOME-ENDPOINT \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/api/functions/NOME-ENDPOINT" \
  --region us-east-1

# 5. Deploy (stage 'prod')
aws apigateway create-deployment \
  --rest-api-id 3l66kn0eaj \
  --stage-name prod \
  --region us-east-1
```

### Erros Comuns

#### Erro 500 "Cannot read properties of undefined (reading 'authorizer')"
**Causa:** Lambda não recebe contexto de autorização do Cognito  
**Solução:** Verificar permissão Lambda tem path completo `/api/functions/NOME-ENDPOINT`

#### Erro 403 no OPTIONS (CORS)
**Causa:** Headers CORS não configurados  
**Solução:** Atualizar integration response do OPTIONS com headers corretos

---


## 7. Deploy de Lambda Handlers

### 🚨 PROBLEMA COMUM: Erro 502 "Cannot find module '../../lib/xxx.js'"

O código TypeScript compilado usa imports relativos porque os handlers estão em `backend/dist/handlers/{categoria}/`.

**NUNCA** faça deploy apenas copiando o arquivo .js do handler. Isso causa erro 502!

### ✅ PROCESSO CORRETO DE DEPLOY

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

# 7. ⚠️ CRÍTICO: Atualizar o handler path
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-{nome} \
  --handler {handler}.handler \
  --region us-east-1

# 8. Aguardar atualização completar
aws lambda wait function-updated \
  --function-name evo-uds-v3-production-{nome} \
  --region us-east-1
```

### 📋 Estrutura Correta do ZIP

```
lambda.zip
├── {handler}.js          # Handler com imports ajustados (./lib/)
├── lib/                  # Todas as bibliotecas compartilhadas
│   ├── middleware.js
│   ├── response.js
│   ├── auth.js
│   ├── database.js
│   └── ...
└── types/                # Tipos TypeScript compilados
    └── lambda.js
```

### ⚠️ Handler Path - MUITO IMPORTANTE

| Situação | Handler Path | Resultado |
|----------|--------------|-----------|
| ❌ ERRADO | `handlers/auth/mfa-handlers.handler` | Erro 502 |
| ✅ CORRETO | `mfa-handlers.handler` | Funciona |

### ❌ ERROS COMUNS A EVITAR

1. **Copiar apenas o .js do handler** → Erro: Cannot find module
2. **Não ajustar os imports** → Erro: Cannot find module
3. **Estrutura de diretórios errada no ZIP** → Erro: Cannot find module
4. **Handler path incorreto** → Erro 502: Runtime.ImportModuleError
5. **Não atualizar handler path após deploy** → Lambda usa path antigo

### 🔍 Como Diagnosticar Erro 502

```bash
# 1. Verificar logs do CloudWatch
aws logs tail /aws/lambda/evo-uds-v3-production-{nome} --since 5m --region us-east-1

# 2. Procurar por "Runtime.ImportModuleError" ou "Cannot find module"

# 3. Verificar configuração atual da Lambda
aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-{nome} \
  --region us-east-1 \
  --query '{Handler: Handler, Layers: Layers[*].Arn}'
```

### 📊 Checklist de Deploy

- [ ] Backend compilado (`npm run build --prefix backend`)
- [ ] Imports ajustados de `../../lib/` para `./lib/`
- [ ] Imports ajustados de `../../types/` para `./types/`
- [ ] Diretório `lib/` incluído no ZIP
- [ ] Diretório `types/` incluído no ZIP
- [ ] Handler path atualizado na configuração
- [ ] `aws lambda wait function-updated` executado
- [ ] Teste de invocação bem-sucedido
- [ ] Logs do CloudWatch sem erros

---


## 8. CloudFormation Deployment

### 🚨 REGRA DE OURO

**ATENÇÃO:** Todos os clientes usam Quick Connect. Existe apenas UM template oficial.

### ✅ TEMPLATE ÚNICO

- **Arquivo:** `public/cloudformation/evo-platform-role.yaml`
- **URL Pública:** `https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml`
- **Deploy:** Via build do frontend (Vite) + S3 sync + CloudFront invalidation

### ⚠️ ERRO COMUM QUE VOCÊ DEVE EVITAR

❌ Atualizar `cloudformation/customer-iam-role-waf.yaml` (deprecated)  
❌ Cliente reporta "no changes" porque o template live não foi atualizado  
❌ Perder tempo debugando quando o problema é ter editado o arquivo errado

### ✅ PROCESSO CORRETO

```bash
# 1. Atualizar template oficial
vim public/cloudformation/evo-platform-role.yaml

# 2. Build frontend (inclui templates)
npm run build

# 3. Deploy para S3
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete

# 4. Invalidar CloudFront
aws cloudfront create-invalidation \
  --distribution-id E1PY7U3VNT6P1R \
  --paths "/cloudformation/*"

# 5. Verificar
curl -I https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml
```

### Comunicar aos Clientes

```markdown
## Atualização Disponível

O template CloudFormation foi atualizado com novas permissões.

**Como atualizar:**
1. Acesse: https://console.aws.amazon.com/cloudformation
2. Selecione o stack: evo-platform-role
3. Clique em "Update"
4. Selecione "Use current template" (já está atualizado!)
5. Next → Next → Next → Submit

**Mudanças:**
- [Listar mudanças aqui]
```

### Troubleshooting

#### "No updates are to be performed"
**Causa:** Template já está atualizado  
**Solução:** Verificar se template no S3/CloudFront está correto

#### Cliente não consegue acessar template
```bash
# Verificar se arquivo existe
aws s3 ls s3://evo-uds-v3-production-frontend-383234048592/cloudformation/

# Testar acesso público
curl -I https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml
```

### Checklist de Deploy

- [ ] Template source atualizado
- [ ] Sintaxe YAML validada
- [ ] Template deployado (Frontend build)
- [ ] CloudFront invalidado
- [ ] URL acessível publicamente
- [ ] Documentação atualizada
- [ ] Clientes notificados

---


## 9. Azure SDK Lambda Layers

### 🚨 Problema: "Azure SDK not installed" ou "Cannot find module '@typespec/ts-http-runtime'"

### Causa Raiz

O Azure SDK tem dependências peer que não são instaladas automaticamente:
- `@typespec/ts-http-runtime` - Runtime do TypeSpec usado pelo Azure SDK
- Node.js 18 no Lambda não resolve corretamente os "exports" condicionais do package.json

### Solução Completa

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

# 6.1. Criar arquivos de compatibilidade para exports internos
mkdir -p /tmp/lambda-layer-azure/nodejs/node_modules/@typespec/ts-http-runtime/internal

cat > /tmp/lambda-layer-azure/nodejs/node_modules/@typespec/ts-http-runtime/internal/logger.js << 'EOF'
module.exports = require('../dist/commonjs/logger/internal.js');
EOF

cat > /tmp/lambda-layer-azure/nodejs/node_modules/@typespec/ts-http-runtime/internal/util.js << 'EOF'
module.exports = require('../dist/commonjs/util/internal.js');
EOF

cat > /tmp/lambda-layer-azure/nodejs/node_modules/@typespec/ts-http-runtime/internal/policies.js << 'EOF'
module.exports = require('../dist/commonjs/policies/internal.js');
EOF

# 7. Copiar dependências transitivas
for pkg in tslib uuid ms http-proxy-agent https-proxy-agent agent-base debug events fast-xml-parser strnum; do
  [ -d "node_modules/$pkg" ] && cp -r "node_modules/$pkg" /tmp/lambda-layer-azure/nodejs/node_modules/
done

# 8. Limpar arquivos desnecessários
rm -f /tmp/lambda-layer-azure/nodejs/node_modules/.prisma/client/libquery_engine-darwin*.node
find /tmp/lambda-layer-azure/nodejs/node_modules -name "*.ts" -not -name "*.d.ts" -delete
find /tmp/lambda-layer-azure/nodejs/node_modules -name "*.map" -delete

# 9. Criar ZIP
cd /tmp/lambda-layer-azure
zip -r /tmp/prisma-azure-layer.zip nodejs
cd -

# 10. Upload para S3
aws s3 cp /tmp/prisma-azure-layer.zip \
  s3://evo-uds-v3-production-frontend-383234048592/layers/prisma-azure-layer.zip \
  --region us-east-1

# 11. Publicar layer
aws lambda publish-layer-version \
  --layer-name evo-prisma-deps-layer \
  --description "Prisma + Zod + Azure SDK + @typespec" \
  --content S3Bucket=evo-uds-v3-production-frontend-383234048592,S3Key=layers/prisma-azure-layer.zip \
  --compatible-runtimes nodejs18.x nodejs20.x \
  --region us-east-1
```

### Atualizar Lambda com Layer

```bash
# Obter ARN do layer (última versão)
LAYER_ARN=$(aws lambda list-layer-versions \
  --layer-name evo-prisma-deps-layer \
  --region us-east-1 \
  --query 'LayerVersions[0].LayerVersionArn' \
  --output text)

# Atualizar Lambda
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-validate-azure-credentials \
  --layers "$LAYER_ARN" \
  --environment "Variables={NODE_PATH=/opt/nodejs/node_modules}" \
  --region us-east-1
```

### Por que os arquivos de compatibilidade são necessários?

O `package.json` do @typespec define exports condicionais que Node.js 18 no Lambda não resolve corretamente:

```json
{
  "exports": {
    "./internal/logger": {
      "require": "./dist/commonjs/logger/internal.js"
    }
  }
}
```

A solução é criar arquivos simples que fazem re-export:

```javascript
// @typespec/ts-http-runtime/internal/logger.js
module.exports = require('../dist/commonjs/logger/internal.js');
```

### Dependências Críticas do Azure SDK

Sempre incluir no layer:

#### Pacotes Azure
- `@azure/identity` - Autenticação
- `@azure/arm-resources` - Resource Management
- `@azure/arm-compute` - VMs
- `@azure/arm-storage` - Storage Accounts
- `@azure/arm-network` - Networking
- `@azure/arm-costmanagement` - Cost Management

#### Dependências Peer (CRÍTICO!)
- `@typespec/ts-http-runtime` - **OBRIGATÓRIO**
- `tslib`, `uuid`, `ms`
- `http-proxy-agent`, `https-proxy-agent`, `agent-base`
- `debug`, `events`, `fast-xml-parser`, `strnum`

---


## 10. MFA Implementation

### 🚨 IMPORTANTE: NÃO USAR COGNITO PARA MFA

A implementação de MFA **NÃO usa Cognito** para verificação de códigos TOTP. O Cognito é usado apenas para autenticação básica.

### Arquitetura MFA

#### Fluxo de Enrollment (Cadastro)

1. Frontend chama `POST /api/functions/mfa-enroll` com `factorType: 'totp'`
2. Backend gera secret TOTP usando `crypto.randomBytes(20)`
3. Backend salva secret na tabela `mfa_factors` do PostgreSQL
4. Backend retorna secret e URL `otpauth://` para QR Code
5. Frontend gera QR Code usando biblioteca `qrcode`
6. Usuário escaneia QR Code com app autenticador

#### Fluxo de Verificação

1. Frontend chama `POST /api/functions/mfa-challenge-verify` com `factorId` e `code`
2. Backend busca fator na tabela `mfa_factors`
3. Backend verifica código TOTP **localmente** usando `verifyTOTP()`
4. Backend atualiza status para `verified` se correto
5. Frontend recebe confirmação

#### Fluxo de Login com MFA

1. Frontend chama `POST /api/functions/mfa-check`
2. Se tiver MFA, solicita código ao usuário
3. Frontend chama `POST /api/functions/mfa-verify-login` com código
4. Backend verifica código TOTP **localmente**
5. Frontend completa login

### Arquivos Principais

#### Backend
- `backend/src/handlers/auth/mfa-handlers.ts` - Todos os handlers MFA
- `backend/src/lib/schemas.ts` - Schemas de validação
- `backend/prisma/schema.prisma` - Model `MfaFactor`

#### Frontend
- `src/components/MFASettings.tsx` - Interface de configuração

#### Banco de Dados
Tabela: `mfa_factors`
- `id`, `user_id`, `factor_type`, `friendly_name`, `secret`
- `status`, `is_active`, `verified_at`, `last_used_at`

### Função de Verificação TOTP

```typescript
function verifyTOTP(secret: string, token: string, window: number = 1): boolean {
  // 1. Decodifica secret de Base32
  // 2. Calcula counter baseado no timestamp (epoch / 30)
  // 3. Gera HMAC-SHA1 do counter com secret
  // 4. Extrai 6 dígitos do HMAC
  // 5. Compara com token fornecido
  // 6. Verifica tokens adjacentes (window) para tolerância
}
```

### ⛔ O QUE NÃO FAZER

1. **NÃO usar `VerifySoftwareTokenCommand` do Cognito**
2. **NÃO usar `AssociateSoftwareTokenCommand` do Cognito**
3. **NÃO depender do Cognito para armazenar secrets MFA**
4. **NÃO usar `accessToken` do Cognito para verificação MFA**

### ✅ O QUE FAZER

1. **Gerar secret TOTP localmente** usando `crypto.randomBytes(20).toString('base32')`
2. **Armazenar secret na tabela `mfa_factors`** do PostgreSQL
3. **Verificar códigos TOTP localmente** usando `verifyTOTP()`
4. **Usar rate limiting** para prevenir brute force (10 tentativas/minuto)

### Lambdas MFA

| Lambda | Função |
|--------|--------|
| `mfa-enroll` | Cadastrar novo fator MFA |
| `mfa-check` | Verificar se usuário tem MFA |
| `mfa-challenge-verify` | Verificar código durante enrollment |
| `mfa-verify-login` | Verificar código durante login |
| `mfa-list-factors` | Listar fatores do usuário |
| `mfa-unenroll` | Remover fator MFA |

### Segurança

#### Implementado
- Rate limiting: 10 tentativas/minuto, bloqueio de 15 minutos
- Isolamento por usuário: `user_id` em todas as queries
- Validação de input com Zod
- Logging de tentativas de brute force

#### Recomendações Futuras
- Criptografar campo `secret` com AWS KMS
- Implementar backup recovery codes
- Adicionar logs de auditoria detalhados
- Implementar MFA obrigatório por organização

---


## 11. Frontend Page Standards

### 🚨 Padrão Visual Obrigatório para Novas Páginas

Todas as páginas do frontend DEVEM seguir o padrão visual usando o componente `<Layout>`.

### ✅ Estrutura Obrigatória de Página

```tsx
import { Layout } from '@/components/Layout';
import { SomeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function NomeDaPagina() {
  const { t } = useTranslation();

  return (
    <Layout
      title={t('pagina.title', 'Título da Página')}
      description={t('pagina.description', 'Descrição breve')}
      icon={<SomeIcon className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        {/* Conteúdo da página */}
      </div>
    </Layout>
  );
}
```

### Props do Layout

| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| `title` | `string` | Sim | Título exibido no header |
| `description` | `string` | Sim | Descrição curta da página |
| `icon` | `ReactNode` | Recomendado | Ícone do Lucide com `h-4 w-4 text-white` |
| `children` | `ReactNode` | Sim | Conteúdo da página |

### O que o Layout Fornece

1. **Sidebar** - Menu lateral com navegação
2. **Header** - Com título, descrição, ícone, seletor de conta cloud, idioma, tema e menu do usuário
3. **Footer** - Rodapé minimalista
4. **Estilos** - Classes `glass`, `bg-gradient-subtle`, etc.

### Padrões de Estilo

#### Cards
```tsx
<Card className="glass border-primary/20">
  <CardHeader>
    <CardTitle>Título</CardTitle>
    <CardDescription>Descrição</CardDescription>
  </CardHeader>
  <CardContent>
    {/* conteúdo */}
  </CardContent>
</Card>
```

#### Tabs
```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="glass">
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1" className="space-y-6">
    {/* conteúdo */}
  </TabsContent>
</Tabs>
```

#### Botões
```tsx
// Botão primário com glow
<Button className="glass hover-glow">
  <Icon className="h-4 w-4 mr-2" />
  Texto
</Button>

// Botão outline
<Button variant="outline" className="glass hover-glow">
  Texto
</Button>
```

#### Espaçamento
```tsx
// Container principal
<div className="space-y-6">
  {/* Seções com gap de 1.5rem */}
</div>

// Grid responsivo
<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
  {/* Cards */}
</div>
```

### Classes CSS Customizadas

| Classe | Descrição |
|--------|-----------|
| `glass` | Efeito glassmorphism com blur |
| `hover-glow` | Efeito glow no hover |
| `bg-gradient-subtle` | Background gradiente sutil |
| `bg-gradient-primary` | Background gradiente primário |
| `shadow-elegant` | Sombra elegante |
| `shadow-glow` | Sombra com glow |
| `border-primary/20` | Borda primária com 20% opacidade |

### Checklist para Novas Páginas

- [ ] Usar `<Layout>` como wrapper principal
- [ ] Definir `title` e `description` com i18n
- [ ] Adicionar ícone apropriado do Lucide
- [ ] Usar classes `glass` e `border-primary/20` em Cards
- [ ] Usar `space-y-6` para espaçamento vertical
- [ ] Usar `grid gap-6` para layouts em grid
- [ ] Adicionar traduções em `src/i18n/locales/pt.json` e `en.json`
- [ ] Testar responsividade (mobile, tablet, desktop)

---


## 12. Audit Logging

### 🚨 Todos os handlers devem registrar logs de auditoria

### Serviço de Auditoria

Localização: `backend/src/lib/audit-service.ts`

#### Funções Disponíveis

```typescript
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
```

| Função | Descrição |
|--------|-----------|
| `logAuditAsync()` | Registra log (fire-and-forget, nunca quebra fluxo) |
| `logAudit()` | Versão async que pode ser awaited |
| `getIpFromEvent()` | Extrai IP do evento Lambda |
| `getUserAgentFromEvent()` | Extrai User-Agent do evento |

### Ações de Auditoria Disponíveis

```typescript
type AuditAction = 
  | 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED'
  | 'MFA_ENABLED' | 'MFA_DISABLED' | 'MFA_VERIFIED'
  | 'PASSWORD_CHANGE'
  | 'USER_CREATE' | 'USER_UPDATE' | 'USER_DELETE'
  | 'CREDENTIAL_CREATE' | 'CREDENTIAL_UPDATE' | 'CREDENTIAL_DELETE'
  | 'SECURITY_SCAN_START' | 'SECURITY_SCAN_COMPLETE'
  | 'COMPLIANCE_SCAN_START' | 'COMPLIANCE_SCAN_COMPLETE'
  | 'COST_ANALYSIS' | 'REPORT_GENERATE' | 'REPORT_EXPORT'
  | 'ALERT_CREATE' | 'ALERT_UPDATE' | 'ALERT_DELETE'
  | 'AI_CHAT' | 'SETTINGS_UPDATE' | 'ORGANIZATION_UPDATE'
  | 'LICENSE_SYNC' | 'DATA_EXPORT' | 'DATA_DELETE'
  | 'WAF_SETUP' | 'WAF_BLOCK_IP' | 'WAF_UNBLOCK_IP';
```

### Tipos de Recursos

```typescript
type AuditResourceType =
  | 'user' | 'organization' | 'aws_credential' | 'azure_credential'
  | 'security_scan' | 'compliance_scan' | 'cost_report'
  | 'alert' | 'ticket' | 'copilot' | 'settings' | 'license'
  | 'api_key' | 'cloudtrail' | 'waf' | 'report' | 'mfa' | 'session';
```

### ✅ Como Usar

```typescript
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';

// Após ação bem-sucedida
logger.info('Ação concluída', { ... });

// Audit log (fire-and-forget)
logAuditAsync({
  organizationId,
  userId: user.sub,
  action: 'SECURITY_SCAN_COMPLETE',
  resourceType: 'security_scan',
  resourceId: scan.id,
  details: {
    duration_ms: duration,
    findings_count: findings.length,
  },
  ipAddress: getIpFromEvent(event),
  userAgent: getUserAgentFromEvent(event),
});

return success({ ... });
```

### ⚠️ Regras Importantes

1. **Usar `logAuditAsync`** (não `logAudit`) - fire-and-forget, nunca quebra fluxo
2. **Chamar APÓS a ação principal** - só logamos ações que realmente aconteceram
3. **Incluir detalhes relevantes** - `organizationId`, `userId`, `resourceId`
4. **Não incluir dados sensíveis** - senhas, tokens, secrets, dados pessoais completos

### Exemplo Completo

```typescript
export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    // Executar ação principal
    const result = await prisma.someTable.create({ ... });

    logger.info('Recurso criado', { id: result.id });

    // Audit log (fire-and-forget)
    logAuditAsync({
      organizationId,
      userId: user.sub,
      action: 'RESOURCE_CREATE',
      resourceType: 'some_resource',
      resourceId: result.id,
      details: { name: result.name },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
    });

    return success({ id: result.id });

  } catch (err) {
    logger.error('Erro ao criar recurso', err as Error);
    return error('Internal server error');
  }
}
```

### Checklist para Novos Handlers

- [ ] Importar `logAuditAsync`, `getIpFromEvent`, `getUserAgentFromEvent`
- [ ] Identificar ação apropriada
- [ ] Chamar `logAuditAsync` após ação bem-sucedida
- [ ] Incluir `organizationId`, `userId`, `action`, `resourceType`
- [ ] Incluir `resourceId` e `details` quando relevante
- [ ] Incluir `ipAddress` e `userAgent`
- [ ] Testar que handler funciona mesmo se auditoria falhar

---


## 13. Error Monitoring

### Sistema de Monitoramento de Erros

O sistema possui monitoramento centralizado de erros para rastreamento e análise.

### Componentes

#### Frontend Error Reporter
Localização: `src/lib/error-reporter.ts`

```typescript
import { reportError } from '@/lib/error-reporter';

// Reportar erro
reportError(error, {
  context: 'SecurityScan',
  userId: user.sub,
  organizationId: org.id,
  metadata: { scanId: scan.id }
});
```

#### Backend Error Aggregator
Localização: `backend/src/handlers/monitoring/error-aggregator.ts`

Lambda: `evo-uds-v3-production-error-aggregator`

### CloudFormation Stack

Localização: `cloudformation/error-monitoring-stack.yaml`

Componentes:
- DynamoDB table para armazenar erros
- Lambda para agregação
- CloudWatch alarms
- SNS topics para notificações

### Setup Script

```bash
# Deploy error monitoring stack
bash scripts/setup-error-monitoring.sh
```

### Boas Práticas

1. **Sempre reportar erros críticos** - Usar `reportError()` em catch blocks
2. **Incluir contexto** - Adicionar informações úteis para debugging
3. **Não incluir dados sensíveis** - Sanitizar antes de reportar
4. **Usar níveis apropriados** - error, warning, info

---


## 14. Bash Command Guidelines

### 🚨 Evitar Erros de Sintaxe em Comandos Shell

### ⛔ Erros Comuns a Evitar

#### 1. Erro `cmdand dquote>` - Aspas não fechadas

```bash
# ❌ ERRADO - Aspas não fechadas
aws lambda wait function-updated --function-name my-function &&echo "Ready!"cmdand dquote>

# ✅ CORRETO - Cada comando em linha separada
aws lambda wait function-updated --function-name my-function
echo "Ready!"

# ✅ CORRETO - Com && mas com espaços
aws lambda wait function-updated --function-name my-function && echo "Ready!"
```

#### 2. Erro de `&&` colado ao comando

```bash
# ❌ ERRADO - && colado
command1&&command2

# ✅ CORRETO - Espaços ao redor de &&
command1 && command2
```

#### 3. Erro de continuação de linha `\`

```bash
# ❌ ERRADO - Espaço após \
aws lambda update-function-code \ 
  --function-name my-function

# ✅ CORRETO - Nada após \
aws lambda update-function-code \
  --function-name my-function
```

### ✅ Boas Práticas

#### 1. Comandos Longos - Usar Continuação de Linha

```bash
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-validate-azure-credentials \
  --layers "arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:47" \
  --environment "Variables={NODE_PATH=/opt/nodejs/node_modules}" \
  --region us-east-1
```

#### 2. Múltiplos Comandos - Usar Linhas Separadas

```bash
aws lambda update-function-code --function-name my-function --zip-file fileb://code.zip
aws lambda wait function-updated --function-name my-function
echo "Deploy complete!"
```

#### 3. Comandos Encadeados - Espaços Obrigatórios

```bash
# ✅ CORRETO - Espaços ao redor de && e ||
command1 && command2 && command3
command1 || echo "Failed"
```

#### 4. Variáveis em Strings - Usar Aspas Duplas

```bash
# ✅ CORRETO - Variáveis em aspas duplas
FUNCTION_NAME="evo-uds-v3-production-validate-azure-credentials"
aws lambda invoke --function-name "$FUNCTION_NAME" output.json
```

#### 5. JSON em Linha de Comando - Usar Aspas Simples

```bash
# ✅ CORRETO - JSON em aspas simples
aws lambda invoke \
  --function-name my-function \
  --payload '{"key": "value"}' \
  output.json
```

### 🔧 Como Recuperar de Erros

#### Erro `dquote>` ou `quote>`
O terminal está esperando fechar aspas.

1. **Fechar as aspas:** Digite `"` ou `'` e pressione Enter
2. **Cancelar:** Pressione `Ctrl+C`

#### Erro `>`
O terminal está esperando mais input.

1. **Cancelar:** Pressione `Ctrl+C`
2. **Completar:** Se era continuação de linha, complete o comando

### 📋 Checklist Antes de Executar

- [ ] Todas as aspas estão fechadas (`"..."` ou `'...'`)
- [ ] Espaços ao redor de `&&`, `||`, `|`
- [ ] Nenhum espaço após `\` em continuação de linha
- [ ] Variáveis entre aspas duplas: `"$VAR"`
- [ ] JSON em aspas simples: `'{"key": "value"}'`
- [ ] Comando não foi colado com caracteres invisíveis

### 🛠️ Comandos AWS Comuns - Formato Correto

#### Lambda - Atualizar Configuração

```bash
# ✅ CORRETO - Apenas layers (quando vars já estão configuradas)
aws lambda update-function-configuration \
  --function-name my-function \
  --layers "arn:aws:lambda:us-east-1:123456789:layer:my-layer:1" \
  --region us-east-1

# ✅ CORRETO - Environment com JSON file
echo '{"Variables":{"NODE_PATH":"/opt/nodejs/node_modules"}}' > /tmp/env.json
aws lambda update-function-configuration \
  --function-name my-function \
  --environment file:///tmp/env.json \
  --region us-east-1
```

**REGRAS para --environment:**
1. **NUNCA** use variáveis vazias (ex: `DATABASE_URL=`)
2. **NUNCA** use `$VAR` dentro de `Variables={}`
3. **PREFIRA** usar apenas `--layers` quando vars já estão configuradas
4. **USE** formato JSON com aspas simples para múltiplas variáveis
5. **USE** `file://` para configurações complexas

#### Lambda - Atualizar Código

```bash
aws lambda update-function-code \
  --function-name evo-uds-v3-production-NOME \
  --zip-file fileb:///tmp/lambda.zip \
  --region us-east-1
```

#### Lambda - Aguardar Atualização

```bash
aws lambda wait function-updated \
  --function-name evo-uds-v3-production-NOME \
  --region us-east-1
```

#### API Gateway - Deploy

```bash
aws apigateway create-deployment \
  --rest-api-id 3l66kn0eaj \
  --stage-name prod \
  --region us-east-1
```

---


## 15. Multi-tenancy & Security

### Isolamento de Dados

**TODAS** as queries ao banco de dados DEVEM filtrar por `organization_id`.

```typescript
// ✅ CORRETO - Sempre filtrar por organizationId
const credentials = await prisma.awsCredential.findMany({
  where: { organizationId },
});

// ❌ ERRADO - Expõe dados de outras organizações
const credentials = await prisma.awsCredential.findMany();
```

### Obter Organization ID

```typescript
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';

const user = getUserFromEvent(event);
const organizationId = getOrganizationId(user);
```

### Impersonation (Super Admin)

Super admins podem impersonar outras organizações usando header `X-Impersonate-Organization`.

```typescript
import { getOrganizationIdWithImpersonation } from '../../lib/auth.js';

const organizationId = getOrganizationIdWithImpersonation(event, user);
```

### Rate Limiting

Implementar rate limiting em handlers críticos:

```typescript
import { checkRateLimit } from '../../lib/rate-limit.js';

// Verificar rate limit (10 req/min)
const rateLimitKey = `mfa-verify:${user.sub}`;
const allowed = await checkRateLimit(rateLimitKey, 10, 60);

if (!allowed) {
  return error('Too many attempts. Try again in 15 minutes.', 429);
}
```

### Input Validation

Sempre validar input com Zod:

```typescript
import { z } from 'zod';

const schema = z.object({
  tenantId: z.string().uuid(),
  clientId: z.string().uuid(),
  clientSecret: z.string().min(1),
});

const validation = schema.safeParse(body);
if (!validation.success) {
  return error('Invalid input', 400);
}

const { tenantId, clientId, clientSecret } = validation.data;
```

### Sanitização de Logs

Nunca logar dados sensíveis:

```typescript
// ❌ ERRADO - Loga senha
logger.info('User login', { email, password });

// ✅ CORRETO - Não loga dados sensíveis
logger.info('User login', { email });
```

---

## 16. Testing Guidelines

### Tipos de Testes

1. **Unit Tests** - Lógica pura, sem dependências externas
2. **Integration Tests** - Testes com banco de dados real
3. **E2E Tests** - Testes completos do fluxo

### ⛔ PROIBIDO: Mocks em Testes de Integração

```typescript
// ❌ ERRADO - Mockar serviços reais
jest.mock('@azure/identity');

// ✅ CORRETO - Usar serviços reais ou sandbox
const credentials = new ClientSecretCredential(
  process.env.TEST_AZURE_TENANT_ID,
  process.env.TEST_AZURE_CLIENT_ID,
  process.env.TEST_AZURE_CLIENT_SECRET
);
```

### Estrutura de Testes

```typescript
describe('Handler Name', () => {
  beforeAll(async () => {
    // Setup (criar dados de teste)
  });

  afterAll(async () => {
    // Cleanup (remover dados de teste)
  });

  it('should handle valid input', async () => {
    const result = await handler(validEvent, context);
    expect(result.statusCode).toBe(200);
  });

  it('should reject invalid input', async () => {
    const result = await handler(invalidEvent, context);
    expect(result.statusCode).toBe(400);
  });
});
```

### Executar Testes

```bash
# Unit tests
npm test --prefix backend

# Integration tests
npm run test:integration --prefix backend

# E2E tests
npm run test:e2e
```

---

## 17. Deployment Checklist

### Antes de Deploy

- [ ] Código compilado sem erros (`npm run build`)
- [ ] Testes passando (`npm test`)
- [ ] TypeScript check sem erros (`npx tsc --noEmit`)
- [ ] Lint sem erros (`npm run lint`)
- [ ] Variáveis de ambiente configuradas
- [ ] Secrets configurados no AWS Secrets Manager
- [ ] Documentação atualizada

### Deploy Backend (Lambda)

- [ ] Backend compilado (`npm run build --prefix backend`)
- [ ] ZIP criado com estrutura correta
- [ ] Imports ajustados (../../lib/ → ./lib/)
- [ ] Lambda code atualizado
- [ ] Lambda configuration atualizada (handler path)
- [ ] Layer atualizado se necessário
- [ ] Aguardar `function-updated`
- [ ] Testar invocação
- [ ] Verificar logs CloudWatch

### Deploy Frontend

- [ ] Frontend compilado (`npm run build`)
- [ ] Assets copiados para S3
- [ ] CloudFront invalidado
- [ ] Testar URL pública
- [ ] Verificar CORS
- [ ] Testar autenticação

### Deploy API Gateway

- [ ] Endpoint criado com CORS
- [ ] Método POST com Cognito authorizer
- [ ] Permissão Lambda adicionada
- [ ] Deploy no stage `prod`
- [ ] Testar endpoint
- [ ] Verificar logs

### Deploy CloudFormation

- [ ] Template validado
- [ ] Template deployado (S3 ou Frontend)
- [ ] CloudFront invalidado
- [ ] URL acessível
- [ ] Clientes notificados

---

## 18. Troubleshooting Guide

### Lambda Errors

#### 502 Bad Gateway
**Causa:** Handler não encontrado ou erro de import  
**Solução:** Verificar handler path e estrutura do ZIP

#### 504 Gateway Timeout
**Causa:** Lambda em VPC sem NAT Gateway  
**Solução:** Verificar NAT Gateway e route tables

#### "Cannot find module"
**Causa:** Dependência faltando no layer ou ZIP  
**Solução:** Atualizar layer ou incluir dependência no ZIP

#### "PrismaClientInitializationError"
**Causa:** Prisma Client não gerado ou DATABASE_URL incorreta  
**Solução:** Gerar Prisma Client e verificar DATABASE_URL

### API Gateway Errors

#### 403 Forbidden (OPTIONS)
**Causa:** CORS não configurado  
**Solução:** Configurar OPTIONS com headers CORS

#### 500 "Cannot read properties of undefined"
**Causa:** Permissão Lambda incorreta  
**Solução:** Adicionar permissão com path completo

#### 401 Unauthorized
**Causa:** Token JWT inválido ou expirado  
**Solução:** Fazer logout e login novamente

### Database Errors

#### "Can't reach database server"
**Causa:** DATABASE_URL incorreta ou Lambda fora da VPC  
**Solução:** Verificar DATABASE_URL e VPC configuration

#### "Connection timeout"
**Causa:** Security Group não permite conexão  
**Solução:** Verificar Security Group rules

---

## 19. Best Practices Summary

### Code Quality

1. **TypeScript Strict Mode** - Sempre usar strict mode
2. **Error Handling** - Sempre usar try/catch
3. **Input Validation** - Sempre validar com Zod
4. **Logging** - Usar logger estruturado
5. **Audit Logging** - Registrar ações importantes

### Security

1. **Multi-tenancy** - Sempre filtrar por organizationId
2. **Rate Limiting** - Implementar em handlers críticos
3. **Input Sanitization** - Validar e sanitizar input
4. **No Secrets in Code** - Usar AWS Secrets Manager
5. **CORS** - Configurar corretamente

### Performance

1. **Connection Pooling** - Reusar conexões Prisma
2. **Caching** - Usar cache quando apropriado
3. **Async Operations** - Usar async/await
4. **Lambda Cold Start** - Minimizar dependências
5. **VPC** - Usar NAT Gateway para acesso externo

### Maintainability

1. **Documentation** - Documentar código complexo
2. **Naming Conventions** - Usar nomes descritivos
3. **Code Organization** - Separar por categoria
4. **DRY Principle** - Não repetir código
5. **SOLID Principles** - Seguir princípios SOLID

---

## 20. Quick Reference

### Comandos Úteis

```bash
# Build
npm run build
npm run build --prefix backend

# Test
npm test
npm test --prefix backend

# Deploy Frontend
npm run build
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"

# Deploy Lambda
# (Ver seção 7 para processo completo)

# Deploy API Gateway
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1

# Logs
aws logs tail /aws/lambda/FUNCTION_NAME --follow --region us-east-1

# Invoke Lambda
aws lambda invoke --function-name FUNCTION_NAME --payload '{}' output.json --region us-east-1
```

### Links Importantes

- **Frontend**: https://evo.ai.udstec.io
- **API**: https://api-evo.ai.udstec.io
- **CloudFormation Template**: https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml
- **AWS Console**: https://console.aws.amazon.com
- **Cognito Console**: https://console.aws.amazon.com/cognito

### Contatos

- **DevOps Team**: devops@udstec.io
- **Support**: support@udstec.io

---

## Changelog

### 2026-01-15 - v2.0
- Consolidação completa de todas as steering rules
- Adicionado seção de Multi-tenancy & Security
- Adicionado seção de Testing Guidelines
- Adicionado seção de Deployment Checklist
- Adicionado seção de Troubleshooting Guide
- Adicionado seção de Best Practices Summary
- Adicionado seção de Quick Reference

### 2026-01-12 - v1.0
- Versão inicial das steering rules individuais

---

**Fim do Documento**

