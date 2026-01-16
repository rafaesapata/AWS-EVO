-- Otimização de queries WAF para resolver timeout 504
-- Problema: COUNT(*) em waf_events demora 13+ segundos

-- 1. Criar índice parcial para eventos bloqueados (mais comum)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waf_events_org_blocked 
ON waf_events(organization_id, timestamp DESC) 
WHERE action = 'BLOCK';

-- 2. Criar índice parcial para eventos das últimas 24h (mais comum)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waf_events_org_recent 
ON waf_events(organization_id, timestamp DESC) 
WHERE timestamp >= NOW() - INTERVAL '24 hours';

-- 3. Criar índice BRIN para timestamp (eficiente para dados temporais grandes)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waf_events_timestamp_brin 
ON waf_events USING BRIN (timestamp);

-- 4. Atualizar estatísticas da tabela
ANALYZE waf_events;

-- 5. Verificar tamanho da tabela
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE tablename = 'waf_events';

-- 6. Verificar índices existentes
SELECT 
  indexname,
  indexdef,
  pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size
FROM pg_indexes
WHERE tablename = 'waf_events'
ORDER BY indexname;
