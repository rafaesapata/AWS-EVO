---
inclusion: manual
---

# API & Lambda Reference

## 🚨 Consulte antes de criar novas Lambdas ou endpoints

---

## API Gateway Configuration

| Propriedade | Valor |
|-------------|-------|
| **REST API ID** | `3l66kn0eaj` |
| **Stage** | `prod` |
| **Custom Domain** | `api-evo.ai.udstec.io` |
| **Authorizer ID** | `joelbs` (Cognito User Pools) |
| **Functions Resource ID** | `n9gxy9` |

### CORS Headers Padrão
```
Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
Access-Control-Allow-Origin: *
```

---

## Criar Novo Endpoint

```bash
# 1. Criar resource
aws apigateway create-resource --rest-api-id 3l66kn0eaj --parent-id n9gxy9 --path-part NOME-ENDPOINT --region us-east-1

# 2. OPTIONS (CORS)
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --authorization-type NONE --region us-east-1
aws apigateway put-integration --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --type MOCK --request-templates '{"application/json": "{\"statusCode\": 200}"}' --region us-east-1
aws apigateway put-method-response --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' --region us-east-1
aws apigateway put-integration-response --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' --region us-east-1

# 3. POST com Cognito
aws apigateway put-method --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method POST --authorization-type COGNITO_USER_POOLS --authorizer-id joelbs --region us-east-1
aws apigateway put-integration --rest-api-id 3l66kn0eaj --resource-id RESOURCE_ID --http-method POST --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:971354623291:function:LAMBDA_NAME/invocations" --region us-east-1

# 4. Permissão Lambda (CRÍTICO: path completo)
aws lambda add-permission --function-name LAMBDA_NAME --statement-id apigateway-NOME-ENDPOINT --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:us-east-1:971354623291:3l66kn0eaj/*/POST/api/functions/NOME-ENDPOINT" --region us-east-1

# 5. Deploy
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1
```

---

## Lambda Functions por Categoria

### 🔐 Autenticação & MFA
| Lambda | Endpoint |
|--------|----------|
| `mfa-enroll` | `/api/functions/mfa-enroll` |
| `mfa-check` | `/api/functions/mfa-check` |
| `mfa-challenge-verify` | `/api/functions/mfa-challenge-verify` |
| `mfa-verify-login` | `/api/functions/mfa-verify-login` |
| `mfa-list-factors` | `/api/functions/mfa-list-factors` |
| `mfa-unenroll` | `/api/functions/mfa-unenroll` |
| `webauthn-register` | `/api/functions/webauthn-register` |
| `webauthn-authenticate` | `/api/functions/webauthn-authenticate` |
| `webauthn-check` | `/api/functions/webauthn-check` |
| `delete-webauthn-credential` | `/api/functions/delete-webauthn-credential` |
| `verify-tv-token` | `/api/functions/verify-tv-token` |
| `self-register` | `/api/functions/self-register` (PUBLIC) |
| `forgot-password` | `/api/functions/forgot-password` |

### 👤 Administração
| Lambda | Endpoint |
|--------|----------|
| `admin-manage-user` | `/api/functions/admin-manage-user` |
| `create-cognito-user` | `/api/functions/create-cognito-user` |
| `create-user` | `/api/functions/create-user` |
| `disable-cognito-user` | `/api/functions/disable-cognito-user` |
| `manage-organizations` | `/api/functions/manage-organizations` |
| `deactivate-demo-mode` | `/api/functions/deactivate-demo-mode` |
| `manage-demo-mode` | `/api/functions/manage-demo-mode` |
| `log-audit` | `/api/functions/log-audit` |
| `manage-email-templates` | `/api/functions/manage-email-templates` |

### ☁️ AWS Credentials
| Lambda | Endpoint |
|--------|----------|
| `list-aws-credentials` | `/api/functions/list-aws-credentials` |
| `save-aws-credentials` | `/api/functions/save-aws-credentials` |
| `update-aws-credentials` | `/api/functions/update-aws-credentials` |

### 🔒 Segurança
| Lambda | Endpoint |
|--------|----------|
| `security-scan` | `/api/functions/security-scan` |
| `start-security-scan` | `/api/functions/start-security-scan` |
| `compliance-scan` | `/api/functions/compliance-scan` |
| `start-compliance-scan` | `/api/functions/start-compliance-scan` |
| `get-compliance-scan-status` | `/api/functions/get-compliance-scan-status` |
| `get-compliance-history` | `/api/functions/get-compliance-history` |
| `well-architected-scan` | `/api/functions/well-architected-scan` |
| `guardduty-scan` | `/api/functions/guardduty-scan` |
| `get-findings` | `/api/functions/get-findings` |
| `get-security-posture` | `/api/functions/get-security-posture` |
| `validate-aws-credentials` | `/api/functions/validate-aws-credentials` |
| `validate-permissions` | `/api/functions/validate-permissions` |
| `iam-deep-analysis` | `/api/functions/iam-deep-analysis` |
| `lateral-movement-detection` | `/api/functions/lateral-movement-detection` |
| `drift-detection` | `/api/functions/drift-detection` |
| `analyze-cloudtrail` | `/api/functions/analyze-cloudtrail` |
| `start-cloudtrail-analysis` | `/api/functions/start-cloudtrail-analysis` |
| `fetch-cloudtrail` | `/api/functions/fetch-cloudtrail` |

### 🛡️ WAF Monitoring
| Lambda | Endpoint |
|--------|----------|
| `waf-setup-monitoring` | `/api/functions/waf-setup-monitoring` |
| `waf-dashboard-api` | `/api/functions/waf-dashboard-api` |

### 💰 Custos & FinOps
| Lambda | Endpoint |
|--------|----------|
| `fetch-daily-costs` | `/api/functions/fetch-daily-costs` |
| `ri-sp-analyzer` | `/api/functions/ri-sp-analyzer` |
| `get-ri-sp-data` | `/api/functions/get-ri-sp-data` |
| `get-ri-sp-analysis` | `/api/functions/get-ri-sp-analysis` |
| `list-ri-sp-history` | `/api/functions/list-ri-sp-history` |
| `cost-optimization` | `/api/functions/cost-optimization` |
| `budget-forecast` | `/api/functions/budget-forecast` |
| `generate-cost-forecast` | `/api/functions/generate-cost-forecast` |
| `finops-copilot` | `/api/functions/finops-copilot` |
| `ml-waste-detection` | `/api/functions/ml-waste-detection` |

### 🤖 IA & Machine Learning
| Lambda | Endpoint |
|--------|----------|
| `bedrock-chat` | `/api/functions/bedrock-chat` |
| `get-ai-notifications` | `/api/functions/get-ai-notifications` |
| `update-ai-notification` | `/api/functions/update-ai-notification` |
| `send-ai-notification` | `/api/functions/send-ai-notification` |
| `list-ai-notifications-admin` | `/api/functions/list-ai-notifications-admin` |
| `manage-notification-rules` | `/api/functions/manage-notification-rules` |
| `intelligent-alerts-analyzer` | `/api/functions/intelligent-alerts-analyzer` |
| `predict-incidents` | `/api/functions/predict-incidents` |
| `detect-anomalies` | `/api/functions/detect-anomalies` |

### 📊 Dashboard
| Lambda | Endpoint |
|--------|----------|
| `get-executive-dashboard` | `/api/functions/get-executive-dashboard` |
| `get-executive-dashboard-public` | `/api/functions/get-executive-dashboard-public` |
| `manage-tv-tokens` | `/api/functions/manage-tv-tokens` |

### 📡 Monitoramento
| Lambda | Endpoint |
|--------|----------|
| `alerts` | `/api/functions/alerts` |
| `auto-alerts` | `/api/functions/auto-alerts` |
| `check-alert-rules` | `/api/functions/check-alert-rules` |
| `aws-realtime-metrics` | `/api/functions/aws-realtime-metrics` |
| `fetch-cloudwatch-metrics` | `/api/functions/fetch-cloudwatch-metrics` |
| `fetch-edge-services` | `/api/functions/fetch-edge-services` |
| `endpoint-monitor-check` | `/api/functions/endpoint-monitor-check` |
| `generate-error-fix-prompt` | `/api/functions/generate-error-fix-prompt` |
| `get-platform-metrics` | `/api/functions/get-platform-metrics` |
| `get-recent-errors` | `/api/functions/get-recent-errors` |
| `get-lambda-health` | `/api/functions/get-lambda-health` |
| `log-frontend-error` | `/api/functions/log-frontend-error` |

### 📜 Licenciamento
| Lambda | Endpoint |
|--------|----------|
| `validate-license` | `/api/functions/validate-license` |
| `configure-license` | `/api/functions/configure-license` |
| `sync-license` | `/api/functions/sync-license` |
| `admin-sync-license` | `/api/functions/admin-sync-license` |
| `manage-seats` | `/api/functions/manage-seats` |

### 🔵 Azure Multi-Cloud
| Lambda | Endpoint |
|--------|----------|
| `azure-oauth-initiate` | `/api/functions/azure-oauth-initiate` |
| `azure-oauth-callback` | `/api/functions/azure-oauth-callback` |
| `azure-oauth-refresh` | `/api/functions/azure-oauth-refresh` |
| `azure-oauth-revoke` | `/api/functions/azure-oauth-revoke` |
| `validate-azure-credentials` | `/api/functions/validate-azure-credentials` |
| `validate-azure-permissions` | `/api/functions/validate-azure-permissions` |
| `save-azure-credentials` | `/api/functions/save-azure-credentials` |
| `list-azure-credentials` | `/api/functions/list-azure-credentials` |
| `delete-azure-credentials` | `/api/functions/delete-azure-credentials` |
| `azure-security-scan` | `/api/functions/azure-security-scan` |
| `start-azure-security-scan` | `/api/functions/start-azure-security-scan` |
| `azure-defender-scan` | `/api/functions/azure-defender-scan` |
| `azure-compliance-scan` | `/api/functions/azure-compliance-scan` |
| `azure-well-architected-scan` | `/api/functions/azure-well-architected-scan` |
| `azure-cost-optimization` | `/api/functions/azure-cost-optimization` |
| `azure-reservations-analyzer` | `/api/functions/azure-reservations-analyzer` |
| `azure-fetch-costs` | `/api/functions/azure-fetch-costs` |
| `azure-resource-inventory` | `/api/functions/azure-resource-inventory` |
| `azure-activity-logs` | `/api/functions/azure-activity-logs` |
| `azure-fetch-monitor-metrics` | `/api/functions/azure-fetch-monitor-metrics` |
| `azure-detect-anomalies` | `/api/functions/azure-detect-anomalies` |
| `azure-fetch-edge-services` | `/api/functions/azure-fetch-edge-services` |
| `list-cloud-credentials` | `/api/functions/list-cloud-credentials` |

### 📚 Knowledge Base
| Lambda | Endpoint |
|--------|----------|
| `kb-analytics-dashboard` | `/api/functions/kb-analytics-dashboard` |
| `kb-ai-suggestions` | `/api/functions/kb-ai-suggestions` |
| `kb-export-pdf` | `/api/functions/kb-export-pdf` |
| `increment-article-views` | `/api/functions/increment-article-views` |
| `increment-article-helpful` | `/api/functions/increment-article-helpful` |
| `track-article-view-detailed` | `/api/functions/track-article-view-detailed` |

### 📄 Relatórios
| Lambda | Endpoint |
|--------|----------|
| `generate-pdf-report` | `/api/functions/generate-pdf-report` |
| `generate-excel-report` | `/api/functions/generate-excel-report` |
| `generate-security-pdf` | `/api/functions/generate-security-pdf` |
| `security-scan-pdf-export` | `/api/functions/security-scan-pdf-export` |
| `generate-remediation-script` | `/api/functions/generate-remediation-script` |

### 🗄️ Dados
| Lambda | Endpoint |
|--------|----------|
| `query-table` | `/api/functions/query-table` |
| `mutate-table` | `/api/functions/mutate-table` |
| `ticket-management` | `/api/functions/ticket-management` |
| `ticket-attachments` | `/api/functions/ticket-attachments` |

### 🏢 Organizações & Perfis
| Lambda | Endpoint |
|--------|----------|
| `create-organization-account` | `/api/functions/create-organization-account` |
| `sync-organization-accounts` | `/api/functions/sync-organization-accounts` |
| `check-organization` | `/api/functions/check-organization` |
| `create-with-organization` | `/api/functions/create-with-organization` |
| `get-user-organization` | `/api/functions/get-user-organization` |

### 📧 Notificações
| Lambda | Endpoint |
|--------|----------|
| `send-email` | `/api/functions/send-email` |
| `send-notification` | `/api/functions/send-notification` |
| `get-communication-logs` | `/api/functions/get-communication-logs` |
| `manage-email-preferences` | `/api/functions/manage-email-preferences` |

### 🔧 Jobs & Sistema
| Lambda | Endpoint |
|--------|----------|
| `process-background-jobs` | `/api/functions/process-background-jobs` |
| `list-background-jobs` | `/api/functions/list-background-jobs` |
| `execute-scheduled-job` | `/api/functions/execute-scheduled-job` |
| `scheduled-scan-executor` | `/api/functions/scheduled-scan-executor` |

### 📦 Storage
| Lambda | Endpoint |
|--------|----------|
| `storage-download` | `/api/functions/storage-download` |
| `storage-delete` | `/api/functions/storage-delete` |
| `upload-attachment` | `/api/functions/upload-attachment` |

### 🔗 Integrações
| Lambda | Endpoint |
|--------|----------|
| `create-jira-ticket` | `/api/functions/create-jira-ticket` |

---

## Endpoints Especiais

| Path | Descrição |
|------|-----------|
| `/api/health` | Health check |
| `/monitored_endpoints` | CRUD de endpoints monitorados |
| `/api/profiles/check` | Verifica perfil |
| `/api/profiles/create-with-org` | Cria perfil com organização |

---

## Estatísticas

- **Total de Lambdas**: ~194 funções
- **Total de Endpoints**: ~140 endpoints
- **Categorias**: 26 categorias

---

## Checklist para Novas Lambdas

- [ ] Verificar se funcionalidade similar já existe
- [ ] Seguir padrão de nomenclatura: `evo-uds-v3-sandbox-{nome}`
- [ ] Criar endpoint no API Gateway com CORS
- [ ] Adicionar permissão Lambda com path COMPLETO
- [ ] Deploy no stage `prod`
- [ ] Atualizar este documento

---

**Última atualização:** 2026-02-03

