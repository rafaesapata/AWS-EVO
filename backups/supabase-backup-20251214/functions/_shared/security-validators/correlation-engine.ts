// Security Correlation Engine - Cross-service risk analysis
export interface CorrelatedFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  analysis: string;
  resource_id: string;
  scan_type: string;
  service: string;
  evidence: any;
  correlated_resources: string[];
  risk_score: number;
}

interface Finding {
  severity: string;
  title: string;
  resource_id: string;
  scan_type: string;
  service: string;
  evidence?: any;
}

// Correlate findings across services to detect compound risks
export function correlateFindings(findings: Finding[]): CorrelatedFinding[] {
  const correlated: CorrelatedFinding[] = [];
  
  // Pattern 1: Public EC2 + Open SG + No WAF = Critical Attack Surface
  const publicEC2s = findings.filter(f => f.scan_type?.includes('ec2') && f.evidence?.publicIp);
  const openSGs = findings.filter(f => f.scan_type?.includes('sg_') && f.severity === 'critical');
  const noWAF = findings.filter(f => f.scan_type?.includes('no_waf') || f.scan_type?.includes('waf'));
  
  if (publicEC2s.length > 0 && openSGs.length > 0) {
    correlated.push({
      severity: 'critical',
      title: `CORRELAÇÃO: Superfície de Ataque Crítica Detectada`,
      description: `${publicEC2s.length} EC2s públicas com ${openSGs.length} Security Groups abertos`,
      analysis: `PADRÃO DE RISCO CORRELACIONADO: Foram detectadas ${publicEC2s.length} instâncias EC2 públicas combinadas com ${openSGs.length} Security Groups com portas críticas abertas${noWAF.length > 0 ? ' e ausência de WAF' : ''}. Esta combinação cria uma superfície de ataque maximizada, permitindo ataques diretos sem nenhuma camada de proteção. AÇÃO URGENTE: (1) Revisar necessidade de IPs públicos, (2) Restringir SGs para IPs específicos, (3) Implementar WAF e CloudFront na frente de workloads públicos.`,
      resource_id: 'correlated-attack-surface',
      scan_type: 'correlation_attack_surface',
      service: 'Multiple',
      evidence: { 
        publicEC2Count: publicEC2s.length,
        openSGCount: openSGs.length,
        noWAFCount: noWAF.length,
        affectedResources: publicEC2s.map(f => f.resource_id)
      },
      correlated_resources: [...publicEC2s.map(f => f.resource_id), ...openSGs.map(f => f.resource_id)],
      risk_score: 95
    });
  }
  
  // Pattern 2: IAM issues + No MFA + Old Keys = Identity Compromise Risk
  const iamNoMFA = findings.filter(f => f.scan_type?.includes('mfa'));
  const oldKeys = findings.filter(f => f.scan_type?.includes('old_keys') || f.scan_type?.includes('key'));
  const wildcardPolicies = findings.filter(f => f.scan_type?.includes('admin_policy') || f.scan_type?.includes('wildcard'));
  
  if (iamNoMFA.length > 0 && (oldKeys.length > 0 || wildcardPolicies.length > 0)) {
    correlated.push({
      severity: 'critical',
      title: `CORRELAÇÃO: Alto Risco de Comprometimento de Identidade`,
      description: `${iamNoMFA.length} usuários sem MFA + ${oldKeys.length} chaves antigas + ${wildcardPolicies.length} políticas privilegiadas`,
      analysis: `PADRÃO DE RISCO CORRELACIONADO: Combinação perigosa de ${iamNoMFA.length} usuários sem MFA, ${oldKeys.length} chaves de acesso antigas, e ${wildcardPolicies.length} políticas com permissões administrativas. Um único vazamento de credenciais resulta em comprometimento total da conta. AÇÃO URGENTE: (1) Forçar MFA para todos os usuários, (2) Rotacionar todas as chaves antigas, (3) Revisar e restringir políticas privilegiadas.`,
      resource_id: 'correlated-identity-risk',
      scan_type: 'correlation_identity_compromise',
      service: 'IAM',
      evidence: { 
        noMFACount: iamNoMFA.length,
        oldKeysCount: oldKeys.length,
        privilegedPolicies: wildcardPolicies.length
      },
      correlated_resources: [...iamNoMFA.map(f => f.resource_id), ...oldKeys.map(f => f.resource_id)],
      risk_score: 90
    });
  }
  
  // Pattern 3: No Observability = Blind Spot
  const noGuardDuty = findings.filter(f => f.scan_type?.includes('guardduty'));
  const noCloudTrail = findings.filter(f => f.scan_type?.includes('cloudtrail'));
  const noConfig = findings.filter(f => f.scan_type?.includes('config'));
  
  if (noGuardDuty.length > 0 && noCloudTrail.length > 0) {
    correlated.push({
      severity: 'critical',
      title: `CORRELAÇÃO: Ambiente Completamente Sem Observabilidade`,
      description: `GuardDuty + CloudTrail desabilitados = zero visibilidade de ameaças`,
      analysis: `PADRÃO DE RISCO CORRELACIONADO: Tanto GuardDuty quanto CloudTrail estão desabilitados/com problemas. Isso significa ZERO capacidade de: detectar ataques em andamento, investigar incidentes, realizar análise forense, identificar comportamento anômalo. A conta está operando completamente às cegas. AÇÃO URGENTE: Habilitar imediatamente GuardDuty e CloudTrail em todas as regiões.`,
      resource_id: 'correlated-no-observability',
      scan_type: 'correlation_blind_environment',
      service: 'Observability',
      evidence: { 
        guarddutyIssues: noGuardDuty.length,
        cloudtrailIssues: noCloudTrail.length,
        configIssues: noConfig.length
      },
      correlated_resources: [...noGuardDuty.map(f => f.resource_id), ...noCloudTrail.map(f => f.resource_id)],
      risk_score: 92
    });
  }
  
  // Pattern 4: Data exposure (Public S3 + No Encryption + No Logging)
  const publicS3 = findings.filter(f => f.scan_type?.includes('s3_public'));
  const noEncryption = findings.filter(f => f.scan_type?.includes('no_encryption') && f.service === 'S3');
  const noLogging = findings.filter(f => f.scan_type?.includes('no_logging') && f.service === 'S3');
  
  if (publicS3.length > 0 || (noEncryption.length > 3 && noLogging.length > 3)) {
    correlated.push({
      severity: 'critical',
      title: `CORRELAÇÃO: Risco de Vazamento de Dados`,
      description: `${publicS3.length} buckets públicos, ${noEncryption.length} sem criptografia, ${noLogging.length} sem logging`,
      analysis: `PADRÃO DE RISCO CORRELACIONADO: Múltiplos problemas de segurança de dados detectados. Buckets públicos permitem acesso não autorizado, falta de criptografia expõe dados em repouso, e ausência de logging impede detecção de vazamentos. AÇÃO URGENTE: (1) Bloquear acesso público em todos os buckets, (2) Ativar criptografia SSE-KMS, (3) Habilitar server access logging.`,
      resource_id: 'correlated-data-exposure',
      scan_type: 'correlation_data_leak_risk',
      service: 'S3',
      evidence: { 
        publicBuckets: publicS3.length,
        unencryptedBuckets: noEncryption.length,
        noLoggingBuckets: noLogging.length
      },
      correlated_resources: [...publicS3.map(f => f.resource_id), ...noEncryption.map(f => f.resource_id)],
      risk_score: 88
    });
  }
  
  // Pattern 5: Database exposure (RDS public + No backup + No encryption)
  const rdsExposed = findings.filter(f => f.scan_type?.includes('rds') && f.severity === 'critical');
  const rdsNoBackup = findings.filter(f => f.scan_type?.includes('rds_backup'));
  const rdsNoEncryption = findings.filter(f => f.scan_type?.includes('rds_no_encryption'));
  
  if (rdsExposed.length > 0 && (rdsNoBackup.length > 0 || rdsNoEncryption.length > 0)) {
    correlated.push({
      severity: 'critical',
      title: `CORRELAÇÃO: Databases em Risco Crítico`,
      description: `${rdsExposed.length} RDS expostos + ${rdsNoBackup.length} sem backup adequado`,
      analysis: `PADRÃO DE RISCO CORRELACIONADO: Databases RDS com múltiplas vulnerabilidades simultâneas. Exposição pública permite ataques diretos, falta de backup adequado impede recovery, e ausência de criptografia expõe dados sensíveis. Um único ataque de ransomware pode resultar em perda total e irreversível de dados. AÇÃO URGENTE: (1) Isolar RDS em subnets privadas, (2) Configurar backup com retenção adequada, (3) Ativar criptografia.`,
      resource_id: 'correlated-database-risk',
      scan_type: 'correlation_database_critical',
      service: 'RDS',
      evidence: { 
        exposedRDS: rdsExposed.length,
        noBackupRDS: rdsNoBackup.length,
        noEncryptionRDS: rdsNoEncryption.length
      },
      correlated_resources: [...rdsExposed.map(f => f.resource_id), ...rdsNoBackup.map(f => f.resource_id)],
      risk_score: 93
    });
  }
  
  return correlated;
}

// Calculate overall risk score based on all findings
export function calculateRiskScore(findings: Finding[]): { 
  score: number; 
  grade: string; 
  summary: string 
} {
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;
  const lowCount = findings.filter(f => f.severity === 'low').length;
  
  // Weighted scoring
  const weightedScore = (criticalCount * 10) + (highCount * 5) + (mediumCount * 2) + (lowCount * 0.5);
  const maxExpectedScore = Math.max(150, findings.length * 3);
  
  const riskPercentage = Math.min(100, (weightedScore / maxExpectedScore) * 100);
  const score = Math.max(0, Math.min(100, 100 - riskPercentage - (criticalCount * 2)));
  
  let grade: string;
  let summary: string;
  
  if (score >= 90) {
    grade = 'A';
    summary = 'Excelente postura de segurança';
  } else if (score >= 80) {
    grade = 'B';
    summary = 'Boa postura com melhorias necessárias';
  } else if (score >= 70) {
    grade = 'C';
    summary = 'Postura aceitável com riscos moderados';
  } else if (score >= 50) {
    grade = 'D';
    summary = 'Postura inadequada com riscos significativos';
  } else {
    grade = 'F';
    summary = 'Postura crítica - ação imediata necessária';
  }
  
  return { score: Math.round(score), grade, summary };
}
