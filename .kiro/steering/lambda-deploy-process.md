# 🚨 PROCESSO OBRIGATÓRIO DE DEPLOY DE LAMBDAS

## Problema Recorrente

O código TypeScript compilado usa imports relativos como `../../lib/xxx.js`. Quando o deploy é feito incorretamente (copiando apenas o arquivo .js do handler), a Lambda falha com erro 502:

```
Runtime.ImportModuleError: Error: Cannot find module '../../lib/response.js'
```

## ✅ PROCESSO CORRETO (OBRIGATÓRIO)

### Opção 1: Usar o Script de Deploy

```bash
# Deploy de uma Lambda específica
./scripts/deploy-lambda.sh <handler-path> <lambda-name>

# Exemplos:
./scripts/deploy-lambda.sh cost/fetch-daily-costs fetch-daily-costs
./scripts/deploy-lambda.sh security/security-scan security-scan
./scripts/deploy-lambda.sh auth/mfa-handlers mfa-enroll
```

### Opção 2: Deploy Manual (Passo a Passo)

```bash
# 1. Build do backend
npm run build --prefix backend

# 2. Criar diretório temporário
rm -rf /tmp/lambda-deploy && mkdir -p /tmp/lambda-deploy

# 3. Copiar handler E AJUSTAR IMPORTS
sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/{categoria}/{handler}.js | \
sed 's|require("../lib/|require("./lib/|g' | \
sed 's|require("../../types/|require("./types/|g' > /tmp/lambda-deploy/{handler}.js

# 4. Copiar lib/ e types/
cp -r backend/dist/lib /tmp/lambda-deploy/
cp -r backend/dist/types /tmp/lambda-deploy/

# 5. Criar ZIP
pushd /tmp/lambda-deploy && zip -r /tmp/lambda.zip . && popd

# 6. Deploy
aws lambda update-function-code \
  --function-name evo-uds-v3-production-{nome} \
  --zip-file fileb:///tmp/lambda.zip \
  --region us-east-1

# 7. Atualizar handler path (CRÍTICO!)
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-{nome} \
  --handler {handler}.handler \
  --region us-east-1

# 8. Aguardar e testar
aws lambda wait function-updated --function-name evo-uds-v3-production-{nome} --region us-east-1
```

## ⛔ O QUE NUNCA FAZER

```bash
# ❌ ERRADO - Copiar apenas o handler
aws lambda update-function-code \
  --function-name evo-uds-v3-production-xxx \
  --zip-file fileb://backend/dist/handlers/xxx/xxx.js

# ❌ ERRADO - Não ajustar imports
cp backend/dist/handlers/xxx/xxx.js /tmp/lambda.zip

# ❌ ERRADO - Handler path incorreto
--handler handlers/xxx/xxx.handler  # ERRADO!
--handler xxx.handler               # CORRETO!
```

## Estrutura Correta do ZIP

```
lambda.zip
├── {handler}.js          # Handler com imports ajustados (./lib/)
├── lib/                  # Todas as bibliotecas compartilhadas
│   ├── aws-helpers.js    # ⚠️ CRÍTICO - Contém resolveAwsCredentials
│   ├── response.js
│   ├── auth.js
│   ├── database.js
│   ├── logging.js
│   └── ...
└── types/
    └── lambda.js
```

## Lambdas que Usam aws-helpers.js (CRÍTICAS)

Estas Lambdas usam `resolveAwsCredentials` e DEVEM ter o código atualizado:

### Cost
- `fetch-daily-costs`
- `ri-sp-analyzer`
- `cost-optimization`
- `budget-forecast`
- `ml-waste-detection`

### Security
- `security-scan`
- `compliance-scan`
- `well-architected-scan`
- `guardduty-scan`
- `iam-deep-analysis`
- `drift-detection`
- `lateral-movement-detection`
- `validate-aws-credentials`
- `validate-permissions`
- `analyze-cloudtrail`

### WAF
- `waf-setup-monitoring`
- `waf-dashboard-api`
- `waf-unblock-expired`

### Monitoring
- `aws-realtime-metrics`
- `fetch-cloudwatch-metrics`
- `fetch-edge-services`

### ML
- `detect-anomalies`

## Verificação Pós-Deploy

```bash
# 1. Verificar handler path
aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-{nome} \
  --query 'Handler' \
  --region us-east-1

# 2. Testar invocação OPTIONS
aws lambda invoke \
  --function-name evo-uds-v3-production-{nome} \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}}}' \
  --region us-east-1 \
  /tmp/test.json

# 3. Verificar logs
aws logs tail /aws/lambda/evo-uds-v3-production-{nome} --since 5m --region us-east-1
```

## Deploy em Massa (Todas as Lambdas AWS)

```bash
./scripts/deploy-all-aws-lambdas.sh
```

## Status de Deploy (2026-01-27)

Todas as 22 Lambdas críticas que usam `aws-helpers.js` foram deployadas corretamente:

| Lambda | Handler Path | Status |
|--------|--------------|--------|
| `fetch-daily-costs` | `fetch-daily-costs.handler` | ✅ |
| `ri-sp-analyzer` | `ri-sp-analyzer.handler` | ✅ |
| `security-scan` | `security-scan.handler` | ✅ |
| `compliance-scan` | `compliance-scan.handler` | ✅ |
| `well-architected-scan` | `well-architected-scan.handler` | ✅ |
| `validate-aws-credentials` | `validate-aws-credentials.handler` | ✅ |
| `waf-dashboard-api` | `waf-dashboard-api.handler` | ✅ |
| `aws-realtime-metrics` | `aws-realtime-metrics.handler` | ✅ |
| `guardduty-scan` | `guardduty-scan.handler` | ✅ |
| `iam-deep-analysis` | `iam-deep-analysis.handler` | ✅ |
| `drift-detection` | `drift-detection.handler` | ✅ |
| `lateral-movement-detection` | `lateral-movement-detection.handler` | ✅ |
| `analyze-cloudtrail` | `analyze-cloudtrail.handler` | ✅ |
| `validate-permissions` | `validate-permissions.handler` | ✅ |
| `waf-setup-monitoring` | `waf-setup-monitoring.handler` | ✅ |
| `cost-optimization` | `cost-optimization.handler` | ✅ |
| `fetch-cloudwatch-metrics` | `fetch-cloudwatch-metrics.handler` | ✅ |
| `fetch-edge-services` | `fetch-edge-services.handler` | ✅ |
| `detect-anomalies` | `detect-anomalies.handler` | ✅ |
| `budget-forecast` | `budget-forecast.handler` | ✅ |
| `ml-waste-detection` | `ml-waste-detection.handler` | ✅ |
| `waf-unblock-expired` | `waf-unblock-expired.handler` | ✅ |

---

**Última atualização:** 2026-01-27
**Versão:** 1.1
