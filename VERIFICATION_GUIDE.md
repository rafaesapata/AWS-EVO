# 🔍 Guia de Verificação - WAF Monitoring

**Objetivo:** Verificar que todas as correções foram aplicadas corretamente

---

## ✅ Checklist de Verificação

### 1. Lambdas Funcionando (Sem Erro 502)

```bash
# Testar WAF Dashboard API
aws lambda invoke \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --cli-binary-format raw-in-base64-out \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}},"headers":{}}' \
  --region us-east-1 \
  /tmp/test-waf.json

# Verificar resposta
cat /tmp/test-waf.json | jq
# Esperado: {"statusCode":200, ...} (NÃO erro 502)
```

```bash
# Testar MFA
aws lambda invoke \
  --function-name evo-uds-v3-production-mfa-list-factors \
  --cli-binary-format raw-in-base64-out \
  --payload '{"requestContext":{"http":{"method":"OPTIONS"}},"headers":{}}' \
  --region us-east-1 \
  /tmp/test-mfa.json

# Verificar resposta
cat /tmp/test-mfa.json | jq
# Esperado: {"statusCode":200, ...} (NÃO erro 502)
```

**Resultado Esperado:** ✅ statusCode 200 em ambos

---

### 2. Handlers Corretos

```bash
# Verificar handlers de todas as Lambdas WAF
for func in waf-dashboard-api waf-setup-monitoring waf-log-processor; do
  echo "=== $func ==="
  aws lambda get-function-configuration \
    --function-name "evo-uds-v3-production-$func" \
    --query 'Handler' \
    --output text \
    --region us-east-1
done
```

**Resultado Esperado:**
```
=== waf-dashboard-api ===
waf-dashboard-api.handler

=== waf-setup-monitoring ===
waf-setup-monitoring.handler

=== waf-log-processor ===
waf-log-processor.handler
```

---

### 3. Código Atualizado (Tamanho Correto)

```bash
# Verificar tamanho do código (deve incluir lib/ e types/)
aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --query '[FunctionName,CodeSize,LastModified]' \
  --output table \
  --region us-east-1
```

**Resultado Esperado:**
- CodeSize: ~780-800 KB (antes era ~69 MB ou muito pequeno)
- LastModified: Data recente (2026-01-08)

---

### 4. CloudFormation Stack (Destination)

```bash
# Verificar se o stack tem o Destination
aws cloudformation describe-stack-resources \
  --stack-name evo-uds-v3-production-waf-monitoring \
  --query 'StackResources[?ResourceType==`AWS::Logs::Destination`]' \
  --output table \
  --region us-east-1
```

**Resultado Esperado:**
```
ResourceType: AWS::Logs::Destination
LogicalResourceId: WafLogsDestination
PhysicalResourceId: arn:aws:logs:us-east-1:383234048592:destination:evo-uds-v3-production-waf-logs-destination
```

**Nota:** Se o stack ainda não foi deployado, o Destination não existirá. Isso é OK - será criado no próximo deploy.

---

### 5. Permissões IAM (Cliente)

```bash
# Verificar se o template do cliente tem as novas permissões
grep -A 5 "iam:CreateRole" cloudformation/customer-iam-role-waf.yaml
```

**Resultado Esperado:**
```yaml
- iam:CreateRole
- iam:GetRole
- iam:PutRolePolicy
- iam:TagRole
```

```bash
# Verificar PassRole com condição
grep -A 3 "iam:PassRole" cloudformation/customer-iam-role-waf.yaml
```

**Resultado Esperado:**
```yaml
- iam:PassRole
Resource:
  - !Sub 'arn:aws:iam::${AWS::AccountId}:role/EVO-CloudWatch-Logs-Role*'
Condition:
  StringEquals:
    iam:PassedToService: logs.amazonaws.com
```

---

### 6. Código Backend (Função Auto-Create)

```bash
# Verificar se a função getOrCreateCloudWatchLogsRole existe
grep -n "async function getOrCreateCloudWatchLogsRole" \
  backend/src/handlers/security/waf-setup-monitoring.ts
```

**Resultado Esperado:**
```
120:async function getOrCreateCloudWatchLogsRole(
```

```bash
# Verificar se o nome do destination está correto
grep "EVO_WAF_DESTINATION_NAME" \
  backend/src/handlers/security/waf-setup-monitoring.ts
```

**Resultado Esperado:**
```typescript
const EVO_WAF_DESTINATION_NAME = 'evo-uds-v3-production-waf-logs-destination';
```

---

### 7. Logs das Lambdas (Sem Erros)

```bash
# Ver logs recentes do WAF Dashboard API
aws logs tail /aws/lambda/evo-uds-v3-production-waf-dashboard-api \
  --since 10m \
  --format short \
  --region us-east-1 \
  | grep -E "ERROR|Cannot find module"
```

**Resultado Esperado:** Nenhuma linha (sem erros de módulo não encontrado)

```bash
# Ver logs recentes do WAF Setup Monitoring
aws logs tail /aws/lambda/evo-uds-v3-production-waf-setup-monitoring \
  --since 10m \
  --format short \
  --region us-east-1 \
  | grep -E "ERROR|Cannot find module"
```

**Resultado Esperado:** Nenhuma linha (sem erros de módulo não encontrado)

---

## 🌐 Verificação no Browser

### 1. Página WAF Monitoring

1. Abra o browser e vá para: `https://evo.ai.udstec.io`
2. Faça login
3. Navegue para **Security** → **WAF Monitoring**

**Resultado Esperado:**
- ✅ Página carrega sem erros 502
- ✅ Não há erros no console do browser
- ✅ Componentes carregam corretamente

### 2. Console do Browser

Abra o DevTools (F12) e verifique a aba **Console**:

**Resultado Esperado:**
- ❌ Nenhum erro `Failed to load resource: the server responded with a status of 502`
- ✅ Requisições retornam 200 ou erros esperados (401, 403)

### 3. Network Tab

Na aba **Network** do DevTools, filtre por `waf`:

**Resultado Esperado:**
- Requisições para `waf-dashboard-api` retornam status 200 ou 401 (não 502)
- Requisições para `mfa-check` retornam status 200 ou 401 (não 502)

---

## 🧪 Teste End-to-End (Opcional)

Se você tiver acesso a uma conta AWS de teste:

### 1. Setup WAF Monitoring

```bash
# Via API (substitua $TOKEN pelo seu token JWT)
curl -X POST https://api-evo.ai.udstec.io/api/functions/waf-setup-monitoring \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "YOUR_AWS_CREDENTIAL_ID",
    "webAclArn": "arn:aws:wafv2:us-east-1:ACCOUNT:regional/webacl/test/ID",
    "enabled": true,
    "filterMode": "block_only"
  }'
```

**Resultado Esperado:**
```json
{
  "success": true,
  "logGroupName": "aws-waf-logs-test",
  "subscriptionFilterName": "evo-waf-monitoring",
  "filterMode": "block_only",
  "message": "WAF monitoring enabled successfully"
}
```

### 2. Verificar Role Criado

```bash
# Na conta do cliente, verificar se o role foi criado
aws iam get-role \
  --role-name EVO-CloudWatch-Logs-Role \
  --query 'Role.[RoleName,Arn,Tags]' \
  --output table
```

**Resultado Esperado:**
```
RoleName: EVO-CloudWatch-Logs-Role
Arn: arn:aws:iam::CUSTOMER_ACCOUNT:role/EVO-CloudWatch-Logs-Role
Tags:
  - Key: ManagedBy
    Value: EVO-Platform
  - Key: Purpose
    Value: WAF-Monitoring
```

### 3. Verificar Subscription Filter

```bash
# Na conta do cliente
aws logs describe-subscription-filters \
  --log-group-name aws-waf-logs-test \
  --region us-east-1
```

**Resultado Esperado:**
```json
{
  "subscriptionFilters": [{
    "filterName": "evo-waf-monitoring",
    "logGroupName": "aws-waf-logs-test",
    "filterPattern": "{ $.action = \"BLOCK\" || $.action = \"COUNT\" }",
    "destinationArn": "arn:aws:logs:us-east-1:383234048592:destination:evo-uds-v3-production-waf-logs-destination",
    "roleArn": "arn:aws:iam::CUSTOMER_ACCOUNT:role/EVO-CloudWatch-Logs-Role"
  }]
}
```

---

## ❌ Troubleshooting

### Problema: Ainda vejo erro 502

**Solução:**
```bash
# 1. Verificar se o deploy foi bem-sucedido
aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --query 'LastModified' \
  --output text

# 2. Verificar logs
aws logs tail /aws/lambda/evo-uds-v3-production-waf-dashboard-api \
  --since 5m --format short

# 3. Redeploy se necessário
./scripts/fix-lambda-imports-v2.sh
```

### Problema: Handler incorreto

**Solução:**
```bash
# Corrigir handler
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-waf-dashboard-api \
  --handler waf-dashboard-api.handler \
  --region us-east-1
```

### Problema: Código muito pequeno (< 100 KB)

**Solução:**
```bash
# Redeploy com lib/ e types/
./scripts/fix-lambda-imports-v2.sh
```

### Problema: CloudFormation stack não tem Destination

**Solução:**
```bash
# Deploy do stack atualizado
aws cloudformation update-stack \
  --stack-name evo-uds-v3-production-waf-monitoring \
  --template-body file://cloudformation/waf-monitoring-stack.yaml \
  --parameters file://cloudformation/waf-monitoring-params.json \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

---

## ✅ Checklist Final

Marque cada item após verificar:

- [ ] Lambdas retornam statusCode 200 (não 502)
- [ ] Handlers estão corretos (sem `handlers/security/` prefix)
- [ ] Código tem tamanho adequado (~780-800 KB)
- [ ] Função `getOrCreateCloudWatchLogsRole` existe no código
- [ ] Nome do destination está correto no código
- [ ] Permissões IAM expandidas no template do cliente
- [ ] Página WAF Monitoring carrega sem erros
- [ ] Console do browser sem erros 502
- [ ] Logs das Lambdas sem erros de módulo

---

## 📞 Suporte

Se alguma verificação falhar:

1. Consulte `WAF_PRIORITY_1_COMPLETE.md` para detalhes técnicos
2. Consulte `IMPLEMENTATION_COMPLETE_SUMMARY.md` para visão geral
3. Execute os comandos de troubleshooting acima
4. Verifique os logs das Lambdas para erros específicos

---

**Última atualização:** 2026-01-08 16:20 UTC  
**Status:** ✅ Todas as correções de Prioridade 1 implementadas
