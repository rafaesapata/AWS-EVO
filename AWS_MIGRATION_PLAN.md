# Plano de Migração: Supabase → AWS Nativo

## Status: 🚧 EM ANDAMENTO

## Visão Geral
Migração completa do sistema `evo-uds-main` de Supabase para arquitetura 100% AWS nativa, mantendo todas as funcionalidades existentes.

---

## 📊 ANÁLISE COMPLETA DO SISTEMA ATUAL

### Frontend (React + Vite + TypeScript)
- **Componentes**: 50+ componentes React
- **Páginas**: 15 páginas principais
- **Integrações**: Supabase Auth, Supabase Functions, Supabase Database
- **Dependências críticas**: `@supabase/supabase-js@2.76.1`

### Backend (Supabase Functions)
**Total: 65 Edge Functions identificadas**

#### Categorias de Funções:
1. **Segurança & Compliance** (15 funções)
   - security-scan, compliance-scan, guardduty-scan
   - drift-detection, validate-waf-security
   - iam-behavior-analysis, iam-deep-analysis
   - lateral-movement-detection, anomaly-detection
   - detect-anomalies, threat-detection

2. **FinOps & Custos** (8 funções)
   - finops-copilot, finops-copilot-v2
   - cost-optimization, budget-forecast
   - generate-cost-forecast, fetch-daily-costs
   - ri-sp-analyzer, ml-waste-detection, waste-detection

3. **Monitoramento & Métricas** (7 funções)
   - aws-realtime-metrics, fetch-cloudwatch-metrics
   - fetch-cloudtrail, analyze-cloudtrail
   - endpoint-monitor-check, health-check
   - process-events

4. **Relatórios & Exportação** (5 funções)
   - generate-pdf-report, generate-excel-report
   - generate-security-pdf, security-scan-pdf-export
   - kb-export-pdf

5. **Jobs & Agendamento** (6 funções)
   - execute-scheduled-job, process-background-jobs
   - scheduled-scan-executor, scheduled-view-refresh
   - daily-license-validation, cleanup-expired-external-ids

6. **Gestão de Contas & Organizações** (5 funções)
   - create-organization-account, sync-organization-accounts
   - sync-resource-inventory, initial-data-load
   - cloudformation-webhook

7. **Autenticação & Usuários** (5 funções)
   - create-user, admin-manage-user
   - webauthn-register, webauthn-authenticate
   - verify-tv-token

8. **Alertas & Notificações** (5 funções)
   - auto-alerts, check-alert-rules
   - intelligent-alerts-analyzer, send-notification
   - get-communication-logs

9. **Knowledge Base & AI** (4 funções)
   - kb-ai-suggestions, kb-analytics-dashboard
   - generate-ai-insights, ai-prioritization

10. **Licenciamento** (3 funções)
    - check-license, validate-license
    - well-architected-scan

11. **Integrações Externas** (2 funções)
    - create-jira-ticket, validate-aws-credentials

12. **Outros** (5 funções)
    - get-findings, get-security-posture, get-security-scan
    - generate-remediation-script, predict-incidents

### Banco de Dados (PostgreSQL)
**Total: 120+ migrações SQL**

#### Tabelas Principais Identificadas:
- `findings` - Achados de segurança
- `aws_credentials` - Credenciais AWS
- `organizations` - Organizações multi-tenant
- `aws_accounts` - Contas AWS gerenciadas
- `security_scans` - Histórico de scans
- `compliance_checks` - Verificações de compliance
- `guardduty_findings` - Achados do GuardDuty
- `background_jobs` - Jobs agendados
- `knowledge_base_articles` - Base de conhecimento
- `licenses` - Licenças do sistema
- `users` (via Supabase Auth)
- `profiles` - Perfis de usuários
- `webauthn_credentials` - Credenciais WebAuthn

#### Features do Banco:
- **RLS (Row Level Security)**: Isolamento multi-tenant
- **Functions**: RPCs customizados (get_user_organization, etc.)
- **Views**: Views materializadas para performance
- **Triggers**: Automações e auditoria
- **Indexes**: Otimizações de query

---

## 🎯 ARQUITETURA ALVO AWS

### 1. Frontend
```
React App (S3 + CloudFront)
├── S3 Bucket (static hosting)
├── CloudFront Distribution (CDN)
├── Route 53 (DNS)
└── ACM Certificate (HTTPS)
```

### 2. Autenticação
```
Amazon Cognito
├── User Pool
│   ├── Custom attributes (organization_id, tenant_id, roles)
│   ├── MFA (TOTP + SMS)
│   ├── Password policies
│   └── Lambda triggers (pre-signup, post-confirmation)
├── Identity Pool (opcional para acesso direto a AWS)
└── App Client (frontend)
```

### 3. APIs & Backend
```
API Gateway (REST) + Lambda
├── /api/security/*
│   ├── POST /compliance-scan → Lambda
│   ├── POST /guardduty-scan → Lambda
│   ├── POST /security-scan → Lambda
│   └── GET /findings → Lambda
├── /api/cost/*
│   ├── POST /finops-copilot → Lambda
│   ├── GET /daily-costs → Lambda
│   └── POST /budget-forecast → Lambda
├── /api/organizations/*
│   ├── POST /create-account → Lambda
│   ├── GET /accounts → Lambda
│   └── POST /sync-accounts → Lambda
├── /api/jobs/*
│   ├── POST /execute → Lambda
│   └── GET /status → Lambda
├── /api/reports/*
│   ├── POST /generate-pdf → Lambda
│   └── POST /generate-excel → Lambda
└── /api/auth/*
    ├── POST /login → Cognito
    ├── POST /logout → Cognito
    └── POST /refresh → Cognito
```

### 4. Banco de Dados
```
Amazon RDS PostgreSQL (ou Aurora PostgreSQL)
├── Multi-AZ deployment
├── Automated backups (35 dias)
├── Encryption at rest (KMS)
├── Enhanced monitoring
├── Performance Insights
└── Read replicas (opcional)
```

### 5. Armazenamento
```
Amazon S3
├── Bucket: reports-{env}
├── Bucket: exports-{env}
├── Bucket: cloudtrail-logs-{env}
└── Lifecycle policies
```

### 6. Jobs Agendados
```
EventBridge Scheduler
├── Rule: daily-license-validation (cron)
├── Rule: drift-detection (cron)
├── Rule: endpoint-monitor (cron)
├── Rule: scheduled-scans (cron)
└── Target: Lambda functions
```

### 7. Segredos & Configuração
```
AWS Systems Manager
├── Parameter Store
│   ├── /app/{env}/database/host
│   ├── /app/{env}/database/port
│   └── /app/{env}/api/base-url
└── Secrets Manager
    ├── /app/{env}/database/credentials
    ├── /app/{env}/jira/api-key
    └── /app/{env}/external-apis/*
```

### 8. Observabilidade
```
CloudWatch
├── Logs
│   ├── /aws/lambda/security-scan
│   ├── /aws/lambda/compliance-scan
│   └── ... (todas as Lambdas)
├── Metrics
│   ├── Custom: ScanDuration
│   ├── Custom: FindingsCount
│   └── Lambda metrics
└── Alarms
    ├── Lambda errors
    ├── API Gateway 5xx
    └── RDS connections
```

---

## 📋 PLANO DE IMPLEMENTAÇÃO

### FASE 1: Preparação e Infraestrutura Base ✅ CONCLUÍDA
- [x] Análise completa do código existente
- [x] Criar estrutura do projeto backend
- [x] Configurar IaC (AWS CDK)
- [x] Provisionar RDS PostgreSQL
- [x] Migrar schema do banco (Prisma)
- [x] Configurar Cognito User Pool
- [x] Criar helpers e utilitários
- [x] Implementar primeira Lambda (security-scan)

### FASE 2: Migração de Autenticação
- [ ] Implementar client Cognito no frontend
- [ ] Migrar fluxo de login/logout
- [ ] Implementar refresh de tokens
- [ ] Migrar MFA (TOTP)
- [ ] Migrar WebAuthn
- [ ] Testar todos os fluxos de auth

### FASE 3: Migração de APIs - Lote 1 (Segurança)
- [ ] security-scan → Lambda
- [ ] compliance-scan → Lambda
- [ ] guardduty-scan → Lambda
- [ ] drift-detection → Lambda
- [ ] Configurar API Gateway routes
- [ ] Testar endpoints

### FASE 4: Migração de APIs - Lote 2 (FinOps)
- [ ] finops-copilot → Lambda
- [ ] cost-optimization → Lambda
- [ ] budget-forecast → Lambda
- [ ] ml-waste-detection → Lambda
- [ ] Testar endpoints

### FASE 5: Migração de APIs - Lote 3 (Gestão)
- [ ] create-organization-account → Lambda
- [ ] sync-organization-accounts → Lambda
- [ ] admin-manage-user → Lambda
- [ ] Testar endpoints

### FASE 6: Migração de APIs - Lote 4 (Relatórios & Jobs)
- [ ] generate-pdf-report → Lambda
- [ ] generate-excel-report → Lambda
- [ ] execute-scheduled-job → Lambda
- [ ] Configurar EventBridge
- [ ] Testar jobs agendados

### FASE 7: Migração de APIs - Lote 5 (Restante)
- [ ] Migrar funções restantes
- [ ] Testar todas as integrações

### FASE 8: Refatoração do Frontend
- [ ] Remover @supabase/supabase-js
- [ ] Criar client HTTP AWS
- [ ] Atualizar todas as chamadas de API
- [ ] Atualizar componentes de auth
- [ ] Testar todos os fluxos

### FASE 9: Storage & Jobs
- [ ] Migrar uploads para S3
- [ ] Configurar presigned URLs
- [ ] Migrar jobs agendados para EventBridge
- [ ] Testar uploads/downloads

### FASE 10: Testes & Validação
- [ ] Testes de integração
- [ ] Testes de carga
- [ ] Validação de segurança
- [ ] Validação de compliance
- [ ] Testes de regressão

### FASE 11: Deploy & Cutover
- [ ] Deploy em ambiente de staging
- [ ] Testes em staging
- [ ] Migração de dados de produção
- [ ] Deploy em produção
- [ ] Monitoramento pós-deploy

---

## 🔧 TECNOLOGIAS & FERRAMENTAS

### Backend
- **Runtime**: Node.js 20.x (Lambda)
- **Language**: TypeScript
- **Build**: esbuild / tsup
- **ORM**: Prisma (ou Knex + SQL puro)
- **AWS SDK**: @aws-sdk/client-* (v3)

### IaC
- **Framework**: AWS CDK (TypeScript)
- **Stacks**:
  - NetworkStack (VPC, Subnets, Security Groups)
  - DatabaseStack (RDS)
  - AuthStack (Cognito)
  - ApiStack (API Gateway + Lambdas)
  - StorageStack (S3)
  - MonitoringStack (CloudWatch)

### Frontend
- **Mantém**: React, Vite, TypeScript, Shadcn
- **Remove**: @supabase/supabase-js
- **Adiciona**: 
  - amazon-cognito-identity-js (ou AWS Amplify Auth)
  - axios (ou fetch nativo)

---

## 📊 MÉTRICAS DE SUCESSO

### Funcionalidade
- ✅ 100% das features funcionando
- ✅ Zero regressões
- ✅ Mesma UX

### Performance
- ✅ Latência de API < 500ms (p95)
- ✅ Tempo de carregamento < 2s
- ✅ Queries de banco < 100ms (p95)

### Segurança
- ✅ Autenticação funcionando
- ✅ Multi-tenant isolation mantido
- ✅ Encryption at rest e in transit
- ✅ Compliance mantido (LGPD, GDPR, etc.)

### Custo
- 🎯 Custo mensal < $500 (dev/staging)
- 🎯 Custo mensal < $2000 (produção)

---

## ⚠️ RISCOS & MITIGAÇÕES

### Risco 1: Perda de funcionalidade RLS
**Mitigação**: Implementar lógica de tenant isolation na camada de serviço (Lambda)

### Risco 2: Latência aumentada
**Mitigação**: Usar Lambda em VPC, connection pooling, caching

### Risco 3: Complexidade de deploy
**Mitigação**: IaC completo com CDK, CI/CD automatizado

### Risco 4: Custo inesperado
**Mitigação**: Budgets, alarmes, otimização de Lambdas

---

## 📝 PRÓXIMOS PASSOS IMEDIATOS

1. ✅ Criar estrutura do backend (`backend/`)
2. ✅ Configurar projeto CDK (`infra/`)
3. ✅ Criar schema Prisma baseado nas migrações
4. ✅ Implementar primeira Lambda (security-scan)
5. ✅ Configurar API Gateway
6. ⏳ Implementar Lambdas restantes (compliance-scan, guardduty-scan, etc.)
7. ⏳ Testar primeira integração end-to-end
8. ⏳ Criar cliente Cognito no frontend
9. ⏳ Refatorar componentes do frontend

---

**Última atualização**: 2025-12-11
**Responsável**: KIRO AI
**Status**: 🚧 Fase 1 em andamento
