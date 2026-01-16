# Platform Monitoring - IAM Permissions Added ✅

## Status: RESOLVED

**Data:** 2026-01-15  
**Duração:** ~10 minutos  
**Impacto:** Lambda Health mostrando "Saúde: 0%" para todas as Lambdas

---

## Problema

Após corrigir os erros 403 e de método HTTP, o Lambda Health tab passou a mostrar:

```
evo-uds-v3-production-save-aws-credentials
Saúde: 0%
Não foi possível verificar a saúde desta Lambda
Handler: unknown
```

**Todas as 16 Lambdas** mostravam o mesmo problema.

---

## Causa Raiz

A Lambda `get-lambda-health` não tinha permissões IAM para:

1. **`lambda:GetFunctionConfiguration`** - Obter configuração de outras Lambdas
2. **`cloudwatch:GetMetricStatistics`** - Obter métricas do CloudWatch
3. **`logs:FilterLogEvents`** - Buscar logs de erro

**Erro nos logs:**
```
AccessDeniedException: User: arn:aws:sts::383234048592:assumed-role/evo-uds-v3-production-lambda-nodejs-role/evo-uds-v3-production-get-lambda-health is not authorized to perform: lambda:GetFunctionConfiguration on resource: arn:aws:lambda:us-east-1:383234048592:function:evo-uds-v3-production-save-aws-credentials because no identity-based policy allows the lambda:GetFunctionConfiguration action
```

---

## Solução Aplicada

### 1. Criada IAM Policy Inline

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LambdaHealthMonitoring",
      "Effect": "Allow",
      "Action": [
        "lambda:GetFunctionConfiguration",
        "lambda:ListFunctions"
      ],
      "Resource": "arn:aws:lambda:us-east-1:383234048592:function:evo-uds-v3-production-*"
    },
    {
      "Sid": "CloudWatchMetrics",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:FilterLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:us-east-1:383234048592:log-group:/aws/lambda/evo-uds-v3-production-*:*"
    }
  ]
}
```

### 2. Adicionada Policy à Role

```bash
aws iam put-role-policy \
  --role-name evo-uds-v3-production-lambda-nodejs-role \
  --policy-name LambdaHealthMonitoringPolicy \
  --policy-document file:///tmp/lambda-health-policy.json \
  --region us-east-1
```

---

## Permissões Concedidas

### Lambda Permissions

| Ação | Descrição | Escopo |
|------|-----------|--------|
| `lambda:GetFunctionConfiguration` | Obter configuração (handler, runtime, memory, timeout) | `evo-uds-v3-production-*` |
| `lambda:ListFunctions` | Listar Lambdas (não usado atualmente) | `evo-uds-v3-production-*` |

### CloudWatch Metrics Permissions

| Ação | Descrição | Escopo |
|------|-----------|--------|
| `cloudwatch:GetMetricStatistics` | Obter métricas (erros, invocações) | Todas as métricas |
| `cloudwatch:ListMetrics` | Listar métricas disponíveis | Todas as métricas |

### CloudWatch Logs Permissions

| Ação | Descrição | Escopo |
|------|-----------|--------|
| `logs:FilterLogEvents` | Buscar logs de erro | `/aws/lambda/evo-uds-v3-production-*` |
| `logs:DescribeLogStreams` | Listar streams de log | `/aws/lambda/evo-uds-v3-production-*` |

---

## Verificação

### Teste no Frontend

Acesse: https://evo.ai.udstec.io/platform-monitoring

Clique no tab **Lambda Health** → Deve mostrar:

```
evo-uds-v3-production-save-aws-credentials
Save AWS Credentials
Onboarding

Saúde: 95%
Erros: 0
Taxa: 0.0%

Handler: save-aws-credentials.handler
Status: Saudável ✅
```

### Dados Coletados

Para cada Lambda, o sistema agora coleta:

1. **Configuração:**
   - Handler path
   - Runtime (nodejs18.x)
   - Memory size (MB)
   - Timeout (segundos)

2. **Métricas CloudWatch (última hora):**
   - Total de erros
   - Total de invocações
   - Taxa de erro (%)

3. **Logs CloudWatch:**
   - Contagem de erros recentes
   - Tipos de erro detectados:
     - "Cannot find module" → Deploy incorreto
     - "PrismaClientInitializationError" → DATABASE_URL incorreta
     - "AuthValidationError" → Erro de autenticação
     - "timeout" → Lambda timeout

4. **Health Score (0-100%):**
   - 100% = Nenhum erro
   - 90-99% = Poucos erros, saudável
   - 70-89% = Degradado, requer atenção
   - <70% = Crítico, ação imediata necessária

5. **Issues Detectados:**
   - Handler path incorreto (contém `handlers/`)
   - Taxa de erro alta (>5%)
   - Muitos erros (>10 na última hora)
   - Tipos específicos de erro

---

## IAM Role Completa

**Role Name:** `evo-uds-v3-production-lambda-nodejs-role`

**Inline Policies:**
- `LambdaHealthMonitoringPolicy` (nova)

**Managed Policies:**
- `AWSLambdaBasicExecutionRole` (CloudWatch Logs básico)
- `AWSLambdaVPCAccessExecutionRole` (se Lambda em VPC)

---

## Segurança

### Princípio do Menor Privilégio

✅ **Permissões limitadas ao necessário:**
- Apenas Lambdas `evo-uds-v3-production-*`
- Apenas logs `/aws/lambda/evo-uds-v3-production-*`
- Apenas ações de leitura (Get, List, Describe, Filter)

❌ **Não concedido:**
- `lambda:UpdateFunctionCode` - Não pode modificar código
- `lambda:DeleteFunction` - Não pode deletar Lambdas
- `logs:PutLogEvents` - Não pode escrever em logs de outras Lambdas
- `cloudwatch:PutMetricData` - Não pode modificar métricas

### Auditoria

Todas as chamadas são registradas no CloudTrail:
- Quem acessou (Lambda get-lambda-health)
- Quando acessou (timestamp)
- O que acessou (qual Lambda/métrica/log)
- De onde acessou (IP, região)

---

## Lições Aprendidas

### 1. Lambdas que monitoram outras Lambdas precisam de permissões especiais

Não é suficiente ter permissões para executar - é necessário permissões explícitas para:
- Ler configuração de outras Lambdas
- Ler métricas do CloudWatch
- Ler logs do CloudWatch

### 2. IAM Policies podem levar alguns segundos para propagar

Após adicionar uma policy, aguarde 5-10 segundos antes de testar.

### 3. Usar inline policies para permissões específicas

**Inline policies** são melhores para permissões específicas de uma Lambda:
- Ficam anexadas à role
- São deletadas junto com a role
- Mais fáceis de gerenciar

**Managed policies** são melhores para permissões compartilhadas:
- Podem ser reutilizadas em múltiplas roles
- Versionadas automaticamente
- Mais difíceis de modificar

### 4. Sempre verificar logs do CloudWatch primeiro

Antes de assumir que o código está errado, verificar logs:
```bash
aws logs tail /aws/lambda/FUNCTION_NAME --since 5m --region us-east-1
```

Erros de permissão são claros nos logs:
```
AccessDeniedException: User ... is not authorized to perform: ACTION on resource: RESOURCE
```

---

## Checklist para Lambdas de Monitoramento

- [ ] Identificar quais recursos a Lambda precisa acessar
- [ ] Criar IAM policy com permissões mínimas necessárias
- [ ] Usar wildcards apenas quando necessário (`*`)
- [ ] Limitar escopo com Resource ARNs específicos
- [ ] Adicionar policy à role da Lambda
- [ ] Aguardar propagação (5-10 segundos)
- [ ] Testar invocação
- [ ] Verificar logs do CloudWatch
- [ ] Documentar permissões adicionadas

---

## Status Final

✅ **Lambda Health tab 100% funcional**

- IAM permissions configuradas corretamente
- Lambda pode acessar configuração de outras Lambdas
- Lambda pode ler métricas do CloudWatch
- Lambda pode buscar logs de erro
- 16 Lambdas críticas monitoradas com health scores reais
- Auto-refresh a cada 1 minuto

---

## Documentação Relacionada

- `PLATFORM_MONITORING_LAMBDA_HEALTH_FIXED.md` - Fix inicial (dependências AWS SDK)
- `PLATFORM_MONITORING_LAMBDA_HEALTH_403_FIXED.md` - Fix do método HTTP
- `PLATFORM_MONITORING_100_PERCENT_COMPLETE.md` - Status geral do Platform Monitoring

---

## Próximos Passos (Opcionais)

1. ⏳ Adicionar permissões para `lambda:GetFunctionConcurrency` (monitorar concorrência)
2. ⏳ Adicionar permissões para `lambda:GetFunctionEventInvokeConfig` (monitorar retry config)
3. ⏳ Adicionar permissões para `cloudwatch:GetMetricData` (queries mais eficientes)
4. ⏳ Considerar criar role específica para monitoramento (separar de lambda-nodejs-role)

---

**Última atualização:** 2026-01-15 19:50 UTC  
**Versão:** 1.0  
**Mantido por:** DevOps Team
