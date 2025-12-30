# EVO Platform - Arquitetura Detalhada do Sistema

## 1. Visão Geral

O **EVO Platform** é uma plataforma SaaS multi-tenant para gerenciamento, monitoramento e otimização de infraestrutura AWS. O sistema oferece funcionalidades de segurança, compliance, análise de custos, detecção de anomalias e inteligência artificial.

### 1.1 URLs de Produção
- **Frontend**: https://evo.ai.udstec.io
- **API**: https://api-evo.ai.udstec.io
- **Região AWS**: us-east-1
- **Conta AWS**: 383234048592

---

## 2. Stack Tecnológica

### 2.1 Frontend
| Tecnologia | Versão | Descrição |
|------------|--------|-----------|
| React | 18.x | Framework UI |
| TypeScript | 5.x | Linguagem |
| Vite | 5.x | Build tool |
| Tailwind CSS | 3.x | Estilização |
| shadcn/ui | - | Componentes UI |
| TanStack Query | 5.x | Gerenciamento de estado/cache |
| React Router | 6.x | Roteamento |
| Recharts | 2.x | Gráficos |
| i18next | - | Internacionalização (PT-BR/EN) |

### 2.2 Backend
| Tecnologia | Versão | Descrição |
|------------|--------|-----------|
| Node.js | 18.x | Runtime |
| TypeScript | 5.x | Linguagem |
| Prisma | 5.x | ORM |
| AWS Lambda | - | Serverless compute |
| AWS SDK v3 | - | Integração AWS |

### 2.3 Banco de Dados
| Tecnologia | Versão | Descrição |
|------------|--------|-----------|
| PostgreSQL | 15.10 | Banco relacional |
| AWS RDS | - | Managed database |
| ElastiCache Redis | 7.x | Cache distribuído |

### 2.4 Infraestrutura AWS
| Serviço | Descrição |
|---------|-----------|
| API Gateway | REST API com Cognito Authorizer |
| Lambda | 94 funções serverless |
| CloudFront | CDN para frontend |
| S3 | Storage de arquivos estáticos |
| Cognito | Autenticação e autorização |
| VPC | Rede privada isolada |
| NAT Gateway | Acesso internet para Lambdas |
| RDS | Banco PostgreSQL |
| ElastiCache | Redis para caching |
| CloudWatch | Logs e métricas |
| SES | Envio de emails |
| Bedrock | IA generativa (Claude) |

---

## 3. Arquitetura de Alto Nível

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                              │
                    ▼                              ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│      CloudFront (CDN)        │    │      API Gateway REST        │
│   evo.ai.udstec.io           │    │   api-evo.ai.udstec.io       │
│   Distribution: E1PY7U3VNT6P1R│    │   ID: 3l66kn0eaj             │
└──────────────────────────────┘    └──────────────────────────────┘
                    │                              │
                    ▼                              ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│         S3 Bucket            │    │     Cognito Authorizer       │
│  evo-uds-v3-production-      │    │   User Pool: us-east-1_      │
│  frontend-383234048592       │    │   qGmGkvmpL                  │
└──────────────────────────────┘    └──────────────────────────────┘
                                                   │
                                                   ▼
                              ┌──────────────────────────────────────┐
                              │         AWS Lambda Functions         │
                              │   94 handlers Node.js/TypeScript     │
                              │   Layer: evo-prisma-deps-layer:12    │
                              └──────────────────────────────────────┘
                                         │         │
                    ┌────────────────────┘         └────────────────────┐
                    ▼                                                   ▼
┌──────────────────────────────┐                    ┌──────────────────────────────┐
│      VPC (10.0.0.0/16)       │                    │     AWS Services             │
│  ┌─────────────────────────┐ │                    │  - STS (AssumeRole)          │
│  │   Private Subnets       │ │                    │  - CloudWatch                │
│  │   10.0.3.0/24 (us-east-1a)│                    │  - Cost Explorer             │
│  │   10.0.4.0/24 (us-east-1b)│                    │  - EC2, RDS, S3, etc.        │
│  └─────────────────────────┘ │                    │  - Bedrock (Claude AI)       │
│           │         │        │                    │  - SES (Email)               │
│           ▼         ▼        │                    └──────────────────────────────┘
│  ┌─────────────┐ ┌─────────┐ │
│  │ RDS Postgres│ │ Redis   │ │
│  │ Port 5432   │ │Port 6379│ │
│  └─────────────┘ └─────────┘ │
│           │                  │
│           ▼                  │
│  ┌─────────────────────────┐ │
│  │   NAT Gateway           │ │
│  │   (Internet access)     │ │
│  └─────────────────────────┘ │
└──────────────────────────────┘
```

---

## 4. Estrutura de Diretórios

```
evo-platform/
├── backend/                    # Backend Node.js/TypeScript
│   ├── src/
│   │   ├── handlers/          # 94 Lambda handlers organizados por domínio
│   │   │   ├── admin/         # Gestão de usuários e organizações
│   │   │   ├── ai/            # Integração com Bedrock/Claude
│   │   │   ├── auth/          # WebAuthn, MFA, TV tokens
│   │   │   ├── aws/           # Credenciais AWS
│   │   │   ├── cost/          # Análise de custos e FinOps
│   │   │   ├── data/          # Query genérico (query-table)
│   │   │   ├── integrations/  # Jira, webhooks
│   │   │   ├── jobs/          # Background jobs
│   │   │   ├── kb/            # Knowledge Base
│   │   │   ├── license/       # Licenciamento
│   │   │   ├── ml/            # Machine Learning
│   │   │   ├── monitoring/    # CloudWatch, endpoints, edge
│   │   │   ├── notifications/ # Alertas e notificações
│   │   │   ├── organizations/ # Multi-tenant
│   │   │   ├── profiles/      # Perfis de usuário
│   │   │   ├── reports/       # Exportação de relatórios
│   │   │   ├── security/      # Scans, compliance, GuardDuty
│   │   │   ├── storage/       # S3 operations
│   │   │   ├── system/        # Migrações, health
│   │   │   ├── user/          # Configurações de usuário
│   │   │   └── websocket/     # Real-time connections
│   │   ├── lib/               # Bibliotecas compartilhadas
│   │   │   ├── auth.ts        # Autenticação/autorização
│   │   │   ├── database.ts    # Prisma client
│   │   │   ├── redis-cache.ts # Cache managers
│   │   │   ├── aws-helpers.ts # STS AssumeRole
│   │   │   ├── response.ts    # HTTP responses
│   │   │   ├── logging.ts     # Structured logging
│   │   │   └── ...            # +40 libs
│   │   └── types/             # TypeScript types
│   └── prisma/
│       └── schema.prisma      # 50+ modelos de dados
├── src/                       # Frontend React/TypeScript
│   ├── components/            # Componentes reutilizáveis
│   │   ├── ui/               # shadcn/ui components
│   │   ├── dashboard/        # Widgets de dashboard
│   │   ├── admin/            # Componentes admin
│   │   └── ...
│   ├── pages/                # 41 páginas da aplicação
│   ├── hooks/                # Custom React hooks
│   ├── contexts/             # React contexts
│   ├── integrations/aws/     # API client
│   ├── lib/                  # Utilitários
│   └── i18n/                 # Traduções PT-BR/EN
├── infra/                    # AWS CDK (TypeScript)
│   ├── lib/                  # Stacks CDK
│   └── bin/                  # Entry point
├── cloudformation/           # Templates CloudFormation
├── scripts/                  # Scripts de deploy/manutenção
└── .kiro/steering/           # Regras de arquitetura para IA
```


---

## 5. Modelo de Dados (PostgreSQL/Prisma)

### 5.1 Entidades Principais (50+ modelos)

#### Multi-Tenancy
| Modelo | Descrição |
|--------|-----------|
| `Organization` | Organização/tenant principal |
| `Profile` | Perfil de usuário vinculado à organização |
| `User` | Usuário do sistema |

#### AWS & Credenciais
| Modelo | Descrição |
|--------|-----------|
| `AwsCredential` | Credenciais AWS (IAM ou AssumeRole) |
| `AwsAccount` | Contas AWS vinculadas |

#### Segurança
| Modelo | Descrição |
|--------|-----------|
| `Finding` | Achados de segurança |
| `SecurityScan` | Scans de segurança executados |
| `SecurityPosture` | Postura de segurança consolidada |
| `GuardDutyFinding` | Achados do GuardDuty |
| `ComplianceCheck` | Verificações de compliance |
| `ComplianceViolation` | Violações de compliance |
| `WellArchitectedScore` | Scores Well-Architected |
| `SecurityEvent` | Eventos de segurança |
| `SecurityFinding` | Findings de segurança |

#### CloudTrail & Auditoria
| Modelo | Descrição |
|--------|-----------|
| `CloudTrailEvent` | Eventos do CloudTrail |
| `CloudTrailAnalysis` | Análises de CloudTrail |
| `CloudTrailFetch` | Histórico de fetches |
| `AuditLog` | Logs de auditoria internos |
| `IAMBehaviorAnomaly` | Anomalias de comportamento IAM |

#### Custos & FinOps
| Modelo | Descrição |
|--------|-----------|
| `DailyCost` | Custos diários por conta |
| `WasteDetection` | Detecção de desperdício |
| `CostOptimization` | Recomendações de otimização |

#### Monitoramento
| Modelo | Descrição |
|--------|-----------|
| `MonitoredEndpoint` | Endpoints monitorados |
| `EndpointCheckHistory` | Histórico de checks |
| `MonitoredResource` | Recursos AWS monitorados |
| `ResourceMetric` | Métricas de recursos |
| `ResourceUtilizationML` | Análise ML de utilização |
| `EdgeService` | Serviços de borda (CloudFront, WAF, ALB) |
| `EdgeMetric` | Métricas de serviços de borda |

#### Drift & Inventário
| Modelo | Descrição |
|--------|-----------|
| `DriftDetection` | Detecções de drift |
| `DriftDetectionHistory` | Histórico de drift |
| `ResourceInventory` | Inventário de recursos |

#### Alertas & Notificações
| Modelo | Descrição |
|--------|-----------|
| `Alert` | Alertas gerados |
| `AlertRule` | Regras de alerta |
| `NotificationSettings` | Configurações de notificação |

#### Integrações
| Modelo | Descrição |
|--------|-----------|
| `JiraIntegration` | Configuração Jira |
| `JiraTicket` | Tickets criados |

#### Outros
| Modelo | Descrição |
|--------|-----------|
| `License` | Licenças do sistema |
| `KnowledgeBaseArticle` | Artigos da base de conhecimento |
| `BackgroundJob` | Jobs em background |
| `WebAuthnCredential` | Credenciais WebAuthn/Passkey |
| `CopilotInteraction` | Interações com IA |
| `TvDisplayToken` | Tokens para TV Dashboard |
| `Dashboard` | Dashboards customizados |
| `ReportExport` | Exportações de relatórios |

### 5.2 Multi-Tenancy

Todas as queries são filtradas por `organization_id` para garantir isolamento de dados:

```typescript
// Padrão obrigatório em todos os handlers
const user = getUserFromEvent(event);
const organizationId = getOrganizationId(user);

// Todas as queries incluem filtro
const data = await prisma.finding.findMany({
  where: { organization_id: organizationId }
});
```

---

## 6. API Gateway & Endpoints

### 6.1 Configuração
- **REST API ID**: `3l66kn0eaj`
- **Stage**: `prod`
- **Custom Domain**: `api-evo.ai.udstec.io`
- **Authorizer**: Cognito User Pools (`ez5xqt`)

### 6.2 Padrão de Endpoints
Todos os endpoints seguem o padrão:
```
POST /api/functions/{handler-name}
```

### 6.3 Principais Endpoints por Categoria

#### Segurança
| Endpoint | Descrição |
|----------|-----------|
| `security-scan` | Executa scan de segurança |
| `well-architected-scan` | Análise Well-Architected |
| `compliance-scan` | Verificação de compliance |
| `guardduty-scan` | Scan GuardDuty |
| `drift-detection` | Detecção de drift |
| `iam-behavior-analysis` | Análise comportamental IAM |
| `lateral-movement-detection` | Detecção de movimento lateral |
| `get-security-posture` | Postura de segurança |
| `get-findings` | Lista findings |

#### CloudTrail
| Endpoint | Descrição |
|----------|-----------|
| `fetch-cloudtrail` | Busca eventos CloudTrail |
| `analyze-cloudtrail` | Analisa eventos |
| `start-cloudtrail-analysis` | Inicia análise assíncrona |

#### Custos
| Endpoint | Descrição |
|----------|-----------|
| `fetch-daily-costs` | Custos diários |
| `cost-optimization` | Recomendações |
| `ml-waste-detection` | Detecção ML de desperdício |
| `ri-sp-analyzer` | Análise RI/Savings Plans |
| `budget-forecast` | Previsão de orçamento |
| `finops-copilot-v2` | Copilot FinOps com IA |

#### Monitoramento
| Endpoint | Descrição |
|----------|-----------|
| `fetch-cloudwatch-metrics` | Métricas CloudWatch |
| `fetch-edge-services` | Serviços de borda |
| `monitored-endpoints` | CRUD endpoints |
| `endpoint-monitor-check` | Verifica endpoints |

#### IA/ML
| Endpoint | Descrição |
|----------|-----------|
| `bedrock-chat` | Chat com Claude |
| `generate-ai-insights` | Insights IA |
| `detect-anomalies` | Detecção de anomalias |
| `predict-incidents` | Predição de incidentes |
| `intelligent-alerts-analyzer` | Análise inteligente |

#### Dados
| Endpoint | Descrição |
|----------|-----------|
| `query-table` | Query genérico para todas as tabelas |

#### Admin
| Endpoint | Descrição |
|----------|-----------|
| `create-cognito-user` | Cria usuário Cognito |
| `admin-manage-user` | Gerencia usuários |
| `manage-organizations` | Gerencia organizações |


---

## 7. Lambda Functions

### 7.1 Configuração Padrão
- **Runtime**: Node.js 18.x
- **Timeout**: 30-60 segundos
- **Memory**: 256-512 MB
- **VPC**: Sim (para acesso ao RDS/Redis)
- **Layer**: `evo-prisma-deps-layer:12`

### 7.2 Lambda Layer
O layer contém:
- `@prisma/client` (gerado para PostgreSQL)
- `.prisma/client` (binários rhel-openssl)
- `ioredis` (cliente Redis)
- `zod` (validação)

### 7.3 Padrão de Handler
```typescript
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // CORS preflight
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  // Autenticação e multi-tenancy
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  const prisma = getPrismaClient();
  
  // Implementação...
  return success({ data: result });
}
```

### 7.4 Total de Handlers: 94

#### Por Categoria:
| Categoria | Quantidade | Descrição |
|-----------|------------|-----------|
| security | 15 | Scans, compliance, GuardDuty |
| cost | 7 | FinOps, custos, waste |
| monitoring | 4 | CloudWatch, endpoints, edge |
| ml | 5 | Machine learning, anomalias |
| ai | 2 | Bedrock, chat |
| admin | 6 | Usuários, organizações |
| auth | 4 | WebAuthn, MFA, TV |
| jobs | 8 | Background jobs |
| kb | 7 | Knowledge base |
| data | 1 | Query genérico |
| integrations | 2 | Jira, webhooks |
| ... | ... | ... |

---

## 8. Autenticação & Autorização

### 8.1 AWS Cognito
- **User Pool ID**: `us-east-1_qGmGkvmpL`
- **Região**: us-east-1
- **Fluxo**: JWT tokens via Authorization header

### 8.2 Claims do Token
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "custom:organization_id": "org-uuid",
  "custom:roles": "[\"admin\",\"user\"]",
  "exp": 1234567890
}
```

### 8.3 WebAuthn/Passkeys
Suporte a autenticação biométrica via WebAuthn:
- `webauthn-register`: Registro de credencial
- `webauthn-authenticate`: Autenticação

### 8.4 TV Dashboard
Tokens especiais para exibição em TVs:
- `verify-tv-token`: Valida token de TV
- Tokens com expiração configurável

---

## 9. Cache (Redis)

### 9.1 Configuração
- **Endpoint**: `evo-uds-production-redis.uhyqcq.0001.use1.cache.amazonaws.com`
- **Porta**: 6379
- **Engine**: Redis 7.x

### 9.2 Cache Managers Especializados
```typescript
// Instâncias globais
export const cacheManager = new RedisCacheManager();
export const securityCache = new SecurityCacheManager(cacheManager);
export const costCache = new CostCacheManager(cacheManager);
export const metricsCache = new MetricsCacheManager(cacheManager);
export const edgeCache = new EdgeCacheManager(cacheManager);
```

### 9.3 TTLs por Tipo
| Tipo | TTL | Descrição |
|------|-----|-----------|
| Métricas 3h | 5 min | Dados recentes |
| Métricas 24h | 15 min | Dados diários |
| Métricas 7d | 1 hora | Dados semanais |
| Discovery | 5 min | Descoberta de recursos |
| Security findings | 5 min | Achados de segurança |
| Cost data | 30 min | Dados de custo |

### 9.4 Fallback
Se Redis não estiver disponível, usa cache em memória:
```typescript
if (!redisAvailable) {
  // Fallback para Map em memória
  const memoryCache = new Map<string, { value: any; expiry: number }>();
}
```

---

## 10. Integração com Contas AWS de Clientes

### 10.1 Modelo de Acesso
O sistema suporta dois modelos:
1. **IAM User**: Access Key + Secret Key (legado)
2. **AssumeRole**: Cross-account role assumption (recomendado)

### 10.2 AssumeRole Pattern
```typescript
// Credencial armazenada
{
  role_arn: "arn:aws:iam::CUSTOMER_ACCOUNT:role/EVO-Platform-Role",
  external_id: "evo-xxxx-xxxx"
}

// Assume role na conta do cliente
const stsClient = new STSClient({ region });
const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
  RoleArn: credential.role_arn,
  ExternalId: credential.external_id,
  RoleSessionName: 'evo-platform-session'
}));
```

### 10.3 CloudFormation Quick Connect
Template para criar role na conta do cliente:
```yaml
# public/cloudformation/evo-platform-role.yaml
Resources:
  EVOPlatformRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Statement:
          - Effect: Allow
            Principal:
              AWS: arn:aws:iam::383234048592:root
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                sts:ExternalId: !Ref ExternalId
```


---

## 11. Frontend - Páginas e Funcionalidades

### 11.1 Total de Páginas: 41

#### Dashboard & Overview
| Página | Rota | Descrição |
|--------|------|-----------|
| Dashboard | `/dashboard` | Visão geral consolidada |
| Index | `/` | Página principal |
| TVDashboard | `/tv-dashboard` | Dashboard para TVs |

#### Segurança
| Página | Rota | Descrição |
|--------|------|-----------|
| SecurityScans | `/security-scans` | Scans de segurança |
| SecurityPosture | `/security-posture` | Postura de segurança |
| WellArchitected | `/well-architected` | Análise Well-Architected |
| Compliance | `/compliance` | Verificações de compliance |
| ThreatDetection | `/threat-detection` | Detecção de ameaças |
| AttackDetection | `/attack-detection` | Detecção de ataques |
| AnomalyDetection | `/anomaly-detection` | Detecção de anomalias |
| CloudTrailAudit | `/cloudtrail-audit` | Auditoria CloudTrail |

#### Custos & FinOps
| Página | Rota | Descrição |
|--------|------|-----------|
| CostAnalysisPage | `/cost-analysis` | Análise de custos |
| CostOptimization | `/cost-optimization` | Otimização de custos |
| MLWasteDetection | `/ml-waste-detection` | Detecção ML de desperdício |
| RISavingsPlans | `/ri-savings-plans` | RI e Savings Plans |
| MonthlyInvoicesPage | `/monthly-invoices` | Faturas mensais |

#### Monitoramento
| Página | Rota | Descrição |
|--------|------|-----------|
| ResourceMonitoring | `/resource-monitoring` | Monitoramento de recursos |
| EndpointMonitoring | `/endpoint-monitoring` | Monitoramento de endpoints |
| EdgeMonitoring | `/edge-monitoring` | CloudFront, WAF, ALB |
| SystemMonitoring | `/system-monitoring` | Monitoramento do sistema |

#### IA & Alertas
| Página | Rota | Descrição |
|--------|------|-----------|
| CopilotAI | `/copilot-ai` | Assistente IA |
| IntelligentAlerts | `/intelligent-alerts` | Alertas inteligentes |
| PredictiveIncidents | `/predictive-incidents` | Predição de incidentes |

#### Administração
| Página | Rota | Descrição |
|--------|------|-----------|
| UserManagement | `/user-management` | Gestão de usuários |
| Organizations | `/organizations` | Gestão de organizações |
| AWSSettings | `/aws-settings` | Configurações AWS |
| LicenseManagement | `/license-management` | Licenciamento |
| BackgroundJobs | `/background-jobs` | Jobs em background |

#### Outros
| Página | Rota | Descrição |
|--------|------|-----------|
| KnowledgeBase | `/knowledge-base` | Base de conhecimento |
| RemediationTickets | `/remediation-tickets` | Tickets Jira |
| CommunicationCenter | `/communication-center` | Central de comunicação |
| Features | `/features` | Lista de funcionalidades |
| Auth | `/auth` | Login/Registro |
| ChangePassword | `/change-password` | Alteração de senha |

### 11.2 Componentes Principais
- `Layout.tsx`: Layout principal com sidebar
- `AppSidebar.tsx`: Menu lateral
- `AwsAccountSelector.tsx`: Seletor de conta AWS
- `OrganizationSwitcher.tsx`: Troca de organização
- `GlobalRefreshButton.tsx`: Atualização global
- `ErrorBoundary.tsx`: Tratamento de erros
- `ProtectedRoute.tsx`: Rotas protegidas

### 11.3 Hooks Customizados
| Hook | Descrição |
|------|-----------|
| `useOrganization` | Organização atual |
| `useAwsAccount` | Conta AWS selecionada |
| `useAuthSafe` | Autenticação segura |
| `useMetricsCache` | Cache de métricas |
| `useLicenseValidation` | Validação de licença |
| `useAutoRefresh` | Auto-refresh de dados |

---

## 12. Networking (VPC)

### 12.1 Configuração
- **VPC ID**: `vpc-09773244a2156129c`
- **CIDR**: `10.0.0.0/16`
- **Região**: us-east-1

### 12.2 Subnets
| Tipo | Subnet ID | CIDR | AZ |
|------|-----------|------|-----|
| Public | `subnet-0c7857d8ca2b5a4e0` | 10.0.1.0/24 | us-east-1a |
| Private | `subnet-0dbb444e4ef54d211` | 10.0.3.0/24 | us-east-1a |
| Private | `subnet-05383447666913b7b` | 10.0.4.0/24 | us-east-1b |

### 12.3 Componentes de Rede
| Componente | ID | Descrição |
|------------|-----|-----------|
| Internet Gateway | `igw-0d7006c2a96e4ef47` | Acesso internet |
| NAT Gateway | `nat-071801f85e8109355` | Saída para Lambdas |
| Route Table (Public) | `rtb-00c15edb16b14d53b` | Rota para IGW |
| Route Table (Private) | `rtb-060d53b4730d4507c` | Rota para NAT |

### 12.4 VPC Endpoints (Gateway)
- S3: `com.amazonaws.us-east-1.s3`
- DynamoDB: `com.amazonaws.us-east-1.dynamodb`

---

## 13. Segurança

### 13.1 Autenticação
- JWT tokens via Cognito
- WebAuthn/Passkeys para MFA
- Tokens de TV com expiração

### 13.2 Autorização
- RBAC via claims do token
- Roles: `super_admin`, `admin`, `user`
- Multi-tenancy via `organization_id`

### 13.3 Isolamento de Dados
- Todas as queries filtram por `organization_id`
- Cache isolado por organização
- Logs segregados

### 13.4 Criptografia
- TLS em trânsito (HTTPS)
- RDS com encryption at rest
- Secrets no Secrets Manager

### 13.5 CORS
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://evo.ai.udstec.io',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, ...'
};
```

---

## 14. Observabilidade

### 14.1 Logging
- CloudWatch Logs para todas as Lambdas
- Structured logging com JSON
- Log groups: `/aws/lambda/evo-uds-v3-production-*`

### 14.2 Métricas
- CloudWatch Metrics
- Custom metrics via `metrics-collector.ts`
- Dashboard CloudWatch

### 14.3 Tracing
- X-Ray tracing disponível
- Correlation IDs em requests

---

## 15. Deploy & CI/CD

### 15.1 Frontend Deploy
```bash
npm run build
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

### 15.2 Backend Deploy
```bash
# Build
npm run build --prefix backend

# Deploy Lambda
aws lambda update-function-code \
  --function-name evo-uds-v3-production-{handler} \
  --zip-file fileb://lambda.zip \
  --region us-east-1

# Deploy API Gateway
aws apigateway create-deployment \
  --rest-api-id 3l66kn0eaj \
  --stage-name prod \
  --region us-east-1
```

### 15.3 Database Migrations
```bash
cd backend
npx prisma migrate deploy
```

---

## 16. Integrações Externas

### 16.1 AWS Bedrock (IA)
- Modelo: Claude 3 Sonnet
- Região: us-east-1
- Uso: Chat, análises, insights

### 16.2 Jira
- Criação automática de tickets
- Sincronização de status

### 16.3 Email (SES)
- Notificações
- Alertas
- Relatórios

---

## 17. Licenciamento

### 17.1 Modelo
- Licenças por organização
- Limites: max_accounts, max_users
- Features habilitadas por plano

### 17.2 Validação
- Validação diária automática
- Bloqueio de funcionalidades se expirado

---

## 18. Resumo de Recursos AWS

| Recurso | Quantidade | Descrição |
|---------|------------|-----------|
| Lambda Functions | 94 | Handlers Node.js |
| API Gateway | 1 | REST API |
| CloudFront | 1 | CDN |
| S3 Buckets | 2+ | Frontend, storage |
| RDS PostgreSQL | 1 | Banco de dados |
| ElastiCache Redis | 1 | Cache |
| Cognito User Pool | 1 | Autenticação |
| VPC | 1 | Rede isolada |
| NAT Gateway | 1 | Saída internet |
| Lambda Layer | 1 | Dependências compartilhadas |

---

*Documento gerado em: 30/12/2025*
*Versão do Sistema: Consultar version.json*
