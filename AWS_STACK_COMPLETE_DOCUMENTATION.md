# 📚 AWS Stack Completa - Documentação Técnica

## 🎯 Visão Geral

Esta plataforma é uma solução SaaS multi-tenant de governança, segurança e otimização de custos AWS, construída 100% em AWS com arquitetura serverless.

---

## 🔐 1. AWS Cognito - Autenticação e Autorização

### User Pool (Development)
- **User Pool ID**: `us-east-1_cnesJ48lR`
- **Client ID**: `4p0okvsr983v2f8rrvgpls76d6`
- **Region**: `us-east-1`

### Funcionalidades Implementadas
- ✅ **Autenticação JWT** - Tokens de acesso e refresh
- ✅ **MFA Opcional** - TOTP via aplicativos autenticadores
- ✅ **Custom Attributes** - Multi-tenancy via atributos customizados:
  - `custom:organization_id` - UUID da organização
  - `custom:organization_name` - Nome da organização
  - `custom:roles` - Array JSON de roles (`["org_admin", "viewer"]`)
  - `custom:tenant_id` - ID do tenant (isolamento de dados)
- ✅ **Password Policies** - Senhas fortes obrigatórias
- ✅ **Email Verification** - Verificação de email automática
- ✅ **Forgot Password Flow** - Recuperação de senha via email
- ✅ **WebAuthn/Passkeys** - Autenticação biométrica (Face ID, Touch ID, Windows Hello)

### Integração
- **API Gateway Authorizer**: `joelbs` (Cognito User Pools)
- **Frontend**: AWS Amplify Auth SDK
- **Backend**: Validação de JWT via `jsonwebtoken` + JWKS


---

## 🚀 2. AWS Lambda - Compute Serverless

### Runtime e Configuração
- **Runtime**: Node.js 18.x
- **Linguagem**: TypeScript (compilado para CommonJS)
- **Timeout Padrão**: 30 segundos
- **Memory**: 256-512 MB (dependendo da função)
- **Prefixo**: `evo-uds-v3-production-`

### Lambda Layers
#### Layer Principal: `evo-prisma-deps-layer:2`
- **ARN**: `arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:2`
- **Conteúdo**:
  - `@prisma/client` - ORM client
  - `.prisma/client` - Cliente gerado com schema
  - `zod` - Validação de schemas
  - Binários RHEL para Lambda (OpenSSL 1.0.x e 3.0.x)

### Categorias de Lambdas

#### 🔒 Security & Compliance
- **`security-scan`** - Scan completo de segurança AWS (IAM, S3, EC2, RDS, etc.)
- **`well-architected-scan`** - Análise baseada no AWS Well-Architected Framework
- **`compliance-scan`** - Verificação de compliance (PCI-DSS, HIPAA, SOC2, etc.)
- **`waf-log-processor`** - Processamento de logs do AWS WAF em tempo real
- **`waf-threat-analyzer`** - Análise de ameaças e detecção de padrões maliciosos
- **`waf-setup-monitoring`** - Configuração automática de monitoramento WAF
- **`waf-dashboard-api`** - API para dashboard de WAF em tempo real

#### 💰 Cost Optimization
- **`fetch-daily-costs`** - Coleta de custos diários via Cost Explorer
- **`ri-sp-analyzer`** - Análise de Reserved Instances e Savings Plans
- **`cost-anomaly-detector`** - Detecção de anomalias de custos
- **`budget-alerts`** - Alertas de orçamento


#### 🤖 AI & Machine Learning
- **`bedrock-chat`** - Chat com Claude 3.5 Sonnet via AWS Bedrock
- **`predict-incidents`** - Predição de incidentes usando ML
- **`ai-recommendations`** - Recomendações inteligentes de otimização

#### 🔑 Credentials & Access Management
- **`list-aws-credentials`** - Listagem de credenciais AWS configuradas
- **`validate-aws-credentials`** - Validação de credenciais
- **`assume-role`** - Assume role cross-account
- **`quickconnect-setup`** - Setup rápido de conexão AWS (CloudFormation)

#### 🗄️ Database Operations
- **`query-table`** - Queries genéricas ao PostgreSQL via Prisma
- **`run-migrations`** - Execução de migrações Prisma
- **`backup-database`** - Backup automático do banco

#### 🔐 WebAuthn/Passkeys
- **`webauthn-register`** - Registro de credenciais biométricas
- **`webauthn-authenticate`** - Autenticação via passkeys
- **`webauthn-list-credentials`** - Listagem de credenciais do usuário
- **`webauthn-delete-credential`** - Remoção de credenciais

#### 📊 Dashboard & Reporting
- **`get-executive-dashboard`** - Dashboard executivo com métricas agregadas
- **`get-executive-dashboard-public`** - Dashboard público para TV/displays
- **`generate-report`** - Geração de relatórios PDF/Excel

#### 🔔 Notifications
- **`send-notification`** - Envio de notificações via SNS
- **`email-digest`** - Digest diário de eventos

### VPC Configuration
- **VPC ID**: `vpc-09773244a2156129c`
- **Subnets Privadas**: 
  - `subnet-0dbb444e4ef54d211` (us-east-1a)
  - `subnet-05383447666913b7b` (us-east-1b)
- **Security Group**: Permite saída para internet via NAT Gateway
- **NAT Gateway**: `nat-071801f85e8109355` (para acesso a APIs AWS)


---

## 🌐 3. Amazon API Gateway - REST API

### Configuração Principal
- **API ID**: `3l66kn0eaj`
- **Tipo**: REST API (não HTTP API)
- **Stage**: `prod` (único stage em produção)
- **Regional Endpoint**: `d-lh5c9lpit7.execute-api.us-east-1.amazonaws.com`
- **Custom Domain**: `api-evo.ai.udstec.io`

### Authorizer
- **ID**: `joelbs`
- **Tipo**: Cognito User Pools
- **User Pool**: `us-east-1_cnesJ48lR`
- **Token Source**: `Authorization` header
- **Caching**: 300 segundos

### Estrutura de Recursos
```
/api
  /functions
    /security-scan (POST)
    /well-architected-scan (POST)
    /compliance-scan (POST)
    /waf-log-processor (POST)
    /waf-threat-analyzer (POST)
    /waf-dashboard (GET)
  /cost
    /daily-costs (GET)
    /ri-sp-analysis (POST)
  /ai
    /bedrock-chat (POST)
    /predict-incidents (POST)
  /credentials
    /list (GET)
    /validate (POST)
  /dashboard
    /executive (GET)
    /executive-public (GET)
  /webauthn
    /register (POST)
    /authenticate (POST)
```

### CORS Configuration
- **Allow-Origin**: `*` (ou domínio específico em produção)
- **Allow-Methods**: `GET, POST, PUT, DELETE, OPTIONS`
- **Allow-Headers**: `Content-Type, Authorization, X-Requested-With, X-API-Key, X-Request-ID`
- **Max-Age**: 3600 segundos

### Integration Type
- **AWS_PROXY** - Integração Lambda com proxy completo
- **Request/Response passthrough** - Lambda recebe evento completo


---

## 🗄️ 4. Amazon RDS - PostgreSQL Database

### Configuração
- **Engine**: PostgreSQL 15.10
- **Instance Class**: db.t3.micro (development) / db.t3.medium (production)
- **Storage**: 20 GB GP3 (auto-scaling até 100 GB)
- **Multi-AZ**: Não (development) / Sim (production)
- **Backup Retention**: 7 dias
- **CloudFormation Stack**: `evo-uds-v3-nodejs-infra`

### Network
- **VPC**: `vpc-09773244a2156129c`
- **Subnets**: Private subnets (us-east-1a, us-east-1b)
- **Security Group**: Permite acesso apenas de Lambdas na mesma VPC
- **Port**: 5432

### ORM - Prisma
- **Schema**: `backend/prisma/schema.prisma`
- **Client Generation**: `npx prisma generate`
- **Migrations**: `npx prisma migrate deploy`

### Principais Tabelas
- **users** - Usuários do sistema (sincronizado com Cognito)
- **organizations** - Organizações (multi-tenancy)
- **aws_credentials** - Credenciais AWS criptografadas
- **security_scans** - Histórico de scans de segurança
- **cost_data** - Dados de custos diários
- **ri_sp_recommendations** - Recomendações de RI/SP
- **waf_events** - Eventos do WAF em tempo real
- **waf_blocked_ips** - IPs bloqueados pelo WAF
- **webauthn_credentials** - Credenciais biométricas
- **audit_logs** - Logs de auditoria (compliance)

### Isolamento Multi-tenant
- Todas as tabelas têm coluna `organization_id`
- Row-Level Security (RLS) via Prisma middleware
- Índices compostos: `(organization_id, created_at)`


---

## 📦 5. Amazon S3 - Object Storage

### Buckets

#### Frontend Bucket
- **Nome**: `evo-uds-v3-production-frontend-383234048592`
- **Região**: `us-east-1`
- **Uso**: Hospedagem do frontend React (SPA)
- **Configuração**:
  - Static Website Hosting: Desabilitado (usa CloudFront)
  - Versioning: Habilitado
  - Encryption: AES-256 (SSE-S3)
  - Block Public Access: Habilitado (acesso via CloudFront OAI)

#### CloudFormation Templates Bucket
- **Nome**: `evo-quickconnect-templates`
- **Região**: `us-east-1`
- **Uso**: Templates CloudFormation para QuickConnect
- **Conteúdo**:
  - `customer-iam-role.yaml` - Role IAM para clientes
  - `customer-iam-role-waf.yaml` - Role com permissões WAF
  - `waf-monitoring-stack.yaml` - Stack de monitoramento WAF

#### WAF Logs Bucket
- **Nome**: `aws-waf-logs-evo-{organization_id}`
- **Região**: `us-east-1`
- **Uso**: Logs do AWS WAF
- **Lifecycle Policy**: 
  - Transição para Glacier após 90 dias
  - Deleção após 365 dias

#### Backup Bucket
- **Nome**: `evo-backups-383234048592`
- **Região**: `us-east-1`
- **Uso**: Backups de banco de dados e configurações
- **Versioning**: Habilitado
- **Replication**: Cross-region para `us-west-2` (disaster recovery)

### S3 VPC Endpoint
- **Tipo**: Gateway Endpoint (sem custo)
- **Service**: `com.amazonaws.us-east-1.s3`
- **Route Tables**: Associado às route tables privadas


---

## 🌍 6. Amazon CloudFront - CDN

### Distribution Principal
- **Distribution ID**: `E1PY7U3VNT6P1R`
- **Domain**: `evo.ai.udstec.io`
- **Origin**: S3 bucket `evo-uds-v3-production-frontend-383234048592`
- **Price Class**: PriceClass_100 (US, Canada, Europe)

### Configuração
- **SSL/TLS Certificate**: AWS Certificate Manager (ACM)
  - Domain: `*.ai.udstec.io`
  - Validation: DNS (Route 53)
- **HTTP Version**: HTTP/2 e HTTP/3 (QUIC)
- **Compression**: Gzip e Brotli habilitados
- **Origin Access Identity (OAI)**: Acesso exclusivo ao S3

### Cache Behavior
- **Default TTL**: 86400 segundos (24 horas)
- **Max TTL**: 31536000 segundos (1 ano)
- **Min TTL**: 0 segundos
- **Cache Policy**: CachingOptimized
- **Origin Request Policy**: CORS-S3Origin

### Custom Error Responses
- **404 → /index.html** (SPA routing)
- **403 → /index.html** (SPA routing)

### Invalidation
```bash
aws cloudfront create-invalidation \
  --distribution-id E1PY7U3VNT6P1R \
  --paths "/*"
```

### Security Headers (Lambda@Edge)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy: default-src 'self'`


---

## 🔔 7. Amazon SNS - Simple Notification Service

### Topics Configurados

#### Security Alerts Topic
- **ARN**: `arn:aws:sns:us-east-1:383234048592:evo-security-alerts`
- **Uso**: Alertas críticos de segurança
- **Subscribers**:
  - Email: Administradores da organização
  - Lambda: `send-notification` (para persistir no banco)
  - SQS: Queue de processamento assíncrono

#### Cost Anomaly Topic
- **ARN**: `arn:aws:sns:us-east-1:383234048592:evo-cost-anomalies`
- **Uso**: Alertas de anomalias de custos
- **Triggers**:
  - Aumento de custos > 20% em 24h
  - Orçamento mensal excedido
  - Recursos não utilizados detectados

#### WAF Threat Topic
- **ARN**: `arn:aws:sns:us-east-1:383234048592:evo-waf-threats`
- **Uso**: Ameaças detectadas pelo WAF
- **Triggers**:
  - Ataques DDoS detectados
  - SQL Injection bloqueado
  - XSS bloqueado
  - Rate limiting ativado
  - IP bloqueado automaticamente

#### System Health Topic
- **ARN**: `arn:aws:sns:us-east-1:383234048592:evo-system-health`
- **Uso**: Status do sistema e health checks
- **Triggers**:
  - Lambda errors > threshold
  - RDS connection failures
  - API Gateway 5xx errors

### Message Attributes
Todas as mensagens incluem:
- `organization_id` - Para filtro multi-tenant
- `severity` - `critical`, `high`, `medium`, `low`
- `category` - `security`, `cost`, `waf`, `system`
- `timestamp` - ISO 8601

### Subscription Filter Policy
```json
{
  "organization_id": ["ORG-UUID"],
  "severity": ["critical", "high"]
}
```


---

## 🛡️ 8. AWS WAF - Web Application Firewall

### WebACL Configuration
- **Name**: `evo-waf-protection`
- **Scope**: REGIONAL (para API Gateway e ALB)
- **Default Action**: Allow
- **CloudWatch Metrics**: Habilitado

### Managed Rule Groups
1. **AWSManagedRulesCommonRuleSet** - Core Rule Set (CRS)
   - SQL Injection protection
   - XSS protection
   - Path traversal protection
   - Known bad inputs

2. **AWSManagedRulesKnownBadInputsRuleSet**
   - Log4j vulnerability (CVE-2021-44228)
   - Known malicious patterns

3. **AWSManagedRulesAmazonIpReputationList**
   - IPs com má reputação
   - Botnets conhecidos

4. **AWSManagedRulesAnonymousIpList**
   - VPNs
   - Proxies
   - Tor exit nodes

### Custom Rules

#### Rate Limiting
```json
{
  "Name": "RateLimitRule",
  "Priority": 1,
  "Statement": {
    "RateBasedStatement": {
      "Limit": 2000,
      "AggregateKeyType": "IP"
    }
  },
  "Action": { "Block": {} }
}
```

#### Geo Blocking (Opcional)
```json
{
  "Name": "GeoBlockRule",
  "Priority": 2,
  "Statement": {
    "GeoMatchStatement": {
      "CountryCodes": ["CN", "RU", "KP"]
    }
  },
  "Action": { "Block": {} }
}
```

#### IP Reputation (Custom)
```json
{
  "Name": "BlockBadIPs",
  "Priority": 3,
  "Statement": {
    "IPSetReferenceStatement": {
      "ARN": "arn:aws:wafv2:us-east-1:383234048592:regional/ipset/blocked-ips/..."
    }
  },
  "Action": { "Block": {} }
}
```

### Logging
- **Destination**: S3 bucket `aws-waf-logs-evo-{organization_id}`
- **Format**: JSON Lines
- **Fields**: All available fields
- **Redacted Fields**: `authorization`, `cookie`

### Real-time Processing
- **Kinesis Data Firehose**: Stream de logs para processamento
- **Lambda Processor**: `waf-log-processor`
  - Parsing de logs
  - Detecção de padrões
  - Auto-blocking de IPs maliciosos
  - Armazenamento no PostgreSQL


---

## 🤖 9. Amazon Bedrock - Generative AI

### Model Access
- **Model ID**: `anthropic.claude-3-5-sonnet-20241022-v2:0`
- **Region**: `us-east-1`
- **Use Cases**:
  - Chat interativo (Copilot)
  - Análise de logs de segurança
  - Recomendações de otimização
  - Geração de relatórios
  - Explicações de vulnerabilidades

### API Configuration
- **Endpoint**: `bedrock-runtime.us-east-1.amazonaws.com`
- **Authentication**: IAM Role (Lambda execution role)
- **Max Tokens**: 4096
- **Temperature**: 0.7 (padrão)
- **Top P**: 0.9

### Lambda Handler: `bedrock-chat`
```typescript
// Streaming de respostas
const response = await bedrockRuntime.invokeModelWithResponseStream({
  modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  body: JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 4096,
    messages: conversationHistory,
    system: systemPrompt
  })
});
```

### System Prompts
- **Security Analyst**: Análise de vulnerabilidades e recomendações
- **Cost Optimizer**: Sugestões de economia
- **Compliance Expert**: Verificação de conformidade
- **General Assistant**: Assistente geral da plataforma

### Context Injection
- Dados da organização
- Histórico de scans
- Configurações AWS
- Custos recentes
- Alertas ativos


---

## 📊 10. AWS Cost Explorer - Cost Management

### API Usage
- **Service**: Cost Explorer API
- **Granularity**: DAILY, MONTHLY
- **Metrics**:
  - `UnblendedCost` - Custo sem descontos
  - `BlendedCost` - Custo com descontos
  - `AmortizedCost` - Custo amortizado (RI/SP)
  - `UsageQuantity` - Quantidade de uso

### Dimensions
- `SERVICE` - Serviço AWS (EC2, S3, RDS, etc.)
- `LINKED_ACCOUNT` - Conta AWS (multi-account)
- `REGION` - Região AWS
- `INSTANCE_TYPE` - Tipo de instância
- `USAGE_TYPE` - Tipo de uso
- `PURCHASE_TYPE` - On-Demand, Reserved, Spot

### Lambda: `fetch-daily-costs`
```typescript
const response = await costExplorer.getCostAndUsage({
  TimePeriod: {
    Start: startDate,
    End: endDate
  },
  Granularity: 'DAILY',
  Metrics: ['UnblendedCost', 'UsageQuantity'],
  GroupBy: [
    { Type: 'DIMENSION', Key: 'SERVICE' },
    { Type: 'DIMENSION', Key: 'REGION' }
  ]
});
```

### Reserved Instances & Savings Plans
- **Lambda**: `ri-sp-analyzer`
- **Análise**:
  - Utilização atual de RI/SP
  - Cobertura (coverage)
  - Economia realizada
  - Recomendações de compra
  - ROI projetado

### Cost Anomaly Detection
- **Threshold**: 20% de variação em 24h
- **Notification**: SNS Topic `evo-cost-anomalies`
- **Actions**:
  - Alerta imediato
  - Análise de causa raiz
  - Recomendações de mitigação


---

## 🔍 11. AWS CloudTrail - Audit & Compliance

### Trail Configuration
- **Name**: `evo-audit-trail`
- **Multi-region**: Sim
- **Organization Trail**: Sim (para multi-account)
- **S3 Bucket**: `evo-cloudtrail-logs-383234048592`
- **Log File Validation**: Habilitado (integridade)

### Events Logged
- **Management Events**: Todas as operações de controle
- **Data Events**: 
  - S3 object-level (GetObject, PutObject, DeleteObject)
  - Lambda invocations
- **Insights Events**: Detecção de atividades anômalas

### Integration with Athena
```sql
-- Query CloudTrail logs
CREATE EXTERNAL TABLE cloudtrail_logs (
  eventversion STRING,
  useridentity STRUCT<
    type:STRING,
    principalid:STRING,
    arn:STRING,
    accountid:STRING
  >,
  eventtime STRING,
  eventsource STRING,
  eventname STRING,
  awsregion STRING,
  sourceipaddress STRING,
  useragent STRING,
  errorcode STRING,
  errormessage STRING,
  requestparameters STRING,
  responseelements STRING
)
PARTITIONED BY (region STRING, year STRING, month STRING, day STRING)
STORED AS INPUTFORMAT 'com.amazon.emr.cloudtrail.CloudTrailInputFormat'
OUTPUTFORMAT 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION 's3://evo-cloudtrail-logs-383234048592/AWSLogs/383234048592/CloudTrail/';
```

### Compliance Queries
- **Failed Login Attempts**: Detecção de tentativas de acesso não autorizado
- **Root Account Usage**: Alertas de uso da conta root
- **IAM Changes**: Mudanças em políticas e roles
- **Security Group Changes**: Modificações em regras de firewall
- **S3 Bucket Policy Changes**: Alterações em permissões de buckets

### Retention
- **S3**: 7 anos (compliance)
- **CloudWatch Logs**: 90 dias
- **Athena**: Query on-demand


---

## 📈 12. Amazon CloudWatch - Monitoring & Logging

### Log Groups

#### Lambda Logs
- **Pattern**: `/aws/lambda/evo-uds-v3-production-*`
- **Retention**: 30 dias
- **Insights**: Habilitado
- **Metrics Filters**:
  - Errors: `[ERROR]` ou `Exception`
  - Warnings: `[WARN]`
  - Latency: Parsing de duração

#### API Gateway Logs
- **Log Group**: `/aws/apigateway/evo-api`
- **Format**: JSON
- **Fields**: 
  - Request ID
  - IP address
  - User agent
  - Request/response body (opcional)
  - Latency
  - Status code

#### RDS Logs
- **Log Group**: `/aws/rds/instance/evo-postgres/postgresql`
- **Logs**:
  - Error logs
  - Slow query logs (> 1 segundo)
  - Connection logs

#### WAF Logs
- **Log Group**: `/aws/wafv2/evo-waf`
- **Real-time**: Sim (via Kinesis)
- **Sampling**: 100% (todos os requests)

### Metrics

#### Custom Metrics
```typescript
// Exemplo de publicação de métrica
await cloudwatch.putMetricData({
  Namespace: 'EVO/Platform',
  MetricData: [{
    MetricName: 'SecurityScanDuration',
    Value: duration,
    Unit: 'Seconds',
    Dimensions: [
      { Name: 'OrganizationId', Value: organizationId },
      { Name: 'ScanType', Value: 'security' }
    ],
    Timestamp: new Date()
  }]
});
```

#### Dashboards
- **Executive Dashboard**: Métricas de alto nível
- **Security Dashboard**: Vulnerabilidades e ameaças
- **Cost Dashboard**: Custos e otimizações
- **Performance Dashboard**: Latência e throughput

### Alarms

#### Lambda Errors
- **Metric**: `Errors`
- **Threshold**: > 5 em 5 minutos
- **Action**: SNS notification

#### API Gateway 5xx
- **Metric**: `5XXError`
- **Threshold**: > 10 em 5 minutos
- **Action**: SNS notification + PagerDuty

#### RDS CPU
- **Metric**: `CPUUtilization`
- **Threshold**: > 80% por 10 minutos
- **Action**: Auto-scaling (se habilitado)

#### Cost Spike
- **Metric**: Custom metric `DailyCost`
- **Threshold**: > 20% do dia anterior
- **Action**: SNS topic `evo-cost-anomalies`


---

## 🌐 13. Amazon VPC - Virtual Private Cloud

### VPC Configuration
- **VPC ID**: `vpc-09773244a2156129c`
- **CIDR Block**: `10.0.0.0/16`
- **Region**: `us-east-1`
- **DNS Hostnames**: Habilitado
- **DNS Resolution**: Habilitado

### Subnets

#### Public Subnets
| Name | Subnet ID | CIDR | AZ | Uso |
|------|-----------|------|-----|-----|
| Public-1 | `subnet-0c7857d8ca2b5a4e0` | 10.0.1.0/24 | us-east-1a | NAT Gateway, Bastion |
| Public-2 | `subnet-0a1b2c3d4e5f6g7h8` | 10.0.2.0/24 | us-east-1b | Load Balancers |

#### Private Subnets
| Name | Subnet ID | CIDR | AZ | Uso |
|------|-----------|------|-----|-----|
| Private-1 | `subnet-0dbb444e4ef54d211` | 10.0.3.0/24 | us-east-1a | Lambda, RDS |
| Private-2 | `subnet-05383447666913b7b` | 10.0.4.0/24 | us-east-1b | Lambda, RDS (Multi-AZ) |

### Internet Gateway
- **IGW ID**: `igw-0d7006c2a96e4ef47`
- **Attached to**: VPC `vpc-09773244a2156129c`
- **Route**: Public subnets → IGW

### NAT Gateway
- **NAT ID**: `nat-071801f85e8109355`
- **Elastic IP**: `eipalloc-0f905bf31aaa39ca1` (54.165.51.84)
- **Subnet**: Public Subnet 1
- **Route**: Private subnets → NAT Gateway
- **Purpose**: Lambdas em VPC acessarem APIs AWS e internet

### Route Tables

#### Public Route Table
- **RT ID**: `rtb-00c15edb16b14d53b`
- **Routes**:
  - `10.0.0.0/16` → local
  - `0.0.0.0/0` → Internet Gateway

#### Private Route Table
- **RT ID**: `rtb-060d53b4730d4507c`
- **Routes**:
  - `10.0.0.0/16` → local
  - `0.0.0.0/0` → NAT Gateway

### VPC Endpoints (Gateway - Sem Custo)

#### S3 Endpoint
- **Service**: `com.amazonaws.us-east-1.s3`
- **Type**: Gateway
- **Route Tables**: Private RT
- **Policy**: Full access

#### DynamoDB Endpoint (Reservado)
- **Service**: `com.amazonaws.us-east-1.dynamodb`
- **Type**: Gateway
- **Status**: Configurado mas não usado (PostgreSQL é o banco principal)

### Security Groups

#### Lambda Security Group
- **SG ID**: `sg-0abc123def456789`
- **Inbound**: Nenhuma (Lambdas não recebem conexões diretas)
- **Outbound**: 
  - `0.0.0.0/0` → TCP 443 (HTTPS)
  - `10.0.0.0/16` → TCP 5432 (PostgreSQL)

#### RDS Security Group
- **SG ID**: `sg-0def456abc789012`
- **Inbound**:
  - Lambda SG → TCP 5432
  - Bastion SG → TCP 5432 (admin)
- **Outbound**: Nenhuma necessária


---

## 🔐 14. AWS IAM - Identity & Access Management

### Roles

#### Lambda Execution Role
- **Role Name**: `evo-lambda-execution-role`
- **Trusted Entity**: `lambda.amazonaws.com`
- **Managed Policies**:
  - `AWSLambdaVPCAccessExecutionRole`
  - `AWSLambdaBasicExecutionRole`
- **Inline Policies**:
  - RDS access (via Secrets Manager)
  - S3 read/write (specific buckets)
  - Cost Explorer read
  - EC2 describe (para security scans)
  - Bedrock invoke model
  - SNS publish
  - CloudWatch metrics

#### Customer Cross-Account Role
- **Role Name**: `EvoMonitoringRole` (criado na conta do cliente)
- **Trusted Entity**: `arn:aws:iam::383234048592:root`
- **External ID**: UUID único por organização
- **Permissions**:
  - `SecurityAudit` (AWS managed)
  - `ViewOnlyAccess` (AWS managed)
  - Custom policy para Cost Explorer
  - Custom policy para WAF (se habilitado)

#### CloudFormation Execution Role
- **Role Name**: `evo-cloudformation-role`
- **Trusted Entity**: `cloudformation.amazonaws.com`
- **Permissions**: Criar recursos da stack (VPC, Lambda, RDS, etc.)

### Policies

#### Cost Explorer Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ce:GetCostAndUsage",
      "ce:GetCostForecast",
      "ce:GetReservationUtilization",
      "ce:GetReservationCoverage",
      "ce:GetSavingsPlansUtilization",
      "ce:GetSavingsPlansCoverage"
    ],
    "Resource": "*"
  }]
}
```

#### WAF Monitoring Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "wafv2:GetWebACL",
      "wafv2:GetLoggingConfiguration",
      "wafv2:ListWebACLs",
      "wafv2:GetSampledRequests"
    ],
    "Resource": "*"
  }]
}
```

### Service Control Policies (SCPs)
- **Prevent Root Usage**: Bloqueia ações da conta root
- **Enforce MFA**: Requer MFA para ações sensíveis
- **Region Restriction**: Limita operações a regiões específicas


---

## 🔒 15. AWS Secrets Manager - Secrets Storage

### Secrets Armazenados

#### RDS Database Credentials
- **Secret Name**: `evo-rds-credentials`
- **Rotation**: Automática (30 dias)
- **Content**:
```json
{
  "username": "evo_admin",
  "password": "GENERATED_PASSWORD",
  "engine": "postgres",
  "host": "evo-postgres.xxxxx.us-east-1.rds.amazonaws.com",
  "port": 5432,
  "dbname": "evo_production"
}
```

#### Customer AWS Credentials (Encrypted)
- **Pattern**: `evo/customer/{organization_id}/credentials`
- **Encryption**: KMS key `evo-customer-credentials-key`
- **Content**:
```json
{
  "roleArn": "arn:aws:iam::CUSTOMER_ACCOUNT:role/EvoMonitoringRole",
  "externalId": "UUID",
  "region": "us-east-1"
}
```

#### API Keys
- **Secret Name**: `evo-api-keys`
- **Content**:
```json
{
  "bedrockApiKey": "...",
  "pagerDutyApiKey": "...",
  "slackWebhook": "..."
}
```

### Access Pattern
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });
const response = await client.send(
  new GetSecretValueCommand({ SecretId: 'evo-rds-credentials' })
);
const secret = JSON.parse(response.SecretString);
```


---

## 🔑 16. AWS KMS - Key Management Service

### Customer Master Keys (CMKs)

#### RDS Encryption Key
- **Key ID**: `evo-rds-encryption-key`
- **Type**: Symmetric
- **Usage**: Encrypt RDS database at rest
- **Rotation**: Automática (anual)

#### S3 Encryption Key
- **Key ID**: `evo-s3-encryption-key`
- **Type**: Symmetric
- **Usage**: Encrypt S3 buckets (SSE-KMS)
- **Buckets**: Frontend, backups, CloudTrail logs

#### Customer Credentials Key
- **Key ID**: `evo-customer-credentials-key`
- **Type**: Symmetric
- **Usage**: Encrypt customer AWS credentials no Secrets Manager
- **Access**: Apenas Lambda execution role

#### CloudWatch Logs Key
- **Key ID**: `evo-logs-encryption-key`
- **Type**: Symmetric
- **Usage**: Encrypt CloudWatch Logs
- **Log Groups**: Todos os log groups da plataforma

### Key Policies
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "Enable IAM User Permissions",
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::383234048592:root"
    },
    "Action": "kms:*",
    "Resource": "*"
  }, {
    "Sid": "Allow Lambda to use the key",
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::383234048592:role/evo-lambda-execution-role"
    },
    "Action": [
      "kms:Decrypt",
      "kms:DescribeKey"
    ],
    "Resource": "*"
  }]
}
```


---

## 📜 17. AWS Certificate Manager (ACM) - SSL/TLS Certificates

### Certificates

#### Wildcard Certificate
- **Domain**: `*.ai.udstec.io`
- **ARN**: `arn:aws:acm:us-east-1:383234048592:certificate/xxxxx`
- **Validation**: DNS (Route 53)
- **Status**: Issued
- **Usage**:
  - CloudFront: `evo.ai.udstec.io`
  - API Gateway: `api-evo.ai.udstec.io`
  - Future subdomains

#### Certificate Renewal
- **Type**: Automática (AWS managed)
- **Validation**: DNS records mantidos no Route 53
- **Notification**: Email 45 dias antes da expiração (backup)

### DNS Validation Records (Route 53)
```
_acme-challenge.ai.udstec.io CNAME _xxx.acm-validations.aws.
```


---

## 🌍 18. Amazon Route 53 - DNS Management

### Hosted Zone
- **Domain**: `ai.udstec.io`
- **Zone ID**: `Z0123456789ABCDEFGHIJ`
- **Type**: Public hosted zone
- **Name Servers**: AWS provided

### DNS Records

#### Frontend (CloudFront)
```
evo.ai.udstec.io    A    ALIAS → CloudFront Distribution (E1PY7U3VNT6P1R)
```

#### API Gateway
```
api-evo.ai.udstec.io    A    ALIAS → API Gateway Regional Endpoint
```

#### ACM Validation
```
_acme-challenge.ai.udstec.io    CNAME    → ACM validation record
```

#### Email (SES - Future)
```
ai.udstec.io    MX    10 inbound-smtp.us-east-1.amazonaws.com
_amazonses.ai.udstec.io    TXT    → SES verification
```

### Health Checks
- **Frontend**: HTTP check em `https://evo.ai.udstec.io/health`
- **API**: HTTPS check em `https://api-evo.ai.udstec.io/health`
- **Frequency**: 30 segundos
- **Alarm**: SNS notification se unhealthy


---

## ☁️ 19. AWS CloudFormation - Infrastructure as Code

### Stacks Principais

#### Infrastructure Stack
- **Stack Name**: `evo-uds-v3-nodejs-infra`
- **Resources**:
  - VPC e Networking (subnets, IGW, NAT)
  - RDS PostgreSQL
  - Security Groups
  - VPC Endpoints
- **Parameters**:
  - `Environment`: production/development
  - `DBInstanceClass`: db.t3.micro/medium
  - `DBAllocatedStorage`: 20-100 GB

#### Application Stack
- **Stack Name**: `evo-uds-v3-application`
- **Resources**:
  - Lambda Functions (todas)
  - Lambda Layers
  - API Gateway
  - Cognito User Pool
  - S3 Buckets
  - CloudFront Distribution
- **Dependencies**: Infrastructure Stack

#### Monitoring Stack
- **Stack Name**: `evo-monitoring`
- **Resources**:
  - CloudWatch Dashboards
  - CloudWatch Alarms
  - SNS Topics
  - EventBridge Rules

### Customer QuickConnect Templates

#### Basic IAM Role
- **Template**: `cloudformation/customer-iam-role.yaml`
- **S3 URL**: `https://evo-quickconnect-templates.s3.amazonaws.com/customer-iam-role.yaml`
- **Resources**:
  - IAM Role com trust relationship
  - Managed policies: SecurityAudit, ViewOnlyAccess
  - Custom policy para Cost Explorer

#### WAF Monitoring Role
- **Template**: `cloudformation/customer-iam-role-waf.yaml`
- **S3 URL**: `https://evo-quickconnect-templates.s3.amazonaws.com/customer-iam-role-waf.yaml`
- **Resources**:
  - IAM Role com permissões WAF
  - Kinesis Firehose para logs
  - S3 bucket para WAF logs

#### WAF Monitoring Stack
- **Template**: `cloudformation/waf-monitoring-stack.yaml`
- **Resources**:
  - Kinesis Data Firehose
  - Lambda processor
  - S3 bucket com lifecycle
  - CloudWatch Log Group

### Stack Updates
```bash
# Update via CDK
cd infra
npm run build
cdk diff
cdk deploy --all

# Update via CLI (templates)
aws cloudformation update-stack \
  --stack-name evo-uds-v3-nodejs-infra \
  --template-body file://template.yaml \
  --parameters file://parameters.json
```


---

## 🔄 20. Amazon EventBridge - Event-Driven Architecture

### Rules Configuradas

#### Daily Cost Fetch
- **Rule Name**: `evo-daily-cost-fetch`
- **Schedule**: `cron(0 2 * * ? *)` (02:00 UTC diariamente)
- **Target**: Lambda `fetch-daily-costs`
- **Input**: 
```json
{
  "source": "eventbridge",
  "action": "fetch-all-organizations"
}
```

#### Weekly Security Scan
- **Rule Name**: `evo-weekly-security-scan`
- **Schedule**: `cron(0 3 ? * SUN *)` (Domingos 03:00 UTC)
- **Target**: Lambda `security-scan`
- **Input**: Full scan de todas as organizações

#### Monthly RI/SP Analysis
- **Rule Name**: `evo-monthly-ri-sp-analysis`
- **Schedule**: `cron(0 4 1 * ? *)` (Dia 1 de cada mês, 04:00 UTC)
- **Target**: Lambda `ri-sp-analyzer`

#### Database Backup
- **Rule Name**: `evo-database-backup`
- **Schedule**: `cron(0 1 * * ? *)` (01:00 UTC diariamente)
- **Target**: Lambda `backup-database`

#### WAF Log Processing
- **Rule Name**: `evo-waf-log-processing`
- **Event Pattern**:
```json
{
  "source": ["aws.wafv2"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventName": ["UpdateWebACL", "CreateWebACL"]
  }
}
```
- **Target**: Lambda `waf-setup-monitoring`

### Custom Events

#### Security Alert Event
```json
{
  "source": "evo.security",
  "detail-type": "Security Alert",
  "detail": {
    "organizationId": "ORG-UUID",
    "severity": "critical",
    "finding": {
      "type": "S3_BUCKET_PUBLIC",
      "resource": "arn:aws:s3:::bucket-name",
      "description": "S3 bucket is publicly accessible"
    }
  }
}
```

#### Cost Anomaly Event
```json
{
  "source": "evo.cost",
  "detail-type": "Cost Anomaly Detected",
  "detail": {
    "organizationId": "ORG-UUID",
    "currentCost": 1500.00,
    "previousCost": 1000.00,
    "percentageIncrease": 50,
    "service": "EC2"
  }
}
```


---

## 📊 21. Amazon Kinesis - Real-time Data Streaming

### Kinesis Data Firehose

#### WAF Logs Stream
- **Delivery Stream Name**: `evo-waf-logs-stream`
- **Source**: AWS WAF logs
- **Destination**: S3 bucket `aws-waf-logs-evo-{organization_id}`
- **Buffer Size**: 5 MB
- **Buffer Interval**: 60 segundos
- **Compression**: GZIP
- **Transformation**: Lambda `waf-log-processor`

#### Lambda Processor Configuration
```typescript
// Processa logs em batch antes de salvar no S3
export async function handler(event: FirehoseTransformationEvent) {
  const records = event.records.map(record => {
    const payload = Buffer.from(record.data, 'base64').toString('utf-8');
    const log = JSON.parse(payload);
    
    // Enriquecimento de dados
    const enriched = {
      ...log,
      processedAt: new Date().toISOString(),
      threatLevel: calculateThreatLevel(log),
      geoLocation: lookupGeoLocation(log.httpRequest.clientIp)
    };
    
    return {
      recordId: record.recordId,
      result: 'Ok',
      data: Buffer.from(JSON.stringify(enriched)).toString('base64')
    };
  });
  
  return { records };
}
```

#### CloudWatch Logs Stream (Future)
- **Delivery Stream Name**: `evo-cloudwatch-logs-stream`
- **Source**: CloudWatch Logs (subscription filter)
- **Destination**: S3 + OpenSearch
- **Use Case**: Log analytics e search


---

## 🔍 22. Amazon Athena - SQL Analytics

### Database: `evo_logs`

#### CloudTrail Table
```sql
CREATE EXTERNAL TABLE cloudtrail_logs (
  eventversion STRING,
  useridentity STRUCT<
    type:STRING,
    principalid:STRING,
    arn:STRING,
    accountid:STRING,
    invokedby:STRING,
    accesskeyid:STRING,
    userName:STRING,
    sessioncontext:STRUCT<
      attributes:STRUCT<
        mfaauthenticated:STRING,
        creationdate:STRING
      >,
      sessionissuer:STRUCT<
        type:STRING,
        principalId:STRING,
        arn:STRING,
        accountId:STRING,
        userName:STRING
      >
    >
  >,
  eventtime STRING,
  eventsource STRING,
  eventname STRING,
  awsregion STRING,
  sourceipaddress STRING,
  useragent STRING,
  errorcode STRING,
  errormessage STRING,
  requestparameters STRING,
  responseelements STRING,
  additionaleventdata STRING,
  requestid STRING,
  eventid STRING,
  resources ARRAY<STRUCT<
    ARN:STRING,
    accountId:STRING,
    type:STRING
  >>,
  eventtype STRING,
  apiversion STRING,
  readonly STRING,
  recipientaccountid STRING,
  serviceeventdetails STRING,
  sharedeventid STRING,
  vpcendpointid STRING
)
PARTITIONED BY (region STRING, year STRING, month STRING, day STRING)
ROW FORMAT SERDE 'com.amazon.emr.hive.serde.CloudTrailSerde'
STORED AS INPUTFORMAT 'com.amazon.emr.cloudtrail.CloudTrailInputFormat'
OUTPUTFORMAT 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION 's3://evo-cloudtrail-logs-383234048592/AWSLogs/383234048592/CloudTrail/';
```

#### WAF Logs Table
```sql
CREATE EXTERNAL TABLE waf_logs (
  timestamp BIGINT,
  formatVersion INT,
  webaclId STRING,
  terminatingRuleId STRING,
  terminatingRuleType STRING,
  action STRING,
  httpSourceName STRING,
  httpSourceId STRING,
  ruleGroupList ARRAY<STRUCT<
    ruleGroupId:STRING,
    terminatingRule:STRUCT<
      ruleId:STRING,
      action:STRING
    >,
    nonTerminatingMatchingRules:ARRAY<STRUCT<
      ruleId:STRING,
      action:STRING
    >>,
    excludedRules:ARRAY<STRUCT<
      ruleId:STRING
    >>
  >>,
  rateBasedRuleList ARRAY<STRUCT<
    rateBasedRuleId:STRING,
    limitKey:STRING,
    maxRateAllowed:INT
  >>,
  nonTerminatingMatchingRules ARRAY<STRUCT<
    ruleId:STRING,
    action:STRING
  >>,
  httpRequest STRUCT<
    clientIp:STRING,
    country:STRING,
    headers:ARRAY<STRUCT<
      name:STRING,
      value:STRING
    >>,
    uri:STRING,
    args:STRING,
    httpVersion:STRING,
    httpMethod:STRING,
    requestId:STRING
  >
)
PARTITIONED BY (year STRING, month STRING, day STRING, hour STRING)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://aws-waf-logs-evo-{organization_id}/';
```

### Saved Queries

#### Failed Login Attempts
```sql
SELECT 
  useridentity.principalid,
  sourceipaddress,
  COUNT(*) as failed_attempts,
  MIN(eventtime) as first_attempt,
  MAX(eventtime) as last_attempt
FROM cloudtrail_logs
WHERE eventname = 'ConsoleLogin'
  AND errorcode = 'Failed authentication'
  AND year = '2026'
  AND month = '01'
GROUP BY useridentity.principalid, sourceipaddress
HAVING COUNT(*) > 5
ORDER BY failed_attempts DESC;
```

#### Top Blocked IPs (WAF)
```sql
SELECT 
  httpRequest.clientIp as ip,
  httpRequest.country as country,
  COUNT(*) as blocked_requests,
  terminatingRuleId as rule
FROM waf_logs
WHERE action = 'BLOCK'
  AND year = '2026'
  AND month = '01'
GROUP BY httpRequest.clientIp, httpRequest.country, terminatingRuleId
ORDER BY blocked_requests DESC
LIMIT 100;
```

### Workgroup
- **Name**: `evo-analytics`
- **Output Location**: `s3://evo-athena-results-383234048592/`
- **Encryption**: SSE-S3
- **Data Scanned per Query**: ~10-100 MB (otimizado com partições)


---

## 🎯 23. AWS Systems Manager (SSM) - Parameter Store

### Parameters Armazenados

#### Application Configuration
```
/evo/production/database/host → RDS endpoint
/evo/production/database/port → 5432
/evo/production/database/name → evo_production
/evo/production/cognito/user-pool-id → us-east-1_cnesJ48lR
/evo/production/cognito/client-id → 4p0okvsr983v2f8rrvgpls76d6
/evo/production/api/base-url → https://api-evo.ai.udstec.io
/evo/production/frontend/url → https://evo.ai.udstec.io
```

#### Feature Flags
```
/evo/features/waf-monitoring → true
/evo/features/ai-copilot → true
/evo/features/cost-optimization → true
/evo/features/compliance-scanning → true
/evo/features/webauthn → true
```

#### Thresholds & Limits
```
/evo/limits/max-security-scans-per-day → 10
/evo/limits/max-cost-queries-per-hour → 100
/evo/thresholds/cost-anomaly-percentage → 20
/evo/thresholds/waf-block-threshold → 100
```

### Access Pattern
```typescript
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({ region: 'us-east-1' });
const response = await ssm.send(
  new GetParameterCommand({
    Name: '/evo/production/database/host',
    WithDecryption: true
  })
);
const dbHost = response.Parameter.Value;
```

### Parameter Tiers
- **Standard**: Parâmetros < 4KB (gratuito)
- **Advanced**: Parâmetros > 4KB (pago)
- **Encryption**: KMS key `evo-ssm-parameters-key`


---

## 🔐 24. AWS STS - Security Token Service

### Assume Role Pattern

#### Cross-Account Access
```typescript
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';

const sts = new STSClient({ region: 'us-east-1' });

// Assume role na conta do cliente
const response = await sts.send(
  new AssumeRoleCommand({
    RoleArn: 'arn:aws:iam::CUSTOMER_ACCOUNT:role/EvoMonitoringRole',
    RoleSessionName: `evo-scan-${organizationId}`,
    ExternalId: externalId, // UUID único por organização
    DurationSeconds: 3600 // 1 hora
  })
);

const credentials = {
  accessKeyId: response.Credentials.AccessKeyId,
  secretAccessKey: response.Credentials.SecretAccessKey,
  sessionToken: response.Credentials.SessionToken
};

// Usar credenciais temporárias
const ec2 = new EC2Client({ 
  region: 'us-east-1',
  credentials 
});
```

### Session Tags
```typescript
{
  Tags: [
    { Key: 'Organization', Value: organizationId },
    { Key: 'Purpose', Value: 'SecurityScan' },
    { Key: 'RequestedBy', Value: userId }
  ]
}
```

### Trust Policy (Customer Side)
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::383234048592:root"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "UNIQUE-EXTERNAL-ID-PER-ORG"
      }
    }
  }]
}
```


---

## 📧 25. Amazon SES - Simple Email Service (Future)

### Configuration (Planejado)
- **Domain**: `ai.udstec.io`
- **Verification**: DNS records (TXT, DKIM, DMARC)
- **Sending Limits**: 
  - Development: 200 emails/day
  - Production: 50,000 emails/day (após request)

### Email Templates

#### Security Alert
```html
Subject: [EVO] Security Alert - {{severity}}
Body: Critical security finding detected in your AWS account...
```

#### Cost Anomaly
```html
Subject: [EVO] Cost Anomaly Detected - {{percentage}}% increase
Body: Your AWS costs increased by {{percentage}}% in the last 24 hours...
```

#### Weekly Digest
```html
Subject: [EVO] Weekly Security & Cost Report
Body: Summary of your AWS environment for the week...
```

### SMTP Configuration
```
Host: email-smtp.us-east-1.amazonaws.com
Port: 587 (TLS) or 465 (SSL)
Username: SMTP credentials from IAM
Password: SMTP password
```


---

## 🏗️ 26. AWS CDK - Cloud Development Kit

### Stack Structure

#### Main App
```typescript
// infra/bin/app.ts
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';
import { DatabaseStack } from '../lib/database-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

const vpcStack = new VpcStack(app, 'EvoVpcStack', {
  env: { account: '383234048592', region: 'us-east-1' }
});

const dbStack = new DatabaseStack(app, 'EvoDatabaseStack', {
  vpc: vpcStack.vpc,
  env: { account: '383234048592', region: 'us-east-1' }
});

const apiStack = new ApiStack(app, 'EvoApiStack', {
  vpc: vpcStack.vpc,
  database: dbStack.database,
  env: { account: '383234048592', region: 'us-east-1' }
});

const frontendStack = new FrontendStack(app, 'EvoFrontendStack', {
  apiUrl: apiStack.apiUrl,
  env: { account: '383234048592', region: 'us-east-1' }
});
```

#### VPC Stack
```typescript
// infra/lib/vpc-stack.ts
export class VpcStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'EvoVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24
        }
      ]
    });

    // VPC Endpoints
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3
    });
  }
}
```

#### Database Stack
```typescript
// infra/lib/database-stack.ts
export class DatabaseStack extends cdk.Stack {
  public readonly database: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    this.database = new rds.DatabaseInstance(this, 'EvoDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_10
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
      storageEncrypted: true
    });
  }
}
```

### CDK Commands
```bash
# Synthesize CloudFormation template
cdk synth

# Show differences
cdk diff

# Deploy all stacks
cdk deploy --all

# Deploy specific stack
cdk deploy EvoApiStack

# Destroy stack (cuidado!)
cdk destroy EvoApiStack
```


---

## 🔒 27. AWS Security Hub - Security Posture Management (Future)

### Configuration (Planejado)
- **Standards**: 
  - AWS Foundational Security Best Practices
  - CIS AWS Foundations Benchmark
  - PCI DSS
- **Integration**: Importar findings para a plataforma
- **Automation**: Remediation automática via Lambda

---

## 🎯 28. AWS Config - Resource Compliance (Future)

### Rules (Planejado)
- **s3-bucket-public-read-prohibited**
- **encrypted-volumes**
- **rds-encryption-enabled**
- **iam-password-policy**
- **cloudtrail-enabled**

### Remediation
- Lambda functions para correção automática
- SNS notifications para aprovação manual

---

## 📊 29. Amazon QuickSight - BI Dashboards (Future)

### Datasets (Planejado)
- Cost data from RDS
- Security findings
- Compliance status
- WAF metrics

### Dashboards
- Executive dashboard
- Security posture
- Cost optimization
- Compliance reports

---

## 🔄 30. AWS Backup - Automated Backups

### Backup Plans

#### RDS Backup Plan
- **Frequency**: Diária (01:00 UTC)
- **Retention**: 7 dias (point-in-time recovery)
- **Vault**: `evo-backup-vault`
- **Encryption**: KMS key `evo-backup-key`

#### Configuration Backup
- **Frequency**: Diária
- **Content**: 
  - Prisma schema
  - CloudFormation templates
  - Lambda code (S3)
  - Environment variables
- **Destination**: S3 bucket `evo-backups-383234048592`

### Disaster Recovery
- **RTO**: 4 horas (Recovery Time Objective)
- **RPO**: 24 horas (Recovery Point Objective)
- **Cross-Region Replication**: S3 → us-west-2


---

## 📋 RESUMO EXECUTIVO

### Serviços AWS em Uso (30 serviços)

#### Compute & Serverless
1. **AWS Lambda** - 30+ funções Node.js/TypeScript
2. **Amazon API Gateway** - REST API com Cognito authorizer

#### Storage & Database
3. **Amazon RDS** - PostgreSQL 15.10 com Prisma ORM
4. **Amazon S3** - Frontend, backups, logs, templates
5. **Amazon EBS** - Volumes para RDS

#### Networking & Content Delivery
6. **Amazon VPC** - Rede privada isolada
7. **Amazon CloudFront** - CDN global para frontend
8. **Amazon Route 53** - DNS management
9. **Elastic Load Balancing** - (Reservado para futuro)

#### Security & Identity
10. **AWS Cognito** - Autenticação e autorização
11. **AWS IAM** - Roles, policies, cross-account access
12. **AWS KMS** - Encryption keys management
13. **AWS Secrets Manager** - Credenciais criptografadas
14. **AWS Certificate Manager** - SSL/TLS certificates
15. **AWS WAF** - Web Application Firewall

#### Monitoring & Logging
16. **Amazon CloudWatch** - Logs, metrics, alarms, dashboards
17. **AWS CloudTrail** - Audit logs (7 anos)
18. **Amazon Athena** - SQL analytics sobre logs

#### AI & Machine Learning
19. **Amazon Bedrock** - Claude 3.5 Sonnet (Generative AI)
20. **Amazon SageMaker** - (Reservado para ML models)

#### Analytics & Streaming
21. **Amazon Kinesis** - Real-time log streaming (WAF)
22. **AWS Cost Explorer** - Cost analysis e RI/SP recommendations

#### Messaging & Notifications
23. **Amazon SNS** - Notificações (security, cost, WAF, system)
24. **Amazon SQS** - (Reservado para queues)
25. **Amazon SES** - Email service (planejado)

#### Infrastructure & Automation
26. **AWS CloudFormation** - IaC (stacks + customer templates)
27. **AWS CDK** - Infrastructure as Code (TypeScript)
28. **Amazon EventBridge** - Event-driven automation
29. **AWS Systems Manager** - Parameter Store

#### Security & Compliance
30. **AWS STS** - Temporary credentials (cross-account)
31. **AWS Backup** - Automated backups
32. **AWS Security Hub** - (Planejado)
33. **AWS Config** - (Planejado)


---

## 💰 ESTIMATIVA DE CUSTOS MENSAIS

### Ambiente de Produção (Estimativa)

#### Compute
- **Lambda**: ~$50-100/mês
  - 1M invocations/mês
  - 256-512 MB memory
  - Avg 2s duration
- **API Gateway**: ~$35/mês
  - 1M requests/mês

#### Storage & Database
- **RDS PostgreSQL**: ~$30-80/mês
  - db.t3.micro (dev) ou db.t3.medium (prod)
  - 20-100 GB storage
  - Multi-AZ: +100%
- **S3**: ~$10-20/mês
  - Frontend: ~500 MB
  - Backups: ~5 GB
  - Logs: ~10 GB/mês
- **CloudFront**: ~$20-50/mês
  - 100 GB data transfer
  - 1M requests

#### Networking
- **NAT Gateway**: ~$32/mês
  - $0.045/hora = ~$32/mês
  - Data processing: $0.045/GB
- **VPC**: Gratuito (endpoints gateway)
- **Route 53**: ~$1/mês
  - Hosted zone: $0.50/mês
  - Queries: ~$0.40/mês

#### Security & Monitoring
- **Cognito**: ~$5-10/mês
  - 1000 MAU gratuitos
  - $0.0055/MAU adicional
- **CloudWatch**: ~$10-30/mês
  - Logs: 5 GB ingest
  - Metrics: Custom metrics
  - Dashboards: 3 dashboards
- **CloudTrail**: ~$5/mês
  - Management events: Gratuito (primeiro trail)
  - Data events: $0.10/100k events
- **WAF**: ~$10-30/mês
  - WebACL: $5/mês
  - Rules: $1/rule/mês
  - Requests: $0.60/1M requests
- **KMS**: ~$5/mês
  - 4 keys × $1/mês
  - API calls: $0.03/10k requests
- **Secrets Manager**: ~$2/mês
  - 5 secrets × $0.40/mês

#### AI & Analytics
- **Bedrock**: ~$20-100/mês (variável)
  - Claude 3.5 Sonnet
  - Input: $0.003/1k tokens
  - Output: $0.015/1k tokens
- **Athena**: ~$5-10/mês
  - $5/TB scanned
  - ~1-2 TB/mês com partições
- **Kinesis Firehose**: ~$5-15/mês
  - Data ingestion: $0.029/GB
  - ~500 GB/mês (WAF logs)

#### Messaging
- **SNS**: ~$1/mês
  - 1M publishes gratuitos
  - Email: $2/100k emails
- **EventBridge**: Gratuito
  - Eventos AWS: Gratuito
  - Custom events: $1/1M events

#### Backup & DR
- **Backup**: ~$5-10/mês
  - Storage: $0.05/GB/mês
  - ~100 GB backups
- **S3 Glacier**: ~$2/mês
  - Old logs: ~50 GB

### **TOTAL ESTIMADO: $300-600/mês**

#### Breakdown por Categoria
- **Compute & API**: 30% (~$100-180)
- **Storage & Database**: 25% (~$75-150)
- **Networking**: 15% (~$45-90)
- **Security & Monitoring**: 15% (~$45-90)
- **AI & Analytics**: 10% (~$30-60)
- **Outros**: 5% (~$15-30)

### Otimizações Possíveis
1. **Reserved Instances** para RDS: -40% ($18-48 economia)
2. **Savings Plans** para Lambda: -17% ($8-17 economia)
3. **S3 Intelligent-Tiering**: -30% em storage ($3-6 economia)
4. **CloudWatch Logs retention**: 7 dias em vez de 30 (-50% em logs)
5. **NAT Gateway**: Usar VPC Endpoints quando possível

### Custos por Cliente (Multi-tenant)
- **Custo fixo**: ~$200/mês (infraestrutura base)
- **Custo variável**: ~$5-20/cliente/mês
- **Break-even**: ~20-40 clientes


---

## 🏗️ ARQUITETURA DE REFERÊNCIA

### Diagrama de Alto Nível

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUÁRIOS                                 │
│                    (Browser / Mobile)                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Amazon CloudFront                             │
│              (CDN + SSL/TLS + WAF Protection)                    │
│                  evo.ai.udstec.io                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Amazon S3                                   │
│              (Frontend React/Vite SPA)                           │
│     evo-uds-v3-production-frontend-383234048592                  │
└─────────────────────────────────────────────────────────────────┘

                         │ API Calls
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Amazon API Gateway                              │
│              (REST API + Cognito Auth)                           │
│                api-evo.ai.udstec.io                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AWS Cognito                                   │
│              (JWT Validation + MFA)                              │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AWS Lambda                                    │
│              (30+ Functions Node.js/TS)                          │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Security    │  │     Cost     │  │      AI      │          │
│  │   Scans      │  │  Analysis    │  │   Bedrock    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │     WAF      │  │   WebAuthn   │  │  Dashboard   │          │
│  │  Monitoring  │  │   Auth       │  │    APIs      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Amazon     │  │   Amazon    │  │   AWS STS   │
│    RDS      │  │   Bedrock   │  │  (Assume    │
│ PostgreSQL  │  │   Claude    │  │   Role)     │
│  + Prisma   │  │  3.5 Sonnet │  │             │
└─────────────┘  └─────────────┘  └──────┬──────┘
                                          │
                                          ▼
                                  ┌─────────────┐
                                  │  Customer   │
                                  │   AWS       │
                                  │  Account    │
                                  └─────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    MONITORING & LOGGING                          │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ CloudWatch   │  │  CloudTrail  │  │   Kinesis    │          │
│  │ Logs/Metrics │  │  Audit Logs  │  │  Firehose    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │     SNS      │  │ EventBridge  │  │   Athena     │          │
│  │ Notifications│  │  Automation  │  │  Analytics   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY LAYER                                │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │     WAF      │  │     KMS      │  │   Secrets    │          │
│  │  Protection  │  │  Encryption  │  │   Manager    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```


---

## 🔄 FLUXOS PRINCIPAIS

### 1. Autenticação do Usuário

```
User → CloudFront → S3 (Frontend)
  ↓
Frontend → API Gateway → Cognito
  ↓
Cognito valida credenciais
  ↓
Retorna JWT (Access Token + ID Token + Refresh Token)
  ↓
Frontend armazena tokens (localStorage)
  ↓
Todas as requests incluem: Authorization: Bearer {token}
```

### 2. Security Scan Cross-Account

```
User → API Gateway → Lambda (security-scan)
  ↓
Lambda → STS AssumeRole (customer account)
  ↓
STS retorna temporary credentials
  ↓
Lambda → EC2/S3/IAM/RDS APIs (customer account)
  ↓
Coleta dados de segurança
  ↓
Lambda → Bedrock (análise com IA)
  ↓
Lambda → RDS (salva resultados)
  ↓
Lambda → SNS (notificação se critical)
  ↓
Retorna resultados para frontend
```

### 3. WAF Real-time Monitoring

```
Customer WAF → Kinesis Firehose
  ↓
Firehose → Lambda (waf-log-processor)
  ↓
Lambda processa logs em batch
  ↓
Lambda → RDS (salva eventos)
  ↓
Lambda detecta padrões maliciosos
  ↓
Lambda → WAF (auto-block IP se threshold)
  ↓
Lambda → SNS (alerta se ataque detectado)
  ↓
Firehose → S3 (logs permanentes)
```

### 4. Cost Analysis Daily

```
EventBridge (cron: 02:00 UTC)
  ↓
Lambda (fetch-daily-costs)
  ↓
Lambda → STS AssumeRole (customer account)
  ↓
Lambda → Cost Explorer API
  ↓
Coleta custos por serviço/região
  ↓
Lambda → RDS (salva dados)
  ↓
Lambda detecta anomalias (>20% increase)
  ↓
Lambda → SNS (alerta se anomalia)
  ↓
Lambda → Bedrock (recomendações de otimização)
```

### 5. AI Copilot Chat

```
User → Frontend (chat input)
  ↓
Frontend → API Gateway → Lambda (bedrock-chat)
  ↓
Lambda → RDS (busca contexto: scans, costs, alerts)
  ↓
Lambda constrói prompt com contexto
  ↓
Lambda → Bedrock (Claude 3.5 Sonnet)
  ↓
Bedrock → Lambda (streaming response)
  ↓
Lambda → Frontend (Server-Sent Events)
  ↓
Frontend renderiza resposta em tempo real
```

### 6. WebAuthn/Passkey Registration

```
User → Frontend (click "Add Passkey")
  ↓
Frontend → navigator.credentials.create()
  ↓
Browser/OS → Biometric prompt (Face ID/Touch ID)
  ↓
User autentica biometricamente
  ↓
Browser gera key pair (private key fica no device)
  ↓
Frontend → API Gateway → Lambda (webauthn-register)
  ↓
Lambda valida challenge
  ↓
Lambda → RDS (salva public key + credential ID)
  ↓
Retorna sucesso
```


---

## 🔐 SEGURANÇA MULTI-CAMADAS

### Layer 1: Network Security
- ✅ **VPC Isolation** - Recursos em rede privada
- ✅ **Security Groups** - Firewall stateful
- ✅ **NACLs** - Firewall stateless (subnet level)
- ✅ **Private Subnets** - Lambda e RDS sem IP público
- ✅ **NAT Gateway** - Saída controlada para internet

### Layer 2: Application Security
- ✅ **AWS WAF** - Proteção contra OWASP Top 10
- ✅ **Rate Limiting** - 2000 req/min por IP
- ✅ **Geo Blocking** - Opcional por país
- ✅ **IP Reputation** - Bloqueio automático de IPs maliciosos
- ✅ **CORS** - Configuração restritiva

### Layer 3: Authentication & Authorization
- ✅ **Cognito** - Autenticação centralizada
- ✅ **JWT Tokens** - Stateless authentication
- ✅ **MFA** - TOTP opcional
- ✅ **WebAuthn/Passkeys** - Autenticação biométrica
- ✅ **Custom Attributes** - Multi-tenancy via organization_id

### Layer 4: Data Security
- ✅ **Encryption at Rest** - KMS para RDS, S3, Secrets
- ✅ **Encryption in Transit** - TLS 1.2+ obrigatório
- ✅ **Database Isolation** - Row-level security via Prisma
- ✅ **Secrets Manager** - Credenciais criptografadas
- ✅ **KMS Keys** - Chaves separadas por tipo de dado

### Layer 5: API Security
- ✅ **API Gateway Authorizer** - Validação JWT em todas as requests
- ✅ **Request Validation** - Schema validation (Zod)
- ✅ **Throttling** - 10,000 req/s burst, 5,000 steady
- ✅ **API Keys** - Opcional para integrações
- ✅ **CloudWatch Logs** - Todas as requests logadas

### Layer 6: IAM Security
- ✅ **Least Privilege** - Roles com permissões mínimas
- ✅ **Cross-Account Roles** - External ID obrigatório
- ✅ **Session Tags** - Rastreabilidade de ações
- ✅ **Service Control Policies** - Restrições organizacionais
- ✅ **MFA for Sensitive Actions** - Operações críticas

### Layer 7: Monitoring & Audit
- ✅ **CloudTrail** - Audit logs de 7 anos
- ✅ **CloudWatch Alarms** - Alertas de anomalias
- ✅ **SNS Notifications** - Alertas em tempo real
- ✅ **Athena Queries** - Análise forense de logs
- ✅ **EventBridge** - Automação de resposta a incidentes

### Layer 8: Compliance
- ✅ **GDPR** - Data residency, right to deletion
- ✅ **SOC 2** - Audit logs, encryption, access control
- ✅ **HIPAA** - Encryption, audit trails (se aplicável)
- ✅ **PCI DSS** - Tokenization, encryption (se aplicável)
- ✅ **ISO 27001** - Security controls documentation


---

## 🚀 DEPLOYMENT WORKFLOW

### 1. Frontend Deployment

```bash
# Build
npm run build

# Sync to S3
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"

# index.html sem cache (para SPA routing)
aws s3 cp dist/index.html s3://evo-uds-v3-production-frontend-383234048592/ \
  --cache-control "no-cache,no-store,must-revalidate"

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id E1PY7U3VNT6P1R \
  --paths "/*"

# Aguardar invalidação (opcional)
aws cloudfront wait invalidation-completed \
  --distribution-id E1PY7U3VNT6P1R \
  --id INVALIDATION_ID
```

### 2. Backend Deployment

```bash
# Build TypeScript
cd backend
npm run build

# Gerar Prisma Client
npm run prisma:generate

# Atualizar Lambda Layer (se necessário)
./scripts/update-lambda-layer.sh

# Deploy via CDK
cd ../infra
npm run build
cdk diff EvoApiStack
cdk deploy EvoApiStack --require-approval never

# Ou deploy individual de Lambda
aws lambda update-function-code \
  --function-name evo-uds-v3-production-security-scan \
  --zip-file fileb://function.zip
```

### 3. Database Migration

```bash
# Development
cd backend
npx prisma migrate dev --name add_new_table

# Production
npx prisma migrate deploy

# Ou via Lambda
aws lambda invoke \
  --function-name evo-uds-v3-production-run-migrations \
  --payload '{"action":"deploy"}' \
  response.json
```

### 4. Infrastructure Update

```bash
cd infra

# Synthesize CloudFormation
cdk synth

# Show differences
cdk diff --all

# Deploy all stacks
cdk deploy --all

# Deploy specific stack
cdk deploy EvoVpcStack

# Rollback (se necessário)
aws cloudformation cancel-update-stack \
  --stack-name EvoApiStack
```

### 5. Rollback Strategy

```bash
# Frontend: Restaurar versão anterior do S3
aws s3 sync s3://evo-backups-383234048592/frontend/v1.2.3/ \
  s3://evo-uds-v3-production-frontend-383234048592/ \
  --delete

# Backend: Reverter Lambda para versão anterior
aws lambda update-function-code \
  --function-name evo-uds-v3-production-security-scan \
  --s3-bucket evo-lambda-code-383234048592 \
  --s3-key security-scan-v1.2.3.zip

# Database: Restaurar snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier evo-postgres-restored \
  --db-snapshot-identifier evo-postgres-snapshot-2026-01-08
```


---

## 📊 MÉTRICAS E KPIs

### Performance Metrics

#### Frontend (CloudFront)
- **Cache Hit Ratio**: > 90%
- **TTFB (Time to First Byte)**: < 200ms
- **Page Load Time**: < 2s
- **Lighthouse Score**: > 90

#### API Gateway
- **Latency P50**: < 100ms
- **Latency P99**: < 500ms
- **Error Rate**: < 0.1%
- **Throttle Rate**: < 0.01%

#### Lambda Functions
- **Cold Start**: < 1s (com VPC)
- **Warm Execution**: < 200ms
- **Memory Utilization**: < 70%
- **Timeout Rate**: < 0.01%

#### RDS Database
- **Connection Pool**: 10-50 connections
- **Query Latency P95**: < 50ms
- **CPU Utilization**: < 70%
- **Storage Utilization**: < 80%

### Availability Metrics
- **Frontend Uptime**: 99.9% (CloudFront SLA)
- **API Uptime**: 99.95% (target)
- **Database Uptime**: 99.9% (Multi-AZ: 99.95%)
- **Overall System Uptime**: 99.9%

### Security Metrics
- **WAF Block Rate**: Variável (baseline: < 1%)
- **Failed Login Attempts**: < 5 per user per hour
- **Security Scan Coverage**: 100% dos recursos
- **Vulnerability Remediation Time**: < 7 dias (critical)

### Cost Metrics
- **Cost per Request**: ~$0.0001
- **Cost per User (MAU)**: ~$0.50-2.00
- **Infrastructure Cost**: ~$300-600/mês
- **Cost Optimization Savings**: Target 15-30%


---

## 🎯 ROADMAP DE SERVIÇOS AWS

### Q1 2026 (Atual)
- ✅ Lambda + API Gateway + Cognito
- ✅ RDS PostgreSQL + Prisma
- ✅ S3 + CloudFront + Route 53
- ✅ VPC + NAT Gateway
- ✅ CloudWatch + CloudTrail
- ✅ SNS + EventBridge
- ✅ Bedrock (Claude 3.5 Sonnet)
- ✅ WAF + Kinesis Firehose
- ✅ Cost Explorer + Athena
- ✅ KMS + Secrets Manager

### Q2 2026 (Planejado)
- 🔄 **Amazon SES** - Email notifications
- 🔄 **AWS Security Hub** - Centralized security findings
- 🔄 **AWS Config** - Resource compliance tracking
- 🔄 **Amazon SQS** - Message queuing para processamento assíncrono
- 🔄 **AWS Step Functions** - Orchestração de workflows complexos
- 🔄 **Amazon OpenSearch** - Log analytics e search

### Q3 2026 (Futuro)
- 📅 **Amazon QuickSight** - BI dashboards avançados
- 📅 **AWS Lambda@Edge** - Edge computing para CloudFront
- 📅 **Amazon ElastiCache** - Redis para caching
- 📅 **AWS AppSync** - GraphQL API (alternativa ao REST)
- 📅 **Amazon Timestream** - Time-series database para métricas
- 📅 **AWS Glue** - ETL para data lake

### Q4 2026 (Exploração)
- 🔮 **Amazon SageMaker** - Custom ML models
- 🔮 **AWS Fargate** - Containers para workloads pesados
- 🔮 **Amazon DynamoDB** - NoSQL para dados não-relacionais específicos
- 🔮 **AWS IoT Core** - Integração com dispositivos IoT
- 🔮 **Amazon Comprehend** - NLP para análise de logs
- 🔮 **AWS Lake Formation** - Data lake governance


---

## 📚 REFERÊNCIAS E DOCUMENTAÇÃO

### AWS Services Documentation
- [AWS Lambda](https://docs.aws.amazon.com/lambda/)
- [Amazon API Gateway](https://docs.aws.amazon.com/apigateway/)
- [Amazon RDS](https://docs.aws.amazon.com/rds/)
- [Amazon Cognito](https://docs.aws.amazon.com/cognito/)
- [AWS WAF](https://docs.aws.amazon.com/waf/)
- [Amazon Bedrock](https://docs.aws.amazon.com/bedrock/)
- [AWS CDK](https://docs.aws.amazon.com/cdk/)

### Internal Documentation
- `ARCHITECTURE.md` - Arquitetura do projeto
- `aws-infrastructure.md` - Infraestrutura AWS detalhada
- `DEPLOY_GUIDE.md` - Guia de deployment
- `SECURITY_CONFIGURATION.md` - Configurações de segurança
- `backend/prisma/schema.prisma` - Schema do banco de dados

### Tools & SDKs
- [Prisma ORM](https://www.prisma.io/docs)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [React 18](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [shadcn/ui](https://ui.shadcn.com/)

### Best Practices
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [AWS Security Best Practices](https://aws.amazon.com/security/best-practices/)
- [Serverless Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Multi-Tenant SaaS on AWS](https://aws.amazon.com/solutions/saas/)

---

## 📝 CHANGELOG

### v2.0.0 (2026-01-08)
- ✅ Documentação completa da stack AWS
- ✅ 30+ serviços AWS documentados
- ✅ Diagramas de arquitetura
- ✅ Fluxos de dados principais
- ✅ Estimativa de custos
- ✅ Métricas e KPIs
- ✅ Roadmap de serviços

### v1.0.0 (2025-12-01)
- ✅ Stack inicial implementada
- ✅ Lambda + API Gateway + Cognito
- ✅ RDS PostgreSQL + Prisma
- ✅ Frontend React + CloudFront

---

## 🤝 CONTRIBUIÇÕES

Este documento é mantido pela equipe de engenharia da EVO Platform.

Para sugestões ou correções:
1. Abra uma issue no repositório
2. Descreva a mudança proposta
3. Aguarde revisão da equipe

---

## 📄 LICENÇA

© 2026 EVO Platform - UDS Technologies
Todos os direitos reservados.

---

**Última atualização**: 08 de Janeiro de 2026
**Versão**: 2.0.0
**Autor**: Equipe EVO Platform

