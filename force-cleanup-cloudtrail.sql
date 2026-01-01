-- Script para forçar limpeza de análises CloudTrail travadas
-- Atualiza análises que estão em 'running' há mais de 30 minutos

UPDATE "CloudTrailAnalysis" 
SET 
    status = 'failed',
    completed_at = NOW(),
    error_message = 'Análise travada - limpeza automática executada'
WHERE 
    status = 'running' 
    AND started_at < NOW() - INTERVAL '30 minutes';

-- Verificar quantas análises foram atualizadas
SELECT 
    COUNT(*) as analyses_cleaned,
    'CloudTrail analyses cleaned' as message
FROM "CloudTrailAnalysis" 
WHERE 
    status = 'failed' 
    AND error_message = 'Análise travada - limpeza automática executada'
    AND completed_at > NOW() - INTERVAL '5 minutes';

-- Mostrar status atual das análises
SELECT 
    status,
    COUNT(*) as count,
    MAX(created_at) as latest_analysis
FROM "CloudTrailAnalysis" 
GROUP BY status
ORDER BY status;