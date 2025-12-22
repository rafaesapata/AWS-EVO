# 🚀 EVO UDS - AWS Native Architecture

Sistema de gerenciamento unificado de segurança, compliance e FinOps para AWS.

**Status**: ✅ **57% Completo** | 26/65 Lambdas | **Pronto para Deploy**

---

## 📊 Status do Projeto

```
┌─────────────────────────────────────────────────────────────┐
│                    PROGRESSO GERAL                          │
├─────────────────────────────────────────────────────────────┤
│  Infraestrutura:  ████████████████████ 100% ✅              │
│  Banco de Dados:  ████████████████████ 100% ✅              │
│  Lambdas Core:    ████████████████████ 100% ✅              │
│  Lambdas Total:   ████████░░░░░░░░░░░░  40% 🚧              │
│  Frontend:        ░░░░░░░░░░░░░░░░░░░░   0% ⏳              │
│  Documentação:    ████████████████████ 100% ✅              │
│  Testes:          ░░░░░░░░░░░░░░░░░░░░   0% ⏳              │
├─────────────────────────────────────────────────────────────┤
│  TOTAL GERAL:     ████████████░░░░░░░░  57% 🚧              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Funcionalidades Implementadas

### ✅ Segurança (9/15 - 60%)
- Security scanning completo
- Compliance checking (CIS, LGPD, PCI-DSS, GDPR, HIPAA)
- GuardDuty integration
- Drift detection
- CloudTrail analysis
- Well-Architected Framework scan
- Validação de credenciais AWS

### ✅ FinOps (5/8 - 63%)
- FinOps Copilot com IA
- Cost optimization recommendations
- Budget forecasting
- Daily cost tracking
- ML-based waste detection

### ✅ Monitoramento (4/7 - 57%)
- Health checks
- CloudWatch metrics
- Auto alerts
- Alert rules engine

### ✅ Gestão (3/5 - 60%)
- Organization account creation
- Account synchronization
- User management (CRUD)

### ✅ Relatórios (2/5 - 40%)
- PDF report generation
- Excel/CSV export

### ✅ Knowledge Base (1/5 - 20%)
- AI-powered suggestions

### ✅ Outros
- Job scheduling
- Notifications (Email, SMS, SNS)
- License validation

---

## 🏗️ Arquitetura

### Infraestrutura (AWS CDK)
```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                            │
│              S3 + CloudFront (CDN)                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   API GATEWAY                           │
│              REST API + Cognito Auth                    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  LAMBDA FUNCTIONS                       │
│         26 Functions (Security, Cost, etc.)             │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 RDS POSTGRESQL                          │
│            Multi-AZ, Encrypted, Backups                 │
└─────────────────────────────────────────────────────────┘
```

### Stacks CDK
1. **NetworkStack** - VPC, Subnets, Security Groups
2. **DatabaseStack** - RDS PostgreSQL Multi-AZ
3. **AuthStack** - Cognito User Pool
4. **ApiStack** - API Gateway + 26 Lambdas
5. **FrontendStack** - S3 + CloudFront
6. **MonitoringStack** - CloudWatch Dashboards

---

## 🚀 Quick Start

### Pré-requisitos
- Node.js 20+
- AWS CLI configurado
- AWS CDK instalado
- Conta AWS com permissões adequadas

### 1. Instalar Dependências

```bash
# Backend
cd backend && npm install

# Infraestrutura
cd ../infra && npm install

# Scripts
cd ../scripts && npm install
```

### 2. Configurar Variáveis de Ambiente

```bash
# Backend
cp backend/.env.example backend/.env
# Editar backend/.env com suas configurações
```

### 3. Bootstrap CDK (primeira vez apenas)

```bash
cd infra
cdk bootstrap
```

### 4. Deploy da Infraestrutura

```bash
# Deploy completo (dev)
npm run deploy:dev

# Ou deploy stack por stack
cdk deploy EvoUds-dev-Network
cdk deploy EvoUds-dev-Database
cdk deploy EvoUds-dev-Auth
cdk deploy EvoUds-dev-Api
cdk deploy EvoUds-dev-Frontend
cdk deploy EvoUds-dev-Monitoring
```

### 5. Aplicar Migrações do Banco

```bash
cd ../backend

# Obter DATABASE_URL do Secrets Manager
export DATABASE_URL="postgresql://..."

# Aplicar migrações
npx prisma migrate deploy

# Gerar Prisma Client
npx prisma generate
```

### 6. Criar Usuário de Teste

```bash
# Obter User Pool ID
export USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Auth \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

# Criar usuário
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username test@example.com \
  --user-attributes Name=email,Value=test@example.com Name=email_verified,Value=true \
  --temporary-password TempPass123!

# Definir senha permanente
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username test@example.com \
  --password TestPass123! \
  --permanent
```

### 7. Testar API

```bash
# Obter API URL
export API_URL=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

echo "API URL: $API_URL"

# Fazer login e obter token (usar Postman ou script)
# Testar endpoint
curl -H "Authorization: Bearer $TOKEN" \
  "${API_URL}security/findings"
```

---

## 📁 Estrutura do Projeto

```
evo-uds-main/
├── backend/                    # Backend Lambda Functions
│   ├── src/
│   │   ├── handlers/          # Lambda handlers (26)
│   │   │   ├── security/      # 9 security functions
│   │   │   ├── cost/          # 5 cost functions
│   │   │   ├── monitoring/    # 4 monitoring functions
│   │   │   ├── organizations/ # 2 org functions
│   │   │   ├── admin/         # 1 admin function
│   │   │   ├── reports/       # 2 report functions
│   │   │   ├── jobs/          # 1 job function
│   │   │   ├── notifications/ # 1 notification function
│   │   │   ├── license/       # 1 license function
│   │   │   └── kb/            # 1 KB function
│   │   ├── lib/               # Shared libraries
│   │   │   ├── auth.ts        # Cognito auth helpers
│   │   │   ├── database.ts    # Prisma client
│   │   │   ├── response.ts    # HTTP responses
│   │   │   └── aws-helpers.ts # AWS SDK helpers
│   │   └── types/             # TypeScript types
│   ├── prisma/
│   │   └── schema.prisma      # Database schema (25+ models)
│   └── package.json
│
├── infra/                      # AWS CDK Infrastructure
│   ├── lib/
│   │   ├── network-stack.ts   # VPC, Subnets, SGs
│   │   ├── database-stack.ts  # RDS PostgreSQL
│   │   ├── auth-stack.ts      # Cognito
│   │   ├── api-stack.ts       # API Gateway + Lambdas
│   │   ├── frontend-stack.ts  # S3 + CloudFront
│   │   └── monitoring-stack.ts # CloudWatch
│   ├── bin/
│   │   └── infra.ts           # CDK App entry point
│   └── package.json
│
├── src/                        # Frontend (React + Vite)
│   ├── components/
│   ├── pages/
│   ├── integrations/
│   │   └── supabase/          # ⚠️ To be migrated to AWS
│   └── ...
│
├── docs/                       # Documentation
│   ├── AWS_MIGRATION_PLAN.md
│   ├── DEPLOY_GUIDE.md
│   ├── FINAL_STATUS.md
│   ├── SESSION_PROGRESS_UPDATE.md
│   ├── NEW_LAMBDAS_REFERENCE.md
│   └── ...
│
└── scripts/                    # Utility scripts
    └── ...
```

---

## 📚 Documentação

### Guias Principais
- [📋 Plano de Migração](AWS_MIGRATION_PLAN.md) - Visão geral da migração
- [🚀 Guia de Deploy](DEPLOY_GUIDE.md) - Passo a passo para deploy
- [📊 Status Final](FINAL_STATUS.md) - Status detalhado do projeto
- [🆕 Novas Lambdas](NEW_LAMBDAS_REFERENCE.md) - Referência das 10 novas funções
- [📈 Progresso da Sessão](SESSION_PROGRESS_UPDATE.md) - Última atualização

### Referências Técnicas
- [🏗️ Arquitetura](ARCHITECTURE.md) - Arquitetura detalhada
- [✅ Checklist de Validação](VALIDATION_CHECKLIST.md) - Validação pós-deploy
- [⚡ Referência Rápida](QUICK_REFERENCE.md) - Comandos úteis

---

## 🔧 Desenvolvimento

### Adicionar Nova Lambda

1. Copiar template:
```bash
cp backend/src/handlers/_templates/lambda-template.ts \
   backend/src/handlers/categoria/nova-funcao.ts
```

2. Implementar lógica

3. Adicionar rota no `infra/lib/api-stack.ts`:
```typescript
const novaFuncaoLambda = createLambda('NovaFuncao', 'handlers/categoria/nova-funcao.handler');
categoriaResource.addResource('nova-funcao').addMethod('POST',
  new apigateway.LambdaIntegration(novaFuncaoLambda),
  { authorizer }
);
```

4. Deploy:
```bash
cd infra && cdk deploy EvoUds-dev-Api
```

### Executar Localmente

```bash
# Backend (testes)
cd backend
npm test

# Frontend
cd ..
npm run dev
```

### Logs

```bash
# Ver logs de uma Lambda
aws logs tail /aws/lambda/evo-uds-dev-SecurityScan --follow

# Ver todos os logs
aws logs tail /aws/lambda/evo-uds-dev- --follow
```

---

## 🧪 Testes

### Testar Lambdas

```bash
cd backend
npm test
```

### Testar Infraestrutura

```bash
cd infra
npm test
```

### Validação Pós-Deploy

Seguir checklist em [VALIDATION_CHECKLIST.md](VALIDATION_CHECKLIST.md)

---

## 📊 Monitoramento

### CloudWatch Dashboard

Acesse: https://console.aws.amazon.com/cloudwatch/home#dashboards:name=evo-uds-dev

### Métricas Principais
- Lambda invocations
- Lambda errors
- Lambda duration
- API Gateway requests
- API Gateway 4xx/5xx errors
- RDS connections
- RDS CPU utilization

### Alarmes Configurados
- Lambda errors > 10 em 5 minutos
- API Gateway 5xx > 5% em 5 minutos
- RDS CPU > 80% por 10 minutos
- RDS storage < 10GB

---

## 💰 Custos Estimados

### Desenvolvimento
```
RDS t3.micro:              $15/mês
Lambda (26 funções):       $8/mês
API Gateway:               $10/mês
CloudWatch:                $5/mês
S3 + CloudFront:           $5/mês
NAT Gateway:               $5/mês
────────────────────────────────
TOTAL:                     $48/mês
```

### Produção (Estimado)
```
RDS t3.medium Multi-AZ:    $120/mês
Lambda (65 funções):       $30/mês
API Gateway:               $80/mês
CloudWatch:                $20/mês
S3 + CloudFront:           $30/mês
NAT Gateway:               $15/mês
────────────────────────────────
TOTAL:                     $295/mês
```

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Add nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

---

## 📝 Licença

Proprietary - EVO UDS

---

## 🆘 Suporte

- **Documentação**: Ver pasta `docs/`
- **Issues**: Abrir issue no repositório
- **Email**: suporte@evouds.com

---

## 🎯 Roadmap

### Fase Atual: Backend (57% ✅)
- [x] Infraestrutura AWS (100%)
- [x] 26 Lambda Functions (40%)
- [ ] 39 Lambda Functions restantes (60%)

### Próxima Fase: Frontend (0% ⏳)
- [ ] Cliente Cognito
- [ ] Cliente HTTP AWS
- [ ] Refatoração de componentes
- [ ] Migração completa

### Fase Final: Produção (0% ⏳)
- [ ] Testes automatizados
- [ ] CI/CD pipeline
- [ ] Deploy em produção
- [ ] Migração de dados
- [ ] Desativação do Supabase

---

**Última Atualização**: 2025-12-11  
**Versão**: 2.0  
**Status**: 🚀 **Pronto para Deploy**
