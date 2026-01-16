# WAF Dashboard API - Otimização de Performance

## Problema Identificado

Erro 504 (Gateway Timeout) no endpoint `waf-dashboard-api` causado por:

1. **Queries COUNT(*) lentas** - Demorando 13-30 segundos
2. **Tabela waf_events muito grande** - Milhões de registros
3. **API Gateway timeout de 30s** - Menor que o timeout da Lambda (60s)

## Logs de Diagnóstico

```
Duration: 13859.41 ms - Query: SELECT COUNT(*) FROM waf_events WHERE organization_id = $1 AND action = $2
Duration: 13694.16 ms - Query: SELECT COUNT(*) FROM waf_attack_campaigns WHERE organization_id = $1 AND status = $2
Duration: 13824.31 ms - Query: SELECT COUNT(*) FROM waf_events (geo distribution)
Duration: 30925.61 ms - Query: AI Analysis com 10+ queries
```

## Soluções Implementadas

### 1. Índices Otimizados (SQL)

```sql
-- Índice parcial para eventos bloqueados (query mais comum)
CREATE INDEX CONCURRENTLY idx_waf_events_org_blocked 
ON waf_events(organization_id, timestamp DESC) 
WHERE action = 'BLOCK';

-- Índice parcial para eventos recentes (últimas 24h)
CREATE INDEX CONCURRENTLY idx_waf_events_org_recent 
ON waf_events(organization_id, timestamp DESC) 
WHERE timestamp >= NOW() - INTERVAL '24 hours';

-- Índice BRIN para timestamp (eficiente para dados temporais)
CREATE INDEX CONCURRENTLY idx_waf_events_timestamp_brin 
ON waf_events USING BRIN (timestamp);
```

### 2. Usar Aproximação para COUNT (Código)

Em vez de `COUNT(*)` exato, usar estimativa do PostgreSQL:

```typescript
// ANTES (lento - 13s)
const totalEvents = await prisma.wafEvent.count({
  where: { organization_id: organizationId, timestamp: { gte: since } }
});

// DEPOIS (rápido - <100ms)
const estimate = await prisma.$queryRaw<Array<{ estimate: number }>>`
  SELECT reltuples::bigint AS estimate
  FROM pg_class
  WHERE relname = 'waf_events'
`;
const totalEvents = estimate[0]?.estimate || 0;
```

### 3. Cache de Métricas (Recomendado)

Implementar cache Redis/ElastiCache para métricas:

```typescript
// Pseudo-código
const cacheKey = `waf:metrics:${organizationId}:24h`;
let metrics = await redis.get(cacheKey);

if (!metrics) {
  metrics = await calculateMetrics(organizationId);
  await redis.setex(cacheKey, 300, JSON.stringify(metrics)); // 5 min TTL
}

return success({ metrics });
```

### 4. Operações Assíncronas para AI Analysis

AI Analysis deve ser assíncrono (não bloquear o frontend):

```typescript
// Frontend chama: POST /waf-ai-analysis (retorna job_id imediatamente)
// Frontend polling: GET /waf-ai-analysis-status?job_id=xxx
// Lambda processa em background
```

## Próximos Passos

1. **Executar SQL de otimização** no RDS PostgreSQL
2. **Atualizar código** da Lambda para usar aproximações
3. **Implementar cache** Redis/ElastiCache
4. **Tornar AI Analysis assíncrono**
5. **Adicionar paginação** em todas as queries

## Comandos para Aplicar

```bash
# 1. Executar otimizações SQL
psql $DATABASE_URL -f backend/scripts/optimize-waf-queries.sql

# 2. Rebuild e redeploy Lambda
npm run build --prefix backend
# ... deploy process

# 3. Monitorar performance
aws logs tail /aws/lambda/evo-uds-v3-production-waf-dashboard-api --follow --region us-east-1
```

## Métricas Esperadas Após Otimização

- **Antes**: 13-30s por query
- **Depois**: <500ms por query
- **Redução**: 95%+ de melhoria

## Referências

- [PostgreSQL COUNT Performance](https://wiki.postgresql.org/wiki/Count_estimate)
- [BRIN Indexes](https://www.postgresql.org/docs/current/brin-intro.html)
- [Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
