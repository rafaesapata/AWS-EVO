# EVO UDS Backend (AWS Lambda)

Backend AWS nativo para o sistema EVO UDS, substituindo as Supabase Edge Functions.

## 🏗️ Arquitetura

- **Runtime**: Node.js 20.x
- **Language**: TypeScript
- **Database**: PostgreSQL (RDS) via Prisma ORM
- **Auth**: AWS Cognito (JWT validation)
- **Deployment**: AWS Lambda via CDK

## 📁 Estrutura

```
backend/
├── src/
│   ├── handlers/          # Lambda handlers (entry points)
│   │   ├── security/      # Security-related functions
│   │   ├── cost/          # FinOps functions
│   │   ├── organizations/ # Organization management
│   │   └── ...
│   ├── lib/               # Shared utilities
│   │   ├── response.ts    # HTTP response helpers
│   │   ├── auth.ts        # Cognito authentication
│   │   ├── database.ts    # Prisma client
│   │   └── aws-helpers.ts # AWS SDK helpers
│   └── types/             # TypeScript types
├── prisma/
│   └── schema.prisma      # Database schema
├── package.json
└── tsconfig.json
```

## 🚀 Desenvolvimento

### Pré-requisitos

- Node.js 20.x
- PostgreSQL (local ou RDS)
- AWS CLI configurado

### Setup

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# Gerar cliente Prisma
npx prisma generate

# Aplicar migrações
npx prisma migrate dev
```

### Build

```bash
# Build para produção
npm run build

# Build em modo watch
npm run dev
```

### Testes

```bash
# Rodar testes
npm test

# Testes com coverage
npm run test:coverage
```

## 📦 Deploy

O deploy é feito automaticamente via AWS CDK no diretório `infra/`.

```bash
cd ../infra
cdk deploy EvoUds-dev-Api
```

## 🔐 Autenticação

Todas as rotas protegidas requerem um token JWT do Cognito no header:

```
Authorization: Bearer <JWT_TOKEN>
```

O token deve conter os claims:
- `sub`: User ID
- `email`: User email
- `custom:organization_id`: Organization UUID
- `custom:tenant_id`: Tenant UUID (opcional)
- `custom:roles`: JSON array de roles

## 🗄️ Banco de Dados

### Conexão

A conexão com o banco é feita via Prisma ORM. A URL de conexão é configurada via variável de ambiente:

```
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

### Migrações

```bash
# Criar nova migração
npx prisma migrate dev --name migration_name

# Aplicar migrações em produção
npx prisma migrate deploy

# Resetar banco (DEV ONLY!)
npx prisma migrate reset
```

### Prisma Studio

```bash
# Abrir interface visual do banco
npx prisma studio
```

## 🔧 Variáveis de Ambiente

```bash
# Database
DATABASE_URL=postgresql://...

# AWS (opcional, usa IAM role da Lambda)
AWS_REGION=us-east-1

# Environment
NODE_ENV=development|production
```

## 📝 Criando Nova Lambda

1. Criar handler em `src/handlers/<categoria>/<nome>.ts`:

```typescript
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();
    
    // Sua lógica aqui
    
    return success({ message: 'Success' });
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Internal error');
  }
}
```

2. Adicionar rota no `infra/lib/api-stack.ts`

3. Build e deploy

## 🐛 Debugging

### Logs Locais

```bash
# Ver logs de build
npm run build

# Ver logs de testes
npm test -- --verbose
```

### Logs na AWS

```bash
# Ver logs em tempo real
aws logs tail /aws/lambda/evo-uds-dev-SecurityScan --follow

# Ver logs de um período
aws logs tail /aws/lambda/evo-uds-dev-SecurityScan \
  --since 1h \
  --format short
```

## 📊 Performance

### Otimizações Implementadas

- ✅ Connection pooling do Prisma
- ✅ Lambda layers para dependências compartilhadas
- ✅ Minificação do código (esbuild)
- ✅ Tree-shaking automático
- ✅ Reutilização de conexões entre invocações

### Métricas Alvo

- Cold start: < 2s
- Warm invocation: < 500ms
- Memory usage: < 256MB (média)

## 🔒 Segurança

### Práticas Implementadas

- ✅ Validação de JWT via Cognito Authorizer
- ✅ Multi-tenant isolation via organization_id
- ✅ Secrets via AWS Secrets Manager
- ✅ Least privilege IAM roles
- ✅ VPC isolation para Lambdas
- ✅ Encryption at rest (RDS)
- ✅ Encryption in transit (TLS)

### Checklist de Segurança

- [ ] Nunca logar dados sensíveis
- [ ] Sempre validar input do usuário
- [ ] Sempre filtrar por organization_id
- [ ] Usar prepared statements (Prisma faz isso)
- [ ] Validar permissões antes de operações críticas

## 📚 Recursos

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)

---

**Mantido por**: KIRO AI  
**Última atualização**: 2025-12-11
