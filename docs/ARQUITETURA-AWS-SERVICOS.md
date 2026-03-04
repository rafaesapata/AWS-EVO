# EVO Platform — Arquitetura & Serviços AWS

> Plataforma multi-cloud de gestão de segurança, custos e compliance para AWS e Azure.
> Arquitetura 100% serverless com 194+ Lambda functions organizadas em 8 domínios.

---

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USUÁRIOS                                      │
│                    (Browser / React SPA)                                 │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     AWS CloudFront (CDN)                                 │
│              + WAFv2 (Rate Limit, SQLi, XSS, Bad Inputs)                │
│              + ACM Certificate (TLS 1.2+)                               │
│              + OAI (Origin Access Identity)                              │
├──────────────┬───────────────────────────────────────────────────────────┤
│  /static/*   │  /api/*                                                   │
│  S3 Origin   │  API Gateway Origin                                       │
└──────┬───────┴──────────┬────────────────────────────────────────────────┘
       │                  │
       ▼                  ▼
┌──────────────┐  ┌───────────────────────────────────────────────────────┐
│  S3 Bucket   │  │         API Gateway (REST, Regional)                  │
│  (Frontend)  │  │         + Cognito Authorizer                          │
│  React SPA   │  │         + Throttling (1000 rps / 2000 burst)          │
└──────────────┘  └──────────────────────┬────────────────────────────────┘
                                         │
                                         ▼
                  ┌───────────────────────────────────────────────────────┐
                  │              194 Lambda Functions (ARM64)              │
                  │              Node.js 20.x + TypeScript                │
                  │              esbuild bundling                         │
                  │              VPC-attached (Private Subnets)           │
                  ├───────────────────────────────────────────────────────┤
                  │  Lambda Layer: Prisma Client + Zod + Azure SDK        │
                  └────┬──────┬──────┬──────┬──────┬──────┬──────────────┘
                       │      │      │      │      │      │
          ┌────────────┘      │      │      │      │      └────────────┐
          ▼                   ▼      ▼      ▼      ▼                   ▼
   ┌─────────────┐    ┌──────────┐ ┌────┐ ┌────┐ ┌──────┐    ┌──────────┐
   │ RDS Proxy   │    │ Bedrock  │ │SES │ │SNS │ │  S3  │    │ Redis    │
   │     ↓       │    │ Claude 3 │ │    │ │    │ │      │    │ElastiCache│
   │ RDS Postgres│    │ Sonnet   │ │    │ │    │ │      │    │          │
   │ 15.x       │    └──────────┘ └────┘ └────┘ └──────┘    └──────────┘
   └─────────────┘
```

---

## Serviços AWS Utilizados

### 1. Compute & Serverless

| Serviço | Uso | Detalhes |
|---------|-----|----------|
| **AWS Lambda** | 194 handlers em 8 domínios | ARM64 (Graviton), Node.js 20.x, 256MB default, 30s timeout default |
| **Lambda Layers** | Dependências compartilhadas | Prisma Client, Zod, Azure SDK, compatível com arm64 |

**Configuração Lambda:**
- Arquitetura: `arm64` (Graviton) — melhor custo/performance
- Bundling: `esbuild` (minify, target es2022)
- VPC: Todas as funções em subnets privadas
- External (Layer): `@prisma/client`, `.prisma/client`
- AWS SDK: bundled pelo esbuild em cada Lambda (não está no External)

**Domínios de Handlers (194 funções):**

| Domínio | Qtd | Diretórios | Funções Principais |
|---------|-----|------------|-------------------|
| Security | 28 | `handlers/security/` | security-scan, compliance-scan, guardduty-findings |
| Cloud | 26 | `handlers/aws/`, `handlers/azure/`, `handlers/cloud/` | save-aws-credentials, validate-azure-credentials, resource-inventory |
| Cost | 17 | `handlers/cost/`, `handlers/ml/` | cost-analysis, fetch-daily-costs, waste-detection |
| Auth | 12 | `handlers/auth/`, `handlers/profiles/`, `handlers/user/` | mfa-enroll, mfa-verify-login, self-register, webauthn |
| Monitoring | 20 | `handlers/monitoring/`, `handlers/dashboard/` | fetch-cloudwatch-metrics, endpoint-monitoring, alert-rules |
| Operations | 43 | `handlers/jobs/`, `handlers/admin/`, `handlers/system/`, `handlers/maintenance/`, `handlers/debug/` | cleanup-stuck-scans, run-migration, manage-organizations |
| AI | 20 | `handlers/ai/`, `handlers/kb/`, `handlers/reports/` | bedrock-chat, generate-response, check-proactive-notifications |
| Integrations | 25 | `handlers/notifications/`, `handlers/integrations/`, `handlers/data/`, `handlers/storage/`, `handlers/websocket/`, `handlers/organizations/`, `handlers/license/` | jira-integration, email-notifications, query-table |


### 2. Networking & API

| Serviço | Uso | Detalhes |
|---------|-----|----------|
| **Amazon VPC** | Isolamento de rede | CIDR 10.0.0.0/16, 3 tiers de subnets (public, private, database) |
| **API Gateway** | REST API (Regional) | Cognito Authorizer, throttling 1000 rps, CORS configurado |
| **NAT Gateway** | Acesso internet para Lambdas | Single NAT em subnet pública, EIP associado |
| **Internet Gateway** | Acesso público | Subnets públicas para NAT e ALB |
| **VPC Endpoints** | Acesso privado a serviços | Gateway endpoints para S3 e DynamoDB (sem custo) |
| **Route 53** | DNS | Domínio customizado `evo.nuevacore.com` |
| **Elastic IP** | IP fixo | Associado ao NAT Gateway |

**Topologia de Rede:**
```
VPC (10.0.0.0/16)
├── Public Subnets (2 AZs)     → NAT Gateway, Internet Gateway
├── Private Subnets (2 AZs)    → Lambda functions, RDS Proxy
└── Database Subnets (2 AZs)   → RDS PostgreSQL (isolado)
```

**Security Groups:**
- `lambda-sg`: Egress all (Lambda → internet via NAT)
- `rds-sg`: Ingress 5432 apenas de lambda-sg e rds-proxy-sg
- `rds-proxy-sg`: Ingress 5432 de lambda-sg, Egress 5432 para rds-sg
- `redis-sg`: Ingress 6379 do VPC CIDR

### 3. Database & Cache

| Serviço | Uso | Detalhes |
|---------|-----|----------|
| **RDS PostgreSQL** | Banco principal | v15.x, Graviton (db.t4g.small), gp3, encrypted, Multi-AZ (prod) |
| **RDS Proxy** | Connection pooling | PostgreSQL engine, TLS required, 100% max connections |
| **ElastiCache Redis** | Cache de métricas e sessões | Redis 7.1, cache.t3.micro, LRU eviction, snapshot diário |
| **Secrets Manager** | Credenciais do banco | Auto-geração de senha, rotação, integração com RDS |
| **SSM Parameter Store** | Configurações | Endpoints Redis, tokens, configurações de OAuth |

**RDS PostgreSQL — Configuração:**
- Engine: PostgreSQL 15.x
- Instance: db.t4g.small (Graviton ARM)
- Storage: gp3, encrypted, auto-scaling até 1TB
- Multi-AZ: Sim (produção) / Não (sandbox)
- Backup: 30 dias (prod) / 7 dias (sandbox)
- Performance Insights: Habilitado
- Enhanced Monitoring: 60s interval
- CloudWatch Logs: postgresql, upgrade
- Deletion Protection: Sim (produção)

**Prisma Schema — 50+ modelos incluindo:**
- `organizations`, `profiles` (multi-tenant)
- `aws_credentials`, `azure_credentials` (multi-cloud)
- `findings`, `security_scans`, `compliance_checks` (segurança)
- `daily_costs`, `waste_detections` (custos)
- `alerts`, `alert_rules`, `monitored_endpoints` (monitoramento)
- `remediation_tickets`, `jira_tickets` (integrações)
- `licenses`, `license_seat_assignments` (licenciamento)
- `webauthn_credentials`, `mfa_factors` (autenticação)
- `audit_logs`, `cloudtrail_events` (auditoria)
- `ai_notifications`, `ai_notification_rules` (IA)

### 4. Autenticação & Autorização

| Serviço | Uso | Detalhes |
|---------|-----|----------|
| **Cognito User Pool** | Gestão de usuários | Email login, MFA opcional (SOFTWARE_TOKEN), custom attributes |
| **Cognito User Pool Client** | OAuth 2.0 | SRP + Password auth, token revocation, 60min access/id tokens |
| **Cognito Identity Pool** | Credenciais federadas | Authenticated/Unauthenticated roles |
| **Cognito User Pool Domain** | Hosted UI | `{project}-{env}-{account}` |
| **IAM Roles** | Permissões | Lambda execution role, Cognito authenticated role, RDS Proxy role, RDS Monitoring role, CodeBuild/Pipeline roles |

**Custom Attributes Cognito:**
- `custom:organization_id` — Multi-tenancy
- `custom:organization_name`
- `custom:roles` — RBAC
- `custom:tenant_id`

**MFA — Implementação Híbrida:**
- Cognito: `SOFTWARE_TOKEN_MFA` (opcional)
- Local: TOTP via `crypto.randomBytes(20)`, salvo em `mfa_factors` (PostgreSQL)
- WebAuthn: Credenciais FIDO2 em `webauthn_credentials`

### 5. Storage (S3)

| Bucket | Uso | Configuração |
|--------|-----|-------------|
| **Lambda Code** | Código das funções | Versionado, encrypted (AES256), lifecycle 30d old versions |
| **Frontend** | React SPA | Website hosting, OAI para CloudFront |
| **Attachments** | Arquivos de tickets/reports | Versionado, encrypted, CORS, lifecycle 90d old versions |
| **SAM Artifacts** | Artefatos de deploy | Versionado, encrypted, lifecycle 30d |
| **CI/CD Artifacts** | Pipeline artifacts | Versionado, encrypted, lifecycle 30d |
| **Public Templates** | CloudFormation templates | Acesso público para onboarding |

**Presigned URLs:** Usados para upload/download seguro de attachments.

### 6. AI & Machine Learning

| Serviço | Uso | Detalhes |
|---------|-----|----------|
| **Amazon Bedrock** | IA generativa | Claude 3 Sonnet (`anthropic.claude-3-sonnet-20240229-v1:0`) |

**Casos de Uso Bedrock:**
- Chat interativo com contexto da plataforma (`bedrock-chat`)
- Análise de findings de segurança (`generate-response`)
- Notificações proativas baseadas em padrões (`check-proactive-notifications`)
- Recomendações de otimização de custos
- Geração de relatórios com insights

**Configuração:**
- Timeout: 120s (handlers AI)
- Memória: 512MB (handlers AI)
- APIs: `InvokeModel`, `InvokeModelWithResponseStream`

### 7. CDN & Segurança de Borda

| Serviço | Uso | Detalhes |
|---------|-----|----------|
| **CloudFront** | CDN global | HTTP/2+3, PriceClass_100, OAI, custom error pages (SPA) |
| **WAFv2** | Firewall de aplicação | Scope CLOUDFRONT, 4 regras |
| **ACM** | Certificados TLS | TLS 1.2+ (SNI), domínio customizado |

**Regras WAF:**

| Prioridade | Regra | Tipo |
|-----------|-------|------|
| 1 | AWSManagedRulesCommonRuleSet | Managed |
| 2 | AWSManagedRulesKnownBadInputsRuleSet | Managed |
| 3 | AWSManagedRulesSQLiRuleSet | Managed |
| 4 | Rate Limit (2000 req/5min por IP) | Custom (Block 429) |

**CloudFront Behaviors:**
- Default (`/*`): S3 Origin (frontend)
- `/api/*`: API Gateway Origin (backend)

### 8. Monitoramento & Observabilidade

| Serviço | Uso | Detalhes |
|---------|-----|----------|
| **CloudWatch Metrics** | Métricas de infra | API Gateway, RDS, Lambda, custom metrics |
| **CloudWatch Logs** | Logs centralizados | Lambda execution logs, RDS logs, API Gateway logs |
| **CloudWatch Alarms** | Alertas automáticos | CPU, storage, connections, 5XX errors, latency |
| **CloudWatch Dashboards** | Visualização | Dashboard principal + Error Monitoring dashboard |
| **CloudWatch Logs Insights** | Queries de log | Análise de erros frontend/backend |
| **X-Ray** | Tracing distribuído | Via `aws-xray-sdk-core` nas Lambdas |

**Alarmes Configurados:**

| Alarme | Métrica | Threshold | Período |
|--------|---------|-----------|---------|
| API 5XX Errors | 5XXError | > 10 | 5min × 2 |
| API Latency | Latency | > 5000ms | 5min × 3 |
| DB CPU | CPUUtilization | > 80% | 5min × 3 |
| DB Connections | DatabaseConnections | > 80 | 5min × 2 |
| DB Storage | FreeStorageSpace | < 5GB | 5min × 2 |
| Lambda 5XX | Custom metric | > 5 | 5min × 1 |
| Frontend Errors | Custom metric | > 10 | 5min × 1 |
| Critical Error Rate | Custom metric | > 20 | 1min × 3 |
| Frontend Critical | Custom metric | > 3 | 1min × 1 |

### 9. Mensageria & Notificações

| Serviço | Uso | Detalhes |
|---------|-----|----------|
| **SNS** | Alertas e notificações | Topics para error alerts, pipeline notifications |
| **SES** | Email transacional | Domínio `nuevacore.com`, templates de email |
| **EventBridge** | Eventos de pipeline | Captura FAILED/SUCCEEDED do CodePipeline |

**SNS Topics:**
- `evo-{env}-alerts` — Alertas de infraestrutura
- `evo-{env}-error-alerts` — Alertas de erros 5XX
- `evo-sam-pipeline-notifications-{env}` — Status do pipeline

**SES:**
- From: `evo@nuevacore.com`
- Tipos: alertas de segurança, relatórios, notificações de compliance
- Templates: HTML customizados via `report-email-templates.ts`

### 10. CI/CD & Deploy

| Serviço | Uso | Detalhes |
|---------|-----|----------|
| **CodePipeline** | Orquestração de deploy | Source → Build → Deploy |
| **CodeBuild** | Build e deploy | ARM container, LARGE compute, 120min timeout |
| **CodeStar Connections** | GitHub integration | Webhook para detectar pushes |
| **CloudFormation** | Infrastructure as Code | Nested stacks, SAM transform |
| **SAM** | Deploy serverless | esbuild bundling, layer management |

**Pipeline Flow:**
```
GitHub Push → CodeStar Connection → CodePipeline
    ↓
CodeBuild (ARM, LARGE):
    1. npm install + prisma generate
    2. Validate Lambda imports (circular deps)
    3. Detect changed files (git diff)
    4. Determine deploy strategy
    5. sam build (esbuild, arm64)
    6. sam deploy (CloudFormation)
    7. Frontend: S3 sync + CloudFront invalidation
```

**Estratégia de Deploy:**

| Mudança | Estratégia | Tempo |
|---------|-----------|-------|
| `backend/` ou `sam/` | FULL_SAM | ~10min |
| `src/`, `public/` | FRONTEND_ONLY | ~2min |
| `docs/`, `scripts/` | SKIP | ~1min |

**Ambientes:**

| Ambiente | Account ID | Branch | Domínio |
|----------|-----------|--------|---------|
| Sandbox | 971354623291 | `sandbox` | evo.sandbox.nuevacore.com |
| Production | 523115032346 | `production` | evo.nuevacore.com |

### 11. Segurança (Serviços Monitorados nas Contas dos Clientes)

Os handlers de segurança da plataforma consultam estes serviços nas contas AWS dos clientes via `sts:AssumeRole`:

| Serviço AWS | Uso na Plataforma |
|-------------|-------------------|
| **IAM** | Análise de políticas, usuários, roles, MFA status |
| **STS** | AssumeRole cross-account para acessar contas dos clientes |
| **Security Hub** | Agregação de findings de segurança |
| **GuardDuty** | Detecção de ameaças |
| **Inspector** | Vulnerabilidades em containers e EC2 |
| **Macie** | Descoberta e proteção de dados sensíveis |
| **Config** | Compliance de recursos |
| **CloudTrail** | Auditoria de API calls |
| **Access Analyzer** | Análise de políticas de acesso |
| **KMS** | Gestão de chaves de criptografia |
| **Well-Architected Tool** | Review de arquitetura (5 pilares) |

### 12. Recursos de Infraestrutura Monitorados (Contas dos Clientes)

Os handlers de cloud/cost consultam estes serviços para inventário e análise de custos:

| Serviço AWS | Uso na Plataforma |
|-------------|-------------------|
| **EC2** | Inventário de instâncias, security groups, VPCs |
| **S3** | Análise de buckets, políticas, criptografia |
| **RDS** | Instâncias de banco, backups, snapshots |
| **Lambda** | Inventário de funções |
| **ECS/EKS** | Containers e Kubernetes |
| **ECR** | Container registry |
| **EFS** | File systems |
| **ElastiCache** | Clusters Redis/Memcached |
| **Elastic Load Balancing** | ALB/NLB |
| **CloudFront** | Distribuições CDN |
| **Route 53** | DNS zones e records |
| **API Gateway / API Gateway V2** | APIs REST e HTTP |
| **CloudFormation** | Stacks de infraestrutura |
| **CloudWatch / CloudWatch Logs** | Métricas e logs |
| **Cost Explorer** | Análise de custos e forecast |
| **Savings Plans** | Compromissos de desconto |
| **Organizations** | Multi-account management |
| **Backup** | Políticas de backup |
| **WAFv2** | Web Application Firewall |
| **Network Firewall** | Firewall de rede |
| **OpenSearch** | Clusters de busca |
| **Redshift** | Data warehouse |
| **Kinesis / Firehose** | Streaming de dados |
| **Glue** | ETL e catálogo de dados |
| **Step Functions** | Orquestração de workflows |
| **EventBridge** | Event bus |
| **SQS** | Filas de mensagens |
| **SNS** | Tópicos de notificação |
| **DynamoDB** | Tabelas NoSQL |
| **SSM** | Parameter Store, automação |


### 13. Integração Azure (Multi-Cloud)

A plataforma também monitora recursos Azure dos clientes:

| Serviço Azure | SDK | Uso |
|---------------|-----|-----|
| Azure AD (Entra ID) | `@azure/identity` | OAuth 2.0, Service Principal |
| Azure Advisor | `@azure/arm-advisor` | Recomendações de otimização |
| Azure Compute | `@azure/arm-compute` | VMs, discos, availability sets |
| Azure Network | `@azure/arm-network` | VNets, NSGs, firewalls, load balancers |
| Azure Storage | `@azure/arm-storage` | Storage accounts, blobs |
| Azure SQL | `@azure/arm-sql` | Bancos SQL Server |
| Azure Key Vault | `@azure/arm-keyvault` | Gestão de segredos |
| Azure Monitor | `@azure/arm-monitor` | Métricas e diagnósticos |
| Azure Security | `@azure/arm-security` | Security Center / Defender |
| Azure Policy | `@azure/arm-policy` | Compliance de políticas |
| Azure Resources | `@azure/arm-resources` | Resource groups, inventário |
| Azure Cost Management | `@azure/arm-costmanagement` | Análise de custos |
| Azure Consumption | `@azure/arm-consumption` | Uso e budgets |
| Azure Authorization | `@azure/arm-authorization` | RBAC, role assignments |
| Azure Front Door | `@azure/arm-frontdoor` | CDN e WAF |
| Azure API Management | `@azure/arm-apimanagement` | APIs |

---

## Bibliotecas Compartilhadas (backend/src/lib/)

| Lib | Serviço AWS | Função |
|-----|-------------|--------|
| `database.ts` | RDS (via Prisma) | Connection pooling, queries |
| `bedrock-client.ts` | Bedrock | Chat AI, análise de findings |
| `email-service.ts` | SES | Envio de emails transacionais |
| `redis-client.ts` | ElastiCache | Cache distribuído |
| `metrics-cache.ts` | ElastiCache | Cache de métricas CloudWatch |
| `aws-helpers.ts` | STS, múltiplos | AssumeRole, clients cross-account |
| `azure-helpers.ts` | — | Clients Azure, token management |
| `auth.ts` | Cognito | Extração de user/org do token |
| `audit-service.ts` | — (PostgreSQL) | Audit logging |
| `token-encryption.ts` | — | Criptografia de tokens OAuth |
| `tracing.ts` | X-Ray | Distributed tracing |
| `distributed-rate-limiter.ts` | ElastiCache | Rate limiting via Redis |
| `circuit-breaker.ts` | — | Resiliência para APIs externas |
| `cloudwatch-batch.ts` | CloudWatch | Batch de métricas customizadas |
| `security-engine/` | Múltiplos | Engine de scanning de segurança |
| `waf/` | WAFv2 | Monitoramento de WAF |
| `cost/` | Cost Explorer | Análise e otimização de custos |
| `ml-analysis/` | Bedrock | Análise ML de padrões |

---

## Padrões Arquiteturais

### Multi-Tenancy
- Isolamento por `organization_id` em todas as queries
- `getOrganizationId(user)` obrigatório em todos os handlers
- Impersonation para operações admin: `getOrganizationIdWithImpersonation(event, user)`

### Segurança
- Credenciais encrypted em Secrets Manager
- Token encryption para OAuth/Azure secrets (AES-256)
- Audit logging obrigatório em handlers que modificam dados
- Rate limiting distribuído via Redis
- CORS headers + security headers em todas as respostas
- WAF com regras managed + rate limiting

### Performance
- RDS Proxy para connection pooling (Lambda → PostgreSQL)
- Redis cache para métricas e dados frequentes
- Lambda Layer para dependências compartilhadas (~reduz cold start)
- ARM64 Graviton para melhor custo/performance
- Presigned URLs para transferência de arquivos grandes
- esbuild minification em todas as Lambdas

### Resiliência
- Multi-AZ RDS em produção
- Backups automáticos (30 dias produção)
- Circuit breaker para APIs externas
- Retry com exponential backoff
- Deletion protection em recursos críticos

### Observabilidade
- Structured logging (JSON)
- CloudWatch metrics + alarms + dashboards
- X-Ray tracing distribuído
- Audit trail em PostgreSQL
- Error monitoring centralizado com SNS alerts

---

## Custos Estimados por Serviço (Referência)

| Serviço | Tier | Custo Estimado/mês |
|---------|------|-------------------|
| Lambda (194 funções) | ARM64, 256MB | Variável por uso |
| RDS PostgreSQL | db.t4g.small, Multi-AZ | ~$50-100 |
| RDS Proxy | PostgreSQL | ~$20-40 |
| ElastiCache Redis | cache.t3.micro | ~$15 |
| NAT Gateway | Single | ~$35 + data |
| CloudFront | PriceClass_100 | Variável por tráfego |
| API Gateway | REST API | Variável por requests |
| S3 | Múltiplos buckets | < $5 |
| Secrets Manager | 2-3 secrets | < $2 |
| CloudWatch | Logs + Metrics + Alarms | ~$10-20 |
| WAFv2 | 4 regras | ~$10 |
| CodeBuild | ARM LARGE | Por minuto de build |
| Bedrock (Claude 3) | Por token | Variável por uso |
| SES | Email | < $1 |

---

## Diagrama de Fluxo de Dados

```
                    ┌──────────────┐
                    │   Cliente    │
                    │  (Browser)   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  CloudFront  │──── WAFv2 (filtragem)
                    │  + ACM TLS   │
                    └──┬───────┬───┘
                       │       │
              ┌────────▼──┐ ┌──▼────────────┐
              │ S3 Frontend│ │ API Gateway   │
              │ (React)    │ │ + Cognito Auth│
              └────────────┘ └──────┬────────┘
                                    │
                             ┌──────▼────────┐
                             │   Lambda      │
                             │  (handler)    │
                             └──┬──┬──┬──┬───┘
                                │  │  │  │
                    ┌───────────┘  │  │  └───────────┐
                    ▼              │  │               ▼
             ┌──────────┐         │  │        ┌──────────┐
             │ RDS Proxy │         │  │        │  Redis   │
             │     ↓     │         │  │        │ (cache)  │
             │PostgreSQL │         │  │        └──────────┘
             └──────────┘         │  │
                           ┌──────┘  └──────┐
                           ▼                ▼
                    ┌──────────┐     ┌──────────┐
                    │ Bedrock  │     │ STS      │
                    │ (Claude) │     │AssumeRole│
                    └──────────┘     └────┬─────┘
                                          │
                                   ┌──────▼──────┐
                                   │ Conta AWS/  │
                                   │ Azure do    │
                                   │ Cliente     │
                                   └─────────────┘
```

---

*Documento gerado a partir da análise completa do repositório AWS-EVO.*
*Última atualização: Fevereiro 2026*
