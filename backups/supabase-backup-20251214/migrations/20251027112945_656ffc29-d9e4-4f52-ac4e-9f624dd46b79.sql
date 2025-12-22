-- EMERGÊNCIA: Corrigir dados órfãos atribuindo à primeira organização
-- AVISO: Este script atribui TODOS os dados sem organization_id à primeira organização
-- Isso é necessário porque as policies RLS agora exigem organization_id NOT NULL

DO $$ 
DECLARE
  first_org_id UUID;
BEGIN
  -- Pegar a primeira organização
  SELECT id INTO first_org_id 
  FROM organizations 
  WHERE is_active = true 
  ORDER BY created_at ASC 
  LIMIT 1;

  IF first_org_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma organização ativa encontrada';
  END IF;

  RAISE NOTICE 'Atribuindo dados órfãos à organização: %', first_org_id;

  -- Atualizar todas as tabelas com dados órfãos
  UPDATE aws_credentials 
  SET organization_id = first_org_id 
  WHERE organization_id IS NULL;

  UPDATE daily_costs 
  SET organization_id = first_org_id 
  WHERE organization_id IS NULL;

  UPDATE findings 
  SET organization_id = first_org_id 
  WHERE organization_id IS NULL;

  UPDATE cost_recommendations 
  SET organization_id = first_org_id 
  WHERE organization_id IS NULL;

  UPDATE budget_forecasts 
  SET organization_id = first_org_id 
  WHERE organization_id IS NULL;

  UPDATE security_scans 
  SET organization_id = first_org_id 
  WHERE organization_id IS NULL;

  UPDATE monitored_resources 
  SET organization_id = first_org_id 
  WHERE organization_id IS NULL;

  UPDATE resource_metrics 
  SET organization_id = first_org_id 
  WHERE organization_id IS NULL;

  UPDATE scheduled_jobs 
  SET organization_id = first_org_id 
  WHERE organization_id IS NULL;

  UPDATE aws_api_logs 
  SET organization_id = first_org_id 
  WHERE organization_id IS NULL;

  UPDATE ai_insights 
  SET organization_id = first_org_id 
  WHERE organization_id IS NULL;

  RAISE NOTICE 'Dados órfãos atualizados com sucesso';
END $$;