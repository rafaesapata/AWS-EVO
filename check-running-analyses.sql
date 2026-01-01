-- Verificar análises CloudTrail em execução
SELECT 
    id,
    status,
    aws_account_id,
    started_at,
    EXTRACT(EPOCH FROM (NOW() - started_at))/60 as running_minutes
FROM "CloudTrailAnalysis" 
WHERE status = 'running'
ORDER BY started_at DESC;

-- Verificar scans de segurança em execução  
SELECT 
    id,
    scan_type,
    status,
    aws_account_id,
    started_at,
    EXTRACT(EPOCH FROM (NOW() - started_at))/60 as running_minutes
FROM "SecurityScan" 
WHERE status = 'running'
ORDER BY started_at DESC;