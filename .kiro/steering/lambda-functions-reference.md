# Lambda Functions & API Gateway Reference

## 🚨 IMPORTANTE: Consulte este documento antes de criar novas Lambdas

Este documento lista TODAS as Lambda functions e endpoints do API Gateway existentes no sistema EVO.
**SEMPRE consulte este documento antes de criar novas funcionalidades para evitar duplicidade.**

## Instruções de Manutenção

### ⚠️ REGRA OBRIGATÓRIA
Ao criar uma nova Lambda ou endpoint:
1. Adicione a entrada neste documento na seção apropriada
2. Inclua: nome da Lambda, endpoint, descrição, e arquivo fonte
3. Atualize a contagem total no final do documento
4. Faça commit das alterações junto com o código

---

## API Gateway Configuration

- **REST API ID**: `3l66kn0eaj`
- **Stage**: `prod`
- **Custom Domain**: `api-evo.ai.udstec.io`
- **Authorizer ID**: `joelbs` (Cognito User Pools)
- **Functions Resource ID**: `n9gxy9` (parent de `/api/functions/*`)

---

## Lambda Functions por Categoria

### 🔐 Autenticação & MFA (auth/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `mfa-enroll` | `/api/functions/mfa-enroll` | Cadastra novo fator MFA (TOTP) | `auth/mfa-handlers.ts` |
| `mfa-check` | `/api/functions/mfa-check` | Verifica se usuário tem MFA habilitado | `auth/mfa-handlers.ts` |
| `mfa-challenge-verify` | `/api/functions/mfa-challenge-verify` | Verifica código durante enrollment | `auth/mfa-handlers.ts` |
| `mfa-verify-login` | `/api/functions/mfa-verify-login` | Verifica código durante login | `auth/mfa-handlers.ts` |
| `mfa-list-factors` | `/api/functions/mfa-list-factors` | Lista fatores MFA do usuário | `auth/mfa-handlers.ts` |
| `mfa-unenroll` | `/api/functions/mfa-unenroll` | Remove fator MFA | `auth/mfa-handlers.ts` |
| `webauthn-register` | `/api/functions/webauthn-register` | Registra credencial WebAuthn/Passkey | `auth/webauthn-register.ts` |
| `webauthn-authenticate` | `/api/functions/webauthn-authenticate` | Autentica via WebAuthn | `auth/webauthn-authenticate.ts` |
| `webauthn-check` | `/api/functions/webauthn-check` | Verifica se usuário tem WebAuthn | `auth/webauthn-check-standalone.ts` |
| `delete-webauthn-credential` | `/api/functions/delete-webauthn-credential` | Remove credencial WebAuthn | `auth/delete-webauthn-credential.ts` |
| `verify-tv-token` | `/api/functions/verify-tv-token` | Verifica token para TV Dashboard | `auth/verify-tv-token.ts` |

### 👤 Administração (admin/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `admin-manage-user` | `/api/functions/admin-manage-user` | CRUD de usuários (update, delete, enable, disable, reset_password) | `admin/admin-manage-user.ts` |
| `create-cognito-user` | `/api/functions/create-cognito-user` | Cria usuário no Cognito | `admin/create-cognito-user.ts` |
| `disable-cognito-user` | `/api/functions/disable-cognito-user` | Desabilita usuário no Cognito | `admin/disable-cognito-user.ts` |
| `manage-organizations` | `/api/functions/manage-organizations` | CRUD de organizações (super admin) | `admin/manage-organizations.ts` |
| `log-audit` | `/api/functions/log-audit` | Registra ações de auditoria | `admin/log-audit.ts` |
| `run-sql` | N/A (interno) | Executa SQL direto (admin) | `admin/run-sql.ts` |
| `cleanup-stuck-scans` | N/A (interno) | Limpa scans travados | `admin/cleanup-stuck-scans.ts` |
| `check-cloudtrail-status` | N/A (interno) | Verifica status do CloudTrail | `admin/check-cloudtrail-status.ts` |

### 🔒 Segurança (security/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `security-scan` | `/api/functions/security-scan` | Security Engine V3 - 23 scanners, 170+ verificações | `security/security-scan.ts` |
| `start-security-scan` | `/api/functions/start-security-scan` | Inicia scan de segurança (async) | `security/start-security-scan.ts` |
| `compliance-scan` | `/api/functions/compliance-scan` | Scan de compliance (CIS, LGPD, PCI-DSS) | `security/compliance-scan.ts` |
| `well-architected-scan` | `/api/functions/well-architected-scan` | Análise Well-Architected (6 pilares) | `security/well-architected-scan.ts` |
| `guardduty-scan` | `/api/functions/guardduty-scan` | Integração com GuardDuty | `security/guardduty-scan.ts` |
| `get-findings` | `/api/functions/get-findings` | Lista findings de segurança | `security/get-findings.ts` |
| `get-security-posture` | `/api/functions/get-security-posture` | Retorna postura de segurança | `security/get-security-posture.ts` |
| `validate-aws-credentials` | `/api/functions/validate-aws-credentials` | Valida credenciais AWS | `security/validate-aws-credentials.ts` |
| `validate-permissions` | `/api/functions/validate-permissions` | Valida permissões IAM | `security/validate-permissions.ts` |
| `iam-deep-analysis` | `/api/functions/iam-deep-analysis` | Análise profunda de IAM | `security/iam-deep-analysis.ts` |
| `lateral-movement-detection` | `/api/functions/lateral-movement-detection` | Detecta movimentação lateral | `security/lateral-movement-detection.ts` |
| `drift-detection` | `/api/functions/drift-detection` | Detecta drift de configuração | `security/drift-detection.ts` |
| `analyze-cloudtrail` | `/api/functions/analyze-cloudtrail` | Analisa eventos CloudTrail | `security/analyze-cloudtrail.ts` |
| `start-cloudtrail-analysis` | `/api/functions/start-cloudtrail-analysis` | Inicia análise CloudTrail (async) | `security/start-cloudtrail-analysis.ts` |
| `fetch-cloudtrail` | `/api/functions/fetch-cloudtrail` | Busca eventos CloudTrail | `security/fetch-cloudtrail.ts` |

### 🛡️ WAF Monitoring (security/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `waf-setup-monitoring` | `/api/functions/waf-setup-monitoring` | Configura monitoramento WAF cross-account | `security/waf-setup-monitoring.ts` |
| `waf-dashboard-api` | `/api/functions/waf-dashboard-api` | API do dashboard WAF (events, metrics, block/unblock) | `security/waf-dashboard-api.ts` |
| `waf-threat-analyzer` | N/A (interno) | Analisa ameaças WAF | `security/waf-threat-analyzer.ts` |
| `waf-log-processor` | N/A (interno) | Processa logs WAF | `security/waf-log-processor.ts` |
| `waf-unblock-expired` | N/A (scheduled) | Desbloqueia IPs expirados | `security/waf-unblock-expired.ts` |

### 💰 Custos & FinOps (cost/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `fetch-daily-costs` | `/api/functions/fetch-daily-costs` | Busca custos diários via Cost Explorer | `cost/fetch-daily-costs.ts` |
| `ri-sp-analyzer` | `/api/functions/ri-sp-analyzer` | Análise de Reserved Instances e Savings Plans | `cost/ri-sp-analyzer.ts` |
| `analyze-ri-sp` | `/api/functions/analyze-ri-sp` | Alias para ri-sp-analyzer | `cost/analyze-ri-sp.ts` |
| `cost-optimization` | `/api/functions/cost-optimization` | Recomendações de otimização | `cost/cost-optimization.ts` |
| `budget-forecast` | `/api/functions/budget-forecast` | Previsão de orçamento | `cost/budget-forecast.ts` |
| `generate-cost-forecast` | `/api/functions/generate-cost-forecast` | Gera forecast de custos | `cost/generate-cost-forecast.ts` |
| `finops-copilot` | `/api/functions/finops-copilot` | Copilot FinOps com IA | `cost/finops-copilot-v2.ts` |
| `ml-waste-detection` | `/api/functions/ml-waste-detection` | Detecção de desperdício com ML | `cost/ml-waste-detection.ts` |

### 🤖 IA & Machine Learning (ai/, ml/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `bedrock-chat` | `/api/functions/bedrock-chat` | Chat com AWS Bedrock (Claude 3.5) | `ai/bedrock-chat.ts` |
| `intelligent-alerts-analyzer` | `/api/functions/intelligent-alerts-analyzer` | Análise inteligente de alertas | `ml/intelligent-alerts-analyzer.ts` |
| `predict-incidents` | `/api/functions/predict-incidents` | Predição de incidentes com ML | `ml/predict-incidents.ts` |
| `detect-anomalies` | `/api/functions/detect-anomalies` | Detecção de anomalias | `ml/detect-anomalies.ts` |
| `anomaly-detection` | `/api/functions/anomaly-detection` | Alias para detect-anomalies | `ml/detect-anomalies.ts` |

### 📊 Dashboard & Monitoramento (dashboard/, monitoring/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `get-executive-dashboard` | `/api/functions/get-executive-dashboard` | Dashboard executivo (autenticado) | `dashboard/get-executive-dashboard.ts` |
| `get-executive-dashboard-public` | `/api/functions/get-executive-dashboard-public` | Dashboard executivo (TV token) | `dashboard/get-executive-dashboard-public.ts` |
| `manage-tv-tokens` | `/api/functions/manage-tv-tokens` | Gerencia tokens de TV Dashboard | `dashboard/manage-tv-tokens.ts` |
| `alerts` | `/api/functions/alerts` | CRUD de alertas | `monitoring/alerts.ts` |
| `auto-alerts` | `/api/functions/auto-alerts` | Alertas automáticos | `monitoring/auto-alerts.ts` |
| `check-alert-rules` | `/api/functions/check-alert-rules` | Verifica regras de alerta | `monitoring/check-alert-rules.ts` |
| `aws-realtime-metrics` | `/api/functions/aws-realtime-metrics` | Métricas AWS em tempo real | `monitoring/aws-realtime-metrics.ts` |
| `fetch-cloudwatch-metrics` | `/api/functions/fetch-cloudwatch-metrics` | Busca métricas CloudWatch | `monitoring/fetch-cloudwatch-metrics.ts` |
| `fetch-edge-services` | `/api/functions/fetch-edge-services` | Busca serviços de edge (CloudFront, etc) | `monitoring/fetch-edge-services.ts` |
| `endpoint-monitor-check` | `/api/functions/endpoint-monitor-check` | Verifica endpoints monitorados | `monitoring/endpoint-monitor-check.ts` |
| `monitored-endpoints` | `/monitored_endpoints` | CRUD de endpoints monitorados | `monitoring/monitored-endpoints.ts` |

### ☁️ AWS Credentials (aws/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `list-aws-credentials` | `/api/functions/list-aws-credentials` | Lista credenciais AWS | `aws/list-aws-credentials.ts` |
| `save-aws-credentials` | `/api/functions/save-aws-credentials` | Salva credenciais AWS | `aws/save-aws-credentials.ts` |
| `update-aws-credentials` | `/api/functions/update-aws-credentials` | Atualiza credenciais AWS | `aws/update-aws-credentials.ts` |

### 🔵 Azure Multi-Cloud (azure/, cloud/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `validate-azure-credentials` | `/api/functions/validate-azure-credentials` | Valida credenciais Azure | `azure/validate-azure-credentials.ts` |
| `save-azure-credentials` | `/api/functions/save-azure-credentials` | Salva credenciais Azure | `azure/save-azure-credentials.ts` |
| `list-azure-credentials` | `/api/functions/list-azure-credentials` | Lista credenciais Azure | `azure/list-azure-credentials.ts` |
| `delete-azure-credentials` | `/api/functions/delete-azure-credentials` | Remove credenciais Azure | `azure/delete-azure-credentials.ts` |
| `azure-security-scan` | `/api/functions/azure-security-scan` | Scan de segurança Azure (sync) | `azure/azure-security-scan.ts` |
| `start-azure-security-scan` | `/api/functions/start-azure-security-scan` | Inicia scan Azure (async) | `azure/start-azure-security-scan.ts` |
| `azure-defender-scan` | `/api/functions/azure-defender-scan` | Microsoft Defender for Cloud | `azure/azure-defender-scan.ts` |
| `azure-compliance-scan` | `/api/functions/azure-compliance-scan` | Compliance CIS/Azure Benchmark | `azure/azure-compliance-scan.ts` |
| `azure-well-architected-scan` | `/api/functions/azure-well-architected-scan` | Azure Well-Architected Framework | `azure/azure-well-architected-scan.ts` |
| `azure-cost-optimization` | `/api/functions/azure-cost-optimization` | Azure Advisor cost recommendations | `azure/azure-cost-optimization.ts` |
| `azure-reservations-analyzer` | `/api/functions/azure-reservations-analyzer` | Azure Reserved Instances analysis | `azure/azure-reservations-analyzer.ts` |
| `azure-fetch-costs` | `/api/functions/azure-fetch-costs` | Busca custos Azure | `azure/azure-fetch-costs.ts` |
| `azure-resource-inventory` | `/api/functions/azure-resource-inventory` | Inventário de recursos Azure | `azure/azure-resource-inventory.ts` |
| `azure-activity-logs` | `/api/functions/azure-activity-logs` | Logs de atividade Azure | `azure/azure-activity-logs.ts` |
| `list-cloud-credentials` | `/api/functions/list-cloud-credentials` | Lista credenciais unificadas (AWS + Azure) | `cloud/list-cloud-credentials.ts` |

### 📜 Licenciamento (license/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `validate-license` | `/api/functions/validate-license` | Valida licença da organização | `license/validate-license.ts` |
| `configure-license` | `/api/functions/configure-license` | Configura licença | `license/configure-license.ts` |
| `sync-license` | `/api/functions/sync-license` | Sincroniza licença com API externa | `license/sync-license.ts` |
| `admin-sync-license` | `/api/functions/admin-sync-license` | Sync de licença (admin) | `license/admin-sync-license.ts` |
| `manage-seats` | `/api/functions/manage-seats` | Gerencia seats de licença | `license/manage-seats.ts` |
| `daily-license-validation` | `/api/functions/daily-license-validation` | Validação diária de licenças | `license/daily-license-validation.ts` |
| `scheduled-license-sync` | N/A (scheduled) | Sync agendado de licenças | `license/scheduled-license-sync.ts` |

### 📚 Knowledge Base (kb/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `kb-analytics-dashboard` | `/api/functions/kb-analytics-dashboard` | Dashboard de analytics KB | `kb/kb-analytics-dashboard.ts` |
| `kb-ai-suggestions` | `/api/functions/kb-ai-suggestions` | Sugestões de IA para KB | `kb/kb-ai-suggestions.ts` |
| `kb-export-pdf` | `/api/functions/kb-export-pdf` | Exporta artigo KB para PDF | `kb/kb-export-pdf.ts` |
| `increment-article-views` | `/api/functions/increment-article-views` | Incrementa views de artigo | `kb/increment-article-views.ts` |
| `increment-article-helpful` | `/api/functions/increment-article-helpful` | Incrementa helpful de artigo | `kb/increment-article-helpful.ts` |
| `track-article-view-detailed` | `/api/functions/track-article-view-detailed` | Tracking detalhado de views | `kb/track-article-view-detailed.ts` |

### 📄 Relatórios (reports/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `generate-pdf-report` | `/api/functions/generate-pdf-report` | Gera relatório PDF | `reports/generate-pdf-report.ts` |
| `generate-excel-report` | `/api/functions/generate-excel-report` | Gera relatório Excel | `reports/generate-excel-report.ts` |
| `generate-security-pdf` | `/api/functions/generate-security-pdf` | Gera PDF de segurança | `reports/generate-security-pdf.ts` |
| `security-scan-pdf-export` | `/api/functions/security-scan-pdf-export` | Exporta scan para PDF | `reports/security-scan-pdf-export.ts` |
| `generate-remediation-script` | `/api/functions/generate-remediation-script` | Gera script de remediação | `reports/generate-remediation-script.ts` |

### 🗄️ Dados (data/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `query-table` | `/api/functions/query-table` | Query genérica em tabelas (multi-tenant) | `data/query-table.ts` |
| `mutate-table` | `/api/functions/mutate-table` | Mutação genérica em tabelas | `data/mutate-table.ts` |

### 🏢 Organizações (organizations/, profiles/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `create-organization-account` | `/api/functions/create-organization-account` | Cria conta de organização | `organizations/create-organization-account.ts` |
| `sync-organization-accounts` | `/api/functions/sync-organization-accounts` | Sincroniza contas | `organizations/sync-organization-accounts.ts` |
| `check-organization` | `/api/functions/check-organization` | Verifica organização | `profiles/check-organization.ts` |
| `create-with-organization` | `/api/functions/create-with-organization` | Cria usuário com organização | `profiles/create-with-organization.ts` |
| `get-user-organization` | `/api/functions/get-user-organization` | Retorna organização do usuário | `profiles/get-user-organization.ts` |

### 📧 Notificações (notifications/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `send-email` | `/api/functions/send-email` | Envia email via SES | `notifications/send-email.ts` |
| `send-notification` | `/api/functions/send-notification` | Envia notificação | `notifications/send-notification.ts` |
| `get-communication-logs` | `/api/functions/get-communication-logs` | Lista logs de comunicação | `notifications/get-communication-logs.ts` |

### 📦 Storage (storage/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `storage-download` | `/api/functions/storage-download` | Download de arquivo S3 | `storage/storage-handlers.ts` |
| `storage-delete` | `/api/functions/storage-delete` | Delete de arquivo S3 | `storage/storage-handlers.ts` |
| `upload-attachment` | `/api/functions/upload-attachment` | Upload de anexo | `storage/storage-handlers.ts` |

### 🔧 Jobs & Sistema (jobs/, system/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `process-background-jobs` | `/api/functions/process-background-jobs` | Processa jobs em background | `jobs/process-background-jobs.ts` |
| `list-background-jobs` | `/api/functions/list-background-jobs` | Lista jobs em background | `jobs/list-background-jobs.ts` |
| `execute-scheduled-job` | `/api/functions/execute-scheduled-job` | Executa job agendado | `jobs/execute-scheduled-job.ts` |
| `scheduled-scan-executor` | `/api/functions/scheduled-scan-executor` | Executor de scans agendados | `jobs/scheduled-scan-executor.ts` |
| `run-migrations` | N/A (interno) | Executa migrações Prisma | `system/run-migrations.ts` |
| `run-sql-migration` | N/A (interno) | Executa migração SQL | `system/run-sql-migration.ts` |
| `create-mfa-table` | N/A (interno) | Cria tabela MFA | `system/create-mfa-table.ts` |

### 🔗 Integrações (integrations/)

| Lambda | Endpoint | Descrição | Arquivo |
|--------|----------|-----------|---------|
| `create-jira-ticket` | `/api/functions/create-jira-ticket` | Cria ticket no Jira | `integrations/create-jira-ticket.ts` |

---

## Endpoints do API Gateway

### Estrutura Base
- Base URL: `https://api-evo.ai.udstec.io`
- Todos os endpoints sob `/api/functions/` usam autenticação Cognito
- Método OPTIONS habilitado para CORS em todos os endpoints

### Endpoints Especiais (sem `/api/functions/`)
| Path | Métodos | Descrição |
|------|---------|-----------|
| `/api/health` | GET | Health check |
| `/monitored_endpoints` | GET, POST, PUT, DELETE | CRUD de endpoints monitorados |
| `/api/profiles/check` | POST | Verifica perfil |
| `/api/profiles/create-with-org` | POST | Cria perfil com organização |

---

## Estatísticas

- **Total de Lambdas**: ~110 funções
- **Total de Endpoints API Gateway**: ~100 endpoints
- **Categorias**: 15 categorias principais

---

## Última Atualização

**Data**: 2026-01-12
**Versão**: 1.0
**Atualizado por**: Sistema

---

## Checklist para Novas Lambdas

Antes de criar uma nova Lambda:

- [ ] Verificar se funcionalidade similar já existe neste documento
- [ ] Verificar se pode ser adicionada a um handler existente
- [ ] Seguir padrão de nomenclatura: `evo-uds-v3-production-{nome}`
- [ ] Criar endpoint no API Gateway com CORS
- [ ] Adicionar entrada neste documento
- [ ] Atualizar contagem total
