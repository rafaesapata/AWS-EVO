# EVO Platform — Inventário Completo de Serviços AWS

> Documento gerado em 26/02/2026 com base na análise completa do repositório AWS-EVO.
> Região primária: `us-east-1` | Contas: Sandbox (`971354623291`) e Production (`523115032346`)

---

## 1. Computação & Serverless

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **AWS Lambda** | 194 funções serverless (Node.js 20.x, ARM64, esbuild). Handlers organizados em 8 domínios. | `sam/production-lambdas-only.yaml` |
| **AWS Lambda Layers** | Layer compartilhada com Prisma Client + zod para todas as funções. | `sam/production-lambdas-only.yaml` (DependenciesLayer) |
| **Amazon API Gateway (HTTP API v2)** | API principal com JWT Authorizer (Cognito). CORS configurado. Stage `prod` com auto-deploy. | `sam/production-lambdas-only.yaml`, `sam/production-infrastructure.yaml` |
| **Amazon API Gateway (REST API v1)** | API legada com Cognito Authorizer, custom domain `api.evo.nuevacore.com`. | `cloudformation/api-gateway-stack.yaml`, `sam/api-custom-domain.yaml` |

---

## 2. Banco de Dados & Cache

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **Amazon RDS (PostgreSQL 15)** | Banco principal. Multi-AZ em produção, gp3, Performance Insights habilitado, backup 7-30 dias. | `cloudformation/database-stack.yaml`, `sam/production-infrastructure.yaml` |
| **Amazon MemoryDB for Redis 7.1** | Cache em memória (rate limiting, sessões). TLS habilitado, single-shard, `db.t4g.small`. | `cloudformation/memorydb-stack.yaml` |
| **Amazon DynamoDB** | Tabela `evo-security-scan-cache` para persistência de cache do Security Engine entre cold starts. TTL habilitado, PAY_PER_REQUEST. | `cloudformation/security-cache-table.yaml` |

---

## 3. Armazenamento & CDN

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **Amazon S3** | Múltiplos buckets: frontend assets, ticket attachments, logs do CloudFront, artefatos SAM, artefatos CI/CD, public templates, código Lambda. | `cloudformation/frontend-stack.yaml`, `sam/production-infrastructure.yaml`, `cicd/cloudformation/codepipeline-stack.yaml` |
| **Amazon CloudFront** | CDN para frontend React. HTTP/2+3, OAC (Origin Access Control), custom domain `evo.nuevacore.com`, TLS 1.2. | `cloudformation/frontend-stack.yaml`, `sam/production-infrastructure.yaml` |

---

## 4. Autenticação & Autorização

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **Amazon Cognito User Pool** | Autenticação de usuários. MFA opcional (TOTP), atributos custom (`organization_id`, `roles`, `tenant_id`). Grupos admin/user. | `cloudformation/cognito-stack.yaml`, `sam/production-infrastructure.yaml` |
| **Amazon Cognito Identity Pool** | Credenciais AWS temporárias para usuários autenticados. | `cloudformation/cognito-stack.yaml` |
| **AWS IAM** | Roles para Lambda execution, CodeBuild, CodePipeline, Cognito authenticated/unauthenticated, WAF Lambda. Managed policies (VPC Access, Bedrock Full Access). | Todos os templates CloudFormation/SAM |
| **AWS STS (Security Token Service)** | Assume role cross-account para escanear recursos de clientes. | `sam/production-lambdas-only.yaml` (IAM policy `sts:AssumeRole`) |

---

## 5. Segurança & Compliance

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **AWS WAFv2** | Web Application Firewall com regras managed (Common, SQLi, XSS, Known Bad Inputs), rate limiting (2000 req/IP), geo-blocking. | `cloudformation/waf-stack.yaml` |
| **AWS GuardDuty** | Detecção de ameaças. Consultado via SDK para security scanning. | `backend/package.json` (`@aws-sdk/client-guardduty`) |
| **AWS Security Hub** | Findings centralizados de segurança e compliance. | `backend/package.json` (`@aws-sdk/client-securityhub`) |
| **AWS Config** | Tracking de compliance de configuração de recursos. | `backend/package.json` (`@aws-sdk/client-config-service`) |
| **Amazon Inspector** | Vulnerability scanning para EC2 e containers. | `backend/package.json` (`@aws-sdk/client-inspector2`) |
| **Amazon Macie** | Descoberta e proteção de dados sensíveis em S3. | `backend/package.json` (`@aws-sdk/client-macie2`) |
| **AWS IAM Access Analyzer** | Validação de acessos IAM e políticas. | `backend/package.json` (`@aws-sdk/client-accessanalyzer`) |
| **AWS CloudTrail** | Audit logging de chamadas API e mudanças em recursos. | `backend/package.json` (`@aws-sdk/client-cloudtrail`) |
| **AWS KMS (Key Management Service)** | Gerenciamento de chaves de criptografia. | `backend/package.json` (`@aws-sdk/client-kms`) |
| **AWS Network Firewall** | Firewall de rede. Escaneado pelo security engine. | `backend/package.json` (`@aws-sdk/client-network-firewall`) |
| **AWS Well-Architected Tool** | Revisão de arquitetura. | `backend/package.json` (`@aws-sdk/client-wellarchitected`) |

---

## 6. Monitoramento & Observabilidade

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **Amazon CloudWatch Metrics** | Métricas de API Gateway, Lambda, RDS, CloudFront, DynamoDB. Métricas custom para segurança e saúde. | `cloudformation/monitoring-stack.yaml`, `cloudformation/security-monitoring-stack.yaml` |
| **Amazon CloudWatch Alarms** | Alarmes para: CPU RDS, erros 5xx, throttles Lambda, latência API, tenant isolation violations, auth failures, SQL injection, XSS, rate limit. | `cloudformation/monitoring-stack.yaml`, `cloudformation/error-monitoring-stack.yaml`, `cloudformation/security-monitoring-stack.yaml` |
| **Amazon CloudWatch Dashboards** | Dashboards: operacional, segurança, error monitoring, Lambda health. | `cloudformation/monitoring-stack.yaml`, `cloudformation/security-monitoring-stack.yaml`, `cloudformation/error-monitoring-stack.yaml`, `cloudformation/lambda-health-monitoring-stack.yaml` |
| **Amazon CloudWatch Logs** | Log groups para Lambda e API Gateway. Metric filters para erros, segurança. Cross-account log forwarding para WAF. | `cloudformation/monitoring-stack.yaml`, `cloudformation/waf-logs-destination-stack.yaml` |

---

## 7. Rede & VPC

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **Amazon VPC** | VPC dedicada (10.0.0.0/16) com subnets públicas e privadas em 2 AZs. | `cloudformation/network-stack.yaml`, `sam/production-infrastructure.yaml` |
| **Internet Gateway** | Acesso à internet para subnets públicas. | `cloudformation/network-stack.yaml` |
| **NAT Gateway** | Acesso à internet para Lambdas em subnets privadas. | `cloudformation/network-stack.yaml` |
| **Elastic IP** | IP fixo para NAT Gateway. | `cloudformation/network-stack.yaml` |
| **Security Groups** | SGs para Lambda, RDS, MemoryDB. | `cloudformation/network-stack.yaml`, `cloudformation/memorydb-stack.yaml` |
| **VPC Endpoints (Gateway)** | Endpoints para S3 e DynamoDB (acesso privado sem NAT). | `cloudformation/network-stack.yaml` |
| **Amazon Route 53** | DNS management e health checks. | `backend/package.json` (`@aws-sdk/client-route-53`) |

---

## 8. Mensageria & Notificações

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **Amazon SNS** | Tópicos para alarmes operacionais, segurança, WAF alerts, pipeline notifications, Lambda health. Subscriptions por email. | `cloudformation/monitoring-stack.yaml`, `cloudformation/security-monitoring-stack.yaml`, `cloudformation/error-monitoring-stack.yaml`, `cloudformation/waf-monitoring-stack.yaml`, `cicd/cloudformation/codepipeline-stack.yaml` |
| **Amazon SQS** | Filas de mensagens (referenciado no SDK). | `backend/package.json` (`@aws-sdk/client-sqs`) |
| **Amazon SES** | Emails transacionais. Região `us-east-1`, domínio `nuevacore.com`, from `evo@nuevacore.com`. Credenciais dedicadas. | `sam/production-lambdas-only.yaml` (env vars), `backend/package.json` (`@aws-sdk/client-ses`) |

---

## 9. AI & Machine Learning

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **Amazon Bedrock Runtime** | Modelo Claude 3 Sonnet para chat AI, geração de conteúdo, análise de segurança. | `backend/package.json` (`@aws-sdk/client-bedrock-runtime`), `.env.example` |

---

## 10. Custo & Otimização

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **AWS Cost Explorer** | Análise de custos, detecção de anomalias, previsões. | `backend/package.json` (`@aws-sdk/client-cost-explorer`) |
| **AWS Savings Plans** | Recomendações de otimização de custos (RI/SP). | `backend/package.json` (`@aws-sdk/client-savingsplans`) |

---

## 11. CI/CD & Deploy

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **AWS CodePipeline** | Pipeline de CI/CD. Source: GitHub via CodeStar Connection. Build & Deploy automático. | `cicd/cloudformation/codepipeline-stack.yaml` |
| **AWS CodeBuild** | Build de Lambdas. Amazon Linux 2, Node.js 20, esbuild. Cache em S3. | `cicd/cloudformation/codepipeline-stack.yaml`, `cicd/buildspec-sam.yml` |
| **AWS CodeStar Connections** | Integração com GitHub para source do pipeline. | `cicd/cloudformation/codepipeline-stack.yaml` |
| **AWS SAM (Serverless Application Model)** | Framework de deploy para 194 Lambdas. `sam build` + `sam deploy` com esbuild. | `sam/production-lambdas-only.yaml`, `cicd/buildspec-sam.yml` |
| **AWS CloudFormation** | Infrastructure as Code. Stacks para rede, banco, frontend, WAF, monitoring, MemoryDB, segurança. | `cloudformation/` (26 templates) |

---

## 12. Serviços Escaneados pelo Security Engine

O Security Engine da plataforma escaneia os seguintes serviços AWS dos clientes via cross-account role assumption:

| Serviço | SDK Client | Scanner |
|---------|-----------|---------|
| **Amazon EC2** | `@aws-sdk/client-ec2` | Instâncias, Security Groups, VPCs |
| **Amazon RDS** | `@aws-sdk/client-rds` | Instâncias, snapshots, encryption |
| **Amazon S3** | `@aws-sdk/client-s3` | Buckets, policies, encryption |
| **AWS IAM** | `@aws-sdk/client-iam` | Users, roles, policies, MFA |
| **AWS Lambda** | `@aws-sdk/client-lambda` | Functions, permissions, VPC config |
| **Amazon ECS** | `@aws-sdk/client-ecs` | Clusters, services, tasks |
| **Amazon ECR** | `@aws-sdk/client-ecr` | Repositories, image scanning |
| **Amazon EKS** | `@aws-sdk/client-eks` | Clusters, node groups |
| **Elastic Load Balancing v2** | `@aws-sdk/client-elastic-load-balancing-v2` | ALB/NLB, listeners, TLS |
| **Amazon ElastiCache** | `@aws-sdk/client-elasticache` | Clusters, encryption |
| **Amazon CloudFront** | `@aws-sdk/client-cloudfront` | Distributions, TLS config |
| **AWS WAFv2** | `@aws-sdk/client-wafv2` | Web ACLs, rules, IP sets |
| **Amazon EventBridge** | `@aws-sdk/client-eventbridge` | Rules, targets |
| **AWS Step Functions** | `@aws-sdk/client-sfn` | State machines, logging, tracing |
| **AWS Systems Manager** | `@aws-sdk/client-ssm` | Parameters, compliance |
| **Amazon Kinesis** | `@aws-sdk/client-kinesis` | Streams, encryption |
| **Amazon Firehose** | `@aws-sdk/client-firehose` | Delivery streams |
| **AWS Glue** | `@aws-sdk/client-glue` | Jobs, crawlers, encryption |
| **Amazon OpenSearch** | `@aws-sdk/client-opensearch` | Domains, encryption |
| **Amazon Redshift** | `@aws-sdk/client-redshift` | Clusters, encryption |
| **Amazon EFS** | `@aws-sdk/client-efs` | File systems, encryption |
| **AWS Backup** | `@aws-sdk/client-backup` | Vaults, plans |
| **AWS Organizations** | `@aws-sdk/client-organizations` | Accounts, policies |
| **Amazon API Gateway v2** | `@aws-sdk/client-apigatewayv2` | HTTP APIs |
| **Amazon API Gateway v1** | `@aws-sdk/client-api-gateway` | REST APIs |

---

## 13. Gerenciamento de Configuração & Secrets

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **AWS Secrets Manager** | Credenciais do banco de dados, secrets de aplicação. | `cloudformation/database-stack.yaml`, `sam/production-infrastructure.yaml` |
| **AWS Systems Manager Parameter Store** | Endpoint do MemoryDB, configurações de ambiente. | `cloudformation/memorydb-stack.yaml` |
| **AWS Certificate Manager (ACM)** | Certificados SSL/TLS para custom domains (CloudFront + API Gateway). | `sam/production-infrastructure.yaml`, `sam/api-custom-domain.yaml` |

---

## 14. Agendamento & Eventos

| Serviço | Uso na Plataforma | Referência |
|---------|-------------------|------------|
| **Amazon EventBridge** | Scheduled rules: license sync diário (cron 2AM UTC), Lambda health check (rate 5 min), WAF unblock expired IPs (rate 5 min), pipeline failure notifications. | `cloudformation/license-sync-scheduler.yaml`, `cloudformation/lambda-health-monitoring-stack.yaml`, `cloudformation/waf-monitoring-stack.yaml`, `cicd/cloudformation/codepipeline-stack.yaml` |

---

## Resumo Quantitativo

| Categoria | Quantidade de Serviços |
|-----------|----------------------|
| Computação & Serverless | 4 |
| Banco de Dados & Cache | 3 |
| Armazenamento & CDN | 2 |
| Autenticação & Autorização | 4 |
| Segurança & Compliance | 11 |
| Monitoramento & Observabilidade | 4 |
| Rede & VPC | 7 |
| Mensageria & Notificações | 3 |
| AI & Machine Learning | 1 |
| Custo & Otimização | 2 |
| CI/CD & Deploy | 5 |
| Serviços Escaneados (clientes) | 25 |
| Configuração & Secrets | 3 |
| Agendamento & Eventos | 1 |
| **Total de serviços AWS distintos** | **~50** |
