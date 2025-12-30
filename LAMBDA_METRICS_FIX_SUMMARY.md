# Correção dos Dados das Lambdas no Monitoramento de Recursos

## Problemas Identificados e Corrigidos

### 1. **Coleta de Métricas das Lambdas Melhorada**
- **Problema**: Métricas das Lambdas não eram coletadas corretamente devido a estatísticas inadequadas
- **Solução**: Implementado lógica específica para cada tipo de métrica Lambda:
  - `Invocations`, `Errors`, `Throttles`: Usar `Sum` (contadores)
  - `Duration`: Usar `Average` (tempo médio)
  - `ConcurrentExecutions`: Usar `Maximum` (pico de execuções)

### 2. **Logging Detalhado Adicionado**
- **Problema**: Falhas silenciosas na coleta de métricas
- **Solução**: Adicionado logging detalhado para:
  - Descoberta de recursos Lambda
  - Coleta de métricas individuais
  - Erros específicos por recurso/métrica

### 3. **Descoberta de Lambdas Robusta**
- **Problema**: Descoberta de funções Lambda sem tratamento de erros
- **Solução**: 
  - Validação de dados essenciais (FunctionName)
  - Captura do estado da função (`Active`, etc.)
  - Metadados adicionais (ARN, timeout, última modificação)

### 4. **Frontend com Filtro por Tipo de Recurso**
- **Problema**: Query genérica retornava limite de 2000 métricas, podendo excluir Lambdas
- **Solução**: Implementado filtro opcional por `resource_type` no cache de métricas

### 5. **Formatação Específica para Métricas Lambda**
- **Problema**: Métricas Lambda não eram formatadas adequadamente
- **Solução**: 
  - Priorização de `Invocations` sobre `Duration` como métrica primária
  - Formatação específica para contadores vs. tempo
  - Unidades corretas (ms para Duration, contadores para Invocations)

### 6. **Handler de Teste Criado**
- **Arquivo**: `backend/src/handlers/monitoring/test-lambda-metrics.ts`
- **Propósito**: Testar especificamente a coleta de métricas das Lambdas
- **Funcionalidades**:
  - Lista funções Lambda na região
  - Verifica métricas disponíveis no CloudWatch
  - Testa coleta de dados das 5 métricas principais
  - Compara com dados salvos no banco

## Arquivos Modificados

### Backend
1. `backend/src/handlers/monitoring/fetch-cloudwatch-metrics.ts`
   - Melhorada função `fetchMetric()` com estatísticas específicas
   - Melhorada função `discoverLambda()` com validação
   - Adicionado logging detalhado no processamento de batches

2. `backend/src/handlers/monitoring/test-lambda-metrics.ts` (NOVO)
   - Handler para debug e teste específico das Lambdas

### Frontend
3. `src/hooks/useMetricsCache.ts`
   - Adicionado parâmetro `resourceType` para filtrar métricas
   - Logging de debug para cache hits/misses

4. `src/components/dashboard/ResourceMonitoringDashboard.tsx`
   - Melhorada função `getPrimaryMetric()` para priorizar `Invocations`
   - Melhorada função `formatMetricValue()` com formatação específica
   - Correção na exibição de unidades (evitar "None")

## Como Testar

### 1. Teste Básico no Frontend
1. Acesse `/resource-monitoring`
2. Selecione uma conta AWS
3. Clique em "Atualizar" para coletar métricas
4. Filtre por "Lambda Functions" no dropdown
5. Verifique se as Lambdas aparecem com métricas

### 2. Teste com Handler de Debug
```bash
# Via API Gateway (se configurado)
curl -X POST https://api-evo.ai.udstec.io/api/functions/test-lambda-metrics \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"accountId": "YOUR_ACCOUNT_ID", "region": "us-east-1"}'
```

### 3. Verificação no Banco de Dados
```sql
-- Verificar recursos Lambda descobertos
SELECT resource_name, resource_type, status, region, metadata 
FROM monitored_resources 
WHERE resource_type = 'lambda' 
ORDER BY updated_at DESC;

-- Verificar métricas das Lambdas
SELECT resource_name, metric_name, metric_value, metric_unit, timestamp
FROM resource_metrics 
WHERE resource_type = 'lambda' 
ORDER BY timestamp DESC 
LIMIT 20;
```

### 4. Logs para Debug
- Verifique os logs do CloudWatch da Lambda `fetch-cloudwatch-metrics`
- Procure por mensagens como:
  - `"Discovered X Lambda functions in region"`
  - `"Found X datapoints for lambda:function-name:metric"`
  - `"No datapoints found for lambda:function-name:metric"`

## Possíveis Causas se Ainda Não Funcionar

### 1. **Permissões AWS**
Verifique se a role da Lambda tem:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:ListFunctions",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics"
      ],
      "Resource": "*"
    }
  ]
}
```

### 2. **Funções Lambda Inativas**
- Lambdas que nunca foram executadas não têm métricas no CloudWatch
- Execute algumas funções manualmente para gerar dados

### 3. **Delay do CloudWatch**
- Métricas podem levar 5-15 minutos para aparecer no CloudWatch
- Teste com funções que foram executadas há pelo menos 30 minutos

### 4. **Região Incorreta**
- Verifique se as credenciais AWS estão configuradas para a região correta
- Lambdas são recursos regionais

## Próximos Passos

1. **Teste em produção** com conta AWS real
2. **Monitore logs** para identificar problemas específicos
3. **Ajuste períodos** se necessário (3h pode ser muito recente para algumas métricas)
4. **Considere alertas** para Lambdas com muitos erros ou throttling

## Métricas Lambda Monitoradas

| Métrica | Descrição | Estatística | Unidade |
|---------|-----------|-------------|---------|
| `Invocations` | Número de execuções | Sum | Count |
| `Duration` | Tempo de execução | Average | Milliseconds |
| `Errors` | Número de erros | Sum | Count |
| `Throttles` | Execuções limitadas | Sum | Count |
| `ConcurrentExecutions` | Execuções simultâneas | Maximum | Count |

Essas correções devem resolver o problema dos dados das Lambdas não sendo populados no monitoramento de recursos.