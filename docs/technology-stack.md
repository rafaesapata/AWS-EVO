# EVO Platform — Technology Stack

Documento detalhado de todas as tecnologias utilizadas na plataforma EVO, uma solução multi-cloud de segurança, monitoramento e otimização de custos em nuvem.

---

## 1. Linguagens e Runtime

### TypeScript
Linguagem principal em todo o projeto (backend e frontend). O backend usa **TypeScript 5.2** com módulos **CommonJS** (target ES2020), enquanto o frontend usa **TypeScript 5.0** com **ES Modules**.

### Node.js 18.x / 20.x
Runtime das Lambda functions na AWS. O ambiente local de desenvolvimento também roda em Node.js. As Lambdas são compiladas para **ARM64** (Graviton2) para melhor custo-benefício.

---

## 2. Backend

### Framework Serverless
Não há framework web em produção. Cada endpoint é uma **AWS Lambda** independente, invocada via API Gateway v2 (HTTP API). Para desenvolvimento local, usa-se **Express 5.2** como servidor de testes.

### ORM e Banco de Dados
- **Prisma 5.22** — ORM principal com migrations versionadas (56+ migrations). Gera client tipado para todas as queries.
- **PostgreSQL** — Banco relacional via **Amazon RDS**. Todas as queries filtram por `organization_id` para garantir isolamento multi-tenant.
- **pg 8.16** — Driver nativo PostgreSQL usado em cenários que exigem queries raw.

### Cache
- **ioredis 5.8** — Client Redis usado para cache de sessões, métricas e rate limiting.
- **Amazon MemoryDB** — Cluster Redis-compatível em produção (substituiu ElastiCache).
- Fallback para cache in-memory quando Redis não está disponível.

### Autenticação e Segurança
- **AWS Cognito** — User Pool para gerenciamento de usuários, registro, login e JWT tokens.
- **WebAuthn/FIDO2** — Autenticação passwordless implementada localmente.
- **MFA (TOTP)** — Implementação local usando `crypto.randomBytes(20)`, secrets salvos em PostgreSQL na tabela `mfa_factors`.
- **bcryptjs 2.4** — Hash de senhas.
- **jsonwebtoken 9.0** — Criação e validação de JWT tokens.
- **jwks-rsa 3.2** — Validação de tokens via JWKS endpoint do Cognito.

### Validação
- **zod 3.22** — Schema validation para inputs de API, configurações e dados de formulários.

### Geração de Documentos
- **pdfkit 0.17** — Geração de relatórios PDF (compliance reports, security assessments).
- **pdf-lib 1.17** — Manipulação de PDFs existentes.

### Utilitários
- **dotenv 17.2** — Carregamento de variáveis de ambiente.
- **tsx 4.6** — Execução direta de TypeScript em scripts de desenvolvimento.
- **dockerode 4.0** — Interação com Docker API para container scanning.

---

## 3. Frontend

### Framework UI
- **React 18.2** — Biblioteca principal de UI com functional components e hooks.
- **Vite 5.0** — Build tool e dev server com HMR (Hot Module Replacement).
- **SWC** (via `@vitejs/plugin-react-swc`) — Transpilação ultra-rápida substituindo Babel.

### Componentes e Estilização
- **shadcn/ui** — Biblioteca de componentes baseada em Radix UI, copiados para o projeto (não instalados como dependência).
- **Radix UI 1.x** — Primitivos acessíveis: Dialog, Dropdown, Select, Tabs, Tooltip, Popover, Accordion, etc.
- **Tailwind CSS 3.4** — Framework CSS utility-first para estilização.
- **PostCSS 8.4** — Processador CSS (pipeline do Tailwind).
- **Lucide React 0.562** — Biblioteca de ícones SVG.
- **clsx 2.1** + **tailwind-merge 3.4** — Utilitários para composição de classes CSS.

### Estado e Data Fetching
- **TanStack React Query 5.90** — Gerenciamento de estado do servidor, cache de requests, invalidação automática e polling.
- **React Hook Form 7.69** — Gerenciamento de formulários com validação performática.
- **@hookform/resolvers 5.2** — Integração entre React Hook Form e Zod para validação tipada.

### Roteamento
- **React Router DOM 6.8** — Roteamento client-side com lazy loading de rotas.

### Visualização de Dados
- **Recharts 3.6** — Biblioteca de gráficos (line, bar, area, pie charts) para dashboards.
- **react-markdown 10.1** — Renderização de Markdown em componentes React.

### Internacionalização
- **i18next 25.7** — Framework de internacionalização.
- **react-i18next 16.5** — Bindings React para i18next.
- **i18next-browser-languagedetector 8.2** — Detecção automática do idioma do navegador.

### Drag & Drop
- **@dnd-kit/core 6.3** — Framework de drag and drop acessível.
- **@dnd-kit/sortable 10.0** — Plugin para listas ordenáveis.

### Segurança no Cliente
- **dompurify 3.3** — Sanitização de HTML para prevenir XSS.
- **validator 13.15** — Validação de inputs (email, URL, etc.).
- **crypto-js 4.2** — Criptografia client-side.

### Outros
- **qrcode 1.5** — Geração de QR codes (usado no setup de MFA).
- **sonner 2.0** — Toast notifications.
- **js-yaml 4.1** — Parsing de YAML.
- **zod 4.3** — Validação de schemas no frontend.

---

## 4. AWS Services

### Compute
| Serviço | Uso |
|---------|-----|
| **Lambda** | 194 handlers serverless, ARM64 (Graviton2), Node.js 20.x |
| **API Gateway v2** | HTTP API com rotas, authorizers e CORS |

### Banco de Dados e Cache
| Serviço | Uso |
|---------|-----|
| **RDS PostgreSQL** | Banco relacional principal, multi-AZ |
| **MemoryDB** | Cache Redis-compatível para sessões e métricas |

### Armazenamento
| Serviço | Uso |
|---------|-----|
| **S3** | Artefatos de build, relatórios, frontend estático |
| **Secrets Manager** | Credenciais de banco, API keys, secrets |
| **SSM Parameter Store** | Configurações de aplicação |

### Segurança
| Serviço | Uso |
|---------|-----|
| **Cognito** | Autenticação, User Pool, JWT |
| **IAM** | Roles e policies para Lambdas e serviços |
| **KMS** | Criptografia de dados em repouso |
| **WAF** | Web Application Firewall, proteção contra ataques |
| **SecurityHub** | Agregação de findings de segurança |
| **GuardDuty** | Detecção de ameaças |
| **Inspector** | Vulnerability scanning |
| **Macie** | Descoberta de dados sensíveis em S3 |
| **Access Analyzer** | Análise de políticas IAM |

### Rede e CDN
| Serviço | Uso |
|---------|-----|
| **CloudFront** | CDN para frontend e assets |
| **VPC** | Rede privada com subnets, security groups |
| **Route 53** | DNS management |
| **Network Firewall** | Firewall de rede |
| **ELB** | Load balancing |

### Monitoramento
| Serviço | Uso |
|---------|-----|
| **CloudWatch Logs** | Logs centralizados de todas as Lambdas |
| **CloudWatch Metrics** | Métricas customizadas e alarmes |
| **CloudWatch Alarms** | Alertas baseados em thresholds |
| **X-Ray** | Distributed tracing entre serviços |
| **CloudTrail** | Audit trail de chamadas AWS API |

### Mensageria e Eventos
| Serviço | Uso |
|---------|-----|
| **EventBridge** | Event bus para comunicação entre serviços |
| **SNS** | Notificações push e fan-out |
| **SQS** | Filas de mensagens para processamento assíncrono |
| **SES** | Envio de emails transacionais |

### Custo e Governança
| Serviço | Uso |
|---------|-----|
| **Cost Explorer** | Análise de custos e recomendações |
| **Savings Plans** | Otimização de custos com reservas |
| **Organizations** | Gerenciamento multi-account |
| **Config** | Compliance e drift detection |

### AI/ML
| Serviço | Uso |
|---------|-----|
| **Bedrock** | LLM (Claude 3 Sonnet) para análise de segurança, recomendações e relatórios |

### Outros AWS
| Serviço | Uso |
|---------|-----|
| **CloudFormation** | IaC para toda a infraestrutura |
| **STS** | Assume role cross-account |
| **Step Functions** | Orquestração de workflows |
| **Kinesis / Firehose** | Streaming de dados |
| **Glue** | ETL e catálogo de dados |

---

## 5. Azure Services (Multi-Cloud)

A plataforma suporta Azure como cloud secundária via OAuth integration.

### SDKs Utilizados
- **@azure/identity 4.13** — Autenticação OAuth com Azure AD.
- **@azure/arm-compute** — Gerenciamento de VMs e compute.
- **@azure/arm-network** — Redes virtuais e NSGs.
- **@azure/arm-storage** — Storage accounts.
- **@azure/arm-keyvault** — Key Vault para secrets.
- **@azure/arm-sql** — Azure SQL Database.
- **@azure/arm-cosmosdb** — Cosmos DB.
- **@azure/arm-monitor** — Métricas e logs.
- **@azure/arm-security** — Security Center findings.
- **@azure/arm-advisor** — Recomendações de otimização.
- **@azure/arm-consumption** — Análise de custos.
- **@azure/arm-resources** — Resource management.
- **@azure/arm-policy** — Azure Policy.
- **@azure/arm-authorization** — RBAC.
- **@azure/arm-frontdoor** — Azure Front Door.
- **@azure/arm-containerinstance** — Container Instances.

### Polyfill Necessário
Handlers Azure requerem crypto polyfill como primeiro import:
```typescript
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}
```

---

## 6. Infraestrutura como Código (IaC)

### AWS SAM (Serverless Application Model)
Template principal em `sam/production-lambdas-only.yaml`. Define todas as 194 Lambdas com:
- Metadata esbuild para bundling
- ARM64 architecture
- VPC configuration
- Environment variables
- IAM policies

### AWS CloudFormation
Stacks aninhadas em `cloudformation/`:
- **master-stack.yaml** — Stack raiz
- **Nested stacks** — Organizadas por domínio (auth, security, cost, ai, etc.)
- Infraestrutura: VPC, RDS, MemoryDB, Cognito, API Gateway, CloudFront, WAF

### AWS CDK 2.100
Usado para constructs específicos e automação de infraestrutura.

---

## 7. CI/CD

### AWS CodeBuild
Pipeline principal definido em `cicd/buildspec-sam.yml`:
1. **pre_build** — Validação de imports, npm ci, Prisma generate
2. **build** — sam build com esbuild
3. **post_build** — sam deploy

### GitHub Actions
Workflows em `.github/` para:
- Validação de PRs
- Checks automáticos

### Estratégia de Deploy
| Branch | Ambiente | Estratégia |
|--------|----------|-----------|
| `sandbox` | Sandbox | FULL_SAM (~10min) |
| `production` | Production | FULL_SAM (~10min) |

Todo deploy backend passa por `sam build` + `sam deploy` completo. Não existe deploy incremental.

### Scripts de Deploy
- `deploy-changed-lambdas.sh` — Análise de mudanças
- `package-lambdas.sh` — Empacotamento
- `run-migrations.sh` — Execução de migrations Prisma
- `setup-pipeline.sh` — Setup inicial do pipeline

---

## 8. Testes

### Vitest 4.0
Framework principal de testes (unit e integration). Configurado em `backend/vitest.config.ts`.

### fast-check 4.5
Property-based testing para validação formal de propriedades de corretude. Usado para testar invariantes do sistema.

### Cypress 15.10
Testes end-to-end do frontend. Simula interações reais do usuário no navegador.

---

## 9. Build e Bundling

### esbuild
Bundler usado pelo SAM para compilar cada Lambda individualmente:
- **Minify**: true
- **Target**: ES2022
- **Sourcemap**: false
- **External**: `@prisma/client`, `.prisma/client` (vêm da Lambda Layer)
- `@aws-sdk/*` é bundled em cada Lambda (não está no External)

### tsup
Configurado em `backend/tsup.config.ts` para builds locais.

### Vite
Build do frontend com:
- Tree-shaking
- Code splitting
- Asset optimization
- SWC para transpilação rápida

---

## 10. Integrações Externas

| Integração | Uso |
|------------|-----|
| **Jira** | Criação automática de tickets para findings de segurança |
| **Supabase** | Validação e gerenciamento de licenças |
| **Docker** | Container scanning via dockerode |
| **Email (SES)** | Notificações, alertas e relatórios |
| **Webhooks** | Integrações customizadas com sistemas externos |

---

## 11. AI/ML Customizado

Além do AWS Bedrock (Claude 3 Sonnet), a plataforma implementa modelos ML customizados:

- **Anomaly Detection** — Detecção de anomalias em custos e métricas de segurança
- **Seasonality Detection** — Identificação de padrões sazonais em uso de recursos
- **Usage Forecasting** — Previsão de consumo e custos futuros
- **Waste Analysis** — Identificação de recursos subutilizados ou desperdiçados

---

## 12. Compliance e Governança

Frameworks de compliance suportados:
- **CIS Benchmarks** — Center for Internet Security
- **PCI-DSS** — Payment Card Industry
- **HIPAA** — Health Insurance Portability
- **SOC 2** — Service Organization Control
- **AWS Well-Architected** — Reviews automatizados

Funcionalidades:
- Security posture scoring
- Drift detection
- Resource tagging policies
- License management
- Demo mode com isolamento de dados

---

## 13. Padrões Arquiteturais

### Serverless-First
100% Lambda-based, sem EC2 ou containers em produção. Event-driven com EventBridge, SNS e SQS.

### Multi-Tenancy
Isolamento por `organization_id` em todas as queries. Row-level security implementada na camada de aplicação.

### Multi-Cloud
AWS como cloud primária, Azure como secundária com OAuth integration. Arquitetura preparada para GCP.

### Domain-Driven Design
8 domínios lógicos com 194 handlers organizados por responsabilidade:
- Security (28), Cloud (26), Cost (17), Auth (12), Monitoring (20), Operations (43), AI (20), Integrations (25)

### Observabilidade
- Logs centralizados (CloudWatch)
- Tracing distribuído (X-Ray)
- Métricas customizadas (CloudWatch Metrics)
- Audit logging em todas as operações de escrita

---

## 14. Ferramentas de Desenvolvimento

| Ferramenta | Uso |
|------------|-----|
| **VS Code / Kiro** | IDE principal |
| **Git + GitHub** | Versionamento e colaboração |
| **npm** | Gerenciamento de pacotes |
| **Prisma Studio** | GUI para banco de dados |
| **tsx** | Execução de scripts TypeScript |
| **Express** | Servidor local de desenvolvimento |
| **validate-lambda-imports.ts** | Validação estática de imports |
| **generate-openapi.ts** | Geração de documentação API |
| **db-tunnel.sh** | Túnel SSH para banco de dados remoto |
