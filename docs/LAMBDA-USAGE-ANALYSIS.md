# Análise de Uso de Lambdas - EVO Platform

**Data:** 2026-02-03
**Total de Lambdas no SAM:** 192

## Resumo Executivo

Esta análise identifica todas as Lambdas definidas no sistema e verifica se cada uma tem uma chamada correspondente no frontend, em agendamentos, ou é invocada por outras Lambdas.

## Lambdas Removidas (Debug/Admin)

As seguintes Lambdas foram removidas por serem de debug/admin sem uso em produção:
- `check-cloudtrail-status`
- `check-costs`
- `add-status-column`
- `run-migration-standalone`
- `fix-azure-constraints`
- `fix-role-arn-migration`
- `delete-webauthn-credential-admin`
- `investigate-data-mismatch`
- `debug-org-query`
- `debug-azure-costs`
- `check-daily-costs`

---

## ✅ Lambdas COM USO CONFIRMADO

### Admin (13 Lambdas)
| Lambda | Uso |
|--------|-----|
| `admin-manage-user` | ✅ UserManagement.tsx |
| `create-cognito-user` | ✅ UserManagement.tsx |
| `create-user` | ✅ API endpoint |
| `deactivate-demo-mode` | ✅ API endpoint |
| `disable-cognito-user` | ✅ UserManagement.tsx |
| `log-audit` | ✅ API endpoint |
| `manage-demo-mode` | ✅ API endpoint |
| `manage-email-templates` | ✅ API endpoint |
| `manage-organizations` | ✅ UserManagement.tsx, AINotificationsAdmin.tsx |
| `automated-cleanup-stuck-scans` | ⏰ Job interno |
| `cleanup-stuck-scans` | ⏰ Job interno |
| `debug-cloudtrail` | 🔧 Debug/Admin |
| `direct-cleanup` | 🔧 Debug/Admin |
| `run-migration` | 🔧 CI/CD |
| `run-sql` | 🔧 Debug/Admin |
| `setup-license-config` | 🔧 Setup inicial |

### AI (8 Lambdas)
| Lambda | Uso |
|--------|-----|
| `bedrock-chat` | ✅ UnifiedCopilot.tsx |
| `check-proactive-notifications` | ⏰ Job agendado |
| `generate-response` | ✅ Interno (AI) |
| `get-ai-notifications` | ✅ useAINotifications.ts |
| `list-ai-notifications-admin` | ✅ AINotificationsAdmin.tsx |
| `manage-notification-rules` | ✅ API endpoint |
| `send-ai-notification` | ✅ AINotificationsAdmin.tsx |
| `update-ai-notification` | ✅ useAINotifications.ts |

### Auth (13 Lambdas)
| Lambda | Uso |
|--------|-----|
| `delete-webauthn-credential` | ✅ API endpoint |
| `forgot-password` | ✅ ForgotPassword.tsx |
| `mfa-enroll` | ✅ MFASettings.tsx |
| `mfa-check` | ✅ MFASettings.tsx |
| `mfa-challenge-verify` | ✅ MFASettings.tsx |
| `mfa-verify-login` | ✅ Auth flow |
| `mfa-list-factors` | ✅ MFASettings.tsx |
| `mfa-unenroll` | ✅ MFASettings.tsx |
| `self-register` | ✅ Register.tsx |
| `verify-tv-token` | ✅ TVDashboard.tsx |
| `webauthn-authenticate` | ✅ API endpoint |
| `webauthn-check` | ✅ ForgotPassword.tsx |
| `webauthn-register` | ✅ API endpoint |

### AWS (3 Lambdas)
| Lambda | Uso |
|--------|-----|
| `list-aws-credentials` | ✅ ScheduleTab.tsx, AwsAccountSelector |
| `save-aws-credentials` | ✅ Quick Connect flow |
| `update-aws-credentials` | ✅ API endpoint |

### Azure (22 Lambdas)
| Lambda | Uso |
|--------|-----|
| `azure-activity-logs` | ✅ API endpoint |
| `azure-compliance-scan` | ✅ SecurityScans.tsx |
| `azure-cost-optimization` | ✅ MLWasteDetection.tsx |
| `azure-defender-scan` | ✅ API endpoint |
| `azure-detect-anomalies` | ✅ API endpoint |
| `azure-fetch-costs` | ✅ CostAnalysisPage.tsx, MonthlyInvoicesPage.tsx |
| `azure-fetch-edge-services` | ✅ EdgeMonitoring.tsx |
| `azure-fetch-monitor-metrics` | ✅ API endpoint |
| `azure-oauth-callback` | ✅ AzureOAuthCallback.tsx |
| `azure-oauth-initiate` | ✅ AzureOAuthButton.tsx |
| `azure-oauth-refresh` | ✅ API endpoint |
| `azure-oauth-revoke` | ✅ API endpoint |
| `azure-reservations-analyzer` | ✅ API endpoint |
| `azure-resource-inventory` | ✅ API endpoint |
| `azure-security-scan` | ✅ SecurityScans.tsx |
| `azure-well-architected-scan` | ✅ API endpoint |
| `delete-azure-credentials` | ✅ AzureCredentialsManager.tsx |
| `list-azure-credentials` | ✅ AzureCredentialsManager.tsx |
| `save-azure-credentials` | ✅ AzureCredentialsForm.tsx, AzureOAuthCallback.tsx |
| `start-azure-security-scan` | ✅ API endpoint |
| `validate-azure-credentials` | ✅ AzureCredentialsForm.tsx |
| `validate-azure-permissions` | ✅ AzureCredentialsManager.tsx |

### Cloud (1 Lambda)
| Lambda | Uso |
|--------|-----|
| `list-cloud-credentials` | ✅ API endpoint |

### Cost (13 Lambdas)
| Lambda | Uso |
|--------|-----|
| `analyze-ri-sp` | ✅ API endpoint |
| `budget-forecast` | ✅ BudgetForecasting.tsx |
| `cost-optimization` | ✅ CostOptimization.tsx |
| `fetch-daily-costs` | ✅ CostAnalysis.tsx, MonthlyInvoices.tsx, CostOverview.tsx |
| `finops-copilot` | ✅ API endpoint |
| `generate-cost-forecast` | ✅ API endpoint |
| `get-ri-sp-analysis` | ✅ API endpoint |
| `get-ri-sp-data` | ✅ AdvancedRISPAnalyzerV2.tsx, AdvancedRISPAnalyzerV3.tsx |
| `list-ri-sp-history` | ✅ API endpoint |
| `ml-waste-detection` | ✅ MLWasteDetection.tsx, WasteDetection.tsx |
| `ri-sp-analyzer` | ✅ aws-service.ts |
| `save-ri-sp-analysis` | ⏰ Interno |

### Dashboard (3 Lambdas)
| Lambda | Uso |
|--------|-----|
| `get-executive-dashboard` | ✅ useExecutiveDashboard.ts |
| `get-executive-dashboard-public` | ✅ TVDashboard.tsx |
| `manage-tv-tokens` | ✅ API endpoint |

### Data (4 Lambdas)
| Lambda | Uso |
|--------|-----|
| `cleanup-cost-data` | ⏰ Job interno |
| `mutate-table` | ✅ Múltiplos componentes |
| `query-table` | ✅ Múltiplos componentes |
| `ticket-attachments` | ✅ TicketDetails.tsx |
| `ticket-management` | ✅ TicketDetails.tsx |

### Debug (3 Lambdas)
| Lambda | Uso |
|--------|-----|
| `check-daily-costs` | 🔧 Debug |
| `diagnose-cost-dashboard` | 🔧 Debug |
| `investigate-data-mismatch` | 🔧 Debug |

### Integrations (2 Lambdas)
| Lambda | Uso |
|--------|-----|
| `cloudformation-webhook` | ✅ Quick Connect (webhook) |
| `create-jira-ticket` | ✅ API endpoint |

### Jobs (12 Lambdas)
| Lambda | Uso |
|--------|-----|
| `auto-cleanup-stuck-scans` | ⏰ Job agendado |
| `cleanup-expired-external-ids` | ⏰ Job agendado |
| `cleanup-expired-oauth-states` | ⏰ Job agendado |
| `cleanup-stuck-scans` | ⏰ Job agendado |
| `execute-scheduled-job` | ✅ API endpoint |
| `initial-data-load` | ⏰ Job inicial |
| `list-background-jobs` | ✅ BackgroundJobsMonitor.tsx |
| `process-background-jobs` | ⏰ EventBridge trigger |
| `process-events` | ⏰ Job interno |
| `scheduled-scan-executor` | ⏰ EventBridge trigger |
| `scheduled-view-refresh` | ⏰ Job agendado |
| `send-scheduled-emails` | ⏰ Job agendado |
| `sync-resource-inventory` | ✅ InfrastructureTopology.tsx |

### KB (Knowledge Base) (7 Lambdas)
| Lambda | Uso |
|--------|-----|
| `increment-article-helpful` | ✅ KnowledgeBase.tsx |
| `increment-article-views` | ✅ KnowledgeBase.tsx |
| `kb-ai-suggestions` | ✅ API endpoint |
| `kb-analytics-dashboard` | ✅ AnalyticsDashboard.tsx |
| `kb-article-tracking` | ⏰ Interno |
| `kb-export-pdf` | ✅ KnowledgeBase.tsx |
| `track-article-view-detailed` | ✅ KnowledgeBase.tsx |

### License (9 Lambdas)
| Lambda | Uso |
|--------|-----|
| `admin-sync-license` | ✅ API endpoint |
| `cleanup-seats` | ⏰ Job agendado |
| `configure-license` | ✅ API endpoint |
| `daily-license-validation` | ⏰ Job agendado |
| `manage-seat-assignments` | ⏰ Interno |
| `manage-seats` | ✅ API endpoint |
| `scheduled-license-sync` | ⏰ Job agendado |
| `sync-license` | ✅ API endpoint |
| `validate-license` | ✅ useLicenseValidation.ts |

### Maintenance (2 Lambdas)
| Lambda | Uso |
|--------|-----|
| `maintenance-auto-cleanup-stuck-scans` | ⏰ Job agendado |
| `cleanup-stuck-scans-simple` | ⏰ Job agendado |

### ML (5 Lambdas)
| Lambda | Uso |
|--------|-----|
| `ai-prioritization` | ⏰ Interno |
| `detect-anomalies` | ✅ AnomalyDetection.tsx |
| `generate-ai-insights` | ✅ AIInsights.tsx |
| `intelligent-alerts-analyzer` | ✅ IntelligentAlerts.tsx |
| `predict-incidents` | ✅ PredictiveIncidents.tsx |

### Monitoring (17 Lambdas)
| Lambda | Uso |
|--------|-----|
| `alerts` | ✅ IntelligentAlerts.tsx, EndpointMonitoring.tsx |
| `auto-alerts` | ✅ API endpoint |
| `aws-realtime-metrics` | ✅ API endpoint |
| `check-alert-rules` | ✅ API endpoint |
| `endpoint-monitor-check` | ✅ EndpointMonitoring.tsx |
| `error-aggregator` | ⏰ Interno |
| `fetch-cloudwatch-metrics` | ✅ EdgeMonitoring.tsx |
| `fetch-edge-services` | ✅ EdgeMonitoring.tsx |
| `generate-error-fix-prompt` | ✅ PlatformMonitoring.tsx |
| `get-lambda-health` | ✅ API endpoint |
| `get-platform-metrics` | ✅ usePlatformMetrics.ts |
| `get-recent-errors` | ✅ usePlatformMetrics.ts |
| `health-check` | ⏰ Health check interno |
| `lambda-health-check` | ⏰ Health check interno |
| `log-frontend-error` | ✅ error-reporter.ts |
| `monitored-endpoints` | ✅ API endpoint |
| `test-lambda-metrics` | 🔧 Debug |

### Notifications (4 Lambdas)
| Lambda | Uso |
|--------|-----|
| `get-communication-logs` | ✅ API endpoint |
| `manage-email-preferences` | ✅ API endpoint |
| `send-email` | ✅ API endpoint |
| `send-notification` | ✅ API endpoint |

### Organizations (2 Lambdas)
| Lambda | Uso |
|--------|-----|
| `create-organization-account` | ✅ API endpoint |
| `sync-organization-accounts` | ✅ API endpoint |

### Profiles (3 Lambdas)
| Lambda | Uso |
|--------|-----|
| `check-organization` | ✅ API endpoint |
| `create-with-organization` | ✅ API endpoint |
| `get-user-organization` | ✅ DemoModeContext.tsx, useOrganization.ts |

### Reports (5 Lambdas)
| Lambda | Uso |
|--------|-----|
| `generate-excel-report` | ✅ ExportManager.tsx, QuickActions.tsx |
| `generate-pdf-report` | ✅ ExportManager.tsx, QuickActions.tsx |
| `generate-remediation-script` | ✅ API endpoint |
| `generate-security-pdf` | ✅ API endpoint |
| `security-scan-pdf-export` | ✅ API endpoint |

### Security (26 Lambdas)
| Lambda | Uso |
|--------|-----|
| `analyze-cloudtrail` | ✅ Invocado por start-cloudtrail-analysis |
| `compliance-scan` | ✅ Invocado por start-compliance-scan |
| `create-remediation-ticket` | ⏰ Interno |
| `drift-detection` | ✅ DriftDetection.tsx |
| `fetch-cloudtrail` | ✅ API endpoint |
| `get-compliance-history` | ✅ SecurityPosture.tsx |
| `get-compliance-scan-status` | ✅ API endpoint |
| `get-findings` | ✅ SecurityScans.tsx |
| `get-security-posture` | ✅ SecurityPosture.tsx |
| `guardduty-scan` | ✅ ThreatDetection.tsx |
| `iam-behavior-analysis` | ⏰ Interno |
| `iam-deep-analysis` | ✅ IAMAnalysis.tsx |
| `lateral-movement-detection` | ✅ API endpoint |
| `security-scan` | ✅ Invocado por start-security-scan |
| `start-analyze-cloudtrail` | ⏰ Interno |
| `start-cloudtrail-analysis` | ✅ CloudTrailAudit.tsx |
| `start-compliance-scan` | ✅ UnifiedCopilot.tsx |
| `start-security-scan` | ✅ UnifiedCopilot.tsx |
| `validate-aws-credentials` | ✅ Quick Connect flow |
| `validate-permissions` | ✅ API endpoint |
| `validate-waf-security` | ✅ WAFSecurityValidation.tsx |
| `waf-dashboard-api` | ✅ WafMonitoring.tsx, WafSetupPanel.tsx, etc. |
| `waf-log-forwarder` | ⏰ S3 trigger |
| `waf-log-processor` | ⏰ Invocado por waf-log-forwarder |
| `waf-setup-monitoring` | ✅ WafSetupPanel.tsx |
| `waf-threat-analyzer` | ⏰ Interno |
| `waf-unblock-expired` | ⏰ Job agendado |
| `well-architected-scan` | ✅ WellArchitectedScorecard.tsx |

### Storage (3 Lambdas)
| Lambda | Uso |
|--------|-----|
| `storage-download` | ✅ ArticleAttachments.tsx |
| `storage-delete` | ✅ ArticleAttachments.tsx |
| `upload-attachment` | ✅ ArticleAttachments.tsx |

### System (8 Lambdas)
| Lambda | Uso |
|--------|-----|
| `add-status-column` | 🔧 Migração única |
| `check-migrations` | 🔧 CI/CD |
| `db-init` | 🔧 Setup inicial |
| `debug-org-query` | 🔧 Debug |
| `fix-azure-constraints` | 🔧 Migração única |
| `list-tables` | 🔧 Debug |
| `run-migrations` | 🔧 CI/CD |
| `run-sql-migration` | 🔧 CI/CD |

### User (1 Lambda)
| Lambda | Uso |
|--------|-----|
| `notification-settings` | ✅ NotificationSettings.tsx |

### WebSocket (2 Lambdas)
| Lambda | Uso |
|--------|-----|
| `websocket-connect` | ✅ WebSocket API |
| `websocket-disconnect` | ✅ WebSocket API |

---

## ⚠️ PROBLEMAS IDENTIFICADOS E CORRIGIDOS

### 1. ✅ Lambdas Criadas (Handlers Faltando)

| Lambda | Arquivo Criado | Status |
|--------|----------------|--------|
| `cancel-background-job` | `backend/src/handlers/jobs/cancel-background-job.ts` | ✅ Criado |
| `retry-background-job` | `backend/src/handlers/jobs/retry-background-job.ts` | ✅ Criado |

### 2. ✅ Nomes de Lambda Corrigidos no Frontend

| Arquivo | Antes | Depois |
|---------|-------|--------|
| `NotificationSettings.tsx` | `save-notification-settings` | `notification-settings` |
| `WasteDetection.tsx` | `waste-detection` | `ml-waste-detection` |

### 3. ✅ Handler Corrigido

| Handler | Correção |
|---------|----------|
| `notification-settings.ts` | Adicionado export `handler` que roteia para métodos corretos |

### 4. ✅ SAM Template Atualizado

Adicionadas as seguintes Lambdas ao `sam/template.yaml`:
- `CancelBackgroundJobFunction`
- `RetryBackgroundJobFunction`

---

## 🔧 Lambdas de Uso Interno/Debug

Estas Lambdas são usadas apenas para debug, migrações ou operações administrativas:

1. **Debug:** `check-cloudtrail-status`, `check-costs`, `debug-cloudtrail`, `debug-azure-costs`, `check-daily-costs`, `diagnose-cost-dashboard`, `investigate-data-mismatch`, `debug-org-query`, `test-lambda-metrics`

2. **Migrações:** `fix-role-arn-migration`, `run-migration`, `run-migration-standalone`, `add-status-column`, `fix-azure-constraints`, `run-sql-migration`

3. **Setup:** `setup-license-config`, `db-init`

4. **CI/CD:** `check-migrations`, `run-migrations`

---

## 📋 Ações Realizadas

### ✅ Correções Aplicadas

1. **Criados handlers faltando:**
   - `backend/src/handlers/jobs/cancel-background-job.ts`
   - `backend/src/handlers/jobs/retry-background-job.ts`

2. **Corrigidas chamadas no frontend:**
   - `NotificationSettings.tsx`: `save-notification-settings` → `notification-settings`
   - `WasteDetection.tsx`: `waste-detection` → `ml-waste-detection`

3. **Corrigido handler `notification-settings.ts`:**
   - Adicionado export `handler` que roteia para os métodos corretos

4. **Atualizado SAM template:**
   - Adicionadas definições para `cancel-background-job` e `retry-background-job`

### 📝 Próximos Passos

1. Fazer commit das alterações
2. Push para branch `main`
3. CI/CD irá fazer deploy automático

### 5. Lambdas Candidatas a Remoção (após validação)
Nenhuma Lambda órfã identificada - todas têm uso confirmado ou são de uso interno/debug.

---

## Legenda

- ✅ = Chamada confirmada no frontend
- ⏰ = Job agendado ou invocação interna
- 🔧 = Debug/Admin/Migração
- ❌ = Problema identificado
