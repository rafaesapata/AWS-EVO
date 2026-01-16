---
inclusion: always
---

# API Gateway Endpoints Reference

## 🚨 IMPORTANTE: Consulte este documento antes de criar novos endpoints

Este documento lista TODOS os endpoints do API Gateway existentes no sistema EVO.
**SEMPRE consulte este documento antes de criar novos endpoints para evitar duplicidade.**

## Configuração do API Gateway

- **REST API ID**: `3l66kn0eaj`
- **Stage**: `prod` (único stage em uso)
- **Custom Domain**: `api-evo.ai.udstec.io`
- **Regional Endpoint**: `d-lh5c9lpit7.execute-api.us-east-1.amazonaws.com`
- **Authorizer ID**: `joelbs` (Cognito User Pools - CognitoAuthorizerV2)
- **Functions Resource ID**: `n9gxy9` (parent de `/api/functions/*`)

## CORS Headers Padrão

Todos os endpoints OPTIONS devem retornar os seguintes headers:

```
Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
Access-Control-Allow-Origin: *
```

## ⛔ REGRAS OBRIGATÓRIAS

### Ao criar um novo endpoint:
1. **Verificar se já existe** - Consulte a lista abaixo
2. **Usar kebab-case** - Ex: `my-new-endpoint` (NÃO `my_new_endpoint`)
3. **Criar OPTIONS com CORS** - Sempre incluir método OPTIONS
4. **Incluir X-Impersonate-Organization** - Nos headers CORS permitidos
5. **Atualizar este documento** - Adicionar o novo endpoint na lista
6. **Deploy no stage `prod`** - NUNCA usar outro stage

### Convenção de nomenclatura:
- ✅ `increment-article-views` (kebab-case)
- ❌ `increment_article_views` (snake_case - PROIBIDO)

---

## Endpoints por Categoria

### 🔐 Autenticação & MFA

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `tejqzp` | `/api/functions/mfa-enroll` | `evo-uds-v3-production-mfa-enroll` |
| `vhgtsi` | `/api/functions/mfa-check` | `evo-uds-v3-production-mfa-check` |
| `9tfn4h` | `/api/functions/mfa-challenge-verify` | `evo-uds-v3-production-mfa-challenge-verify` |
| `xl5j8m` | `/api/functions/mfa-verify-login` | `evo-uds-v3-production-mfa-verify-login` |
| `vkk96e` | `/api/functions/mfa-list-factors` | `evo-uds-v3-production-mfa-list-factors` |
| `4l7a9f` | `/api/functions/mfa-unenroll` | `evo-uds-v3-production-mfa-unenroll` |
| `k8mjtq` | `/api/functions/webauthn-register` | `evo-uds-v3-production-webauthn-register` |
| `hredml` | `/api/functions/webauthn-authenticate` | `evo-uds-v3-production-webauthn-authenticate` |
| `5kwfqx` | `/api/functions/webauthn-check` | `evo-uds-v3-production-webauthn-check` |
| `bxc2jy` | `/api/functions/delete-webauthn-credential` | `evo-uds-v3-production-delete-webauthn-credential` |
| `6ijcy6` | `/api/functions/verify-tv-token` | `evo-uds-v3-production-verify-tv-token` |

### 👤 Administração

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `tg603p` | `/api/functions/admin-manage-user` | `evo-uds-v3-production-admin-manage-user` |
| `yudf3q` | `/api/functions/create-cognito-user` | `evo-uds-v3-production-create-cognito-user` |
| `x0twka` | `/api/functions/disable-cognito-user` | `evo-uds-v3-production-disable-cognito-user` |
| `2j586k` | `/api/functions/manage-organizations` | `evo-uds-v3-production-manage-organizations` |
| `26gu21` | `/api/functions/log-audit` | `evo-uds-v3-production-log-audit` |

### 🔒 Segurança

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `mru5m2` | `/api/functions/security-scan` | `evo-uds-v3-production-security-scan` |
| `l57dh7` | `/api/functions/start-security-scan` | `evo-uds-v3-production-start-security-scan` |
| `4e9me7` | `/api/functions/compliance-scan` | `evo-uds-v3-production-compliance-scan` |
| `brgrmb` | `/api/functions/start-compliance-scan` | `evo-uds-v3-production-start-compliance-scan` |
| `9ss8w4` | `/api/functions/get-compliance-scan-status` | `evo-uds-v3-production-get-compliance-scan-status` |
| `43b21j` | `/api/functions/get-compliance-history` | `evo-uds-v3-production-get-compliance-history` |
| `xrrjft` | `/api/functions/well-architected-scan` | `evo-uds-v3-production-well-architected-scan` |
| `ddne82` | `/api/functions/guardduty-scan` | `evo-uds-v3-production-guardduty-scan` |
| `6gsogw` | `/api/functions/get-findings` | `evo-uds-v3-production-get-findings` |
| `28bgnr` | `/api/functions/get-security-posture` | `evo-uds-v3-production-get-security-posture` |
| `a6o9xp` | `/api/functions/validate-aws-credentials` | `evo-uds-v3-production-validate-aws-credentials` |
| `82be3r` | `/api/functions/validate-permissions` | `evo-uds-v3-production-validate-permissions` |
| `dfbp4j` | `/api/functions/iam-deep-analysis` | `evo-uds-v3-production-iam-deep-analysis` |
| `k9efuk` | `/api/functions/lateral-movement-detection` | `evo-uds-v3-production-lateral-movement-detection` |
| `laezrq` | `/api/functions/drift-detection` | `evo-uds-v3-production-drift-detection` |
| `nwxq2h` | `/api/functions/analyze-cloudtrail` | `evo-uds-v3-production-analyze-cloudtrail` |
| `e3iye7` | `/api/functions/start-cloudtrail-analysis` | `evo-uds-v3-production-start-cloudtrail-analysis` |
| `t2axjb` | `/api/functions/fetch-cloudtrail` | `evo-uds-v3-production-fetch-cloudtrail` |

### 🛡️ WAF Monitoring

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `5xxb1b` | `/api/functions/waf-setup-monitoring` | `evo-uds-v3-production-waf-setup-monitoring` |
| `gqu27y` | `/api/functions/waf-dashboard-api` | `evo-uds-v3-production-waf-dashboard-api` |

### 💰 Custos & FinOps

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `ic5x7o` | `/api/functions/fetch-daily-costs` | `evo-uds-v3-production-fetch-daily-costs` |
| `3a4avi` | `/api/functions/ri-sp-analyzer` | `evo-uds-v3-production-ri-sp-analyzer` |
| `vz6zay` | `/api/functions/cost-optimization` | `evo-uds-v3-production-cost-optimization` |
| `prvxz1` | `/api/functions/budget-forecast` | `evo-uds-v3-production-budget-forecast` |
| `n88siy` | `/api/functions/generate-cost-forecast` | `evo-uds-v3-production-generate-cost-forecast` |
| `jk7w8y` | `/api/functions/finops-copilot` | `evo-uds-v3-production-finops-copilot` |
| `m7ln5j` | `/api/functions/ml-waste-detection` | `evo-uds-v3-production-ml-waste-detection` |

### 🤖 IA & Machine Learning

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `qb5gnf` | `/api/functions/bedrock-chat` | `evo-uds-v3-production-bedrock-chat` |
| `00i1j8` | `/api/functions/intelligent-alerts-analyzer` | `evo-uds-v3-production-intelligent-alerts-analyzer` |
| `u73ju4` | `/api/functions/predict-incidents` | `evo-uds-v3-production-predict-incidents` |
| `styfgh` | `/api/functions/detect-anomalies` | `evo-uds-v3-production-detect-anomalies` |
| `5bki5e` | `/api/functions/anomaly-detection` | `evo-uds-v3-production-anomaly-detection` |

### 📊 Dashboard & Monitoramento

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `xstepp` | `/api/functions/get-executive-dashboard` | `evo-uds-v3-production-get-executive-dashboard` |
| `vr5fmk` | `/api/functions/get-executive-dashboard-public` | `evo-uds-v3-production-get-executive-dashboard-public` |
| `ktfsjr` | `/api/functions/manage-tv-tokens` | `evo-uds-v3-production-manage-tv-tokens` |
| `p34kg9` | `/api/functions/alerts` | `evo-uds-v3-production-alerts` |
| `quaj0g` | `/api/functions/auto-alerts` | `evo-uds-v3-production-auto-alerts` |
| `q1yx4q` | `/api/functions/check-alert-rules` | `evo-uds-v3-production-check-alert-rules` |
| `oa07cd` | `/api/functions/aws-realtime-metrics` | `evo-uds-v3-production-aws-realtime-metrics` |
| `jjmfls` | `/api/functions/fetch-cloudwatch-metrics` | `evo-uds-v3-production-fetch-cloudwatch-metrics` |
| `qemkl5` | `/api/functions/fetch-edge-services` | `evo-uds-v3-production-fetch-edge-services` |
| `c50w7v` | `/api/functions/endpoint-monitor-check` | `evo-uds-v3-production-endpoint-monitor-check` |
| `658jbt` | `/api/functions/generate-error-fix-prompt` | `evo-uds-v3-production-generate-error-fix-prompt` |
| `goaymq` | `/api/functions/get-platform-metrics` | `evo-uds-v3-production-get-platform-metrics` |
| `j7obmh` | `/api/functions/get-recent-errors` | `evo-uds-v3-production-get-recent-errors` |

### ☁️ AWS Credentials

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `owc858` | `/api/functions/list-aws-credentials` | `evo-uds-v3-production-list-aws-credentials` |
| `ulrjzw` | `/api/functions/save-aws-credentials` | `evo-uds-v3-production-save-aws-credentials` |
| `jqdvex` | `/api/functions/update-aws-credentials` | `evo-uds-v3-production-update-aws-credentials` |

### 🔵 Azure Multi-Cloud

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `bs1pz7` | `/api/functions/azure-oauth-initiate` | `evo-uds-v3-production-azure-oauth-initiate` |
| `oqanpl` | `/api/functions/azure-oauth-callback` | `evo-uds-v3-production-azure-oauth-callback` |
| `bb4jp5` | `/api/functions/azure-oauth-refresh` | `evo-uds-v3-production-azure-oauth-refresh` |
| `d87n72` | `/api/functions/azure-oauth-revoke` | `evo-uds-v3-production-azure-oauth-revoke` |
| `3c4ik8` | `/api/functions/validate-azure-credentials` | `evo-uds-v3-production-validate-azure-credentials` |
| `9f6vyi` | `/api/functions/save-azure-credentials` | `evo-uds-v3-production-save-azure-credentials` |
| `i2s5d9` | `/api/functions/list-azure-credentials` | `evo-uds-v3-production-list-azure-credentials` |
| `zmn7l7` | `/api/functions/delete-azure-credentials` | `evo-uds-v3-production-delete-azure-credentials` |
| `qnmduw` | `/api/functions/azure-security-scan` | `evo-uds-v3-production-azure-security-scan` |
| `pcfpat` | `/api/functions/start-azure-security-scan` | `evo-uds-v3-production-start-azure-security-scan` |
| `8se2tw` | `/api/functions/azure-defender-scan` | `evo-uds-v3-production-azure-defender-scan` |
| `hgfjy6` | `/api/functions/azure-compliance-scan` | `evo-uds-v3-production-azure-compliance-scan` |
| `1km6sw` | `/api/functions/azure-well-architected-scan` | `evo-uds-v3-production-azure-well-architected-scan` |
| `ye9trb` | `/api/functions/azure-cost-optimization` | `evo-uds-v3-production-azure-cost-optimization` |
| `4s9s7d` | `/api/functions/azure-reservations-analyzer` | `evo-uds-v3-production-azure-reservations-analyzer` |
| `mer8kc` | `/api/functions/azure-fetch-costs` | `evo-uds-v3-production-azure-fetch-costs` |
| `rzlkx4` | `/api/functions/azure-resource-inventory` | `evo-uds-v3-production-azure-resource-inventory` |
| `7enf38` | `/api/functions/azure-activity-logs` | `evo-uds-v3-production-azure-activity-logs` |
| `wn1yqu` | `/api/functions/azure-fetch-monitor-metrics` | `evo-uds-v3-production-azure-fetch-monitor-metrics` |
| `cd7gtb` | `/api/functions/azure-detect-anomalies` | `evo-uds-v3-production-azure-detect-anomalies` |
| `3s8ari` | `/api/functions/list-cloud-credentials` | `evo-uds-v3-production-list-cloud-credentials` |

### 📜 Licenciamento

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `7ed10q` | `/api/functions/validate-license` | `evo-uds-v3-production-validate-license` |
| `twi6xr` | `/api/functions/configure-license` | `evo-uds-v3-production-configure-license` |
| `kaf7e9` | `/api/functions/sync-license` | `evo-uds-v3-production-sync-license` |
| `jgmgzc` | `/api/functions/admin-sync-license` | `evo-uds-v3-production-admin-sync-license` |
| `by24d9` | `/api/functions/manage-seats` | `evo-uds-v3-production-manage-seats` |
| `igmcx7` | `/api/functions/daily-license-validation` | `evo-uds-v3-production-daily-license-validation` |

### 📚 Knowledge Base

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `6jmpsl` | `/api/functions/kb-analytics-dashboard` | `evo-uds-v3-production-kb-analytics-dashboard` |
| `yof7xi` | `/api/functions/kb-ai-suggestions` | `evo-uds-v3-production-kb-ai-suggestions` |
| `kntfc9` | `/api/functions/kb-export-pdf` | `evo-uds-v3-production-kb-export-pdf` |
| `rlxxg3` | `/api/functions/increment-article-views` | `evo-uds-v3-production-increment-article-views` |
| `z52awx` | `/api/functions/increment-article-helpful` | `evo-uds-v3-production-increment-article-helpful` |
| `lbrm4e` | `/api/functions/track-article-view-detailed` | `evo-uds-v3-production-track-article-view-detailed` |

### 📄 Relatórios

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `b8ggbk` | `/api/functions/generate-pdf-report` | `evo-uds-v3-production-generate-pdf-report` |
| `e9b72o` | `/api/functions/generate-excel-report` | `evo-uds-v3-production-generate-excel-report` |
| `8p2pt3` | `/api/functions/generate-security-pdf` | `evo-uds-v3-production-generate-security-pdf` |
| `8hmvy5` | `/api/functions/security-scan-pdf-export` | `evo-uds-v3-production-security-scan-pdf-export` |
| `o7kv3g` | `/api/functions/generate-remediation-script` | `evo-uds-v3-production-generate-remediation-script` |

### 🗄️ Dados

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `p2wp1i` | `/api/functions/query-table` | `evo-uds-v3-production-query-table` |
| `h2yw8x` | `/api/functions/mutate-table` | `evo-uds-v3-production-mutate-table` |

### 🏢 Organizações & Perfis

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `gau0re` | `/api/functions/create-organization-account` | `evo-uds-v3-production-create-organization-account` |
| `onnw2s` | `/api/functions/sync-organization-accounts` | `evo-uds-v3-production-sync-organization-accounts` |
| `b8m7vm` | `/api/functions/check-organization` | `evo-uds-v3-production-check-organization` |
| `am9cnx` | `/api/functions/create-with-organization` | `evo-uds-v3-production-create-with-organization` |
| `qglhf3` | `/api/functions/get-user-organization` | `evo-uds-v3-production-get-user-organization` |

### 📧 Notificações

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `qxk9ym` | `/api/functions/send-email` | `evo-uds-v3-production-send-email` |
| `qczsvo` | `/api/functions/send-notification` | `evo-uds-v3-production-send-notification` |
| `aa25yv` | `/api/functions/get-communication-logs` | `evo-uds-v3-production-get-communication-logs` |

### 📦 Storage

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `ov2own` | `/api/functions/storage-download` | `evo-uds-v3-production-storage-download` |
| `5kgy0i` | `/api/functions/storage-delete` | `evo-uds-v3-production-storage-delete` |
| `67fmah` | `/api/functions/upload-attachment` | `evo-uds-v3-production-upload-attachment` |

### 🔧 Jobs & Sistema

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `0bzm7t` | `/api/functions/process-background-jobs` | `evo-uds-v3-production-process-background-jobs` |
| `kcsice` | `/api/functions/list-background-jobs` | `evo-uds-v3-production-list-background-jobs` |
| `klvj3s` | `/api/functions/execute-scheduled-job` | `evo-uds-v3-production-execute-scheduled-job` |
| `8wiqvm` | `/api/functions/scheduled-scan-executor` | `evo-uds-v3-production-scheduled-scan-executor` |

### 🔗 Integrações

| Resource ID | Path | Lambda |
|-------------|------|--------|
| `3jwu9p` | `/api/functions/create-jira-ticket` | `evo-uds-v3-production-create-jira-ticket` |

---

## Endpoints Especiais (fora de /api/functions/)

| Resource ID | Path | Descrição |
|-------------|------|-----------|
| `bo20vc` | `/api/health` | Health check |
| `7qhwko` | `/monitored_endpoints` | CRUD de endpoints monitorados |
| `ru4o79` | `/api/profiles/check` | Verifica perfil |
| `enmiis` | `/api/profiles/create-with-org` | Cria perfil com organização |

---

## Estatísticas

- **Total de Endpoints**: 114 endpoints sob `/api/functions/`
- **Endpoints Especiais**: 4 endpoints
- **Categorias**: 15 categorias

---

## Como Criar Novo Endpoint

### Processo Completo (5 passos obrigatórios)

```bash
# 1. Criar resource
aws apigateway create-resource \
  --rest-api-id 3l66kn0eaj \
  --parent-id n9gxy9 \
  --path-part NOME-ENDPOINT \
  --region us-east-1

# 2. Criar OPTIONS (CORS) - OBRIGATÓRIO
aws apigateway put-method \
  --rest-api-id 3l66kn0eaj \
  --resource-id RESOURCE_ID \
  --http-method OPTIONS \
  --authorization-type NONE \
  --region us-east-1

aws apigateway put-integration \
  --rest-api-id 3l66kn0eaj \
  --resource-id RESOURCE_ID \
  --http-method OPTIONS \
  --type MOCK \
  --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
  --region us-east-1

aws apigateway put-method-response \
  --rest-api-id 3l66kn0eaj \
  --resource-id RESOURCE_ID \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' \
  --region us-east-1

aws apigateway put-integration-response \
  --rest-api-id 3l66kn0eaj \
  --resource-id RESOURCE_ID \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \
  --region us-east-1

# 3. Criar POST com Cognito
aws apigateway put-method \
  --rest-api-id 3l66kn0eaj \
  --resource-id RESOURCE_ID \
  --http-method POST \
  --authorization-type COGNITO_USER_POOLS \
  --authorizer-id joelbs \
  --region us-east-1

aws apigateway put-integration \
  --rest-api-id 3l66kn0eaj \
  --resource-id RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:383234048592:function:LAMBDA_NAME/invocations" \
  --region us-east-1

# 4. Adicionar permissão Lambda - CRÍTICO!
# ⚠️ O source-arn DEVE incluir o path completo: /api/functions/NOME-ENDPOINT
aws lambda add-permission \
  --function-name LAMBDA_NAME \
  --statement-id apigateway-NOME-ENDPOINT \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/api/functions/NOME-ENDPOINT" \
  --region us-east-1

# 5. Deploy (IMPORTANTE: usar stage 'prod')
aws apigateway create-deployment \
  --rest-api-id 3l66kn0eaj \
  --stage-name prod \
  --region us-east-1
```

---

## 🚨 Erros Comuns e Soluções

### Erro 500 "Cannot read properties of undefined (reading 'authorizer')"

**Causa:** A Lambda não está recebendo o contexto de autorização do Cognito.

**Soluções:**
1. Verificar se o método POST tem `authorizationType: COGNITO_USER_POOLS`
2. Verificar se o `authorizerId` está correto (`joelbs`)
3. Verificar se a permissão Lambda tem o path correto

### Erro 500 sem logs na Lambda

**Causa:** API Gateway não consegue invocar a Lambda (permissão faltando ou incorreta).

**Diagnóstico:**
```bash
# Verificar permissões da Lambda
aws lambda get-policy --function-name LAMBDA_NAME --region us-east-1

# Verificar se o source-arn está correto
# DEVE ser: arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/api/functions/NOME-ENDPOINT
# NÃO: arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/NOME-ENDPOINT (falta /api/functions/)
```

**Solução:**
```bash
aws lambda add-permission \
  --function-name LAMBDA_NAME \
  --statement-id apigateway-NOME-ENDPOINT-fix \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:383234048592:3l66kn0eaj/*/POST/api/functions/NOME-ENDPOINT" \
  --region us-east-1
```

### Erro 403 no OPTIONS (CORS)

**Causa:** Headers CORS não configurados corretamente.

**Solução:**
```bash
# Atualizar integration response do OPTIONS
aws apigateway update-integration-response \
  --rest-api-id 3l66kn0eaj \
  --resource-id RESOURCE_ID \
  --http-method OPTIONS \
  --status-code 200 \
  --patch-operations '[{"op":"replace","path":"/responseParameters/method.response.header.Access-Control-Allow-Headers","value":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token,X-Impersonate-Organization'"'"'"}]' \
  --region us-east-1

# Deploy
aws apigateway create-deployment --rest-api-id 3l66kn0eaj --stage-name prod --region us-east-1
```

### Erro 401 "Unauthorized"

**Possíveis causas:**
1. Token JWT expirado → Fazer logout e login novamente
2. Token JWT inválido → Verificar configuração do Cognito
3. Credenciais de terceiros inválidas (Azure, etc.) → Verificar credenciais

### Erro 502 "Cannot find module"

**Causa:** Lambda deployada sem as dependências corretas.

**Solução:** Seguir o processo de deploy correto em `.kiro/steering/architecture.md`

---

## Checklist para Novo Endpoint

- [ ] Resource criado com `create-resource`
- [ ] Método OPTIONS configurado com CORS
- [ ] Headers CORS incluem `X-Impersonate-Organization`
- [ ] Método POST configurado com Cognito authorizer
- [ ] Integration POST aponta para Lambda correta
- [ ] **Permissão Lambda adicionada com path COMPLETO** (`/api/functions/NOME-ENDPOINT`)
- [ ] Deploy feito no stage `prod`
- [ ] Endpoint adicionado neste documento
- [ ] Endpoint adicionado em `lambda-functions-reference.md`

---

## Histórico de Limpeza

### 2026-01-12 - Remoção de Duplicatas
Removidos 5 endpoints duplicados:
- `increment_article_views` (1xb4re) → usar `increment-article-views` (rlxxg3)
- `increment_article_helpful` (ef15rq) → usar `increment-article-helpful` (z52awx)
- `track_article_view_detailed` (ddj42d) → usar `track-article-view-detailed` (lbrm4e)
- `analyze-ri-sp` (6fnbul) → usar `ri-sp-analyzer` (3a4avi)
- `waf-dashboard` (8o8d8c) → usar `waf-dashboard-api` (gqu27y)

### 2026-01-12 - Atualização CORS
Adicionado `X-Impersonate-Organization` aos headers CORS permitidos em todos os 112 endpoints.

### 2026-01-12 - Fix Permissão Lambda validate-azure-credentials
Corrigida permissão Lambda que estava com path incorreto (`/validate-azure-credentials` em vez de `/api/functions/validate-azure-credentials`).

### 2026-01-15 - Platform Monitoring Endpoints
Adicionados 3 novos endpoints para o sistema de Platform Monitoring com 100% de cobertura:
- `generate-error-fix-prompt` (658jbt) - Gera prompts de correção dinâmicos
- `get-platform-metrics` (goaymq) - Métricas de 114 Lambdas + 111 endpoints + frontend
- `get-recent-errors` (j7obmh) - Erros recentes do CloudWatch Logs em tempo real

### 2026-01-15 - Novos Endpoints de Compliance
Adicionados 3 novos endpoints para o sistema avançado de compliance:
- `start-compliance-scan` (brgrmb) - Inicia scan de compliance assíncrono
- `get-compliance-scan-status` (9ss8w4) - Retorna status e progresso do scan
- `get-compliance-history` (43b21j) - Retorna histórico para análise de tendências

---

**Última atualização:** 2026-01-15
**Versão:** 1.3
