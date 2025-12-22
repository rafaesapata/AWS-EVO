/**
 * Lambda handler para compliance scan
 * AWS Lambda Handler for compliance-scan
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

interface ComplianceScanRequest {
  frameworkId: string;
  scanId?: string;
  accountId?: string;
}

interface ComplianceControl {
  control_id: string;
  control_name: string;
  status: 'passed' | 'failed';
  severity: 'critical' | 'high' | 'medium' | 'low';
  evidence: any;
  remediation_steps?: string;
}

const FRAMEWORK_CONTROLS: Record<string, { control_id: string; control_name: string }[]> = {
  'cis': [
    // Identity and Access Management
    { control_id: 'CIS-1.1', control_name: 'Evitar uso da conta root' },
    { control_id: 'CIS-1.2', control_name: 'MFA habilitado na conta root' },
    { control_id: 'CIS-1.3', control_name: 'Credenciais não utilizadas há mais de 90 dias removidas' },
    { control_id: 'CIS-1.4', control_name: 'Rotação de access keys a cada 90 dias' },
    { control_id: 'CIS-1.5', control_name: 'Política de senha forte (mínimo 14 caracteres)' },
    { control_id: 'CIS-1.8', control_name: 'MFA habilitado para todos usuários IAM' },
    
    // Logging
    { control_id: 'CIS-2.1', control_name: 'CloudTrail habilitado em todas regiões' },
    { control_id: 'CIS-2.2', control_name: 'CloudTrail log file validation habilitada' },
    { control_id: 'CIS-2.3', control_name: 'S3 bucket de CloudTrail não público' },
    { control_id: 'CIS-2.4', control_name: 'CloudTrail integrado com CloudWatch Logs' },
    { control_id: 'CIS-2.5', control_name: 'AWS Config habilitado em todas regiões' },
    { control_id: 'CIS-2.7', control_name: 'CloudTrail logs encriptados em repouso usando KMS' },
    
    // Monitoring
    { control_id: 'CIS-3.1', control_name: 'Alarme CloudWatch para uso não autorizado de API' },
    { control_id: 'CIS-3.2', control_name: 'Alarme para login no console sem MFA' },
    { control_id: 'CIS-3.3', control_name: 'Alarme para uso da conta root' },
    { control_id: 'CIS-3.4', control_name: 'Alarme para mudanças em políticas IAM' },
    
    // Networking
    { control_id: 'CIS-4.1', control_name: 'Security Groups não permitem 0.0.0.0/0 em porta 22 (SSH)' },
    { control_id: 'CIS-4.2', control_name: 'Security Groups não permitem 0.0.0.0/0 em porta 3389 (RDP)' },
    { control_id: 'CIS-4.3', control_name: 'VPC default não existe ou está vazia' },
    
    // Storage
    { control_id: 'CIS-5.1', control_name: 'S3 buckets não são públicos' },
    { control_id: 'CIS-5.2', control_name: 'S3 bucket-level Public Access Block habilitado' },
    { control_id: 'CIS-5.3', control_name: 'S3 buckets com encriptação server-side habilitada' },
    { control_id: 'CIS-5.4', control_name: 'EBS encryption by default habilitado' },
  ],
  'lgpd': [
    { control_id: 'LGPD-1.1', control_name: 'Dados pessoais criptografados em repouso' },
    { control_id: 'LGPD-1.2', control_name: 'Dados pessoais criptografados em trânsito' },
    { control_id: 'LGPD-2.1', control_name: 'Controles de acesso baseados em funções (RBAC)' },
    { control_id: 'LGPD-2.2', control_name: 'Logs de auditoria de acesso a dados pessoais' },
    { control_id: 'LGPD-3.1', control_name: 'Política de retenção de dados implementada' },
    { control_id: 'LGPD-4.1', control_name: 'Backups criptografados' },
    { control_id: 'LGPD-5.1', control_name: 'Monitoramento de vazamento de dados' },
  ],
  'pci-dss': [
    { control_id: 'PCI-1.1', control_name: 'Firewall configurado para proteger dados de cartões' },
    { control_id: 'PCI-2.2', control_name: 'Hardening de sistemas' },
    { control_id: 'PCI-3.4', control_name: 'PAN renderizado ilegível' },
    { control_id: 'PCI-4.1', control_name: 'Criptografia forte em redes públicas' },
    { control_id: 'PCI-8.2', control_name: 'Autenticação multi-fator para acessos remotos' },
    { control_id: 'PCI-10.1', control_name: 'Trilhas de auditoria de acesso a dados de cartão' },
  ],
};

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('Compliance scan started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: ComplianceScanRequest = event.body ? JSON.parse(event.body) : {};
    const { frameworkId, scanId, accountId } = body;
    
    if (!frameworkId) {
      return badRequest('frameworkId is required');
    }
    
    logger.info('Starting compliance scan', { frameworkId });
    
    const prisma = getPrismaClient();
    
    // Get AWS credentials
    const credential = await prisma.awsCredential.findFirst({
      where: {
        organization_id: organizationId,
        is_active: true,
        ...(accountId && { id: accountId }),
      },
      orderBy: { created_at: 'desc' },
    });
    
    if (!credential) {
      return badRequest('AWS credentials not found');
    }
    
    // Get existing findings for analysis
    const findings = await prisma.finding.findMany({
      where: {
        organization_id: organizationId,
        source: 'security_scan',
      },
      take: 50,
      orderBy: { created_at: 'desc' },
    });
    
    // Get security posture
    const posture = await prisma.securityPosture.findFirst({
      where: { organization_id: organizationId },
      orderBy: { calculated_at: 'desc' },
    });
    
    // Get framework controls
    const controls = FRAMEWORK_CONTROLS[frameworkId] || [];
    
    logger.info('Analyzing compliance controls', { frameworkId, controlCount: controls.length });
    
    // Analyze compliance based on findings
    const complianceResults: ComplianceControl[] = analyzeCompliance(
      frameworkId,
      controls,
      findings,
      posture
    );
    
    // Create or use existing scan
    let scanRecord;
    if (scanId) {
      scanRecord = await prisma.securityScan.findUnique({
        where: { id: scanId },
      });
    }
    
    if (!scanRecord) {
      scanRecord = await prisma.securityScan.create({
        data: {
          organization_id: organizationId,
          aws_account_id: credential.id,
          scan_type: `compliance-${frameworkId}`,
          status: 'completed',
          scan_config: { framework: frameworkId },
          completed_at: new Date(),
        },
      });
    }
    
    // Store compliance checks
    await prisma.complianceCheck.createMany({
      data: complianceResults.map(control => ({
        scan_id: scanRecord!.id,
        framework: frameworkId,
        control_id: control.control_id,
        control_name: control.control_name,
        status: control.status,
        severity: control.severity,
        evidence: control.evidence,
        remediation_steps: control.remediation_steps,
      })),
    });
    
    const passed = complianceResults.filter(c => c.status === 'passed').length;
    const failed = complianceResults.filter(c => c.status === 'failed').length;
    
    logger.info('Compliance scan completed', { passed, failed, total: complianceResults.length });
    
    return success({
      scan_id: scanRecord.id,
      framework: frameworkId,
      checks_count: complianceResults.length,
      passed,
      failed,
      compliance_score: Math.round((passed / complianceResults.length) * 100),
    });
    
  } catch (err) {
    logger.error('Compliance scan error', err as Error);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

/**
 * Analisa compliance baseado nos findings existentes
 */
function analyzeCompliance(
  frameworkId: string,
  controls: { control_id: string; control_name: string }[],
  findings: any[],
  posture: any
): ComplianceControl[] {
  const results: ComplianceControl[] = [];
  
  for (const control of controls) {
    let status: 'passed' | 'failed' = 'passed';
    let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
    let evidence: any = {};
    let remediation: string | undefined;
    
    // Análise baseada no control_id
    if (control.control_id.includes('CIS-1')) {
      // IAM controls
      const iamFindings = findings.filter(f => 
        f.service === 'IAM' || f.scan_type?.includes('iam')
      );
      
      if (iamFindings.length > 0) {
        status = 'failed';
        severity = 'high';
        evidence = { findings_count: iamFindings.length };
        remediation = 'Revisar e corrigir configurações de IAM conforme CIS Benchmark';
      }
    } else if (control.control_id.includes('CIS-2')) {
      // Logging controls
      const loggingFindings = findings.filter(f => 
        f.scan_type?.includes('cloudtrail') || f.scan_type?.includes('logging')
      );
      
      if (loggingFindings.length > 0) {
        status = 'failed';
        severity = 'high';
        evidence = { findings_count: loggingFindings.length };
        remediation = 'Habilitar CloudTrail e logging conforme CIS Benchmark';
      }
    } else if (control.control_id.includes('CIS-4')) {
      // Network controls
      const networkFindings = findings.filter(f => 
        f.category === 'Network Exposure' || 
        f.scan_type?.includes('sg_') ||
        f.scan_type?.includes('ec2_')
      );
      
      if (networkFindings.length > 0) {
        status = 'failed';
        severity = 'critical';
        evidence = { 
          findings_count: networkFindings.length,
          exposed_resources: networkFindings.map(f => f.resource_id)
        };
        remediation = 'Restringir Security Groups e remover exposição pública';
      }
    } else if (control.control_id.includes('CIS-5')) {
      // Storage controls
      const storageFindings = findings.filter(f => 
        f.service === 'S3' || f.service === 'RDS' || f.service === 'EBS'
      );
      
      if (storageFindings.length > 0) {
        status = 'failed';
        severity = 'high';
        evidence = { findings_count: storageFindings.length };
        remediation = 'Habilitar encryption e public access block em recursos de storage';
      }
    } else if (control.control_id.includes('LGPD')) {
      // LGPD controls - verificar encryption e access controls
      const encryptionFindings = findings.filter(f => 
        f.scan_type?.includes('encryption') || f.scan_type?.includes('public')
      );
      
      if (encryptionFindings.length > 0) {
        status = 'failed';
        severity = 'critical';
        evidence = { findings_count: encryptionFindings.length };
        remediation = 'Implementar criptografia e controles de acesso conforme LGPD Art.46';
      }
    } else if (control.control_id.includes('PCI')) {
      // PCI-DSS controls
      const pciFindings = findings.filter(f => 
        f.compliance?.includes('PCI-DSS')
      );
      
      if (pciFindings.length > 0) {
        status = 'failed';
        severity = 'critical';
        evidence = { findings_count: pciFindings.length };
        remediation = 'Corrigir violações de PCI-DSS identificadas';
      }
    }
    
    results.push({
      control_id: control.control_id,
      control_name: control.control_name,
      status,
      severity,
      evidence,
      remediation_steps: remediation,
    });
  }
  
  return results;
}
