-- Primeiro: Limpar dados duplicados mantendo apenas o mais recente por combinação única
DELETE FROM resource_metrics 
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY aws_account_id, resource_id, metric_name, timestamp 
      ORDER BY created_at DESC
    ) as row_num
    FROM resource_metrics
  ) t 
  WHERE row_num > 1
);

-- Segundo: Limpar dados muito antigos (manter apenas últimos 7 dias)
DELETE FROM resource_metrics 
WHERE timestamp < NOW() - INTERVAL '7 days';

-- Terceiro: Criar índice único para evitar futuras duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_metrics_unique 
ON resource_metrics (aws_account_id, resource_id, metric_name, timestamp);