-- Verificar análises CloudTrail recentes
SELECT 
    id,
    status,
    aws_account_id,
    organization_id,
    hours_back,
    events_processed,
    started_at,
    completed_at,
    created_at,
    EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)) as duration_seconds
FROM "CloudTrailAnalysis" 
ORDER BY created_at DESC 
LIMIT 10;

-- Verificar análises em execução
SELECT 
    id,
    aws_account_id,
    started_at,
    EXTRACT(EPOCH FROM (NOW() - started_at)) as running_seconds
FROM "CloudTrailAnalysis" 
WHERE status = 'running';

-- Verificar análises com falha
SELECT 
    id,
    aws_account_id,
    started_at,
    results
FROM "CloudTrailAnalysis" 
WHERE status = 'failed'
ORDER BY created_at DESC 
LIMIT 5;

-- Verificar contas AWS ativas
SELECT 
    id,
    account_id,
    account_name,
    organization_id,
    is_active
FROM "AwsCredential" 
WHERE is_active = true;