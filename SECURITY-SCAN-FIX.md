# Security Scan Lambda - Handler Path Fix

## Problema Identificado

A Lambda `evo-uds-v3-sandbox-security-scan` está com o handler path **incorreto**:

- **Atual (ERRADO):** `handlers/security/security-scan.handler`
- **Correto:** `security-scan.handler`

## Evidência

```bash
AWS_PROFILE=EVO_SANDBOX aws lambda get-function-configuration \
  --function-name evo-uds-v3-sandbox-security-scan \
  --region us-east-1 \
  --query 'Handler'
  
# Output: "handlers/security/security-scan.handler"
```

## Causa

O handler path incorreto impede que a Lambda seja invocada corretamente. O esbuild compila o código para a raiz do ZIP, então o handler deve ser apenas `security-scan.handler`.

## Sintomas

- Log group não existe: `/aws/lambda/evo-uds-v3-sandbox-security-scan`
- Lambda nunca foi invocada com sucesso
- Security scan não funciona no frontend

## Solução

### Opção 1: Redeploy via CI/CD (RECOMENDADO)

1. Fazer um commit trivial para forçar redeploy:
```bash
git commit --allow-empty -m "fix: trigger redeploy to fix security-scan handler path"
git push origin main
```

2. Aguardar CI/CD completar o deploy

3. Verificar handler path:
```bash
AWS_PROFILE=EVO_SANDBOX aws lambda get-function-configuration \
  --function-name evo-uds-v3-sandbox-security-scan \
  --region us-east-1 \
  --query 'Handler'
```

### Opção 2: Fix Manual (EMERGÊNCIA APENAS)

**⚠️ Usar apenas em emergência - viola regras de deployment**

```bash
AWS_PROFILE=EVO_SANDBOX aws lambda update-function-configuration \
  --function-name evo-uds-v3-sandbox-security-scan \
  --handler security-scan.handler \
  --region us-east-1
```

## Verificação

Após o fix, testar a Lambda:

```bash
# 1. Verificar handler
AWS_PROFILE=EVO_SANDBOX aws lambda get-function-configuration \
  --function-name evo-uds-v3-sandbox-security-scan \
  --region us-east-1 \
  --query 'Handler'

# 2. Invocar Lambda (OPTIONS)
echo '{"requestContext":{"http":{"method":"OPTIONS"}}}' > /tmp/payload.json
AWS_PROFILE=EVO_SANDBOX aws lambda invoke \
  --function-name evo-uds-v3-sandbox-security-scan \
  --payload file:///tmp/payload.json \
  --region us-east-1 \
  /tmp/response.json && cat /tmp/response.json

# 3. Verificar logs
AWS_PROFILE=EVO_SANDBOX aws logs tail \
  "/aws/lambda/evo-uds-v3-sandbox-security-scan" \
  --since 5m \
  --region us-east-1
```

## Template SAM (Correto)

O template `sam/template.yaml` já está correto:

```yaml
SecurityScanFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: security-scan.handler  # ✅ CORRETO
    CodeUri: ../backend/src/handlers/security/
```

## Próximos Passos

1. ✅ Documentar problema
2. ✅ Fazer commit para trigger CI/CD (commit 1a742f9)
3. ⏳ Aguardar deploy (em progresso - Build stage)
4. ⏳ Verificar fix
5. ⏳ Testar security scan no frontend

## Monitorar Deploy

```bash
# Verificar status do pipeline
AWS_PROFILE=EVO_PRODUCTION aws codepipeline get-pipeline-state \
  --name evo-sam-pipeline-production \
  --region us-east-1 \
  --no-cli-pager | jq -r '.stageStates[] | "\(.stageName): \(.latestExecution.status)"'

# Ou usar o script de monitoramento
./scripts/monitor-pipeline.sh evo-sam-pipeline-production
```

## Após Deploy Completar

```bash
# 1. Verificar handler path corrigido
AWS_PROFILE=EVO_PRODUCTION aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-security-scan \
  --region us-east-1 \
  --query 'Handler' \
  --output text

# Esperado: "security-scan.handler"

# 2. Testar invocação
echo '{"requestContext":{"http":{"method":"OPTIONS"}}}' > /tmp/payload.json
AWS_PROFILE=EVO_PRODUCTION aws lambda invoke \
  --function-name evo-uds-v3-production-security-scan \
  --payload file:///tmp/payload.json \
  --region us-east-1 \
  /tmp/response.json && cat /tmp/response.json

# 3. Verificar logs
AWS_PROFILE=EVO_PRODUCTION aws logs tail \
  "/aws/lambda/evo-uds-v3-production-security-scan" \
  --since 5m \
  --region us-east-1 \
  --follow
```

---

**Data:** 2026-02-05
**Status:** Deploy em Progresso (Build stage)
**Commit:** 1a742f9
**Pipeline:** evo-sam-pipeline-production
