---
inclusion: always
---

# Lambda Operations - Deploy, Layers e Troubleshooting

## 🚨 Processo de Deploy (CI/CD OBRIGATÓRIO)

⛔ **NUNCA fazer deploy manual de lambdas.** Todo deploy é via CI/CD.

O pipeline (`cicd/buildspec-sam.yml`) detecta automaticamente o que mudou e faz deploy SOMENTE das lambdas afetadas. Basta fazer commit e push.

### Como funciona internamente (referência, NÃO executar manualmente):
- O CI/CD usa `cicd/scripts/deploy-changed-lambdas.sh` com mapeamento handler→lambda
- Imports são ajustados automaticamente (`../../lib/` → `./lib/`)
- lib/ e types/ são incluídos no ZIP automaticamente
- Handler path é configurado corretamente (`handler.handler`, não `handlers/xxx/handler.handler`)

### ⛔ NUNCA FAZER
```bash
❌ ./scripts/deploy-lambda.sh ...           # Deploy manual proibido
❌ ./scripts/deploy-all-lambdas.sh          # Deploy manual proibido
❌ aws lambda update-function-code ...       # Deploy manual proibido
✅ git add . && git commit && git push      # CI/CD faz o deploy
```

---

## Azure SDK - Requisitos Especiais

### Crypto Polyfill (OBRIGATÓRIO para handlers Azure)
```typescript
// DEVE ser o PRIMEIRO import
import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}
```

### Handlers que DEVEM ter crypto polyfill
- `validate-azure-credentials.ts`
- `save-azure-credentials.ts`
- `azure-*.ts` (todos os handlers Azure)

### @typespec Compatibilidade
Node.js 18 no Lambda não resolve exports condicionais. Criar arquivos em `@typespec/ts-http-runtime/internal/`:
```javascript
// internal/logger.js
module.exports = require('../dist/commonjs/logger/internal.js');
```

---

## Lambdas Críticas

### 🔴 CRÍTICO - Bloqueiam Onboarding
| Lambda | Funcionalidade |
|--------|----------------|
| `save-aws-credentials` | Quick Connect AWS |
| `validate-aws-credentials` | Validação AWS |
| `save-azure-credentials` | Quick Connect Azure |
| `validate-azure-credentials` | Validação Azure |

### 🟠 ALTO - Funcionalidades Core
| Lambda | Funcionalidade |
|--------|----------------|
| `security-scan` | Security Engine V3 |
| `compliance-scan` | Compliance v2.0 |
| `mfa-enroll` | MFA enrollment |
| `mfa-verify-login` | MFA login |

### Lambdas que Usam aws-helpers.js
`fetch-daily-costs`, `ri-sp-analyzer`, `security-scan`, `compliance-scan`, `well-architected-scan`, `guardduty-scan`, `iam-deep-analysis`, `drift-detection`, `lateral-movement-detection`, `validate-aws-credentials`, `validate-permissions`, `analyze-cloudtrail`, `waf-setup-monitoring`, `waf-dashboard-api`, `waf-unblock-expired`, `cost-optimization`, `fetch-cloudwatch-metrics`, `fetch-edge-services`, `detect-anomalies`, `budget-forecast`, `ml-waste-detection`, `aws-realtime-metrics`

---

## Health Check

### Verificar Erros (últimas 24h)
```bash
for func in save-aws-credentials validate-aws-credentials security-scan; do
  echo "=== $func ==="
  aws logs filter-log-events \
    --log-group-name "/aws/lambda/evo-uds-v3-sandbox-$func" \
    --start-time $(date -v-24H +%s000) \
    --filter-pattern "ERROR" \
    --region us-east-1 \
    --query 'events[*].message' --output text 2>/dev/null | head -3
done
```

### Testar Invocação
```bash
aws lambda invoke \
  --function-name evo-uds-v3-sandbox-{nome} \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}}}' \
  --region us-east-1 /tmp/test.json && cat /tmp/test.json
```

---

## Troubleshooting

### Erro 502 "Cannot find module '../../lib/xxx.js'"
**Causa:** Deploy incorreto (só copiou handler)
**Solução:** Refazer deploy com lib/ e types/, ajustar imports

### Erro "Runtime.ImportModuleError"
**Causa:** Handler path incorreto
**Solução:** Verificar e corrigir handler path

### Erro "Azure SDK not installed"
**Causa:** Layer sem pacotes Azure
**Solução:** Usar layer 91 (com Azure SDK + jsonwebtoken + lodash)

### Erro "crypto is not defined"
**Causa:** Handler Azure sem crypto polyfill
**Solução:** Adicionar polyfill no início do arquivo

### Erro "Cannot find module 'jsonwebtoken'"
**Causa:** Layer sem jsonwebtoken (dependência do @azure/msal-node)
**Solução:** Usar layer 91+

### Erro "Cannot find module 'lodash.includes'"
**Causa:** Layer sem dependências lodash
**Solução:** Usar layer 91+

---

## Atualizar Layer em Todas as Lambdas

```bash
LAYER_ARN="arn:aws:lambda:us-east-1:971354623291:layer:evo-prisma-deps-layer:91"

aws lambda list-functions --region us-east-1 \
  --query 'Functions[?starts_with(FunctionName, `evo-uds-v3-sandbox`)].FunctionName' \
  --output text | tr '\t' '\n' | while read func; do
  [ -n "$func" ] && aws lambda update-function-configuration \
    --function-name "$func" --layers "$LAYER_ARN" --region us-east-1 --no-cli-pager > /dev/null 2>&1
done
```

### Atualizar Lambdas Azure
```bash
LAYER_ARN="arn:aws:lambda:us-east-1:971354623291:layer:evo-prisma-deps-layer:91"
for func in validate-azure-credentials save-azure-credentials list-azure-credentials delete-azure-credentials azure-security-scan start-azure-security-scan azure-defender-scan azure-compliance-scan azure-well-architected-scan azure-cost-optimization azure-reservations-analyzer azure-fetch-costs azure-resource-inventory azure-activity-logs azure-fetch-monitor-metrics azure-detect-anomalies azure-fetch-edge-services list-cloud-credentials azure-oauth-initiate azure-oauth-callback azure-oauth-refresh azure-oauth-revoke; do
  aws lambda update-function-configuration --function-name "evo-uds-v3-sandbox-$func" --layers "$LAYER_ARN" --region us-east-1 --no-cli-pager > /dev/null 2>&1
done
```

---

## Criar Novo Layer

```bash
# 1. Preparar
npm install --prefix backend && npm run prisma:generate --prefix backend
rm -rf /tmp/layer && mkdir -p /tmp/layer/nodejs/node_modules

# 2. Copiar pacotes
cp -r backend/node_modules/@prisma backend/node_modules/.prisma backend/node_modules/zod /tmp/layer/nodejs/node_modules/

# 3. Usar script para AWS SDK (copia dependências transitivas)
node scripts/copy-deps.cjs backend /tmp/layer @aws-sdk/client-sts @aws-sdk/client-wafv2 ...

# 4. Limpar
find /tmp/layer -name "*.map" -delete
find /tmp/layer -name "*.md" -delete
rm -f /tmp/layer/nodejs/node_modules/.prisma/client/libquery_engine-darwin*.node

# 5. Publicar
cd /tmp/layer && zip -r /tmp/layer.zip nodejs
aws s3 cp /tmp/layer.zip s3://evo-uds-v3-sandbox-frontend-971354623291/layers/layer.zip
aws lambda publish-layer-version --layer-name evo-prisma-deps-layer --content S3Bucket=evo-uds-v3-sandbox-frontend-971354623291,S3Key=layers/layer.zip --compatible-runtimes nodejs18.x nodejs20.x --region us-east-1
```

---

**Última atualização:** 2026-02-03
