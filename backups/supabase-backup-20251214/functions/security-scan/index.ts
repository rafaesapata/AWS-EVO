import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getResolvedAWSCredentials, signAWSGetRequest } from '../_shared/aws-credentials-helper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ==================== TYPES ====================
interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  analysis: string;
  resource_id: string;
  resource_arn?: string;
  scan_type: string;
  service: string;
  category: string;
  evidence: any;
  compliance?: string[];
  remediation?: string;
  risk_vector?: string;
}

interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

interface CorrelatedRisk {
  riskVector: string;
  severity: 'critical' | 'high' | 'medium';
  affectedResources: string[];
  description: string;
  attackPath: string[];
  complianceViolations: string[];
}

// ==================== CONSTANTS ====================
const CRITICAL_PORTS: Record<number, string> = {
  22: 'SSH', 3389: 'RDP', 3306: 'MySQL', 5432: 'PostgreSQL',
  1433: 'SQL Server', 27017: 'MongoDB', 6379: 'Redis', 
  9200: 'Elasticsearch', 5601: 'Kibana', 1521: 'Oracle',
  11211: 'Memcached', 5900: 'VNC', 23: 'Telnet',
  21: 'FTP', 139: 'NetBIOS', 445: 'SMB', 111: 'RPC',
  2049: 'NFS', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt'
};

const COMPLIANCE_FRAMEWORKS = {
  CIS: 'CIS AWS Foundations Benchmark',
  LGPD: 'Lei Geral de Proteção de Dados',
  GDPR: 'General Data Protection Regulation',
  PCI: 'PCI-DSS v4.0',
  HIPAA: 'Health Insurance Portability and Accountability Act',
  SOC2: 'SOC 2 Type II',
  ISO27001: 'ISO/IEC 27001:2022'
};

const OUTDATED_RUNTIMES = [
  'python2.7', 'python3.6', 'python3.7', 'nodejs10.x', 'nodejs12.x', 
  'nodejs14.x', 'ruby2.5', 'ruby2.6', 'dotnetcore2.1', 'dotnetcore3.1', 
  'java8', 'go1.x'
];

// Scan level definitions
type ScanLevel = 'basic' | 'advanced' | 'military';

interface ScanLevelConfig {
  name: string;
  description: string;
  checks: string[];
  severityMultiplier: number;
  includeCorrelation: boolean;
  includeDeepIAM: boolean;
  includeCloudTrail: boolean;
  includeSnapshots: boolean;
}

const SCAN_LEVELS: Record<ScanLevel, ScanLevelConfig> = {
  basic: {
    name: 'Básico',
    description: 'Verificações essenciais de segurança',
    checks: ['ec2_exposure', 'rds_public', 's3_public', 'sg_open_ports'],
    severityMultiplier: 1,
    includeCorrelation: false,
    includeDeepIAM: false,
    includeCloudTrail: false,
    includeSnapshots: false
  },
  advanced: {
    name: 'Avançado',
    description: 'Análise abrangente com validações de conformidade',
    checks: ['all_basic', 'iam_analysis', 'encryption', 'backup', 'logging'],
    severityMultiplier: 1.5,
    includeCorrelation: true,
    includeDeepIAM: true,
    includeCloudTrail: true,
    includeSnapshots: false
  },
  military: {
    name: 'Military-Grade',
    description: 'Auditoria de máximo rigor - Zero tolerância a brechas',
    checks: ['all_advanced', 'deep_correlation', 'attack_vectors', 'compliance_full'],
    severityMultiplier: 2,
    includeCorrelation: true,
    includeDeepIAM: true,
    includeCloudTrail: true,
    includeSnapshots: true
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body for scan level
    let scanLevel: ScanLevel = 'military';
    let accountId: string | null = null;
    
    try {
      const body = await req.json();
      if (body.scanLevel && SCAN_LEVELS[body.scanLevel as ScanLevel]) {
        scanLevel = body.scanLevel as ScanLevel;
      }
      accountId = body.accountId || null;
    } catch {
      // Default to military if no body
    }

    const levelConfig = SCAN_LEVELS[scanLevel];
    console.log(`🔒 AWS Security Audit Starting - Level: ${levelConfig.name}`);
    console.log(`📋 Mode: ${levelConfig.description}`);
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authentication required');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    
    if (userError || !user) throw new Error('Authentication required');
    console.log('✅ Auditor authenticated:', user.id);

    const { data: orgId, error: orgError } = await supabase.rpc('get_user_organization', { _user_id: user.id });
    if (orgError || !orgId) throw new Error('Organization not found');

    // Get credentials - use specific account if provided
    let credentialsQuery = supabase
      .from('aws_credentials')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true);
    
    if (accountId) {
      credentialsQuery = credentialsQuery.eq('id', accountId);
    }
    
    const { data: credentials, error: credError } = await credentialsQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) throw new Error('AWS credentials not found');

    const regionsToScan = credentials.regions?.length > 0 
      ? credentials.regions 
      : ['us-east-1', 'us-west-2', 'eu-west-1', 'sa-east-1'];

    console.log(`🌍 Scanning ${regionsToScan.length} regions with ${levelConfig.name} rigor`);

    // Create scan record
    const { data: scanRecord, error: scanError } = await supabase
      .from('security_scans')
      .insert({
        aws_account_id: credentials.id,
        organization_id: orgId,
        scan_type: `${scanLevel}-audit`,
        status: 'running',
        scan_config: { 
          regions: regionsToScan, 
          level: scanLevel,
          mode: levelConfig.description,
          includeCorrelation: levelConfig.includeCorrelation,
          includeDeepIAM: levelConfig.includeDeepIAM
        }
      })
      .select()
      .single();

    if (scanError) throw new Error(`Failed to create scan: ${scanError.message}`);

    const findings: Finding[] = [];
    const allResources: any = {
      ec2Instances: [], securityGroups: [], loadBalancers: [], rdsInstances: [],
      s3Buckets: [], lambdaFunctions: [], iamUsers: [], iamRoles: [], iamPolicies: [],
      vpcs: [], subnets: [], nacls: [], routeTables: [], internetGateways: [],
      natGateways: [], apiGateways: [], ecsClusters: [], ecsServices: [],
      eksClusters: [], cloudFrontDistributions: [], wafWebACLs: [],
      kmsKeys: [], ebsVolumes: [], snapshots: [], cloudTrails: [],
      guardDutyDetectors: [], securityHubEnabled: false, configRecorders: [],
      secretsManagerSecrets: [], parameterStoreParams: [], dynamoDBTables: [],
      efsFileSystems: []
    };

    // ==================== PHASE 1: COMPREHENSIVE DATA COLLECTION ====================
    console.log(`📥 PHASE 1: ${levelConfig.name} resource enumeration...`);
    
    for (const scanRegion of regionsToScan) {
      console.log(`🔍 [${scanRegion}] Resource collection (${scanLevel})...`);
      
      let regionCreds: AWSCredentials;
      try {
        regionCreds = await getResolvedAWSCredentials(credentials, scanRegion);
      } catch (e) {
        console.warn(`⚠️ Failed to get credentials for ${scanRegion}`);
        continue;
      }

      // Parallel collection - adjust based on scan level
      const basicPromises: Promise<any>[] = [
        describeEC2Instances(regionCreds, scanRegion),
        describeAllSecurityGroups(regionCreds, scanRegion),
        describeLoadBalancers(regionCreds, scanRegion),
        describeRDSInstances(regionCreds, scanRegion),
      ];
      
      const advancedPromises: Promise<any>[] = scanLevel !== 'basic' ? [
        listLambdaFunctions(regionCreds, scanRegion),
        describeVPCs(regionCreds, scanRegion),
        describeSubnets(regionCreds, scanRegion),
        describeNACLs(regionCreds, scanRegion),
        describeEBSVolumes(regionCreds, scanRegion),
        describeCloudTrails(regionCreds, scanRegion),
        describeECSClusters(regionCreds, scanRegion),
      ] : [];
      
      const militaryPromises: Promise<any>[] = levelConfig.includeSnapshots ? [
        describeEBSSnapshots(regionCreds, scanRegion),
      ] : [];

      const allPromises = [...basicPromises, ...advancedPromises, ...militaryPromises];
      const results = await Promise.allSettled(allPromises);

      // Map results back
      let idx = 0;
      if (results[idx]?.status === 'fulfilled') allResources.ec2Instances.push(...(results[idx] as any).value.map((r: any) => ({ ...r, region: scanRegion }))); idx++;
      if (results[idx]?.status === 'fulfilled') allResources.securityGroups.push(...(results[idx] as any).value.map((r: any) => ({ ...r, region: scanRegion }))); idx++;
      if (results[idx]?.status === 'fulfilled') allResources.loadBalancers.push(...(results[idx] as any).value.map((r: any) => ({ ...r, region: scanRegion }))); idx++;
      if (results[idx]?.status === 'fulfilled') allResources.rdsInstances.push(...(results[idx] as any).value.map((r: any) => ({ ...r, region: scanRegion }))); idx++;
      
      if (scanLevel !== 'basic') {
        if (results[idx]?.status === 'fulfilled') allResources.lambdaFunctions.push(...(results[idx] as any).value.map((r: any) => ({ ...r, region: scanRegion }))); idx++;
        if (results[idx]?.status === 'fulfilled') allResources.vpcs.push(...(results[idx] as any).value.map((r: any) => ({ ...r, region: scanRegion }))); idx++;
        if (results[idx]?.status === 'fulfilled') allResources.subnets.push(...(results[idx] as any).value.map((r: any) => ({ ...r, region: scanRegion }))); idx++;
        if (results[idx]?.status === 'fulfilled') allResources.nacls.push(...(results[idx] as any).value.map((r: any) => ({ ...r, region: scanRegion }))); idx++;
        if (results[idx]?.status === 'fulfilled') allResources.ebsVolumes.push(...(results[idx] as any).value.map((r: any) => ({ ...r, region: scanRegion }))); idx++;
        if (results[idx]?.status === 'fulfilled') allResources.cloudTrails.push(...(results[idx] as any).value.map((r: any) => ({ ...r, region: scanRegion }))); idx++;
        if (results[idx]?.status === 'fulfilled') allResources.ecsClusters.push(...(results[idx] as any).value.map((r: any) => ({ ...r, region: scanRegion }))); idx++;
      }
      
      if (levelConfig.includeSnapshots && results[idx]?.status === 'fulfilled') {
        allResources.snapshots.push(...(results[idx] as any).value.map((r: any) => ({ ...r, region: scanRegion })));
      }
    }

    // Global resources (IAM, S3, CloudFront)
    console.log('🌐 Collecting global resources...');
    const globalCreds = await getResolvedAWSCredentials(credentials, 'us-east-1');
    
    const globalPromises: Promise<any>[] = [listS3Buckets(globalCreds)];
    
    if (levelConfig.includeDeepIAM) {
      globalPromises.push(listIAMUsers(globalCreds), listIAMRoles(globalCreds));
    }
    
    if (scanLevel !== 'basic') {
      globalPromises.push(listCloudFrontDistributions(globalCreds));
    }

    const globalResults = await Promise.allSettled(globalPromises);
    
    let gIdx = 0;
    if (globalResults[gIdx]?.status === 'fulfilled') allResources.s3Buckets = (globalResults[gIdx] as any).value; gIdx++;
    
    if (levelConfig.includeDeepIAM) {
      if (globalResults[gIdx]?.status === 'fulfilled') allResources.iamUsers = (globalResults[gIdx] as any).value; gIdx++;
      if (globalResults[gIdx]?.status === 'fulfilled') allResources.iamRoles = (globalResults[gIdx] as any).value; gIdx++;
    }
    
    if (scanLevel !== 'basic' && globalResults[gIdx]?.status === 'fulfilled') {
      allResources.cloudFrontDistributions = (globalResults[gIdx] as any).value;
    }

    console.log(`📊 Resources enumerated: EC2=${allResources.ec2Instances.length}, SG=${allResources.securityGroups.length}, RDS=${allResources.rdsInstances.length}, S3=${allResources.s3Buckets.length}${levelConfig.includeDeepIAM ? `, IAM Users=${allResources.iamUsers.length}` : ''}`);

    // ==================== PHASE 2: SECURITY ANALYSIS ====================
    console.log(`🔒 PHASE 2: ${levelConfig.name} security analysis...`);

    // Build security group lookup for correlation
    const sgLookup = new Map<string, any>();
    for (const sg of allResources.securityGroups) {
      if (sg.GroupId) sgLookup.set(sg.GroupId, sg);
    }

    // 2.1 EC2 ANALYSIS - MAXIMUM RIGOR
    console.log('🖥️ EC2 Analysis (Military Grade)...');
    for (const instance of allResources.ec2Instances) {
      if (!instance.InstanceId) continue;
      
      const instanceId = instance.InstanceId;
      const accountId = credentials.account_id || '000000000000';
      const instanceArn = `arn:aws:ec2:${instance.region}:${accountId}:instance/${instanceId}`;
      const publicIp = instance.PublicIpAddress;

      const sgIds = instance.SecurityGroups?.map((sg: any) => sg.GroupId) || [];
      const instanceSGs = sgIds.map((id: string) => sgLookup.get(id)).filter(Boolean);

      // ===== CRITICAL: Public exposure with ANY open port =====
      if (publicIp) {
        for (const sg of instanceSGs) {
          // Check each critical port
          for (const [port, portName] of Object.entries(CRITICAL_PORTS)) {
            const portNum = parseInt(port);
            const isOpenToWorld = sg.IpPermissions?.some((rule: any) => 
              (rule.FromPort <= portNum && rule.ToPort >= portNum || rule.FromPort === -1) &&
              rule.IpRanges?.some((range: any) => range.CidrIp === '0.0.0.0/0' || range.CidrIp === '::/0')
            );

            if (isOpenToWorld) {
              findings.push({
                severity: 'critical',
                title: `EC2 Exposta: ${portName} (${port}) Aberta ao Mundo`,
                description: `Instância ${instanceId} (${publicIp}) com porta ${port}/${portName} acessível de 0.0.0.0/0`,
                analysis: `RISCO CRÍTICO IMEDIATO: Vetor de ataque direto. A porta ${port} (${portName}) está exposta globalmente, permitindo ataques de força bruta, exploração de CVEs conhecidos, e acesso não autorizado. IMPACTO: Comprometimento total do servidor, movimentação lateral, exfiltração de dados. AÇÃO IMEDIATA: (1) Restringir SG para IPs autorizados, (2) Implementar VPN/Bastion, (3) Usar SSM Session Manager.`,
                resource_id: instanceId,
                resource_arn: instanceArn,
                scan_type: 'ec2_critical_port_exposure',
                service: 'EC2',
                category: 'Network Exposure',
                compliance: ['CIS 5.2', 'PCI-DSS 1.3.1', 'LGPD Art.46'],
                remediation: `aws ec2 revoke-security-group-ingress --group-id ${sg.GroupId} --protocol tcp --port ${port} --cidr 0.0.0.0/0`,
                risk_vector: 'network_exposure',
                evidence: { instanceId, arn: instanceArn, publicIp, port: portNum, portName, securityGroup: sg.GroupId, region: instance.region }
              });
            }
          }

          // ALL TRAFFIC OPEN - MAXIMUM SEVERITY
          const hasAllTrafficOpen = sg.IpPermissions?.some((rule: any) => 
            rule.FromPort === -1 && 
            rule.IpRanges?.some((range: any) => range.CidrIp === '0.0.0.0/0')
          );

          if (hasAllTrafficOpen) {
            findings.push({
              severity: 'critical',
              title: `ALERTA MÁXIMO: EC2 com TODO Tráfego Aberto`,
              description: `SG ${sg.GroupId} permite ALL TRAFFIC de 0.0.0.0/0 para ${instanceId}`,
              analysis: `RISCO CRÍTICO MÁXIMO: Security Group completamente aberto. Todos os 65535 portas TCP/UDP expostas. Equivalente a não ter firewall. IMPACTO: Comprometimento garantido se houver qualquer serviço vulnerável. AÇÃO: Remover regra IMEDIATAMENTE e criar regras específicas.`,
              resource_id: instanceId,
              resource_arn: instanceArn,
              scan_type: 'ec2_all_traffic_open',
              service: 'EC2',
              category: 'Maximum Exposure',
              compliance: ['CIS 5.2', 'CIS 5.3', 'PCI-DSS 1.2', 'SOC2 CC6.6'],
              risk_vector: 'total_exposure',
              evidence: { instanceId, publicIp, securityGroup: sg.GroupId, rule: 'ALL TRAFFIC 0.0.0.0/0', region: instance.region }
            });
          }
        }
      }

      // IMDSv1 - CRITICAL (not just high)
      if (instance.MetadataOptions?.HttpTokens !== 'required') {
        findings.push({
          severity: 'critical',
          title: `EC2 Vulnerável a SSRF (IMDSv1)`,
          description: `${instanceId} aceita IMDSv1, vulnerável a Server-Side Request Forgery`,
          analysis: `RISCO CRÍTICO: IMDSv1 habilitado permite que qualquer vulnerabilidade SSRF na aplicação resulte em roubo de credenciais IAM. Capital One breach (2019) explorou exatamente isso - $80M em multas. IMPACTO: Roubo de role credentials, privilege escalation. AÇÃO: Forçar IMDSv2 com HttpTokens=required.`,
          resource_id: instanceId,
          resource_arn: instanceArn,
          scan_type: 'ec2_imdsv1_vulnerable',
          service: 'EC2',
          category: 'Credential Theft Risk',
          compliance: ['CIS 5.6', 'AWS Well-Architected SEC05-BP03'],
          remediation: `aws ec2 modify-instance-metadata-options --instance-id ${instanceId} --http-tokens required`,
          risk_vector: 'credential_theft',
          evidence: { instanceId, httpTokens: instance.MetadataOptions?.HttpTokens || 'optional', region: instance.region }
        });
      }

      // Missing IAM Role - Using static credentials
      if (!instance.IamInstanceProfile) {
        findings.push({
          severity: 'high',
          title: `EC2 sem IAM Role (Credenciais Estáticas Prováveis)`,
          description: `${instanceId} sem Instance Profile - provavelmente usa Access Keys hardcoded`,
          analysis: `RISCO ALTO: Sem IAM Role, aplicações na instância provavelmente usam Access Keys estáticos, que não rotacionam automaticamente e podem ser exfiltrados. IMPACTO: Credenciais persistentes que sobrevivem restart, difíceis de revogar. AÇÃO: Criar IAM Role com least privilege e associar à instância.`,
          resource_id: instanceId,
          resource_arn: instanceArn,
          scan_type: 'ec2_no_iam_role',
          service: 'EC2',
          category: 'Identity',
          compliance: ['CIS 4.1', 'AWS Well-Architected SEC02-BP02'],
          risk_vector: 'static_credentials',
          evidence: { instanceId, iamProfile: null, region: instance.region }
        });
      }
    }

    // 2.2 RDS ANALYSIS - MAXIMUM RIGOR
    console.log('🗄️ RDS Analysis (Military Grade)...');
    for (const db of allResources.rdsInstances) {
      if (!db.DBInstanceIdentifier) continue;
      
      const dbId = db.DBInstanceIdentifier;
      const accountId = credentials.account_id || '000000000000';
      const dbArn = `arn:aws:rds:${db.region}:${accountId}:db:${dbId}`;

      // PUBLIC ACCESS - ALWAYS CRITICAL
      if (db.PubliclyAccessible) {
        findings.push({
          severity: 'critical',
          title: `RDS PÚBLICO: ${dbId} Acessível da Internet`,
          description: `Database ${dbId} com PubliclyAccessible=true - endpoint público`,
          analysis: `RISCO CRÍTICO MÁXIMO: Database exposto à internet. Mesmo com SG restritivo, o DNS é público e pode ser descoberto. Ataques: brute force, SQL injection via internet, enumeração. IMPACTO: Vazamento total de dados, violação LGPD/GDPR, ransomware. AÇÃO IMEDIATA: Desabilitar PubliclyAccessible.`,
          resource_id: dbId,
          resource_arn: dbArn,
          scan_type: 'rds_public_critical',
          service: 'RDS',
          category: 'Data Exposure',
          compliance: ['CIS 4.1.3', 'PCI-DSS 2.2.2', 'LGPD Art.46', 'HIPAA 164.312'],
          remediation: `aws rds modify-db-instance --db-instance-identifier ${dbId} --no-publicly-accessible --apply-immediately`,
          risk_vector: 'data_exposure',
          evidence: { dbInstanceId: dbId, arn: dbArn, publiclyAccessible: true, region: db.region }
        });
      }

      // NO ENCRYPTION - CRITICAL FOR PRODUCTION
      if (!db.StorageEncrypted) {
        findings.push({
          severity: 'critical',
          title: `RDS sem Criptografia: Dados em Texto Puro`,
          description: `${dbId} armazena dados sem encryption at-rest`,
          analysis: `RISCO CRÍTICO: Dados armazenados em texto puro. Qualquer acesso ao storage físico (insider, backup comprometido, snapshot compartilhado) expõe todos os dados. VIOLAÇÃO DIRETA de LGPD Art.46, GDPR Art.32, HIPAA, PCI-DSS. AÇÃO: Migrar para instância criptografada (requer novo RDS).`,
          resource_id: dbId,
          resource_arn: dbArn,
          scan_type: 'rds_no_encryption',
          service: 'RDS',
          category: 'Data Protection',
          compliance: ['CIS 4.1.1', 'PCI-DSS 3.4', 'LGPD Art.46', 'GDPR Art.32', 'HIPAA 164.312(a)(2)(iv)'],
          risk_vector: 'unencrypted_data',
          evidence: { dbInstanceId: dbId, storageEncrypted: false, region: db.region }
        });
      }

      // NO BACKUP - CRITICAL
      if ((db.BackupRetentionPeriod || 0) === 0) {
        findings.push({
          severity: 'critical',
          title: `RDS sem Backup: Perda de Dados Iminente`,
          description: `${dbId} sem backup automático - qualquer falha é catastrófica`,
          analysis: `RISCO CRÍTICO: Sem backup, qualquer falha, corrupção, ransomware ou erro humano resulta em PERDA TOTAL E IRREVERSÍVEL de dados. IMPACTO: Business continuity comprometida, violação de SLAs, danos legais. AÇÃO IMEDIATA: Habilitar backup com retenção mínima 7 dias (recomendado: 35).`,
          resource_id: dbId,
          resource_arn: dbArn,
          scan_type: 'rds_no_backup',
          service: 'RDS',
          category: 'Data Protection',
          compliance: ['CIS 4.1.4', 'SOC2 A1.2', 'ISO27001 A.12.3'],
          remediation: `aws rds modify-db-instance --db-instance-identifier ${dbId} --backup-retention-period 35`,
          risk_vector: 'data_loss',
          evidence: { dbInstanceId: dbId, backupRetentionPeriod: 0, region: db.region }
        });
      } else if ((db.BackupRetentionPeriod || 0) < 7) {
        findings.push({
          severity: 'high',
          title: `RDS Backup Insuficiente (${db.BackupRetentionPeriod} dias)`,
          description: `${dbId} com retenção de apenas ${db.BackupRetentionPeriod} dias`,
          analysis: `RISCO ALTO: Retenção de ${db.BackupRetentionPeriod} dias é insuficiente. Problemas descobertos após esse período são irrecuperáveis. AÇÃO: Aumentar para mínimo 7 dias, idealmente 35.`,
          resource_id: dbId,
          resource_arn: dbArn,
          scan_type: 'rds_low_backup',
          service: 'RDS',
          category: 'Data Protection',
          compliance: ['CIS 4.1.4', 'SOC2 A1.2'],
          risk_vector: 'data_loss',
          evidence: { dbInstanceId: dbId, backupRetentionPeriod: db.BackupRetentionPeriod, region: db.region }
        });
      }

      // NO MULTI-AZ - HIGH for production
      if (!db.MultiAZ) {
        findings.push({
          severity: 'high',
          title: `RDS Single-AZ: Sem Alta Disponibilidade`,
          description: `${dbId} opera em zona única - falha de AZ = indisponibilidade total`,
          analysis: `RISCO ALTO: Sem Multi-AZ, uma falha de zona de disponibilidade causa downtime completo. RPO/RTO comprometidos. IMPACTO: Indisponibilidade potencial de horas. AÇÃO: Habilitar Multi-AZ para failover automático.`,
          resource_id: dbId,
          resource_arn: dbArn,
          scan_type: 'rds_single_az',
          service: 'RDS',
          category: 'Availability',
          compliance: ['AWS Well-Architected REL10-BP01', 'SOC2 A1.1'],
          risk_vector: 'availability',
          evidence: { dbInstanceId: dbId, multiAZ: false, region: db.region }
        });
      }

      // NO DELETION PROTECTION
      if (!db.DeletionProtection) {
        findings.push({
          severity: 'high',
          title: `RDS sem Proteção contra Deleção Acidental`,
          description: `${dbId} pode ser deletado com um único comando`,
          analysis: `RISCO ALTO: Sem deletion protection, o database pode ser deletado acidentalmente ou maliciosamente. AÇÃO: Habilitar DeletionProtection.`,
          resource_id: dbId,
          resource_arn: dbArn,
          scan_type: 'rds_no_deletion_protection',
          service: 'RDS',
          category: 'Data Protection',
          compliance: ['CIS 4.1.5', 'SOC2 CC6.1'],
          remediation: `aws rds modify-db-instance --db-instance-identifier ${dbId} --deletion-protection`,
          risk_vector: 'accidental_deletion',
          evidence: { dbInstanceId: dbId, deletionProtection: false, region: db.region }
        });
      }
    }

    // 2.3 LOAD BALANCER ANALYSIS
    console.log('⚖️ Load Balancer Analysis (Military Grade)...');
    for (const lb of allResources.loadBalancers) {
      if (!lb.LoadBalancerArn) continue;
      
      const lbArn = lb.LoadBalancerArn;
      const lbName = lb.LoadBalancerName || lbArn.split('/').pop();

      if (lb.Scheme === 'internet-facing') {
        const hasWAF = await checkWAFAssociation(globalCreds, lb.region, lbArn);
        
        if (!hasWAF) {
          findings.push({
            severity: 'critical',
            title: `Load Balancer Público sem WAF: ${lbName}`,
            description: `ALB/NLB ${lbName} exposto à internet sem AWS WAF`,
            analysis: `RISCO CRÍTICO: Load Balancer público sem WAF está completamente exposto a ataques web: SQL Injection, XSS, Bot attacks, DDoS L7, OWASP Top 10. IMPACTO: Comprometimento de aplicações backend. AÇÃO: Criar WAF WebACL com managed rules e associar ao LB.`,
            resource_id: lbName,
            resource_arn: lbArn,
            scan_type: 'elb_no_waf',
            service: 'ELB',
            category: 'Web Application Security',
            compliance: ['CIS 5.4', 'PCI-DSS 6.6', 'OWASP Top 10'],
            remediation: `aws wafv2 associate-web-acl --web-acl-arn <WAF_ARN> --resource-arn ${lbArn}`,
            risk_vector: 'web_attacks',
            evidence: { arn: lbArn, name: lbName, scheme: lb.Scheme, waf: false, region: lb.region }
          });
        }
      }
    }

    // 2.4 S3 ANALYSIS - ZERO TOLERANCE
    console.log('📦 S3 Analysis (Military Grade)...');
    for (const bucket of allResources.s3Buckets) {
      const bucketName = bucket.Name;
      if (!bucketName) continue;

      const publicAccessConfig = await getS3PublicAccessBlock(globalCreds, bucketName);
      
      // ANY missing block = CRITICAL
      if (!publicAccessConfig || 
          !publicAccessConfig.BlockPublicAcls || 
          !publicAccessConfig.BlockPublicPolicy ||
          !publicAccessConfig.IgnorePublicAcls ||
          !publicAccessConfig.RestrictPublicBuckets) {
        
        const missingBlocks = [];
        if (!publicAccessConfig?.BlockPublicAcls) missingBlocks.push('BlockPublicAcls');
        if (!publicAccessConfig?.BlockPublicPolicy) missingBlocks.push('BlockPublicPolicy');
        if (!publicAccessConfig?.IgnorePublicAcls) missingBlocks.push('IgnorePublicAcls');
        if (!publicAccessConfig?.RestrictPublicBuckets) missingBlocks.push('RestrictPublicBuckets');

        findings.push({
          severity: 'critical',
          title: `S3 Potencialmente Público: ${bucketName}`,
          description: `Block Public Access incompleto: faltam ${missingBlocks.join(', ')}`,
          analysis: `RISCO CRÍTICO: Bucket ${bucketName} não possui todas as proteções de Block Public Access. Configurações faltantes: ${missingBlocks.join(', ')}. IMPACTO: Dados podem ser expostos publicamente por ACLs ou políticas permissivas. VIOLAÇÃO: LGPD Art.46, GDPR Art.32. AÇÃO: Habilitar todos os 4 bloqueios.`,
          resource_id: bucketName,
          resource_arn: `arn:aws:s3:::${bucketName}`,
          scan_type: 's3_incomplete_public_block',
          service: 'S3',
          category: 'Data Exposure',
          compliance: ['CIS 2.1.1', 'CIS 2.1.2', 'LGPD Art.46', 'GDPR Art.32', 'PCI-DSS 3.1'],
          risk_vector: 'data_exposure',
          evidence: { bucket: bucketName, publicAccessBlock: publicAccessConfig, missingBlocks }
        });
      }

      // Check encryption
      const hasEncryption = await getS3Encryption(globalCreds, bucketName);
      if (!hasEncryption) {
        findings.push({
          severity: 'high',
          title: `S3 sem Criptografia Padrão: ${bucketName}`,
          description: `Bucket ${bucketName} permite objetos sem criptografia`,
          analysis: `RISCO ALTO: Sem default encryption, objetos podem ser armazenados sem proteção. AÇÃO: Configurar SSE-S3 ou SSE-KMS como padrão.`,
          resource_id: bucketName,
          resource_arn: `arn:aws:s3:::${bucketName}`,
          scan_type: 's3_no_encryption',
          service: 'S3',
          category: 'Data Protection',
          compliance: ['CIS 2.1.3', 'PCI-DSS 3.4', 'LGPD Art.46'],
          risk_vector: 'unencrypted_data',
          evidence: { bucket: bucketName, encryption: false }
        });
      }

      // Check versioning
      const versioning = await getS3Versioning(globalCreds, bucketName);
      if (versioning !== 'Enabled') {
        findings.push({
          severity: 'high',
          title: `S3 sem Versionamento: ${bucketName}`,
          description: `Bucket ${bucketName} sem proteção contra deleção/sobrescrita`,
          analysis: `RISCO ALTO: Sem versioning, deleções e sobrescritas são irreversíveis. Vulnerável a ransomware e erros humanos. AÇÃO: Habilitar versioning.`,
          resource_id: bucketName,
          resource_arn: `arn:aws:s3:::${bucketName}`,
          scan_type: 's3_no_versioning',
          service: 'S3',
          category: 'Data Protection',
          compliance: ['CIS 2.1.4', 'SOC2 A1.2'],
          risk_vector: 'data_loss',
          evidence: { bucket: bucketName, versioning: versioning || 'Disabled' }
        });
      }
    }

    // 2.5 EBS ANALYSIS
    console.log('💾 EBS Analysis (Military Grade)...');
    for (const volume of allResources.ebsVolumes) {
      if (!volume.VolumeId) continue;
      
      const volumeId = volume.VolumeId;
      const volumeArn = `arn:aws:ec2:${volume.region}:${credentials.account_id}:volume/${volumeId}`;

      if (!volume.Encrypted) {
        findings.push({
          severity: 'high',
          title: `EBS Volume sem Criptografia: ${volumeId}`,
          description: `Volume ${volumeId} armazena dados em texto puro`,
          analysis: `RISCO ALTO: Volume EBS não criptografado. Dados expostos em snapshots compartilhados ou acesso físico. AÇÃO: Criar novo volume criptografado e migrar dados.`,
          resource_id: volumeId,
          resource_arn: volumeArn,
          scan_type: 'ebs_no_encryption',
          service: 'EBS',
          category: 'Data Protection',
          compliance: ['CIS 2.2.1', 'PCI-DSS 3.4', 'LGPD Art.46'],
          risk_vector: 'unencrypted_data',
          evidence: { volumeId, encrypted: false, region: volume.region }
        });
      }
    }

    // 2.6 SNAPSHOT ANALYSIS
    console.log('📸 Snapshot Analysis (Military Grade)...');
    for (const snapshot of allResources.snapshots) {
      if (!snapshot.SnapshotId) continue;
      
      const snapshotId = snapshot.SnapshotId;
      const snapshotArn = `arn:aws:ec2:${snapshot.region}:${credentials.account_id}:snapshot/${snapshotId}`;

      const isPublic = await checkSnapshotPublicAccess(globalCreds, snapshot.region, snapshotId);
      if (isPublic) {
        findings.push({
          severity: 'critical',
          title: `SNAPSHOT PÚBLICO: ${snapshotId}`,
          description: `Snapshot ${snapshotId} compartilhado com TODAS as contas AWS`,
          analysis: `RISCO CRÍTICO MÁXIMO: Snapshot público permite que qualquer conta AWS copie e acesse os dados. IMPACTO: Vazamento total de dados do volume. AÇÃO IMEDIATA: Remover permissão pública.`,
          resource_id: snapshotId,
          resource_arn: snapshotArn,
          scan_type: 'snapshot_public',
          service: 'EBS',
          category: 'Data Exposure',
          compliance: ['CIS 2.2.2', 'LGPD Art.46', 'PCI-DSS 3.1'],
          remediation: `aws ec2 modify-snapshot-attribute --snapshot-id ${snapshotId} --attribute createVolumePermission --operation-type remove --group-names all`,
          risk_vector: 'data_exposure',
          evidence: { snapshotId, public: true, region: snapshot.region }
        });
      }

      if (!snapshot.Encrypted) {
        findings.push({
          severity: 'medium',
          title: `Snapshot sem Criptografia: ${snapshotId}`,
          description: `Snapshot ${snapshotId} não está criptografado`,
          analysis: `RISCO MÉDIO: Snapshot sem criptografia pode expor dados se compartilhado. AÇÃO: Copiar snapshot com encryption habilitada.`,
          resource_id: snapshotId,
          resource_arn: snapshotArn,
          scan_type: 'snapshot_no_encryption',
          service: 'EBS',
          category: 'Data Protection',
          compliance: ['CIS 2.2.1'],
          risk_vector: 'unencrypted_data',
          evidence: { snapshotId, encrypted: false, region: snapshot.region }
        });
      }
    }

    // 2.7 LAMBDA ANALYSIS
    console.log('⚡ Lambda Analysis (Military Grade)...');
    for (const func of allResources.lambdaFunctions) {
      if (!func.FunctionName) continue;
      
      const funcName = func.FunctionName;
      const funcArn = func.FunctionArn || `arn:aws:lambda:${func.region}:${credentials.account_id}:function:${funcName}`;

      // Outdated runtime - CRITICAL in military grade
      if (OUTDATED_RUNTIMES.includes(func.Runtime)) {
        findings.push({
          severity: 'critical',
          title: `Lambda com Runtime EOL: ${funcName} (${func.Runtime})`,
          description: `Função ${funcName} usa runtime ${func.Runtime} sem suporte de segurança`,
          analysis: `RISCO CRÍTICO: Runtime ${func.Runtime} está End-of-Life e não recebe patches de segurança. Vulnerabilidades conhecidas não serão corrigidas. IMPACTO: Exploração de CVEs conhecidos. AÇÃO: Migrar para runtime suportado.`,
          resource_id: funcName,
          resource_arn: funcArn,
          scan_type: 'lambda_eol_runtime',
          service: 'Lambda',
          category: 'Vulnerability Management',
          compliance: ['CIS 2.3.1', 'PCI-DSS 6.2'],
          risk_vector: 'unpatched_vulnerability',
          evidence: { functionName: funcName, runtime: func.Runtime, region: func.region }
        });
      }

      // No KMS encryption
      if (!func.KMSKeyArn) {
        findings.push({
          severity: 'medium',
          title: `Lambda sem CMK: ${funcName}`,
          description: `Função ${funcName} usa criptografia AWS gerenciada`,
          analysis: `RISCO MÉDIO: Lambda ${funcName} não usa Customer Managed Key para variáveis de ambiente. Sem CMK, não há controle granular sobre acesso às chaves. AÇÃO: Configurar KMS CMK.`,
          resource_id: funcName,
          resource_arn: funcArn,
          scan_type: 'lambda_no_cmk',
          service: 'Lambda',
          category: 'Encryption',
          compliance: ['CIS 2.3.2'],
          risk_vector: 'key_management',
          evidence: { functionName: funcName, kmsKey: null, region: func.region }
        });
      }
    }

    // 2.8 VPC FLOW LOGS ANALYSIS
    console.log('🌊 VPC Flow Logs Analysis (Military Grade)...');
    for (const vpc of allResources.vpcs) {
      if (!vpc.VpcId) continue;
      
      const vpcId = vpc.VpcId;
      const hasFlowLogs = await checkVPCFlowLogs(globalCreds, vpc.region, vpcId);
      
      if (!hasFlowLogs) {
        findings.push({
          severity: 'critical',
          title: `VPC sem Flow Logs: ${vpcId} - Cego para Tráfego`,
          description: `VPC ${vpcId} não possui logging de tráfego de rede`,
          analysis: `RISCO CRÍTICO: Sem Flow Logs, não há visibilidade de tráfego. Impossibilita: detecção de exfiltração, investigação forense, detecção de movimentação lateral, compliance auditing. IMPACTO: Incidentes passam despercebidos. AÇÃO: Habilitar VPC Flow Logs para CloudWatch ou S3.`,
          resource_id: vpcId,
          resource_arn: `arn:aws:ec2:${vpc.region}:${credentials.account_id}:vpc/${vpcId}`,
          scan_type: 'vpc_no_flow_logs',
          service: 'VPC',
          category: 'Logging & Monitoring',
          compliance: ['CIS 3.9', 'PCI-DSS 10.2', 'SOC2 CC7.2'],
          risk_vector: 'no_visibility',
          evidence: { vpcId, flowLogs: false, region: vpc.region }
        });
      }
    }

    // 2.9 NACL ANALYSIS
    console.log('🚧 NACL Analysis (Military Grade)...');
    for (const nacl of allResources.nacls) {
      if (!nacl.NetworkAclId || nacl.IsDefault) continue;
      
      const naclId = nacl.NetworkAclId;
      
      const hasAllTrafficAllow = nacl.Entries?.some((entry: any) => 
        entry.RuleAction === 'allow' && 
        entry.CidrBlock === '0.0.0.0/0' &&
        entry.Protocol === '-1'
      );

      if (hasAllTrafficAllow) {
        findings.push({
          severity: 'high',
          title: `NACL Permissiva: ${naclId} (Todo Tráfego)`,
          description: `NACL ${naclId} permite todo tráfego de qualquer origem`,
          analysis: `RISCO ALTO: NACL permite all traffic, anulando primeira linha de defesa. AÇÃO: Criar regras específicas para portas/protocolos necessários.`,
          resource_id: naclId,
          resource_arn: `arn:aws:ec2:${nacl.region}:${credentials.account_id}:network-acl/${naclId}`,
          scan_type: 'nacl_permissive',
          service: 'VPC',
          category: 'Network Security',
          compliance: ['CIS 5.1', 'PCI-DSS 1.3'],
          risk_vector: 'network_exposure',
          evidence: { naclId, region: nacl.region }
        });
      }
    }

    // 2.10 IAM ANALYSIS - MAXIMUM RIGOR
    console.log('👤 IAM Analysis (Military Grade)...');
    for (const user of allResources.iamUsers) {
      if (!user.UserName) continue;
      
      const [accessKeysResult, mfaResult] = await Promise.allSettled([
        listAccessKeys(globalCreds, user.UserName),
        listMFADevices(globalCreds, user.UserName),
      ]);

      const accessKeys = accessKeysResult.status === 'fulfilled' ? accessKeysResult.value : [];
      const mfaDevices = mfaResult.status === 'fulfilled' ? mfaResult.value : [];

      // NO MFA - CRITICAL
      if (mfaDevices.length === 0) {
        findings.push({
          severity: 'critical',
          title: `IAM User sem MFA: ${user.UserName}`,
          description: `Usuário ${user.UserName} sem autenticação multi-fator`,
          analysis: `RISCO CRÍTICO: Conta IAM sem MFA é altamente vulnerável a credential stuffing, phishing, password spray. Uma senha comprometida = acesso total à AWS. IMPACTO: Comprometimento de conta com potencial privilege escalation. AÇÃO IMEDIATA: Habilitar MFA (preferência: hardware key ou WebAuthn).`,
          resource_id: user.UserName,
          resource_arn: user.Arn,
          scan_type: 'iam_no_mfa',
          service: 'IAM',
          category: 'Identity',
          compliance: ['CIS 1.10', 'CIS 1.14', 'PCI-DSS 8.3', 'SOC2 CC6.1'],
          risk_vector: 'credential_compromise',
          evidence: { userName: user.UserName, arn: user.Arn, mfaEnabled: false }
        });
      }

      // Access key age analysis
      for (const key of accessKeys) {
        if (!key.CreateDate || key.Status !== 'Active') continue;
        
        const createDate = new Date(key.CreateDate);
        const daysOld = Math.floor((Date.now() - createDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysOld > 180) {
          findings.push({
            severity: 'critical',
            title: `Access Key Antiga (${daysOld} dias): ${user.UserName}`,
            description: `Chave ${key.AccessKeyId} com ${daysOld} dias sem rotação`,
            analysis: `RISCO CRÍTICO: Chave de acesso com mais de 180 dias. Quanto mais antiga, maior a probabilidade de ter sido comprometida em algum ponto. AWS recomenda rotação a cada 90 dias. AÇÃO: Rotacionar imediatamente.`,
            resource_id: user.UserName,
            resource_arn: user.Arn,
            scan_type: 'iam_key_ancient',
            service: 'IAM',
            category: 'Identity',
            compliance: ['CIS 1.12', 'PCI-DSS 8.2.4', 'SOC2 CC6.1'],
            risk_vector: 'credential_compromise',
            evidence: { userName: user.UserName, keyId: key.AccessKeyId, ageInDays: daysOld }
          });
        } else if (daysOld > 90) {
          findings.push({
            severity: 'high',
            title: `Access Key Expirada (${daysOld} dias): ${user.UserName}`,
            description: `Chave ${key.AccessKeyId} ultrapassa 90 dias recomendados`,
            analysis: `RISCO ALTO: Chave de acesso com ${daysOld} dias. Rotação a cada 90 dias é best practice. AÇÃO: Criar nova chave, atualizar aplicações, desativar antiga.`,
            resource_id: user.UserName,
            resource_arn: user.Arn,
            scan_type: 'iam_key_old',
            service: 'IAM',
            category: 'Identity',
            compliance: ['CIS 1.12', 'PCI-DSS 8.2.4'],
            risk_vector: 'credential_compromise',
            evidence: { userName: user.UserName, keyId: key.AccessKeyId, ageInDays: daysOld }
          });
        }
      }
    }

    // 2.11 CLOUDTRAIL ANALYSIS
    console.log('📜 CloudTrail Analysis (Military Grade)...');
    if (allResources.cloudTrails.length === 0) {
      findings.push({
        severity: 'critical',
        title: `CloudTrail DESATIVADO - Sem Auditoria`,
        description: `Nenhum CloudTrail encontrado nas regiões escaneadas`,
        analysis: `RISCO CRÍTICO MÁXIMO: Sem CloudTrail, não há registro de ações na AWS. Impossibilita: detecção de atividade maliciosa, investigação forense, compliance auditing, detecção de insider threat. IMPACTO: Ataques passam completamente despercebidos. AÇÃO IMEDIATA: Criar trail multi-região.`,
        resource_id: 'cloudtrail',
        scan_type: 'cloudtrail_disabled',
        service: 'CloudTrail',
        category: 'Logging & Monitoring',
        compliance: ['CIS 3.1', 'CIS 3.2', 'PCI-DSS 10.1', 'SOC2 CC7.1', 'HIPAA 164.312(b)'],
        risk_vector: 'no_audit_trail',
        evidence: { trails: 0, regions: regionsToScan }
      });
    } else {
      for (const trail of allResources.cloudTrails) {
        if (!trail.IsMultiRegionTrail) {
          findings.push({
            severity: 'high',
            title: `CloudTrail Single-Region: ${trail.TrailARN}`,
            description: `Trail não cobre todas as regiões AWS`,
            analysis: `RISCO ALTO: CloudTrail single-region deixa outras regiões sem auditoria. Atacantes podem operar em regiões não monitoradas. AÇÃO: Converter para multi-region trail.`,
            resource_id: trail.TrailARN || 'cloudtrail',
            scan_type: 'cloudtrail_single_region',
            service: 'CloudTrail',
            category: 'Logging & Monitoring',
            compliance: ['CIS 3.1', 'PCI-DSS 10.1'],
            risk_vector: 'incomplete_logging',
            evidence: { trailArn: trail.TrailARN, multiRegion: false, region: trail.region }
          });
        }

        if (!trail.LogFileValidationEnabled) {
          findings.push({
            severity: 'high',
            title: `CloudTrail sem Validação de Integridade`,
            description: `Trail ${trail.TrailARN} não valida integridade de logs`,
            analysis: `RISCO ALTO: Sem log file validation, atacantes podem modificar/deletar logs para cobrir rastros. AÇÃO: Habilitar log file validation.`,
            resource_id: trail.TrailARN || 'cloudtrail',
            scan_type: 'cloudtrail_no_validation',
            service: 'CloudTrail',
            category: 'Logging & Monitoring',
            compliance: ['CIS 3.2', 'PCI-DSS 10.5.5'],
            risk_vector: 'log_tampering',
            evidence: { trailArn: trail.TrailARN, logValidation: false }
          });
        }
      }
    }

    // ==================== PHASE 3: RISK CORRELATION ====================
    console.log('🔗 PHASE 3: Correlating risks for attack vector identification...');
    
    const correlatedRisks: CorrelatedRisk[] = [];
    
    // Correlation: Public EC2 + Open Ports + No IAM Role = Complete Attack Vector
    const publicEC2WithOpenPorts = findings.filter(f => 
      f.scan_type.includes('ec2_critical_port') || f.scan_type === 'ec2_all_traffic_open'
    );
    const ec2WithoutRole = findings.filter(f => f.scan_type === 'ec2_no_iam_role');
    const ec2WithIMDSv1 = findings.filter(f => f.scan_type === 'ec2_imdsv1_vulnerable');

    // Find instances that appear in multiple risk categories
    const riskyInstances = new Set<string>();
    [...publicEC2WithOpenPorts, ...ec2WithoutRole, ...ec2WithIMDSv1].forEach(f => {
      if (f.evidence?.instanceId) riskyInstances.add(f.evidence.instanceId);
    });

    for (const instanceId of riskyInstances) {
      const instanceFindings = findings.filter(f => f.evidence?.instanceId === instanceId);
      if (instanceFindings.length >= 2) {
        const riskTypes = instanceFindings.map(f => f.scan_type);
        
        correlatedRisks.push({
          riskVector: 'compound_ec2_exposure',
          severity: 'critical',
          affectedResources: [instanceId],
          description: `Instância ${instanceId} apresenta múltiplos vetores de risco simultâneos: ${riskTypes.join(', ')}`,
          attackPath: [
            'Internet → Porta aberta',
            'Exploração de serviço',
            'SSRF para IMDS (se IMDSv1)',
            'Credencial estática ou role theft',
            'Movimentação lateral'
          ],
          complianceViolations: ['CIS', 'PCI-DSS', 'SOC2']
        });

        // Add correlated finding
        findings.push({
          severity: 'critical',
          title: `VETOR DE ATAQUE COMPLETO: ${instanceId}`,
          description: `Múltiplas vulnerabilidades correlacionadas formam cadeia de ataque exploitável`,
          analysis: `RISCO CRÍTICO MÁXIMO: A instância ${instanceId} combina ${instanceFindings.length} vulnerabilidades que juntas formam um vetor de ataque completo. Um atacante pode: (1) Acessar via porta exposta, (2) Explorar serviço vulnerável, (3) Roubar credenciais via IMDS ou estáticas, (4) Escalar privilégios e mover lateralmente. PRIORIDADE MÁXIMA DE REMEDIAÇÃO.`,
          resource_id: instanceId,
          scan_type: 'correlated_attack_vector',
          service: 'Security Posture',
          category: 'Attack Vector',
          compliance: ['CIS', 'PCI-DSS', 'SOC2', 'LGPD', 'GDPR'],
          risk_vector: 'complete_attack_chain',
          evidence: { 
            instanceId, 
            correlatedFindings: instanceFindings.length,
            riskTypes,
            attackPath: correlatedRisks[correlatedRisks.length - 1]?.attackPath
          }
        });
      }
    }

    // Correlation: Public RDS + No Encryption + No Backup = Data Catastrophe
    const publicRDS = findings.filter(f => f.scan_type === 'rds_public_critical');
    const unencryptedRDS = findings.filter(f => f.scan_type === 'rds_no_encryption');
    const noBackupRDS = findings.filter(f => f.scan_type === 'rds_no_backup');

    const riskyDatabases = new Set<string>();
    [...publicRDS, ...unencryptedRDS, ...noBackupRDS].forEach(f => {
      if (f.evidence?.dbInstanceId) riskyDatabases.add(f.evidence.dbInstanceId);
    });

    for (const dbId of riskyDatabases) {
      const dbFindings = findings.filter(f => f.evidence?.dbInstanceId === dbId);
      if (dbFindings.length >= 2) {
        findings.push({
          severity: 'critical',
          title: `CATÁSTROFE DE DADOS IMINENTE: ${dbId}`,
          description: `Database combina múltiplos riscos críticos que podem resultar em perda/vazamento total`,
          analysis: `RISCO CRÍTICO MÁXIMO: O database ${dbId} apresenta ${dbFindings.length} vulnerabilidades correlacionadas. Combinação de exposição pública, falta de criptografia e/ou backup ausente cria cenário de catástrofe: vazamento de dados sensíveis + impossibilidade de recuperação. PRIORIDADE MÁXIMA.`,
          resource_id: dbId,
          scan_type: 'correlated_data_catastrophe',
          service: 'RDS',
          category: 'Data Protection',
          compliance: ['LGPD Art.46', 'GDPR Art.32', 'PCI-DSS 3.4', 'HIPAA'],
          risk_vector: 'data_catastrophe',
          evidence: { dbId, correlatedFindings: dbFindings.length, riskTypes: dbFindings.map(f => f.scan_type) }
        });
      }
    }

    // ==================== PHASE 4: SAVE RESULTS ====================
    
    // SECURITY: Delete old findings for this specific account only (not all org findings)
    await supabase
      .from('findings')
      .delete()
      .eq('organization_id', orgId)
      .eq('source', 'security_scan')
      .contains('details', { aws_account_id: credentials.id });

    // Insert new findings
    if (findings.length > 0) {
      const findingsToInsert = findings.map((f, idx) => ({
        organization_id: orgId,
        event_id: `${scanRecord.id}-finding-${idx}`,
        event_name: f.title,
        event_time: new Date().toISOString(),
        user_identity: { type: 'AWSService', service: f.service },
        severity: f.severity,
        description: f.description,
        ai_analysis: f.analysis,
        details: {
          resource_id: f.resource_id,
          resource_arn: f.resource_arn || null,
          service: f.service,
          category: f.category,
          compliance: f.compliance,
          remediation: f.remediation,
          risk_vector: f.risk_vector,
          scan_id: scanRecord.id,
          aws_account_id: credentials.id,
          ...f.evidence
        },
        source: 'security_scan',
        scan_type: f.scan_type,
        status: 'pending',
      }));

      const { error: insertError } = await supabase
        .from('findings')
        .insert(findingsToInsert);

      if (insertError) {
        console.error('Error inserting findings:', insertError);
      } else {
        console.log(`✅ Successfully inserted ${findings.length} findings`);
      }
    }

    // Calculate scores with military-grade weighting
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    const mediumCount = findings.filter(f => f.severity === 'medium').length;
    const lowCount = findings.filter(f => f.severity === 'low').length;

    // Military-grade scoring: Critical findings have exponential impact
    const totalChecks = 300;
    const score = Math.max(0, Math.round(
      100 - (criticalCount * 20) - (highCount * 10) - (mediumCount * 3) - (lowCount * 1)
    ));

    // Update scan record
    await supabase
      .from('security_scans')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_findings: findings.length,
        critical_count: criticalCount,
        high_count: highCount,
        medium_count: mediumCount,
        low_count: lowCount,
      })
      .eq('id', scanRecord.id);

    // Save to history
    await supabase
      .from('security_scans_history')
      .insert({
        organization_id: orgId,
        aws_account_id: credentials.id,
        scan_date: new Date().toISOString(),
        status: 'completed',
        total_findings: findings.length,
        critical_count: criticalCount,
        high_count: highCount,
        medium_count: mediumCount,
        low_count: lowCount,
        findings_summary: {
          byService: findings.reduce((acc: any, f) => { acc[f.service] = (acc[f.service] || 0) + 1; return acc; }, {}),
          byScanType: findings.reduce((acc: any, f) => { acc[f.scan_type] = (acc[f.scan_type] || 0) + 1; return acc; }, {}),
          byCategory: findings.reduce((acc: any, f) => { acc[f.category] = (acc[f.category] || 0) + 1; return acc; }, {}),
          correlatedRisks: correlatedRisks.length
        }
      });

    // Update security posture with detailed categories
    const categories = {
      identity: { 
        score: Math.max(0, 100 - (findings.filter(f => f.service === 'IAM').length * 15)), 
        findings: findings.filter(f => f.service === 'IAM').length,
        critical: findings.filter(f => f.service === 'IAM' && f.severity === 'critical').length
      },
      network: { 
        score: Math.max(0, 100 - (findings.filter(f => ['VPC', 'Network', 'ELB'].includes(f.service)).length * 12)), 
        findings: findings.filter(f => ['VPC', 'Network', 'ELB'].includes(f.service)).length,
        critical: findings.filter(f => ['VPC', 'Network', 'ELB'].includes(f.service) && f.severity === 'critical').length
      },
      data: { 
        score: Math.max(0, 100 - (findings.filter(f => ['S3', 'RDS', 'EBS'].includes(f.service)).length * 15)), 
        findings: findings.filter(f => ['S3', 'RDS', 'EBS'].includes(f.service)).length,
        critical: findings.filter(f => ['S3', 'RDS', 'EBS'].includes(f.service) && f.severity === 'critical').length
      },
      compute: { 
        score: Math.max(0, 100 - (findings.filter(f => ['EC2', 'Lambda', 'ECS'].includes(f.service)).length * 12)), 
        findings: findings.filter(f => ['EC2', 'Lambda', 'ECS'].includes(f.service)).length,
        critical: findings.filter(f => ['EC2', 'Lambda', 'ECS'].includes(f.service) && f.severity === 'critical').length
      },
      logging: { 
        score: Math.max(0, 100 - (findings.filter(f => ['CloudTrail', 'Observability'].includes(f.service)).length * 20)), 
        findings: findings.filter(f => ['CloudTrail', 'Observability'].includes(f.service)).length,
        critical: findings.filter(f => ['CloudTrail', 'Observability'].includes(f.service) && f.severity === 'critical').length
      },
    };

    await supabase
      .from('security_posture')
      .upsert({
        organization_id: orgId,
        aws_account_id: credentials.id,
        overall_score: score,
        critical_findings: criticalCount,
        high_findings: highCount,
        medium_findings: mediumCount,
        low_findings: lowCount,
        total_findings: findings.length,
        calculated_at: new Date().toISOString(),
        identity_score: categories.identity.score,
        network_score: categories.network.score,
        data_score: categories.data.score,
        compute_score: categories.compute.score,
        monitoring_score: categories.logging.score,
        details: { categories, scan_id: scanRecord.id },
        trend: 'stable',
        score_change: 0
      }, { onConflict: 'organization_id,aws_account_id' });

    console.log(`✅ ${levelConfig.name.toUpperCase()} AUDIT COMPLETE: ${findings.length} findings (${criticalCount} CRITICAL, ${highCount} HIGH)`);
    console.log(`📊 Security Score: ${score}/100 | Correlated Risks: ${correlatedRisks.length}`);

    return new Response(JSON.stringify({
      success: true,
      scanId: scanRecord.id,
      scanLevel,
      levelName: levelConfig.name,
      totalFindings: findings.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      score,
      correlatedRisks: correlatedRisks.length,
      findings: findings.slice(0, 100),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Military-grade audit error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ==================== AWS API HELPERS ====================

async function makeAWSRequest(credentials: AWSCredentials, service: string, action: string, region: string, params: Record<string, string> = {}) {
  try {
    // Handle REST API services differently (Lambda, CloudFront)
    if (service === 'lambda') {
      return await makeLambdaRESTRequest(credentials, action, region);
    }
    if (service === 'cloudfront') {
      return await makeCloudFrontRESTRequest(credentials, action);
    }
    
    // Handle global services correctly - they don't have regional endpoints
    let host: string;
    let signingRegion = region;
    
    if (service === 's3') {
      host = 's3.amazonaws.com';
      signingRegion = 'us-east-1';
    } else if (service === 'iam') {
      host = 'iam.amazonaws.com';
      signingRegion = 'us-east-1';
    } else if (service === 'route53') {
      host = 'route53.amazonaws.com';
      signingRegion = 'us-east-1';
    } else {
      host = `${service}.${region}.amazonaws.com`;
    }
    
    // CRITICAL: Query parameters MUST be sorted alphabetically for AWS Signature V4
    const allParams = { Action: action, Version: getAPIVersion(service), ...params };
    const sortedKeys = Object.keys(allParams).sort();
    const sortedParams = new URLSearchParams();
    for (const key of sortedKeys) {
      sortedParams.append(key, allParams[key as keyof typeof allParams]);
    }
    const queryString = sortedParams.toString();
    
    // Sign request with correct region
    const headers = await signAWSGetRequestWithContentHash(credentials, service, signingRegion, host, '/', queryString);
    const url = `https://${host}/?${queryString}`;
    
    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AWS ${service}.${action} error:`, response.status, errorText.substring(0, 200));
      return [];
    }

    return parseXMLResponse(await response.text(), action);
  } catch (error) {
    console.error(`AWS ${service}.${action} failed:`, error);
    return [];
  }
}

// Lambda uses REST API, not Query API
async function makeLambdaRESTRequest(credentials: AWSCredentials, action: string, region: string) {
  try {
    const host = `lambda.${region}.amazonaws.com`;
    let path = '/2015-03-31/functions';
    
    if (action === 'ListFunctions') {
      path = '/2015-03-31/functions/';
    }
    
    const headers = await signAWSGetRequestWithContentHash(credentials, 'lambda', region, host, path, '');
    const url = `https://${host}${path}`;
    
    const response = await fetch(url, { method: 'GET', headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AWS lambda.${action} error:`, response.status, errorText.substring(0, 200));
      return [];
    }
    
    const data = await response.json();
    return data.Functions || [];
  } catch (error) {
    console.error(`AWS lambda.${action} failed:`, error);
    return [];
  }
}

// CloudFront uses REST API, not Query API
async function makeCloudFrontRESTRequest(credentials: AWSCredentials, action: string) {
  try {
    const host = 'cloudfront.amazonaws.com';
    let path = '/2020-05-31/distribution';
    
    if (action === 'ListDistributions') {
      path = '/2020-05-31/distribution';
    }
    
    const headers = await signAWSGetRequestWithContentHash(credentials, 'cloudfront', 'us-east-1', host, path, '');
    const url = `https://${host}${path}`;
    
    const response = await fetch(url, { method: 'GET', headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AWS cloudfront.${action} error:`, response.status, errorText.substring(0, 200));
      return [];
    }
    
    const text = await response.text();
    // Parse CloudFront XML response
    const distributionMatches = text.match(/<DistributionSummary>([\s\S]*?)<\/DistributionSummary>/g) || [];
    return distributionMatches.map(match => {
      const extractField = (field: string) => {
        const regex = new RegExp(`<${field}>(.*?)<\\/${field}>`);
        return match.match(regex)?.[1] || null;
      };
      return {
        Id: extractField('Id'),
        DomainName: extractField('DomainName'),
        Status: extractField('Status'),
        Enabled: extractField('Enabled') === 'true',
        ARN: extractField('ARN'),
        WebACLId: extractField('WebACLId'),
        HttpVersion: extractField('HttpVersion'),
        ViewerCertificate: {
          CloudFrontDefaultCertificate: match.includes('<CloudFrontDefaultCertificate>true'),
          MinimumProtocolVersion: extractField('MinimumProtocolVersion'),
        },
        Logging: {
          Enabled: match.includes('<Logging>') && match.includes('<Enabled>true</Enabled>'),
        }
      };
    });
  } catch (error) {
    console.error(`AWS cloudfront.${action} failed:`, error);
    return [];
  }
}

// Extended signing function that includes x-amz-content-sha256 header (required for S3)
async function signAWSGetRequestWithContentHash(
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  service: string,
  region: string,
  host: string,
  path: string,
  queryString: string
): Promise<Record<string, string>> {
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.substring(0, 8);
  
  const payloadHash = await sha256Internal('');
  
  // Build canonical headers - include content hash for S3
  let canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\n`;
  let signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  
  if (credentials.sessionToken) {
    canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\nx-amz-security-token:${credentials.sessionToken}\n`;
    signedHeaders = 'host;x-amz-content-sha256;x-amz-date;x-amz-security-token';
  }
  
  const canonicalRequest = [
    'GET',
    path,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    await sha256Internal(canonicalRequest)
  ].join('\n');
  
  const signingKey = await getSignatureKeyInternal(credentials.secretAccessKey, date, region, service);
  const signature = await hmacHexInternal(signingKey, stringToSign);
  
  const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  const headers: Record<string, string> = {
    'Host': host,
    'X-Amz-Date': timestamp,
    'X-Amz-Content-Sha256': payloadHash,
    'Authorization': authHeader
  };
  
  if (credentials.sessionToken) {
    headers['X-Amz-Security-Token'] = credentials.sessionToken;
  }
  
  return headers;
}

// Internal crypto helpers for local signing
async function sha256Internal(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacRawInternal(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  let keyData: Uint8Array;
  if (key instanceof Uint8Array) {
    keyData = new Uint8Array(key.length);
    keyData.set(key);
  } else {
    keyData = new Uint8Array(key);
  }
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData as BufferSource,
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function hmacHexInternal(key: ArrayBuffer | Uint8Array, message: string): Promise<string> {
  const sig = await hmacRawInternal(key, message);
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getSignatureKeyInternal(secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const kDate = await hmacRawInternal(encoder.encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmacRawInternal(kDate, region);
  const kService = await hmacRawInternal(kRegion, service);
  return await hmacRawInternal(kService, 'aws4_request');
}

function getAPIVersion(service: string): string {
  const versions: Record<string, string> = {
    'ec2': '2016-11-15', 'rds': '2014-10-31', 'iam': '2010-05-08',
    'lambda': '2015-03-31', 'elasticloadbalancing': '2015-12-01',
    's3': '2006-03-01', 'cloudfront': '2020-05-31', 'wafv2': '2019-07-29',
    'cloudtrail': '2013-11-01', 'ecs': '2014-11-13'
  };
  return versions[service] || '2016-11-15';
}

function parseXMLResponse(xmlText: string, action: string): any[] {
  try {
    const itemPatterns: Record<string, RegExp> = {
      'DescribeInstances': /<item>([\s\S]*?)<\/item>/g,
      'DescribeSecurityGroups': /<item>([\s\S]*?)<\/item>/g,
      'DescribeLoadBalancers': /<member>([\s\S]*?)<\/member>/g,
      'DescribeDBInstances': /<DBInstance>([\s\S]*?)<\/DBInstance>/g,
      'ListFunctions': /<member>([\s\S]*?)<\/member>/g,
      'DescribeVpcs': /<item>([\s\S]*?)<\/item>/g,
      'DescribeSubnets': /<item>([\s\S]*?)<\/item>/g,
      'DescribeNetworkAcls': /<item>([\s\S]*?)<\/item>/g,
      'DescribeVolumes': /<item>([\s\S]*?)<\/item>/g,
      'DescribeSnapshots': /<item>([\s\S]*?)<\/item>/g,
      'ListUsers': /<member>([\s\S]*?)<\/member>/g,
      'ListRoles': /<member>([\s\S]*?)<\/member>/g,
      'ListAccessKeys': /<member>([\s\S]*?)<\/member>/g,
      'ListMFADevices': /<member>([\s\S]*?)<\/member>/g,
      'ListAllMyBuckets': /<Bucket>([\s\S]*?)<\/Bucket>/g,
      'ListDistributions': /<DistributionSummary>([\s\S]*?)<\/DistributionSummary>/g,
      'DescribeFlowLogs': /<item>([\s\S]*?)<\/item>/g,
      'DescribeTrails': /<member>([\s\S]*?)<\/member>/g,
      'ListClusters': /<member>([\s\S]*?)<\/member>/g,
    };

    const pattern = itemPatterns[action] || /<item>([\s\S]*?)<\/item>/g;
    const matches = xmlText.match(pattern) || [];
    
    return matches.map(match => {
      const item: any = {};
      
      const extractField = (fieldName: string) => {
        const regex = new RegExp(`<${fieldName}>(.*?)<\/${fieldName}>`);
        const result = match.match(regex);
        return result ? result[1] : null;
      };

      // EC2 fields
      item.InstanceId = extractField('InstanceId');
      item.PublicIpAddress = extractField('PublicIpAddress');
      item.PrivateIpAddress = extractField('PrivateIpAddress');
      item.VpcId = extractField('VpcId');
      item.SubnetId = extractField('SubnetId');
      
      const metadataMatch = match.match(/<MetadataOptions>([\s\S]*?)<\/MetadataOptions>/);
      if (metadataMatch) {
        item.MetadataOptions = { HttpTokens: extractField('HttpTokens') };
      }
      
      const profileMatch = match.match(/<IamInstanceProfile>([\s\S]*?)<\/IamInstanceProfile>/);
      if (profileMatch) {
        item.IamInstanceProfile = { Arn: extractField('Arn') };
      }

      const sgMatches = match.match(/<GroupId>(.*?)<\/GroupId>/g);
      if (sgMatches) {
        item.SecurityGroups = sgMatches.map(sg => ({ GroupId: sg.replace(/<\/?GroupId>/g, '') }));
      }

      // Security Group rules
      const ipPermissions: any[] = [];
      const ipPermMatches = match.match(/<ipPermissions>[\s\S]*?<item>([\s\S]*?)<\/item>[\s\S]*?<\/ipPermissions>/g);
      if (ipPermMatches) {
        for (const pm of ipPermMatches) {
          const fromPort = pm.match(/<fromPort>(\d+)<\/fromPort>/)?.[1];
          const toPort = pm.match(/<toPort>(\d+)<\/toPort>/)?.[1];
          const protocol = pm.match(/<ipProtocol>(.*?)<\/ipProtocol>/)?.[1];
          const cidrMatches = pm.match(/<cidrIp>(.*?)<\/cidrIp>/g);
          
          ipPermissions.push({
            FromPort: fromPort ? parseInt(fromPort) : (protocol === '-1' ? -1 : null),
            ToPort: toPort ? parseInt(toPort) : (protocol === '-1' ? -1 : null),
            IpProtocol: protocol,
            IpRanges: cidrMatches?.map(c => ({ CidrIp: c.replace(/<\/?cidrIp>/g, '') })) || [],
          });
        }
      }
      if (ipPermissions.length > 0) item.IpPermissions = ipPermissions;

      // RDS fields
      item.DBInstanceIdentifier = extractField('DBInstanceIdentifier');
      item.Engine = extractField('Engine');
      item.BackupRetentionPeriod = parseInt(extractField('BackupRetentionPeriod') || '0');
      item.StorageEncrypted = extractField('StorageEncrypted') === 'true';
      item.PubliclyAccessible = extractField('PubliclyAccessible') === 'true';
      item.MultiAZ = extractField('MultiAZ') === 'true';
      item.DeletionProtection = extractField('DeletionProtection') === 'true';

      // Load Balancer fields
      item.LoadBalancerArn = extractField('LoadBalancerArn');
      item.LoadBalancerName = extractField('LoadBalancerName');
      item.Scheme = extractField('Scheme');

      // Lambda fields
      item.FunctionName = extractField('FunctionName');
      item.FunctionArn = extractField('FunctionArn');
      item.Runtime = extractField('Runtime');
      item.KMSKeyArn = extractField('KMSKeyArn');

      // IAM fields
      item.UserName = extractField('UserName');
      item.RoleName = extractField('RoleName');
      item.Arn = extractField('Arn');
      item.CreateDate = extractField('CreateDate');
      item.AccessKeyId = extractField('AccessKeyId');
      item.Status = extractField('Status');

      // S3 fields
      item.Name = extractField('Name');

      // VPC/NACL fields
      item.NetworkAclId = extractField('NetworkAclId');
      item.IsDefault = extractField('IsDefault') === 'true';
      item.CidrBlock = extractField('CidrBlock');

      // Volume/Snapshot fields
      item.VolumeId = extractField('VolumeId');
      item.SnapshotId = extractField('SnapshotId');
      item.Encrypted = extractField('Encrypted') === 'true';

      // CloudTrail fields
      item.TrailARN = extractField('TrailARN');
      item.IsMultiRegionTrail = extractField('IsMultiRegionTrail') === 'true';
      item.LogFileValidationEnabled = extractField('LogFileValidationEnabled') === 'true';

      return item;
    });
  } catch (e) {
    console.error('XML parsing error:', e);
    return [];
  }
}

// Resource collection functions
async function describeEC2Instances(credentials: AWSCredentials, region: string) {
  return await makeAWSRequest(credentials, 'ec2', 'DescribeInstances', region) || [];
}

async function describeAllSecurityGroups(credentials: AWSCredentials, region: string) {
  return await makeAWSRequest(credentials, 'ec2', 'DescribeSecurityGroups', region) || [];
}

async function describeLoadBalancers(credentials: AWSCredentials, region: string) {
  return await makeAWSRequest(credentials, 'elasticloadbalancing', 'DescribeLoadBalancers', region) || [];
}

async function describeRDSInstances(credentials: AWSCredentials, region: string) {
  return await makeAWSRequest(credentials, 'rds', 'DescribeDBInstances', region) || [];
}

async function listLambdaFunctions(credentials: AWSCredentials, region: string) {
  return await makeAWSRequest(credentials, 'lambda', 'ListFunctions', region) || [];
}

async function describeVPCs(credentials: AWSCredentials, region: string) {
  return await makeAWSRequest(credentials, 'ec2', 'DescribeVpcs', region) || [];
}

async function describeSubnets(credentials: AWSCredentials, region: string) {
  return await makeAWSRequest(credentials, 'ec2', 'DescribeSubnets', region) || [];
}

async function describeNACLs(credentials: AWSCredentials, region: string) {
  return await makeAWSRequest(credentials, 'ec2', 'DescribeNetworkAcls', region) || [];
}

async function describeEBSVolumes(credentials: AWSCredentials, region: string) {
  return await makeAWSRequest(credentials, 'ec2', 'DescribeVolumes', region) || [];
}

async function describeEBSSnapshots(credentials: AWSCredentials, region: string) {
  return await makeAWSRequest(credentials, 'ec2', 'DescribeSnapshots', region, { 'Owner.1': 'self' }) || [];
}

async function describeCloudTrails(credentials: AWSCredentials, region: string) {
  return await makeAWSRequest(credentials, 'cloudtrail', 'DescribeTrails', region) || [];
}

async function describeECSClusters(credentials: AWSCredentials, region: string) {
  // ECS uses JSON-based API, not Query API
  try {
    const host = `ecs.${region}.amazonaws.com`;
    const body = '{}';
    
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = timestamp.substring(0, 8);
    const payloadHash = await sha256Internal(body);
    
    let canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${timestamp}\nx-amz-target:AmazonEC2ContainerServiceV20141113.ListClusters\n`;
    let signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
    
    if (credentials.sessionToken) {
      canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${timestamp}\nx-amz-security-token:${credentials.sessionToken}\nx-amz-target:AmazonEC2ContainerServiceV20141113.ListClusters\n`;
      signedHeaders = 'content-type;host;x-amz-date;x-amz-security-token;x-amz-target';
    }
    
    const canonicalRequest = [
      'POST',
      '/',
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');
    
    const credentialScope = `${date}/${region}/ecs/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timestamp,
      credentialScope,
      await sha256Internal(canonicalRequest)
    ].join('\n');
    
    const signingKey = await getSignatureKeyInternal(credentials.secretAccessKey, date, region, 'ecs');
    const signature = await hmacHexInternal(signingKey, stringToSign);
    const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-amz-json-1.1',
      'Host': host,
      'X-Amz-Date': timestamp,
      'X-Amz-Target': 'AmazonEC2ContainerServiceV20141113.ListClusters',
      'Authorization': authHeader
    };
    
    if (credentials.sessionToken) {
      headers['X-Amz-Security-Token'] = credentials.sessionToken;
    }
    
    const response = await fetch(`https://${host}/`, { method: 'POST', headers, body });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AWS ecs.ListClusters error:`, response.status, errorText.substring(0, 200));
      return [];
    }
    
    const data = await response.json();
    return data.clusterArns?.map((arn: string) => ({ clusterArn: arn })) || [];
  } catch (error) {
    console.error(`AWS ecs.ListClusters failed:`, error);
    return [];
  }
}

async function listIAMUsers(credentials: AWSCredentials) {
  return await makeAWSRequest(credentials, 'iam', 'ListUsers', 'us-east-1') || [];
}

async function listIAMRoles(credentials: AWSCredentials) {
  return await makeAWSRequest(credentials, 'iam', 'ListRoles', 'us-east-1') || [];
}

async function listS3Buckets(credentials: AWSCredentials) {
  return await makeAWSRequest(credentials, 's3', 'ListAllMyBuckets', 'us-east-1') || [];
}

async function listCloudFrontDistributions(credentials: AWSCredentials) {
  return await makeAWSRequest(credentials, 'cloudfront', 'ListDistributions', 'us-east-1') || [];
}

async function listAccessKeys(credentials: AWSCredentials, userName: string) {
  return await makeAWSRequest(credentials, 'iam', 'ListAccessKeys', 'us-east-1', { UserName: userName }) || [];
}

async function listMFADevices(credentials: AWSCredentials, userName: string) {
  return await makeAWSRequest(credentials, 'iam', 'ListMFADevices', 'us-east-1', { UserName: userName }) || [];
}

// WAFv2 uses JSON API, not Query API
async function checkWAFAssociation(credentials: AWSCredentials, region: string, resourceArn: string): Promise<boolean> {
  try {
    // WAFv2 regional scope for ALB/API Gateway
    const host = `wafv2.${region}.amazonaws.com`;
    const body = JSON.stringify({ ResourceArn: resourceArn });
    
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = timestamp.substring(0, 8);
    const payloadHash = await sha256Internal(body);
    
    let canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${timestamp}\nx-amz-target:AWSWAF_20190729.GetWebACLForResource\n`;
    let signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
    
    if (credentials.sessionToken) {
      canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${timestamp}\nx-amz-security-token:${credentials.sessionToken}\nx-amz-target:AWSWAF_20190729.GetWebACLForResource\n`;
      signedHeaders = 'content-type;host;x-amz-date;x-amz-security-token;x-amz-target';
    }
    
    const canonicalRequest = [
      'POST', '/', '',
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');
    
    const credentialScope = `${date}/${region}/wafv2/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', timestamp, credentialScope, await sha256Internal(canonicalRequest)].join('\n');
    
    const signingKey = await getSignatureKeyInternal(credentials.secretAccessKey, date, region, 'wafv2');
    const signature = await hmacHexInternal(signingKey, stringToSign);
    const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-amz-json-1.1',
      'Host': host,
      'X-Amz-Date': timestamp,
      'X-Amz-Target': 'AWSWAF_20190729.GetWebACLForResource',
      'Authorization': authHeader
    };
    
    if (credentials.sessionToken) {
      headers['X-Amz-Security-Token'] = credentials.sessionToken;
    }
    
    const response = await fetch(`https://${host}/`, { method: 'POST', headers, body });
    if (!response.ok) return false;
    
    const data = await response.json();
    return !!data.WebACL;
  } catch (e) {
    console.error('WAF check error:', e);
    return false;
  }
}

async function checkVPCFlowLogs(credentials: AWSCredentials, region: string, vpcId: string): Promise<boolean> {
  try {
    // EC2 Query API with proper filter format
    const host = `ec2.${region}.amazonaws.com`;
    const params: Record<string, string> = {
      Action: 'DescribeFlowLogs',
      Version: '2016-11-15',
      'Filter.1.Name': 'resource-id',
      'Filter.1.Value.1': vpcId
    };
    
    // Sort params alphabetically for AWS Signature V4
    const sortedKeys = Object.keys(params).sort();
    const sortedParams = new URLSearchParams();
    for (const key of sortedKeys) {
      sortedParams.append(key, params[key]);
    }
    const queryString = sortedParams.toString();
    
    const headers = await signAWSGetRequestWithContentHash(
      credentials, 'ec2', region, host, '/', queryString
    );
    
    const response = await fetch(`https://${host}/?${queryString}`, { method: 'GET', headers });
    if (!response.ok) return false;
    
    const text = await response.text();
    return text.includes('<flowLogId>');
  } catch (e) {
    console.error('VPC Flow Logs check error:', e);
    return false;
  }
}

async function checkSnapshotPublicAccess(credentials: AWSCredentials, region: string, snapshotId: string): Promise<boolean> {
  try {
    const host = `ec2.${region}.amazonaws.com`;
    const params: Record<string, string> = {
      Action: 'DescribeSnapshotAttribute',
      Version: '2016-11-15',
      SnapshotId: snapshotId,
      Attribute: 'createVolumePermission'
    };
    
    // Sort params alphabetically
    const sortedKeys = Object.keys(params).sort();
    const sortedParams = new URLSearchParams();
    for (const key of sortedKeys) {
      sortedParams.append(key, params[key]);
    }
    const queryString = sortedParams.toString();
    
    const headers = await signAWSGetRequestWithContentHash(
      credentials, 'ec2', region, host, '/', queryString
    );
    
    const response = await fetch(`https://${host}/?${queryString}`, { method: 'GET', headers });
    if (!response.ok) return false;
    
    const text = await response.text();
    // Check if snapshot is shared with 'all' (public)
    return text.includes('<group>all</group>');
  } catch (e) {
    console.error('Snapshot public access check error:', e);
    return false;
  }
}

// S3 bucket-specific APIs using virtual-hosted style (more reliable)
async function getS3PublicAccessBlock(credentials: AWSCredentials, bucketName: string): Promise<any> {
  try {
    // Virtual-hosted style: bucket.s3.region.amazonaws.com
    const host = `${bucketName}.s3.us-east-1.amazonaws.com`;
    const path = '/';
    const queryString = 'publicAccessBlock=';
    
    const headers = await signS3VirtualHostedRequest(credentials, host, path, queryString);
    
    const response = await fetch(`https://${host}/?publicAccessBlock`, { method: 'GET', headers });
    if (!response.ok) {
      // 404 means no public access block configured (bucket might be public)
      if (response.status === 404) {
        return { BlockPublicAcls: false, IgnorePublicAcls: false, BlockPublicPolicy: false, RestrictPublicBuckets: false };
      }
      return null;
    }
    const text = await response.text();
    return {
      BlockPublicAcls: text.includes('<BlockPublicAcls>true</BlockPublicAcls>'),
      IgnorePublicAcls: text.includes('<IgnorePublicAcls>true</IgnorePublicAcls>'),
      BlockPublicPolicy: text.includes('<BlockPublicPolicy>true</BlockPublicPolicy>'),
      RestrictPublicBuckets: text.includes('<RestrictPublicBuckets>true</RestrictPublicBuckets>'),
    };
  } catch (e) {
    console.error(`S3 PublicAccessBlock failed for ${bucketName}:`, e);
    return null;
  }
}

async function getS3Encryption(credentials: AWSCredentials, bucketName: string): Promise<boolean> {
  try {
    const host = `${bucketName}.s3.us-east-1.amazonaws.com`;
    const headers = await signS3VirtualHostedRequest(credentials, host, '/', 'encryption=');
    const response = await fetch(`https://${host}/?encryption`, { method: 'GET', headers });
    return response.ok;
  } catch {
    return false;
  }
}

async function getS3Versioning(credentials: AWSCredentials, bucketName: string): Promise<string> {
  try {
    const host = `${bucketName}.s3.us-east-1.amazonaws.com`;
    const headers = await signS3VirtualHostedRequest(credentials, host, '/', 'versioning=');
    const response = await fetch(`https://${host}/?versioning`, { method: 'GET', headers });
    if (!response.ok) return 'Unknown';
    const text = await response.text();
    if (text.includes('<Status>Enabled</Status>')) return 'Enabled';
    if (text.includes('<Status>Suspended</Status>')) return 'Suspended';
    return 'Disabled';
  } catch {
    return 'Unknown';
  }
}

// Virtual-hosted S3 signing (simpler and more reliable)
async function signS3VirtualHostedRequest(
  credentials: AWSCredentials,
  host: string,
  path: string,
  queryString: string
): Promise<Record<string, string>> {
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.substring(0, 8);
  const payloadHash = await sha256Internal('');
  const region = 'us-east-1';
  
  // Headers must be sorted alphabetically
  let canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\n`;
  let signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  
  if (credentials.sessionToken) {
    canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\nx-amz-security-token:${credentials.sessionToken}\n`;
    signedHeaders = 'host;x-amz-content-sha256;x-amz-date;x-amz-security-token';
  }
  
  const canonicalRequest = ['GET', path, queryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', timestamp, credentialScope, await sha256Internal(canonicalRequest)].join('\n');
  
  const signingKey = await getSignatureKeyInternal(credentials.secretAccessKey, date, region, 's3');
  const signature = await hmacHexInternal(signingKey, stringToSign);
  const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  const headers: Record<string, string> = {
    'Host': host,
    'X-Amz-Date': timestamp,
    'X-Amz-Content-Sha256': payloadHash,
    'Authorization': authHeader
  };
  
  if (credentials.sessionToken) {
    headers['X-Amz-Security-Token'] = credentials.sessionToken;
  }
  
  return headers;
}

// Dedicated S3 bucket operation signing (uses different querystring handling)
async function signS3BucketRequest(
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  service: string,
  region: string,
  host: string,
  path: string,
  queryString: string
): Promise<Record<string, string>> {
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.substring(0, 8);
  
  const payloadHash = await sha256Internal('');
  
  // S3 requires sorted headers
  let canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\n`;
  let signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  
  if (credentials.sessionToken) {
    canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\nx-amz-security-token:${credentials.sessionToken}\n`;
    signedHeaders = 'host;x-amz-content-sha256;x-amz-date;x-amz-security-token';
  }
  
  // For S3 bucket operations, queryString is just the operation name (e.g., "publicAccessBlock")
  // NOT key=value format
  const canonicalRequest = [
    'GET',
    path,
    queryString,  // S3 uses the operation name directly
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    await sha256Internal(canonicalRequest)
  ].join('\n');
  
  const signingKey = await getSignatureKeyInternal(credentials.secretAccessKey, date, region, service);
  const signature = await hmacHexInternal(signingKey, stringToSign);
  
  const authHeader = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  const headers: Record<string, string> = {
    'Host': host,
    'X-Amz-Date': timestamp,
    'X-Amz-Content-Sha256': payloadHash,
    'Authorization': authHeader
  };
  
  if (credentials.sessionToken) {
    headers['X-Amz-Security-Token'] = credentials.sessionToken;
  }
  
  return headers;
}
