// Observability Security Validator - CloudTrail, GuardDuty, Config, Security Hub
import { signAWSGetRequest } from '../aws-credentials-helper.ts';

export interface ObservabilityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  analysis: string;
  resource_id: string;
  resource_arn?: string;
  scan_type: string;
  service: string;
  evidence: any;
}

interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

// Analyze CloudTrail Configuration
export async function analyzeCloudTrail(credentials: AWSCredentials, region: string): Promise<ObservabilityFinding[]> {
  const findings: ObservabilityFinding[] = [];
  
  try {
    const trails = await describeTrails(credentials, region);
    
    if (trails.length === 0) {
      findings.push({
        severity: 'critical',
        title: `CloudTrail Completamente Desabilitado`,
        description: `Nenhum trail CloudTrail configurado na região ${region}`,
        analysis: `RISCO CRÍTICO: CloudTrail desabilitado significa ZERO visibilidade sobre ações na conta AWS. Impossível detectar: acessos não autorizados, alterações de configuração, criação de usuários maliciosos, exfiltração de dados, e atividades de atacantes. Sem CloudTrail, investigação forense pós-incidente é impossível. Mitigação: (1) URGENTE: Criar trail multi-region, (2) Habilitar management events e data events, (3) Enviar logs para S3 criptografado, (4) Integrar com CloudWatch Logs, (5) Configurar alertas para eventos suspeitos.`,
        resource_id: 'cloudtrail',
        scan_type: 'cloudtrail_disabled',
        service: 'CloudTrail',
        evidence: { trailCount: 0, region }
      });
      return findings;
    }
    
    for (const trail of trails) {
      const trailName = trail.Name || 'unknown-trail';
      const trailArn = trail.TrailARN;
      
      // Check if multi-region
      if (!trail.IsMultiRegionTrail) {
        findings.push({
          severity: 'high',
          title: `CloudTrail Não é Multi-Region`,
          description: `Trail ${trailName} captura apenas eventos de uma região`,
          analysis: `RISCO ALTO: O trail ${trailName} não é multi-region, capturando apenas eventos da região ${region}. Atividades em outras regiões passam despercebidas. Atacantes frequentemente operam em regiões não monitoradas. Mitigação: Converter para trail multi-region (IsMultiRegionTrail=true).`,
          resource_id: trailName,
          resource_arn: trailArn,
          scan_type: 'cloudtrail_not_multiregion',
          service: 'CloudTrail',
          evidence: { trailArn, isMultiRegion: false, region }
        });
      }
      
      // Check log file validation
      if (!trail.LogFileValidationEnabled) {
        findings.push({
          severity: 'high',
          title: `CloudTrail Sem Validação de Integridade`,
          description: `Trail ${trailName} permite adulteração de logs`,
          analysis: `RISCO ALTO: O trail ${trailName} não tem Log File Validation habilitado. Atacantes podem modificar ou deletar logs sem detecção, cobrindo seus rastros. Mitigação: Habilitar LogFileValidationEnabled=true.`,
          resource_id: trailName,
          resource_arn: trailArn,
          scan_type: 'cloudtrail_no_validation',
          service: 'CloudTrail',
          evidence: { trailArn, logFileValidation: false }
        });
      }
      
      // Check CloudWatch Logs integration
      if (!trail.CloudWatchLogsLogGroupArn) {
        findings.push({
          severity: 'high',
          title: `CloudTrail Sem Integração CloudWatch Logs`,
          description: `Trail ${trailName} não envia para CloudWatch Logs`,
          analysis: `RISCO ALTO: O trail ${trailName} não está integrado com CloudWatch Logs. Isso impede: alertas em tempo real, pesquisa rápida de eventos, métricas automáticas, e detecção automatizada. Mitigação: Configurar CloudWatch Logs destination com metric filters para eventos críticos.`,
          resource_id: trailName,
          resource_arn: trailArn,
          scan_type: 'cloudtrail_no_cloudwatch',
          service: 'CloudTrail',
          evidence: { trailArn, cloudWatchIntegration: false }
        });
      }
      
      // Check S3 bucket encryption
      const s3Bucket = trail.S3BucketName;
      if (s3Bucket) {
        const bucketEncryption = await checkS3BucketEncryption(credentials, s3Bucket);
        if (!bucketEncryption) {
          findings.push({
            severity: 'high',
            title: `Bucket CloudTrail Sem Criptografia KMS`,
            description: `Logs do trail ${trailName} armazenados sem criptografia adequada`,
            analysis: `RISCO ALTO: O bucket S3 ${s3Bucket} que armazena logs CloudTrail não possui criptografia KMS. Logs contêm informações sensíveis sobre operações na conta. Mitigação: Configurar SSE-KMS no bucket e especificar KMSKeyId no trail.`,
            resource_id: trailName,
            resource_arn: trailArn,
            scan_type: 'cloudtrail_s3_no_encryption',
            service: 'CloudTrail',
            evidence: { trailArn, s3Bucket, encryption: 'none' }
          });
        }
      }
      
      // Check if trail is logging
      const trailStatus = await getTrailStatus(credentials, region, trailName);
      if (!trailStatus?.IsLogging) {
        findings.push({
          severity: 'critical',
          title: `CloudTrail Parado/Desabilitado`,
          description: `Trail ${trailName} não está registrando eventos`,
          analysis: `RISCO CRÍTICO: O trail ${trailName} existe mas NÃO está ativo (IsLogging=false). Nenhum evento está sendo capturado. Mitigação: URGENTE - Executar StartLogging no trail.`,
          resource_id: trailName,
          resource_arn: trailArn,
          scan_type: 'cloudtrail_not_logging',
          service: 'CloudTrail',
          evidence: { trailArn, isLogging: false }
        });
      }
    }
  } catch (error) {
    console.error('Error analyzing CloudTrail:', error);
  }
  
  return findings;
}

// Analyze GuardDuty
export async function analyzeGuardDuty(credentials: AWSCredentials, region: string): Promise<ObservabilityFinding[]> {
  const findings: ObservabilityFinding[] = [];
  
  try {
    const detectors = await listGuardDutyDetectors(credentials, region);
    
    if (detectors.length === 0) {
      findings.push({
        severity: 'critical',
        title: `GuardDuty Não Habilitado`,
        description: `Nenhum detector GuardDuty ativo na região ${region}`,
        analysis: `RISCO CRÍTICO: GuardDuty desabilitado elimina TODA detecção de ameaças baseada em ML/AI. Sem GuardDuty: (1) Nenhuma detecção de IAM abuse, (2) Nenhuma detecção de comunicação com C2, (3) Nenhuma detecção de crypto-mining, (4) Nenhuma detecção de reconnaissance, (5) Nenhuma detecção de data exfiltration, (6) Nenhuma análise de VPC Flow Logs, (7) Nenhuma análise de DNS logs. A conta está operando completamente às cegas para ameaças. Mitigação: URGENTE - Habilitar GuardDuty em TODAS as regiões.`,
        resource_id: 'guardduty',
        scan_type: 'guardduty_disabled',
        service: 'GuardDuty',
        evidence: { enabled: false, region }
      });
      return findings;
    }
    
    for (const detectorId of detectors) {
      const detector = await getGuardDutyDetector(credentials, region, detectorId);
      
      if (detector?.Status !== 'ENABLED') {
        findings.push({
          severity: 'critical',
          title: `GuardDuty Detector Desabilitado`,
          description: `Detector ${detectorId} não está ativo`,
          analysis: `RISCO CRÍTICO: O detector GuardDuty ${detectorId} existe mas não está habilitado. Nenhuma detecção de ameaça está ocorrendo. Mitigação: Habilitar o detector.`,
          resource_id: detectorId,
          scan_type: 'guardduty_detector_disabled',
          service: 'GuardDuty',
          evidence: { detectorId, status: detector?.Status, region }
        });
      }
      
      // Check for S3 protection
      if (!detector?.DataSources?.S3Logs?.Status || detector.DataSources.S3Logs.Status !== 'ENABLED') {
        findings.push({
          severity: 'high',
          title: `GuardDuty S3 Protection Desabilitado`,
          description: `Detector ${detectorId} não monitora atividade S3`,
          analysis: `RISCO ALTO: S3 Protection no GuardDuty não está habilitado. Isso impede detecção de: acesso anômalo a buckets, exfiltração de dados via S3, uso de credenciais comprometidas para acessar S3. Mitigação: Habilitar S3 data source no detector.`,
          resource_id: detectorId,
          scan_type: 'guardduty_no_s3_protection',
          service: 'GuardDuty',
          evidence: { detectorId, s3Protection: false, region }
        });
      }
      
      // Check for Kubernetes protection
      if (!detector?.DataSources?.Kubernetes?.AuditLogs?.Status || detector.DataSources.Kubernetes.AuditLogs.Status !== 'ENABLED') {
        findings.push({
          severity: 'medium',
          title: `GuardDuty EKS Protection Desabilitado`,
          description: `Detector ${detectorId} não monitora clusters EKS`,
          analysis: `RISCO MÉDIO: EKS Audit Log monitoring não está habilitado. Se você usa EKS, atividades suspeitas em clusters Kubernetes não serão detectadas. Mitigação: Habilitar Kubernetes audit logs no detector (se usar EKS).`,
          resource_id: detectorId,
          scan_type: 'guardduty_no_eks_protection',
          service: 'GuardDuty',
          evidence: { detectorId, eksProtection: false, region }
        });
      }
      
      // Check for Malware Protection
      if (!detector?.DataSources?.MalwareProtection?.ScanEc2InstanceWithFindings?.EbsVolumes?.Status || 
          detector.DataSources.MalwareProtection.ScanEc2InstanceWithFindings.EbsVolumes.Status !== 'ENABLED') {
        findings.push({
          severity: 'medium',
          title: `GuardDuty Malware Protection Desabilitado`,
          description: `Detector ${detectorId} não faz scan de malware`,
          analysis: `RISCO MÉDIO: Malware Protection não está habilitado. GuardDuty não fará scan de EBS volumes para detectar malware, trojans, e outras ameaças. Mitigação: Habilitar Malware Protection no detector.`,
          resource_id: detectorId,
          scan_type: 'guardduty_no_malware',
          service: 'GuardDuty',
          evidence: { detectorId, malwareProtection: false, region }
        });
      }
    }
  } catch (error) {
    console.error('Error analyzing GuardDuty:', error);
  }
  
  return findings;
}

// Analyze AWS Config
export async function analyzeAWSConfig(credentials: AWSCredentials, region: string): Promise<ObservabilityFinding[]> {
  const findings: ObservabilityFinding[] = [];
  
  try {
    const recorders = await describeConfigurationRecorders(credentials, region);
    
    if (recorders.length === 0) {
      findings.push({
        severity: 'high',
        title: `AWS Config Não Configurado`,
        description: `Nenhum recorder AWS Config ativo na região ${region}`,
        analysis: `RISCO ALTO: AWS Config não está configurado. Isso significa: (1) Nenhum histórico de configuração de recursos, (2) Nenhuma avaliação de compliance, (3) Impossível rastrear drift de configuração, (4) Nenhum snapshot de estado para recovery. Mitigação: Configurar AWS Config com all resources recording.`,
        resource_id: 'aws-config',
        scan_type: 'config_disabled',
        service: 'Config',
        evidence: { enabled: false, region }
      });
      return findings;
    }
    
    for (const recorder of recorders) {
      const recorderName = recorder.name || 'default';
      
      // Check if recording all resources
      if (!recorder.recordingGroup?.allSupported) {
        findings.push({
          severity: 'medium',
          title: `AWS Config Não Grava Todos os Recursos`,
          description: `Recorder ${recorderName} configurado para recursos específicos`,
          analysis: `RISCO MÉDIO: O AWS Config recorder ${recorderName} não está configurado para gravar todos os recursos (allSupported=false). Alguns recursos podem ter alterações não rastreadas. Mitigação: Configurar allSupported=true para captura completa.`,
          resource_id: recorderName,
          scan_type: 'config_not_all_resources',
          service: 'Config',
          evidence: { recorderName, allSupported: false, region }
        });
      }
      
      // Check recorder status
      const status = await describeConfigurationRecorderStatus(credentials, region, recorderName);
      if (!status?.recording) {
        findings.push({
          severity: 'high',
          title: `AWS Config Recorder Parado`,
          description: `Recorder ${recorderName} não está gravando`,
          analysis: `RISCO ALTO: O AWS Config recorder ${recorderName} existe mas não está ativo (recording=false). Nenhuma configuração está sendo capturada. Mitigação: Iniciar o recorder.`,
          resource_id: recorderName,
          scan_type: 'config_not_recording',
          service: 'Config',
          evidence: { recorderName, recording: false, region }
        });
      }
    }
    
    // Check for Config Rules
    const rules = await describeConfigRules(credentials, region);
    if (rules.length < 10) {
      findings.push({
        severity: 'medium',
        title: `Poucas Regras AWS Config`,
        description: `Apenas ${rules.length} regras de compliance configuradas`,
        analysis: `RISCO MÉDIO: Existem apenas ${rules.length} regras AWS Config. Uma configuração robusta deve incluir regras para: S3 encryption, EBS encryption, RDS encryption, restricted SSH, restricted RDP, IAM password policy, CloudTrail enabled, etc. Mitigação: Adicionar AWS Managed Rules ou regras customizadas para compliance.`,
        resource_id: 'config-rules',
        scan_type: 'config_few_rules',
        service: 'Config',
        evidence: { ruleCount: rules.length, region }
      });
    }
  } catch (error) {
    console.error('Error analyzing AWS Config:', error);
  }
  
  return findings;
}

// Analyze Security Hub
export async function analyzeSecurityHub(credentials: AWSCredentials, region: string): Promise<ObservabilityFinding[]> {
  const findings: ObservabilityFinding[] = [];
  
  try {
    const hubStatus = await getSecurityHubStatus(credentials, region);
    
    if (!hubStatus.enabled) {
      findings.push({
        severity: 'high',
        title: `Security Hub Não Habilitado`,
        description: `AWS Security Hub desabilitado na região ${region}`,
        analysis: `RISCO ALTO: Security Hub não está habilitado. Security Hub centraliza findings de GuardDuty, Inspector, Macie, Firewall Manager, IAM Access Analyzer, e third-party tools. Também fornece security standards (CIS, PCI-DSS, AWS Foundational). Sem Security Hub, não há visão unificada de segurança. Mitigação: Habilitar Security Hub e ativar standards relevantes.`,
        resource_id: 'security-hub',
        scan_type: 'securityhub_disabled',
        service: 'SecurityHub',
        evidence: { enabled: false, region }
      });
      return findings;
    }
    
    // Check for enabled standards
    const standards = await getEnabledStandards(credentials, region);
    
    const recommendedStandards = ['CIS AWS Foundations', 'AWS Foundational Security Best Practices', 'PCI DSS'];
    const enabledStandardNames = standards.map((s: any) => s.StandardsArn || '');
    
    if (!enabledStandardNames.some((n: string) => n.includes('cis-aws-foundations'))) {
      findings.push({
        severity: 'medium',
        title: `CIS AWS Foundations Não Habilitado`,
        description: `Standard CIS não ativo no Security Hub`,
        analysis: `RISCO MÉDIO: O standard CIS AWS Foundations Benchmark não está habilitado. Este standard fornece validações de segurança baseadas nas melhores práticas do Center for Internet Security. Mitigação: Habilitar CIS AWS Foundations no Security Hub.`,
        resource_id: 'security-hub',
        scan_type: 'securityhub_no_cis',
        service: 'SecurityHub',
        evidence: { enabledStandards: enabledStandardNames, region }
      });
    }
    
    if (!enabledStandardNames.some((n: string) => n.includes('aws-foundational-security'))) {
      findings.push({
        severity: 'medium',
        title: `AWS Foundational Security Best Practices Não Habilitado`,
        description: `Standard AWS nativo não ativo no Security Hub`,
        analysis: `RISCO MÉDIO: O standard AWS Foundational Security Best Practices não está habilitado. Este standard é mantido pela AWS e cobre configurações de segurança recomendadas. Mitigação: Habilitar AWS Foundational Security Best Practices.`,
        resource_id: 'security-hub',
        scan_type: 'securityhub_no_aws_standard',
        service: 'SecurityHub',
        evidence: { enabledStandards: enabledStandardNames, region }
      });
    }
    
    // Check for integrations
    const integrations = await getSecurityHubIntegrations(credentials, region);
    
    if (!integrations.some((i: any) => i.includes('guardduty'))) {
      findings.push({
        severity: 'medium',
        title: `GuardDuty Não Integrado ao Security Hub`,
        description: `Findings GuardDuty não fluem para Security Hub`,
        analysis: `RISCO MÉDIO: GuardDuty não está enviando findings para Security Hub. Isso fragmenta a visibilidade de segurança. Mitigação: Habilitar integração GuardDuty no Security Hub.`,
        resource_id: 'security-hub',
        scan_type: 'securityhub_no_guardduty',
        service: 'SecurityHub',
        evidence: { integrations, region }
      });
    }
  } catch (error) {
    console.error('Error analyzing Security Hub:', error);
  }
  
  return findings;
}

// Helper functions
async function describeTrails(credentials: AWSCredentials, region: string): Promise<any[]> {
  const endpoint = `https://cloudtrail.${region}.amazonaws.com/`;
  const host = `cloudtrail.${region}.amazonaws.com`;
  
  try {
    const headers = await signAWSGetRequest(credentials, 'cloudtrail', region, host, '/', '');
    headers['Content-Type'] = 'application/x-amz-json-1.1';
    headers['X-Amz-Target'] = 'com.amazonaws.cloudtrail.v20131101.CloudTrail_20131101.DescribeTrails';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.trailList || [];
  } catch (error) {
    console.error('Error describing trails:', error);
    return [];
  }
}

async function getTrailStatus(credentials: AWSCredentials, region: string, trailName: string): Promise<any> {
  const endpoint = `https://cloudtrail.${region}.amazonaws.com/`;
  const host = `cloudtrail.${region}.amazonaws.com`;
  
  try {
    const headers = await signAWSGetRequest(credentials, 'cloudtrail', region, host, '/', '');
    headers['Content-Type'] = 'application/x-amz-json-1.1';
    headers['X-Amz-Target'] = 'com.amazonaws.cloudtrail.v20131101.CloudTrail_20131101.GetTrailStatus';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ Name: trailName })
    });
    
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error getting trail status:', error);
    return null;
  }
}

async function checkS3BucketEncryption(credentials: AWSCredentials, bucketName: string): Promise<boolean> {
  // Simplified - would need GetBucketEncryption
  return false;
}

async function listGuardDutyDetectors(credentials: AWSCredentials, region: string): Promise<string[]> {
  const endpoint = `https://guardduty.${region}.amazonaws.com/detector`;
  const host = `guardduty.${region}.amazonaws.com`;
  
  try {
    const headers = await signAWSGetRequest(credentials, 'guardduty', region, host, '/detector', '');
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.detectorIds || [];
  } catch (error) {
    console.error('Error listing GuardDuty detectors:', error);
    return [];
  }
}

async function getGuardDutyDetector(credentials: AWSCredentials, region: string, detectorId: string): Promise<any> {
  const endpoint = `https://guardduty.${region}.amazonaws.com/detector/${detectorId}`;
  const host = `guardduty.${region}.amazonaws.com`;
  
  try {
    const headers = await signAWSGetRequest(credentials, 'guardduty', region, host, `/detector/${detectorId}`, '');
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error getting GuardDuty detector:', error);
    return null;
  }
}

async function describeConfigurationRecorders(credentials: AWSCredentials, region: string): Promise<any[]> {
  const endpoint = `https://config.${region}.amazonaws.com/`;
  const host = `config.${region}.amazonaws.com`;
  
  try {
    const headers = await signAWSGetRequest(credentials, 'config', region, host, '/', '');
    headers['Content-Type'] = 'application/x-amz-json-1.1';
    headers['X-Amz-Target'] = 'StarlingDoveService.DescribeConfigurationRecorders';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.ConfigurationRecorders || [];
  } catch (error) {
    console.error('Error describing config recorders:', error);
    return [];
  }
}

async function describeConfigurationRecorderStatus(credentials: AWSCredentials, region: string, recorderName: string): Promise<any> {
  const endpoint = `https://config.${region}.amazonaws.com/`;
  const host = `config.${region}.amazonaws.com`;
  
  try {
    const headers = await signAWSGetRequest(credentials, 'config', region, host, '/', '');
    headers['Content-Type'] = 'application/x-amz-json-1.1';
    headers['X-Amz-Target'] = 'StarlingDoveService.DescribeConfigurationRecorderStatus';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ConfigurationRecorderNames: [recorderName] })
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    return data.ConfigurationRecordersStatus?.[0];
  } catch (error) {
    console.error('Error getting config recorder status:', error);
    return null;
  }
}

async function describeConfigRules(credentials: AWSCredentials, region: string): Promise<any[]> {
  const endpoint = `https://config.${region}.amazonaws.com/`;
  const host = `config.${region}.amazonaws.com`;
  
  try {
    const headers = await signAWSGetRequest(credentials, 'config', region, host, '/', '');
    headers['Content-Type'] = 'application/x-amz-json-1.1';
    headers['X-Amz-Target'] = 'StarlingDoveService.DescribeConfigRules';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.ConfigRules || [];
  } catch (error) {
    console.error('Error describing config rules:', error);
    return [];
  }
}

async function getSecurityHubStatus(credentials: AWSCredentials, region: string): Promise<{ enabled: boolean }> {
  const endpoint = `https://securityhub.${region}.amazonaws.com/accounts`;
  const host = `securityhub.${region}.amazonaws.com`;
  
  try {
    const headers = await signAWSGetRequest(credentials, 'securityhub', region, host, '/accounts', '');
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers
    });
    
    return { enabled: response.ok };
  } catch (error) {
    console.error('Error getting Security Hub status:', error);
    return { enabled: false };
  }
}

async function getEnabledStandards(credentials: AWSCredentials, region: string): Promise<any[]> {
  const endpoint = `https://securityhub.${region}.amazonaws.com/standards/subscription`;
  const host = `securityhub.${region}.amazonaws.com`;
  
  try {
    const headers = await signAWSGetRequest(credentials, 'securityhub', region, host, '/standards/subscription', '');
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.StandardsSubscriptions || [];
  } catch (error) {
    console.error('Error getting enabled standards:', error);
    return [];
  }
}

async function getSecurityHubIntegrations(credentials: AWSCredentials, region: string): Promise<string[]> {
  // Simplified - would need ListEnabledProductsForImport
  return [];
}
