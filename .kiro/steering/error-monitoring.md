# Error Monitoring & Critical Lambda Health Checks

## 🚨 IMPORTANTE: Lambdas Críticas que NÃO podem falhar

Este documento lista as Lambdas CRÍTICAS do sistema que, se falharem, bloqueiam funcionalidades essenciais.

## Lambdas Críticas por Impacto

### 🔴 CRÍTICO - Bloqueiam Onboarding de Clientes

| Lambda | Funcionalidade | Impacto se falhar |
|--------|----------------|-------------------|
| `save-aws-credentials` | Quick Connect AWS | Impossível adicionar novas contas AWS |
| `validate-aws-credentials` | Validação de credenciais | Impossível validar contas AWS |
| `save-azure-credentials` | Quick Connect Azure | Impossível adicionar contas Azure |
| `validate-azure-credentials` | Validação Azure | Impossível validar contas Azure |

### 🟠 ALTO - Bloqueiam Funcionalidades Core

| Lambda | Funcionalidade | Impacto se falhar |
|--------|----------------|-------------------|
| `security-scan` | Security Engine V3 | Impossível fazer scans de segurança |
| `compliance-scan` | Compliance v2.0 | Impossível fazer scans de compliance |
| `mfa-enroll` | MFA enrollment | Impossível configurar MFA |
| `mfa-verify-login` | MFA login | Impossível fazer login com MFA |
| `webauthn-register` | Passkey registration | Impossível registrar passkeys |
| `webauthn-authenticate` | Passkey login | Impossível fazer login com passkey |

### 🟡 MÉDIO - Degradam Experiência

| Lambda | Funcionalidade | Impacto se falhar |
|--------|----------------|-------------------|
| `fetch-daily-costs` | Cost dashboard | Dashboard de custos vazio |
| `bedrock-chat` | FinOps Copilot | Copilot indisponível |
| `get-executive-dashboard` | Executive dashboard | Dashboard executivo quebrado |

## Como Monitorar Lambdas Críticas

### 1. Verificar Logs de Erro (últimas 24h)

```bash
# Verificar todas as Lambdas críticas
for func in save-aws-credentials validate-aws-credentials save-azure-credentials validate-azure-credentials security-scan compliance-scan mfa-enroll mfa-verify-login; do
  echo "=== Checking evo-uds-v3-production-$func ==="
  aws logs filter-log-events \
    --log-group-name "/aws/lambda/evo-uds-v3-production-$func" \
    --start-time $(date -v-24H +%s000) \
    --filter-pattern "ERROR" \
    --region us-east-1 \
    --query 'events[*].message' \
    --output text 2>/dev/null | head -5
  echo ""
done
```

### 2. Verificar Handler Path Correto

```bash
# Verificar se handler path está correto
aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-save-aws-credentials \
  --region us-east-1 \
  --query 'Handler'

# Deve retornar: "save-aws-credentials.handler"
# NÃO: "handlers/aws/save-aws-credentials.handler"
```

### 3. Testar Invocação OPTIONS

```bash
# Testar se Lambda responde corretamente
aws lambda invoke \
  --function-name evo-uds-v3-production-save-aws-credentials \
  --cli-binary-format raw-in-base64-out \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}}}' \
  --region us-east-1 \
  /tmp/test.json

# Deve retornar StatusCode: 200
cat /tmp/test.json
# Deve conter: "statusCode":200
```

## Erros Comuns e Como Detectar

### Erro: "Cannot find module '../../lib/xxx.js'"

**Causa:** Deploy incorreto - handler sem dependências

**Como detectar:**
```bash
aws logs filter-log-events \
  --log-group-name "/aws/lambda/evo-uds-v3-production-LAMBDA_NAME" \
  --start-time $(date -v-1H +%s000) \
  --filter-pattern "Cannot find module" \
  --region us-east-1
```

**Solução:** Seguir processo de deploy correto em `architecture.md`

### Erro: "Runtime.ImportModuleError"

**Causa:** Handler path incorreto ou arquivo não encontrado

**Como detectar:**
```bash
aws logs filter-log-events \
  --log-group-name "/aws/lambda/evo-uds-v3-production-LAMBDA_NAME" \
  --start-time $(date -v-1H +%s000) \
  --filter-pattern "Runtime.ImportModuleError" \
  --region us-east-1
```

**Solução:** Verificar handler path e refazer deploy

### Erro: "PrismaClientInitializationError"

**Causa:** DATABASE_URL incorreta ou Prisma Client não gerado

**Como detectar:**
```bash
aws logs filter-log-events \
  --log-group-name "/aws/lambda/evo-uds-v3-production-LAMBDA_NAME" \
  --start-time $(date -v-1H +%s000) \
  --filter-pattern "PrismaClientInitializationError" \
  --region us-east-1
```

**Solução:** Verificar DATABASE_URL em `database-configuration.md`

## CloudWatch Alarms Recomendados

### Alarm 1: Lambda Errors > 5 em 5 minutos

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "save-aws-credentials-errors" \
  --alarm-description "Alert when save-aws-credentials has errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=evo-uds-v3-production-save-aws-credentials \
  --evaluation-periods 1 \
  --region us-east-1
```

### Alarm 2: Lambda Throttles > 0

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "save-aws-credentials-throttles" \
  --alarm-description "Alert when save-aws-credentials is throttled" \
  --metric-name Throttles \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=evo-uds-v3-production-save-aws-credentials \
  --evaluation-periods 1 \
  --region us-east-1
```

## Script de Health Check Automático

```bash
#!/bin/bash
# scripts/check-critical-lambdas-health.sh

CRITICAL_LAMBDAS=(
  "save-aws-credentials"
  "validate-aws-credentials"
  "save-azure-credentials"
  "validate-azure-credentials"
  "security-scan"
  "compliance-scan"
  "mfa-enroll"
  "mfa-verify-login"
)

echo "🔍 Checking critical Lambda health..."
echo ""

ERRORS_FOUND=0

for func in "${CRITICAL_LAMBDAS[@]}"; do
  FULL_NAME="evo-uds-v3-production-$func"
  
  # Check for errors in last hour
  ERROR_COUNT=$(aws logs filter-log-events \
    --log-group-name "/aws/lambda/$FULL_NAME" \
    --start-time $(date -v-1H +%s000) \
    --filter-pattern "ERROR" \
    --region us-east-1 \
    --query 'length(events)' \
    --output text 2>/dev/null)
  
  if [ "$ERROR_COUNT" -gt 0 ]; then
    echo "❌ $func: $ERROR_COUNT errors in last hour"
    ERRORS_FOUND=$((ERRORS_FOUND + 1))
    
    # Show last error
    aws logs filter-log-events \
      --log-group-name "/aws/lambda/$FULL_NAME" \
      --start-time $(date -v-1H +%s000) \
      --filter-pattern "ERROR" \
      --region us-east-1 \
      --query 'events[-1].message' \
      --output text 2>/dev/null | head -3
    echo ""
  else
    echo "✅ $func: No errors"
  fi
done

echo ""
if [ $ERRORS_FOUND -eq 0 ]; then
  echo "✅ All critical Lambdas are healthy"
  exit 0
else
  echo "❌ Found errors in $ERRORS_FOUND critical Lambda(s)"
  exit 1
fi
```

## Checklist Pós-Deploy

Após qualquer deploy de Lambda crítica:

- [ ] Verificar logs por erros: `aws logs filter-log-events --filter-pattern "ERROR"`
- [ ] Testar invocação OPTIONS: `aws lambda invoke`
- [ ] Verificar handler path: `aws lambda get-function-configuration`
- [ ] Verificar layer anexado: `aws lambda get-function-configuration --query 'Layers'`
- [ ] Testar funcionalidade no frontend (se aplicável)

## Quando Reportar Incidente

Reportar imediatamente se:

1. **Lambda crítica com erro 502/500** - Bloqueio total de funcionalidade
2. **Erro "Cannot find module"** - Deploy incorreto
3. **Erro "Runtime.ImportModuleError"** - Handler path incorreto
4. **Mais de 10 erros em 5 minutos** - Problema sistêmico
5. **Quick Connect falhando** - Bloqueio de onboarding

## Histórico de Incidentes

### 2026-01-15 - save-aws-credentials quebrado (Quick Connect down)

**Duração:** ~1 hora (16:26 - 17:22 UTC)  
**Impacto:** CRÍTICO - Quick Connect completamente indisponível  
**Causa:** Deploy incorreto sem lib/  
**Solução:** Redeploy correto seguindo processo documentado  
**Lição:** Adicionar health checks automáticos para Lambdas críticas

---

**Última atualização:** 2026-01-15  
**Versão:** 1.0  
**Mantido por:** DevOps Team
