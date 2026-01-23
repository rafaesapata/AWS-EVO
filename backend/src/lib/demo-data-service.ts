/**
 * Demo Data Service
 * 
 * SERVIÇO CENTRALIZADO PARA DADOS DE DEMONSTRAÇÃO
 * 
 * REGRAS DE SEGURANÇA:
 * 1. Este serviço SÓ é chamado quando organization.demo_mode = true
 * 2. Dados demo são gerados NO BACKEND, nunca no frontend
 * 3. Todos os dados são claramente marcados como demo
 * 4. Logs de auditoria registram acesso a dados demo
 * 
 * REGRA CRÍTICA - FAIL-SAFE:
 * - isOrganizationInDemoMode() retorna FALSE em caso de erro
 * - getDemoOrRealData() retorna dados REAIS em caso de erro na verificação
 * - Isso garante que NUNCA retornamos dados demo por engano
 * 
 * IMPORTANTE: Nunca misturar dados demo com dados reais!
 */

import { logger } from './logging.js';

// Tipos para dados demo
interface DemoSecurityFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  service: string;
  resource_id: string;
  status: string;
  remediation: string;
  _isDemo: true;
}

interface DemoCostData {
  date: string;
  service: string;
  cost: number;
  currency: string;
  _isDemo: true;
}

interface DemoWafEvent {
  id: string;
  timestamp: string;
  action: string;
  rule_id: string;
  source_ip: string;
  country: string;
  uri: string;
  _isDemo: true;
}

// Prefixo para IDs demo (facilita identificação)
const DEMO_ID_PREFIX = 'demo-';

/**
 * Verifica se a organização está em modo demo
 * 
 * REGRA CRÍTICA - FAIL-SAFE:
 * - Retorna FALSE em caso de qualquer erro
 * - Retorna FALSE se demo_mode não for EXPLICITAMENTE true
 * - Isso garante que NUNCA ativamos demo mode por engano
 */
export async function isOrganizationInDemoMode(
  prisma: any,
  organizationId: string
): Promise<boolean> {
  try {
    // Validar organizationId
    if (!organizationId || typeof organizationId !== 'string') {
      logger.warn('Invalid organizationId for demo mode check', { organizationId });
      return false;
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { demo_mode: true, demo_expires_at: true }
    });
    
    // Se não encontrou a org, não é demo
    if (!org) {
      return false;
    }
    
    // Se demo_mode não é EXPLICITAMENTE true, não é demo
    if (org.demo_mode !== true) {
      return false;
    }
    
    // Verificar se o demo expirou
    if (org.demo_expires_at && new Date(org.demo_expires_at) < new Date()) {
      logger.info('Demo mode expired', { organizationId, expiredAt: org.demo_expires_at });
      return false;
    }
    
    return true;
  } catch (error) {
    // CRÍTICO: Em caso de erro, NUNCA retorna true (fail-safe)
    logger.error('Error checking demo mode - defaulting to FALSE', error as Error);
    return false;
  }
}

/**
 * Gera dados de segurança para demonstração
 */
export function generateDemoSecurityFindings(): DemoSecurityFinding[] {
  return [
    {
      id: `${DEMO_ID_PREFIX}finding-001`,
      severity: 'critical',
      title: 'S3 Bucket com acesso público',
      description: 'O bucket demo-company-data está configurado com acesso público, expondo dados sensíveis.',
      service: 'S3',
      resource_id: 'demo-company-data',
      status: 'open',
      remediation: 'Remover a política de acesso público e habilitar Block Public Access.',
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}finding-002`,
      severity: 'high',
      title: 'Security Group permite acesso SSH de qualquer IP',
      description: 'O Security Group sg-demo-web permite conexões SSH (porta 22) de 0.0.0.0/0.',
      service: 'EC2',
      resource_id: 'sg-demo-web',
      status: 'open',
      remediation: 'Restringir o acesso SSH apenas a IPs conhecidos ou usar AWS Systems Manager Session Manager.',
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}finding-003`,
      severity: 'high',
      title: 'RDS sem criptografia habilitada',
      description: 'A instância RDS demo-database não possui criptografia at-rest habilitada.',
      service: 'RDS',
      resource_id: 'demo-database',
      status: 'open',
      remediation: 'Criar um snapshot criptografado e restaurar a instância a partir dele.',
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}finding-004`,
      severity: 'medium',
      title: 'CloudTrail não está habilitado em todas as regiões',
      description: 'O CloudTrail está configurado apenas para us-east-1, deixando outras regiões sem auditoria.',
      service: 'CloudTrail',
      resource_id: 'demo-trail',
      status: 'open',
      remediation: 'Habilitar CloudTrail multi-região para capturar eventos em todas as regiões.',
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}finding-005`,
      severity: 'medium',
      title: 'IAM User com credenciais antigas',
      description: 'O usuário demo-developer possui access keys com mais de 90 dias sem rotação.',
      service: 'IAM',
      resource_id: 'demo-developer',
      status: 'open',
      remediation: 'Rotacionar as access keys e implementar política de rotação automática.',
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}finding-006`,
      severity: 'low',
      title: 'EBS Volume sem tags de identificação',
      description: 'O volume vol-demo-data não possui tags para identificação de owner e projeto.',
      service: 'EC2',
      resource_id: 'vol-demo-data',
      status: 'open',
      remediation: 'Adicionar tags obrigatórias: Owner, Project, Environment, CostCenter.',
      _isDemo: true
    }
  ];
}

/**
 * Gera dados de custos para demonstração
 */
export function generateDemoCostData(days: number = 30): DemoCostData[] {
  const services = [
    { name: 'Amazon EC2', baseDaily: 45.50 },
    { name: 'Amazon RDS', baseDaily: 28.30 },
    { name: 'Amazon S3', baseDaily: 12.80 },
    { name: 'AWS Lambda', baseDaily: 8.50 },
    { name: 'Amazon CloudFront', baseDaily: 15.20 },
    { name: 'Amazon DynamoDB', baseDaily: 6.40 },
    { name: 'AWS WAF', baseDaily: 4.20 },
    { name: 'Amazon Route 53', baseDaily: 2.10 }
  ];

  const costs: DemoCostData[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    for (const service of services) {
      // Adicionar variação aleatória de ±20%
      const variation = 0.8 + Math.random() * 0.4;
      const cost = Math.round(service.baseDaily * variation * 100) / 100;

      costs.push({
        date: dateStr,
        service: service.name,
        cost,
        currency: 'USD',
        _isDemo: true
      });
    }
  }

  return costs;
}

/**
 * Gera eventos WAF para demonstração
 */
export function generateDemoWafEvents(count: number = 50): DemoWafEvent[] {
  const actions = ['BLOCK', 'ALLOW', 'COUNT'];
  const rules = ['SQLi-Rule', 'XSS-Rule', 'RateLimit-Rule', 'GeoBlock-Rule', 'Bot-Control'];
  const countries = ['BR', 'US', 'CN', 'RU', 'DE', 'FR', 'JP', 'IN'];
  const uris = ['/api/login', '/api/users', '/admin', '/wp-admin', '/.env', '/api/data'];

  const events: DemoWafEvent[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now - Math.random() * 24 * 60 * 60 * 1000).toISOString();
    
    events.push({
      id: `${DEMO_ID_PREFIX}waf-${i.toString().padStart(4, '0')}`,
      timestamp,
      action: actions[Math.floor(Math.random() * actions.length)],
      rule_id: rules[Math.floor(Math.random() * rules.length)],
      source_ip: `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
      country: countries[Math.floor(Math.random() * countries.length)],
      uri: uris[Math.floor(Math.random() * uris.length)],
      _isDemo: true
    });
  }

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Gera métricas do dashboard executivo para demonstração
 * 
 * IMPORTANTE: Esta estrutura DEVE corresponder exatamente à interface
 * ExecutiveDashboardResponse definida em get-executive-dashboard.ts
 */
export function generateDemoExecutiveDashboard() {
  const now = new Date();
  const DEMO_ORG_ID = 'demo-organization-id';
  const DEMO_ACCOUNT_ID = 'demo-aws-account';
  
  // Gerar dados de tendência para os últimos 30 dias
  const costTrend = [];
  const securityTrend = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    // Custo com variação realista
    const baseCost = 120 + Math.sin(i / 7) * 20;
    const variation = (Math.random() - 0.5) * 30;
    costTrend.push({
      date: dateStr,
      cost: Math.round((baseCost + variation) * 100) / 100,
      credits: 0,
      net: Math.round((baseCost + variation) * 100) / 100
    });
    
    // Score de segurança melhorando gradualmente
    const baseScore = 65 + (29 - i) * 0.3;
    securityTrend.push({
      date: dateStr,
      score: Math.min(100, Math.round(baseScore + (Math.random() - 0.5) * 5)),
      findings: Math.max(0, 30 - Math.floor(i / 3))
    });
  }

  return {
    _isDemo: true,
    summary: {
      overallScore: 72,
      scoreChange: 5,
      mtdSpend: 3847.52,
      budget: 5000.00,
      budgetUtilization: 76.95,
      potentialSavings: 892.30,
      uptimeSLA: 99.7,
      activeAlerts: {
        critical: 2,
        high: 5,
        medium: 8
      }
    },
    financial: {
      mtdCost: 3847.52,
      ytdCost: 42156.80,
      credits: 0,
      netCost: 3847.52,
      budget: 5000.00,
      budgetUtilization: 76.95,
      topServices: [
        { service: 'Amazon EC2', cost: 1365.00, percentage: 35.5, rank: 1 },
        { service: 'Amazon RDS', cost: 849.00, percentage: 22.1, rank: 2 },
        { service: 'Amazon CloudFront', cost: 456.00, percentage: 11.9, rank: 3 },
        { service: 'Amazon S3', cost: 384.00, percentage: 10.0, rank: 4 },
        { service: 'AWS Lambda', cost: 255.00, percentage: 6.6, rank: 5 }
      ],
      savings: {
        potential: 892.30,
        costRecommendations: 542.30,
        riSpRecommendations: 350.00,
        recommendationsCount: 12
      },
      lastCostUpdate: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    },
    security: {
      score: 72,
      findings: {
        critical: 2,
        high: 5,
        medium: 8,
        low: 15,
        total: 30
      },
      trend: {
        newLast7Days: 3,
        resolvedLast7Days: 7,
        netChange: -4
      },
      mttr: {
        critical: 4,
        high: 12,
        medium: 48,
        low: 168,
        average: 24
      },
      lastScanDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    },
    operations: {
      endpoints: {
        total: 12,
        healthy: 10,
        degraded: 1,
        down: 1
      },
      uptime: {
        current: 99.7,
        target: 99.9
      },
      responseTime: {
        avg: 245
      },
      alerts: {
        active: [
          {
            id: `${DEMO_ID_PREFIX}alert-001`,
            severity: 'critical',
            title: 'Endpoint /api/payments fora do ar',
            since: new Date(Date.now() - 45 * 60 * 1000)
          },
          {
            id: `${DEMO_ID_PREFIX}alert-002`,
            severity: 'high',
            title: 'Latência elevada em /api/users',
            since: new Date(Date.now() - 2 * 60 * 60 * 1000)
          }
        ],
        count: {
          critical: 1,
          high: 1
        }
      },
      remediations: {
        pending: 5,
        inProgress: 3,
        resolved: 42,
        total: 50
      },
      lastCheckDate: new Date(Date.now() - 5 * 60 * 1000).toISOString()
    },
    insights: [
      {
        id: `${DEMO_ID_PREFIX}insight-001`,
        type: 'security_risk',
        severity: 'critical',
        title: '2 vulnerabilidades críticas detectadas',
        description: 'Existem 2 findings de segurança com severidade crítica que requerem atenção imediata.',
        recommendation: 'Execute um scan de segurança e priorize a remediação dos findings críticos.',
        confidence: 0.95,
        generatedAt: now
      },
      {
        id: `${DEMO_ID_PREFIX}insight-002`,
        type: 'optimization',
        severity: 'info',
        title: 'R$ 892,30/mês em economia potencial',
        description: 'Identificamos 12 recomendações de otimização que podem economizar até R$ 892,30 por mês.',
        recommendation: 'Revise as recomendações de Reserved Instances e Savings Plans.',
        confidence: 0.92,
        generatedAt: now
      },
      {
        id: `${DEMO_ID_PREFIX}insight-003`,
        type: 'security_risk',
        severity: 'warning',
        title: '1 endpoint fora do ar',
        description: 'Detectamos 1 endpoint monitorado que está indisponível há 45 minutos.',
        recommendation: 'Verifique a saúde dos serviços e infraestrutura afetados.',
        confidence: 0.98,
        generatedAt: now
      }
    ],
    trends: {
      cost: costTrend,
      security: securityTrend,
      period: '30d'
    },
    metadata: {
      generatedAt: now.toISOString(),
      dataFreshness: {
        costs: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        security: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        endpoints: new Date(Date.now() - 5 * 60 * 1000).toISOString()
      },
      organizationId: DEMO_ORG_ID,
      accountId: DEMO_ACCOUNT_ID,
      trendPeriod: '30d'
    }
  };
}

/**
 * Gera dados de compliance para demonstração
 */
export function generateDemoComplianceData() {
  return {
    _isDemo: true,
    frameworks: [
      {
        name: 'CIS AWS Foundations',
        version: '1.5.0',
        score: 78,
        passed: 42,
        failed: 12,
        notApplicable: 3
      },
      {
        name: 'LGPD',
        version: '1.0',
        score: 85,
        passed: 28,
        failed: 5,
        notApplicable: 2
      },
      {
        name: 'PCI-DSS',
        version: '4.0',
        score: 72,
        passed: 180,
        failed: 70,
        notApplicable: 15
      },
      {
        name: 'SOC 2',
        version: 'Type II',
        score: 88,
        passed: 95,
        failed: 13,
        notApplicable: 8
      }
    ],
    recentViolations: [
      {
        id: `${DEMO_ID_PREFIX}violation-001`,
        framework: 'CIS AWS Foundations',
        control: '2.1.1',
        title: 'Ensure S3 Bucket Policy is set to deny HTTP requests',
        severity: 'high',
        resource: 'demo-company-data',
        _isDemo: true
      },
      {
        id: `${DEMO_ID_PREFIX}violation-002`,
        framework: 'PCI-DSS',
        control: '8.3.1',
        title: 'Implement MFA for all access to cardholder data',
        severity: 'critical',
        resource: 'demo-payment-api',
        _isDemo: true
      }
    ]
  };
}

/**
 * Gera dados de detecção de anomalias para demonstração
 */
export function generateDemoAnomalyDetection() {
  const anomalies = [
    {
      id: 'demo-anomaly-001',
      type: 'COST_SPIKE',
      category: 'cost',
      severity: 'HIGH',
      title: 'Cost anomaly detected for Amazon EC2',
      description: 'Amazon EC2 cost deviated 45.2% from normal',
      metric: 'UnblendedCost',
      expectedValue: 125.50,
      actualValue: 182.20,
      deviation: 2.8,
      timestamp: new Date().toISOString(),
      resourceId: 'Amazon EC2',
      recommendation: 'Review Amazon EC2 usage and check for unexpected resources or configuration changes',
      _isDemo: true
    },
    {
      id: 'demo-anomaly-002',
      type: 'COST_SPIKE',
      category: 'cost',
      severity: 'MEDIUM',
      title: 'Cost anomaly detected for Amazon RDS',
      description: 'Amazon RDS cost deviated 28.5% from normal',
      metric: 'UnblendedCost',
      expectedValue: 85.00,
      actualValue: 109.22,
      deviation: 2.1,
      timestamp: new Date().toISOString(),
      resourceId: 'Amazon RDS',
      recommendation: 'Review Amazon RDS usage and check for unexpected resources or configuration changes',
      _isDemo: true
    },
    {
      id: 'demo-anomaly-003',
      type: 'ERROR_SPIKE',
      category: 'performance',
      severity: 'HIGH',
      title: 'Lambda error rate anomaly',
      description: 'Lambda errors increased to 45 (avg: 12.3)',
      metric: 'Lambda/Errors',
      expectedValue: 12.3,
      actualValue: 45,
      deviation: 2.65,
      timestamp: new Date().toISOString(),
      recommendation: 'Review Lambda function logs and recent deployments',
      _isDemo: true
    },
    {
      id: 'demo-anomaly-004',
      type: 'SECURITY_EVENT_SPIKE',
      category: 'security',
      severity: 'CRITICAL',
      title: 'Unusual ConsoleLogin activity',
      description: 'ConsoleLogin events increased from 2.5/day to 15.8/day',
      metric: 'ConsoleLogin',
      expectedValue: 2.5,
      actualValue: 15.8,
      deviation: 5.32,
      timestamp: new Date().toISOString(),
      recommendation: 'Investigate ConsoleLogin events for potential security issues',
      _isDemo: true
    },
    {
      id: 'demo-anomaly-005',
      type: 'SECURITY_EVENT_SPIKE',
      category: 'security',
      severity: 'HIGH',
      title: 'Unusual IAMUserCreation activity',
      description: 'IAMUserCreation events increased from 0.3/day to 3.2/day',
      metric: 'IAMUserCreation',
      expectedValue: 0.3,
      actualValue: 3.2,
      deviation: 9.67,
      timestamp: new Date().toISOString(),
      recommendation: 'Investigate IAMUserCreation events for potential security issues',
      _isDemo: true
    }
  ];

  return {
    _isDemo: true,
    scanId: 'demo-scan-anomaly-001',
    summary: {
      totalAnomalies: anomalies.length,
      byCategory: {
        cost: 2,
        performance: 1,
        security: 2
      },
      bySeverity: {
        CRITICAL: 1,
        HIGH: 2,
        MEDIUM: 1,
        LOW: 0
      },
      analysisType: 'all',
      sensitivity: 'medium',
      lookbackDays: 30,
      executionTimeMs: 1850
    },
    anomalies
  };
}

/**
 * Gera dados de ML Waste Detection para demonstração
 */
export function generateDemoMLWasteDetection() {
  const recommendations = [
    {
      id: 'demo-ml-001',
      resource_id: 'i-demo-idle-001',
      resource_arn: 'arn:aws:ec2:us-east-1:demo:instance/i-demo-idle-001',
      resource_name: 'demo-idle-webserver',
      resource_type: 'EC2::Instance',
      resource_subtype: 'm5.xlarge',
      region: 'us-east-1',
      account_id: 'demo-account',
      current_size: 'm5.xlarge',
      current_monthly_cost: 140.16,
      current_hourly_cost: 0.192,
      recommended_size: 't3.medium',
      recommendation_type: 'downsize',
      recommendation_priority: 4,
      potential_monthly_savings: 105.12,
      potential_annual_savings: 1261.44,
      ml_confidence: 0.92,
      utilization_patterns: {
        avgCpuUsage: 8.5,
        maxCpuUsage: 22.3,
        avgMemoryUsage: 15.2,
        maxMemoryUsage: 35.8,
        peakHours: [9, 10, 11, 14, 15],
        weekdayPattern: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        hasRealMetrics: true,
        dataCompleteness: 0.95,
        trend: 'stable',
        seasonality: 'business_hours'
      },
      implementation_complexity: 'medium',
      implementation_steps: [
        { order: 1, action: 'Create AMI backup', command: 'aws ec2 create-image --instance-id i-demo-idle-001 --name "backup-before-resize"', riskLevel: 'safe' },
        { order: 2, action: 'Stop instance', command: 'aws ec2 stop-instances --instance-ids i-demo-idle-001', riskLevel: 'safe' },
        { order: 3, action: 'Modify instance type', command: 'aws ec2 modify-instance-attribute --instance-id i-demo-idle-001 --instance-type t3.medium', riskLevel: 'safe' },
        { order: 4, action: 'Start instance', command: 'aws ec2 start-instances --instance-ids i-demo-idle-001', riskLevel: 'safe' }
      ],
      risk_assessment: 'medium',
      analyzed_at: new Date().toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-ml-002',
      resource_id: 'vol-demo-unattached-001',
      resource_arn: 'arn:aws:ec2:us-east-1:demo:volume/vol-demo-unattached-001',
      resource_name: 'demo-old-backup-volume',
      resource_type: 'EC2::Volume',
      resource_subtype: 'gp2',
      region: 'us-east-1',
      account_id: 'demo-account',
      current_size: '500 GB (gp2)',
      current_monthly_cost: 50.00,
      current_hourly_cost: 0.0685,
      recommended_size: null,
      recommendation_type: 'terminate',
      recommendation_priority: 5,
      potential_monthly_savings: 50.00,
      potential_annual_savings: 600.00,
      ml_confidence: 0.98,
      utilization_patterns: {
        avgCpuUsage: 0,
        maxCpuUsage: 0,
        hasRealMetrics: true,
        dataCompleteness: 1,
        trend: 'stable',
        seasonality: 'none'
      },
      implementation_complexity: 'low',
      implementation_steps: [
        { order: 1, action: 'Create snapshot', command: 'aws ec2 create-snapshot --volume-id vol-demo-unattached-001 --description "Backup before deletion"', riskLevel: 'safe' },
        { order: 2, action: 'Delete volume', command: 'aws ec2 delete-volume --volume-id vol-demo-unattached-001', riskLevel: 'destructive' }
      ],
      risk_assessment: 'low',
      analyzed_at: new Date().toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-ml-003',
      resource_id: 'demo-database-dev',
      resource_arn: 'arn:aws:rds:us-east-1:demo:db/demo-database-dev',
      resource_name: 'demo-database-dev',
      resource_type: 'RDS::DBInstance',
      resource_subtype: 'db.r5.large',
      region: 'us-east-1',
      account_id: 'demo-account',
      current_size: 'db.r5.large',
      current_monthly_cost: 165.00,
      current_hourly_cost: 0.226,
      recommended_size: 'db.t3.medium',
      recommendation_type: 'downsize',
      recommendation_priority: 4,
      potential_monthly_savings: 117.00,
      potential_annual_savings: 1404.00,
      ml_confidence: 0.88,
      utilization_patterns: {
        avgCpuUsage: 5.2,
        maxCpuUsage: 18.7,
        avgConnections: 3.5,
        hasRealMetrics: true,
        dataCompleteness: 0.92,
        trend: 'stable',
        seasonality: 'none'
      },
      implementation_complexity: 'medium',
      implementation_steps: [
        { order: 1, action: 'Create snapshot', command: 'aws rds create-db-snapshot --db-instance-identifier demo-database-dev --db-snapshot-identifier backup-before-resize', riskLevel: 'safe' },
        { order: 2, action: 'Modify instance class', command: 'aws rds modify-db-instance --db-instance-identifier demo-database-dev --db-instance-class db.t3.medium --apply-immediately', riskLevel: 'safe' }
      ],
      risk_assessment: 'medium',
      analyzed_at: new Date().toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-ml-004',
      resource_id: 'eipalloc-demo-unused-001',
      resource_arn: 'arn:aws:ec2:us-east-1:demo:elastic-ip/eipalloc-demo-unused-001',
      resource_name: '54.200.100.50',
      resource_type: 'EC2::ElasticIp',
      resource_subtype: 'vpc',
      region: 'us-east-1',
      account_id: 'demo-account',
      current_size: '54.200.100.50',
      current_monthly_cost: 3.65,
      current_hourly_cost: 0.005,
      recommended_size: null,
      recommendation_type: 'terminate',
      recommendation_priority: 2,
      potential_monthly_savings: 3.65,
      potential_annual_savings: 43.80,
      ml_confidence: 0.99,
      utilization_patterns: {
        avgCpuUsage: 0,
        maxCpuUsage: 0,
        hasRealMetrics: true,
        dataCompleteness: 1,
        trend: 'stable',
        seasonality: 'none'
      },
      implementation_complexity: 'low',
      implementation_steps: [
        { order: 1, action: 'Release Elastic IP', command: 'aws ec2 release-address --allocation-id eipalloc-demo-unused-001', riskLevel: 'destructive' }
      ],
      risk_assessment: 'low',
      analyzed_at: new Date().toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-ml-005',
      resource_id: 'nat-demo-lowtraffic-001',
      resource_arn: 'arn:aws:ec2:us-east-1:demo:natgateway/nat-demo-lowtraffic-001',
      resource_name: 'demo-nat-dev',
      resource_type: 'EC2::NatGateway',
      resource_subtype: 'public',
      region: 'us-east-1',
      account_id: 'demo-account',
      current_size: 'NAT Gateway',
      current_monthly_cost: 32.85,
      current_hourly_cost: 0.045,
      recommended_size: 'NAT Instance (t3.nano)',
      recommendation_type: 'migrate',
      recommendation_priority: 3,
      potential_monthly_savings: 24.85,
      potential_annual_savings: 298.20,
      ml_confidence: 0.85,
      utilization_patterns: {
        avgBytesProcessed: 1.2,
        maxBytesProcessed: 5.8,
        hasRealMetrics: true,
        dataCompleteness: 0.88,
        trend: 'stable',
        seasonality: 'none'
      },
      implementation_complexity: 'high',
      implementation_steps: [
        { order: 1, action: 'Launch NAT Instance', command: 'aws ec2 run-instances --image-id ami-nat --instance-type t3.nano', riskLevel: 'safe' },
        { order: 2, action: 'Update route tables', command: 'aws ec2 replace-route --route-table-id rtb-xxx --destination-cidr-block 0.0.0.0/0 --instance-id i-nat', riskLevel: 'safe' },
        { order: 3, action: 'Delete NAT Gateway', command: 'aws ec2 delete-nat-gateway --nat-gateway-id nat-demo-lowtraffic-001', riskLevel: 'destructive' }
      ],
      risk_assessment: 'high',
      analyzed_at: new Date().toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-ml-006',
      resource_id: 'demo-lambda-oversized',
      resource_arn: 'arn:aws:lambda:us-east-1:demo:function:demo-lambda-oversized',
      resource_name: 'demo-lambda-oversized',
      resource_type: 'Lambda::Function',
      resource_subtype: '2048 MB',
      region: 'us-east-1',
      account_id: 'demo-account',
      current_size: '2048 MB',
      current_monthly_cost: 25.00,
      current_hourly_cost: 0.034,
      recommended_size: '512 MB',
      recommendation_type: 'downsize',
      recommendation_priority: 3,
      potential_monthly_savings: 18.75,
      potential_annual_savings: 225.00,
      ml_confidence: 0.87,
      utilization_patterns: {
        avgMemoryUsed: 180,
        maxMemoryUsed: 320,
        avgDuration: 450,
        maxDuration: 1200,
        hasRealMetrics: true,
        dataCompleteness: 0.90,
        trend: 'stable',
        seasonality: 'none'
      },
      implementation_complexity: 'low',
      implementation_steps: [
        { order: 1, action: 'Update memory configuration', command: 'aws lambda update-function-configuration --function-name demo-lambda-oversized --memory-size 512', riskLevel: 'safe' }
      ],
      risk_assessment: 'low',
      analyzed_at: new Date().toISOString(),
      _isDemo: true
    }
  ];

  const totalMonthlySavings = recommendations.reduce((sum, r) => sum + r.potential_monthly_savings, 0);
  const totalAnnualSavings = totalMonthlySavings * 12;

  return {
    _isDemo: true,
    success: true,
    analyzed_resources: 45,
    total_monthly_savings: parseFloat(totalMonthlySavings.toFixed(2)),
    total_annual_savings: parseFloat(totalAnnualSavings.toFixed(2)),
    recommendations,
    summary: {
      by_type: {
        EC2: { count: 2, savings: 155.12 },
        RDS: { count: 1, savings: 117.00 },
        EBS: { count: 1, savings: 50.00 },
        Lambda: { count: 1, savings: 18.75 },
        NAT: { count: 1, savings: 24.85 }
      },
      by_recommendation: {
        terminate: 2,
        downsize: 3,
        'auto-scale': 0,
        optimize: 0,
        migrate: 1
      },
      execution_time: '2.45',
      aws_account_number: 'demo-123456789012'
    }
  };
}

/**
 * Gera dados de Well-Architected Framework para demonstração
 */
export function generateDemoWellArchitectedData() {
  const pillars = [
    {
      pillar: 'operational_excellence',
      score: 78,
      checks_passed: 7,
      checks_failed: 2,
      critical_issues: 0,
      recommendations: [
        {
          check_name: 'CloudWatch Alarms',
          description: '3 recursos sem alarmes configurados',
          recommendation: 'Configure alarmes para CPU, memória e erros de aplicação',
          severity: 'medium',
          _isDemo: true
        },
        {
          check_name: 'Resource Tagging',
          description: '5 instâncias sem tags adequadas',
          recommendation: 'Adicione tags: Owner, Project, Environment, CostCenter',
          severity: 'low',
          _isDemo: true
        }
      ]
    },
    {
      pillar: 'security',
      score: 65,
      checks_passed: 5,
      checks_failed: 3,
      critical_issues: 2,
      recommendations: [
        {
          check_name: 'Security Groups Abertos',
          description: '2 Security Groups com acesso 0.0.0.0/0 em portas sensíveis',
          recommendation: 'Restrinja acesso SSH/RDP apenas a IPs conhecidos',
          severity: 'critical',
          _isDemo: true
        },
        {
          check_name: 'MFA',
          description: '3 usuários IAM sem MFA habilitado',
          recommendation: 'Habilite MFA para todos os usuários com acesso ao console',
          severity: 'critical',
          _isDemo: true
        },
        {
          check_name: 'S3 Encryption',
          description: '2 buckets sem criptografia at-rest',
          recommendation: 'Habilite SSE-S3 ou SSE-KMS em todos os buckets',
          severity: 'high',
          _isDemo: true
        }
      ]
    },
    {
      pillar: 'reliability',
      score: 72,
      checks_passed: 6,
      checks_failed: 2,
      critical_issues: 1,
      recommendations: [
        {
          check_name: 'RDS Multi-AZ',
          description: '1 banco de dados de produção sem Multi-AZ',
          recommendation: 'Habilite Multi-AZ para alta disponibilidade',
          severity: 'critical',
          _isDemo: true
        },
        {
          check_name: 'Multi-AZ Distribution',
          description: 'Instâncias concentradas em única AZ',
          recommendation: 'Distribua workloads em múltiplas AZs',
          severity: 'high',
          _isDemo: true
        }
      ]
    },
    {
      pillar: 'performance_efficiency',
      score: 82,
      checks_passed: 8,
      checks_failed: 2,
      critical_issues: 0,
      recommendations: [
        {
          check_name: 'Instance Generation',
          description: '4 instâncias usando geração antiga (t2, m4)',
          recommendation: 'Migre para t3/m5 para melhor custo-benefício',
          severity: 'medium',
          _isDemo: true
        },
        {
          check_name: 'RDS Storage',
          description: '1 banco usando storage magnético',
          recommendation: 'Migre para gp3 para melhor performance',
          severity: 'high',
          _isDemo: true
        }
      ]
    },
    {
      pillar: 'cost_optimization',
      score: 68,
      checks_passed: 5,
      checks_failed: 3,
      critical_issues: 0,
      recommendations: [
        {
          check_name: 'Stopped Instances',
          description: '3 instâncias paradas há mais de 30 dias',
          recommendation: 'Termine instâncias ou crie AMIs e delete',
          severity: 'medium',
          _isDemo: true
        },
        {
          check_name: 'Reserved Instances',
          description: '8 instâncias on-demand elegíveis para RI',
          recommendation: 'Considere Reserved Instances para economia de até 40%',
          severity: 'medium',
          _isDemo: true
        },
        {
          check_name: 'Unattached EBS',
          description: '5 volumes EBS não anexados',
          recommendation: 'Delete volumes não utilizados ou crie snapshots',
          severity: 'low',
          _isDemo: true
        }
      ]
    },
    {
      pillar: 'sustainability',
      score: 75,
      checks_passed: 6,
      checks_failed: 2,
      critical_issues: 0,
      recommendations: [
        {
          check_name: 'Graviton',
          description: '6 instâncias não utilizam processadores Graviton',
          recommendation: 'Considere t4g/m6g para melhor eficiência energética',
          severity: 'low',
          _isDemo: true
        },
        {
          check_name: 'Region Selection',
          description: 'Recursos em região com maior pegada de carbono',
          recommendation: 'Considere migrar para regiões com energia renovável',
          severity: 'low',
          _isDemo: true
        }
      ]
    }
  ];

  const overallScore = Math.round(pillars.reduce((sum, p) => sum + p.score, 0) / pillars.length);

  return {
    _isDemo: true,
    success: true,
    scan_id: 'demo-wa-scan-001',
    overall_score: overallScore,
    pillars
  };
}

/**
 * Gera dados de previsão de orçamento para demonstração
 */
export function generateDemoBudgetForecast() {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  // Gerar dados históricos dos últimos 6 meses
  const historicalData = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date(currentYear, currentMonth - i, 1);
    const baseAmount = 3500 + Math.random() * 1000;
    historicalData.push({
      month: date.toISOString().slice(0, 7),
      actual: Math.round(baseAmount * 100) / 100,
      budget: 4500,
      variance: Math.round((4500 - baseAmount) * 100) / 100
    });
  }

  // Gerar previsão para os próximos 3 meses
  const forecastData = [];
  for (let i = 1; i <= 3; i++) {
    const date = new Date(currentYear, currentMonth + i, 1);
    const baseAmount = 3800 + Math.random() * 800;
    const lowerBound = baseAmount * 0.9;
    const upperBound = baseAmount * 1.15;
    forecastData.push({
      month: date.toISOString().slice(0, 7),
      predicted: Math.round(baseAmount * 100) / 100,
      lower_bound: Math.round(lowerBound * 100) / 100,
      upper_bound: Math.round(upperBound * 100) / 100,
      confidence: 0.85 - (i * 0.05)
    });
  }

  return {
    _isDemo: true,
    current_month: {
      budget: 4500,
      spent: 2847.52,
      remaining: 1652.48,
      days_remaining: 30 - today.getDate(),
      projected_spend: 4125.30,
      on_track: true
    },
    historical: historicalData,
    forecast: forecastData,
    insights: [
      {
        type: 'trend',
        message: 'Gastos estão 8% abaixo do orçamento nos últimos 3 meses',
        severity: 'info',
        _isDemo: true
      },
      {
        type: 'anomaly',
        message: 'Aumento de 15% em custos de EC2 detectado na última semana',
        severity: 'warning',
        _isDemo: true
      },
      {
        type: 'recommendation',
        message: 'Considere aumentar o orçamento de S3 em 10% para o próximo trimestre',
        severity: 'info',
        _isDemo: true
      }
    ]
  };
}

/**
 * Gera análise de RI/SP para demonstração
 */
export function generateDemoRISPAnalysis() {
  return {
    _isDemo: true,
    summary: {
      totalOnDemandSpend: 4250.00,
      potentialSavings: 1487.50,
      savingsPercentage: 35,
      recommendedRIs: 8,
      recommendedSPs: 3
    },
    reservedInstances: [
      {
        id: `${DEMO_ID_PREFIX}ri-001`,
        instanceType: 'm5.xlarge',
        region: 'us-east-1',
        currentOnDemandCost: 876.00,
        riCost: 547.50,
        savings: 328.50,
        savingsPercentage: 37.5,
        utilizationRate: 92,
        recommendation: 'Comprar RI de 1 ano com pagamento parcial',
        _isDemo: true
      },
      {
        id: `${DEMO_ID_PREFIX}ri-002`,
        instanceType: 'r5.2xlarge',
        region: 'us-east-1',
        currentOnDemandCost: 1248.00,
        riCost: 748.80,
        savings: 499.20,
        savingsPercentage: 40,
        utilizationRate: 88,
        recommendation: 'Comprar RI de 3 anos com pagamento total',
        _isDemo: true
      }
    ],
    savingsPlans: [
      {
        id: `${DEMO_ID_PREFIX}sp-001`,
        type: 'Compute Savings Plan',
        commitment: 500.00,
        estimatedSavings: 175.00,
        savingsPercentage: 35,
        coverage: 78,
        recommendation: 'Ativar Compute SP de 1 ano',
        _isDemo: true
      }
    ]
  };
}

/**
 * Gera dados de otimização de custos para demonstração
 */
export function generateDemoCostOptimizations() {
  const optimizations = [
    {
      type: 'terminate_stopped_instance',
      resource_id: 'i-demo-stopped-001',
      resource_type: 'EC2',
      resource_name: 'demo-web-server-old',
      current_cost: 45.00,
      optimized_cost: 0,
      savings: 45.00,
      recommendation: 'Terminate stopped instance "demo-web-server-old" or create AMI and terminate',
      details: 'Stopped for 45 days',
      priority: 'high' as const,
      effort: 'low' as const,
      category: 'Idle Resources',
      _isDemo: true
    },
    {
      type: 'delete_unattached_volume',
      resource_id: 'vol-demo-unattached-001',
      resource_type: 'EBS',
      resource_name: 'demo-data-backup',
      current_cost: 25.00,
      optimized_cost: 0,
      savings: 25.00,
      recommendation: 'Delete unattached volume "demo-data-backup" (250GB gp2)',
      details: 'Create snapshot before deletion if data might be needed',
      priority: 'high' as const,
      effort: 'low' as const,
      category: 'Idle Resources',
      _isDemo: true
    },
    {
      type: 'migrate_gp2_to_gp3',
      resource_id: 'vol-demo-gp2-001',
      resource_type: 'EBS',
      resource_name: 'demo-app-data',
      current_cost: 50.00,
      optimized_cost: 40.00,
      savings: 10.00,
      recommendation: 'Migrate "demo-app-data" from gp2 to gp3',
      details: 'gp3 offers 20% lower cost and better baseline performance',
      priority: 'medium' as const,
      effort: 'low' as const,
      category: 'Modernization',
      _isDemo: true
    },
    {
      type: 'upgrade_instance_generation',
      resource_id: 'i-demo-old-gen-001',
      resource_type: 'EC2',
      resource_name: 'demo-api-server',
      current_cost: 136.00,
      optimized_cost: 108.80,
      savings: 27.20,
      recommendation: 'Upgrade "demo-api-server" from t2.xlarge to t3.xlarge',
      details: 'New generation offers better price/performance ratio',
      priority: 'medium' as const,
      effort: 'medium' as const,
      category: 'Modernization',
      _isDemo: true
    },
    {
      type: 'rightsize_instance',
      resource_id: 'i-demo-oversized-001',
      resource_type: 'EC2',
      resource_name: 'demo-batch-processor',
      current_cost: 280.00,
      optimized_cost: 140.00,
      savings: 140.00,
      recommendation: 'Consider rightsizing "demo-batch-processor" from m5.2xlarge to m5.xlarge',
      details: 'Review CloudWatch metrics to confirm utilization before downsizing',
      priority: 'medium' as const,
      effort: 'medium' as const,
      category: 'Right-sizing',
      _isDemo: true
    },
    {
      type: 'savings_plan_candidate',
      resource_id: 'i-demo-ondemand-001',
      resource_type: 'EC2',
      resource_name: 'demo-production-web',
      current_cost: 182.00,
      optimized_cost: 131.04,
      savings: 50.96,
      recommendation: 'Consider Savings Plan for "demo-production-web" (r5.xlarge)',
      details: '1-year Compute Savings Plan can save up to 28%',
      priority: 'low' as const,
      effort: 'low' as const,
      category: 'Commitment Discounts',
      _isDemo: true
    },
    {
      type: 'release_unused_eip',
      resource_id: 'eipalloc-demo-001',
      resource_type: 'Elastic IP',
      resource_name: '54.123.45.67',
      current_cost: 3.65,
      optimized_cost: 0,
      savings: 3.65,
      recommendation: 'Release unused Elastic IP 54.123.45.67',
      details: 'Unassociated Elastic IPs incur charges',
      priority: 'high' as const,
      effort: 'low' as const,
      category: 'Idle Resources',
      _isDemo: true
    },
    {
      type: 'upgrade_rds_generation',
      resource_id: 'demo-database-prod',
      resource_type: 'RDS',
      resource_name: 'demo-database-prod',
      current_cost: 260.00,
      optimized_cost: 225.00,
      savings: 35.00,
      recommendation: 'Upgrade "demo-database-prod" from db.m4.xlarge to db.m5.xlarge',
      details: 'New generation offers better performance at similar or lower cost',
      priority: 'medium' as const,
      effort: 'medium' as const,
      category: 'Modernization',
      _isDemo: true
    },
    {
      type: 'disable_multiaz_nonprod',
      resource_id: 'demo-database-staging',
      resource_type: 'RDS',
      resource_name: 'demo-database-staging',
      current_cost: 192.00,
      optimized_cost: 96.00,
      savings: 96.00,
      recommendation: 'Disable Multi-AZ for non-production database "demo-database-staging"',
      details: 'Multi-AZ doubles cost - not needed for dev/test environments',
      priority: 'high' as const,
      effort: 'low' as const,
      category: 'Configuration',
      _isDemo: true
    },
    {
      type: 'rds_storage_gp3',
      resource_id: 'demo-database-analytics',
      resource_type: 'RDS',
      resource_name: 'demo-database-analytics',
      current_cost: 57.50,
      optimized_cost: 40.00,
      savings: 17.50,
      recommendation: 'Migrate "demo-database-analytics" storage from gp2 to gp3',
      details: 'gp3 storage is ~30% cheaper with better baseline performance',
      priority: 'medium' as const,
      effort: 'low' as const,
      category: 'Modernization',
      _isDemo: true
    },
    {
      type: 'cleanup_old_snapshots',
      resource_id: 'vol-demo-snapshots',
      resource_type: 'EBS Snapshot',
      resource_name: 'Snapshots for vol-demo-data',
      current_cost: 45.00,
      optimized_cost: 13.50,
      savings: 31.50,
      recommendation: 'Clean up 25 snapshots for volume vol-demo-data',
      details: 'Implement snapshot lifecycle policy to retain only necessary snapshots',
      priority: 'medium' as const,
      effort: 'low' as const,
      category: 'Storage Optimization',
      _isDemo: true
    },
    {
      type: 'rightsize_lambda_memory',
      resource_id: 'arn:aws:lambda:us-east-1:demo:function:demo-image-processor',
      resource_type: 'Lambda',
      resource_name: 'demo-image-processor',
      current_cost: 33.33,
      optimized_cost: 16.67,
      savings: 16.66,
      recommendation: 'Review memory allocation for "demo-image-processor" (2048MB)',
      details: 'Use AWS Lambda Power Tuning to find optimal memory',
      priority: 'medium' as const,
      effort: 'low' as const,
      category: 'Right-sizing',
      _isDemo: true
    }
  ];

  // Calculate summary
  const totalSavings = optimizations.reduce((sum, opt) => sum + opt.savings, 0);
  
  // Group by category
  const byCategory = optimizations.reduce((acc, opt) => {
    acc[opt.category] = (acc[opt.category] || 0) + opt.savings;
    return acc;
  }, {} as Record<string, number>);

  return {
    _isDemo: true,
    optimizations,
    summary: {
      total_opportunities: optimizations.length,
      monthly_savings: parseFloat(totalSavings.toFixed(2)),
      annual_savings: parseFloat((totalSavings * 12).toFixed(2)),
      by_priority: {
        high: optimizations.filter(o => o.priority === 'high').length,
        medium: optimizations.filter(o => o.priority === 'medium').length,
        low: optimizations.filter(o => o.priority === 'low').length,
      },
      by_category: byCategory,
      analysis_duration_ms: 1250,
    }
  };
}

/**
 * Wrapper para retornar dados demo ou reais baseado no modo da organização
 * 
 * REGRA CRÍTICA - FAIL-SAFE:
 * - Em caso de QUALQUER erro na verificação, retorna dados REAIS
 * - Só retorna dados demo se isOrganizationInDemoMode() retornar EXPLICITAMENTE true
 * - Isso garante que NUNCA retornamos dados demo por engano
 */
export async function getDemoOrRealData<T>(
  prisma: any,
  organizationId: string,
  demoDataGenerator: () => T,
  realDataFetcher: () => Promise<T>
): Promise<{ data: T; isDemo: boolean }> {
  try {
    // Verificar se está em modo demo
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    
    if (isDemo === true) {
      // APENAS se isDemo for EXPLICITAMENTE true
      logger.info('Returning demo data', { organizationId, isDemo: true });
      return {
        data: demoDataGenerator(),
        isDemo: true
      };
    }
    
    // Qualquer outro caso (false, undefined, erro) = dados reais
    const data = await realDataFetcher();
    return {
      data,
      isDemo: false
    };
  } catch (error) {
    // CRÍTICO: Em caso de erro, SEMPRE retorna dados reais (fail-safe)
    logger.error('Error in getDemoOrRealData - returning real data', error as Error);
    const data = await realDataFetcher();
    return {
      data,
      isDemo: false
    };
  }
}

/**
 * Gera dados de previsão de incidentes para demonstração
 */
export function generateDemoPredictIncidents() {
  const now = new Date();
  
  const predictions = [
    {
      id: 'demo-prediction-001',
      organization_id: 'demo-org',
      resource_id: 'critical-findings-aggregate',
      resource_name: '3 Critical Security Findings',
      resource_type: 'Security Hub Findings',
      region: 'All Regions',
      incident_type: 'security_incident',
      severity: 'critical',
      probability: 78,
      confidence_score: 85,
      timeframe: '24-48 hours',
      time_to_incident_hours: 36,
      description: '3 critical security finding(s) require immediate attention. Risk of security breach if not addressed.',
      recommendation: 'Immediate remediation of critical findings required',
      recommended_actions: '1. Review and remediate 3 critical findings immediately\n2. Investigate root cause of each critical finding\n3. Enable enhanced monitoring for affected resources\n4. Review and tighten IAM policies',
      contributing_factors: [
        { factor: 'Critical Findings', value: '3 pending', weight: 0.6 },
        { factor: 'High Findings', value: '8 pending', weight: 0.2 },
        { factor: 'Security Events', value: '5 in 7 days', weight: 0.2 }
      ],
      indicators: { criticalFindings: 3, highFindings: 8, securityEvents: 5 },
      status: 'active',
      created_at: now,
      _isDemo: true
    },
    {
      id: 'demo-prediction-002',
      organization_id: 'demo-org',
      resource_id: 'cost-analysis-aggregate',
      resource_name: 'Cost Anomaly (+65%)',
      resource_type: 'AWS Cost Explorer',
      region: 'All Regions',
      incident_type: 'cost_spike',
      severity: 'high',
      probability: 72,
      confidence_score: 75,
      timeframe: '2-4 days',
      time_to_incident_hours: 72,
      description: 'Significant cost increase detected: $185.50/day vs average $112.42/day (+65%)',
      recommendation: 'Investigate cost anomaly and optimize resources',
      recommended_actions: '1. Review recent resource provisioning\n2. Check for unused or oversized resources\n3. Analyze cost by service breakdown\n4. Set up cost alerts and budgets',
      contributing_factors: [
        { factor: 'Current Daily Cost', value: '$185.50', weight: 0.4 },
        { factor: 'Average Daily Cost', value: '$112.42', weight: 0.3 },
        { factor: 'Cost Increase', value: '+65%', weight: 0.3 }
      ],
      indicators: { currentCost: 185.50, avgCost: 112.42, costIncrease: 65 },
      status: 'active',
      created_at: now,
      _isDemo: true
    },
    {
      id: 'demo-prediction-003',
      organization_id: 'demo-org',
      resource_id: 'drift-detection-aggregate',
      resource_name: '15 Configuration Drifts',
      resource_type: 'CloudFormation Drift',
      region: 'All Regions',
      incident_type: 'configuration_drift',
      severity: 'medium',
      probability: 65,
      confidence_score: 72,
      timeframe: '2-5 days',
      time_to_incident_hours: 72,
      description: '15 configuration drifts detected in the last 30 days. Infrastructure may deviate from desired state.',
      recommendation: 'Review and remediate configuration drifts',
      recommended_actions: '1. Review 15 detected drifts\n2. Prioritize critical/high severity drifts\n3. Update IaC templates to match desired state\n4. Implement drift detection automation',
      contributing_factors: [
        { factor: 'Security Group Drifts', value: '6 detected', weight: 0.4 },
        { factor: 'IAM Policy Drifts', value: '5 detected', weight: 0.35 },
        { factor: 'S3 Bucket Drifts', value: '4 detected', weight: 0.25 }
      ],
      indicators: { driftsCount: 15 },
      status: 'active',
      created_at: now,
      _isDemo: true
    },
    {
      id: 'demo-prediction-004',
      organization_id: 'demo-org',
      resource_id: 'iam-anomaly-aggregate',
      resource_name: '8 IAM Anomalies',
      resource_type: 'IAM Access Analyzer',
      region: 'All Regions',
      incident_type: 'iam_security_risk',
      severity: 'medium',
      probability: 58,
      confidence_score: 70,
      timeframe: '2-5 days',
      time_to_incident_hours: 72,
      description: '8 IAM behavior anomalies detected. Review for potential unauthorized access.',
      recommendation: 'Review IAM activities and rotate credentials if necessary',
      recommended_actions: '1. Review anomalous IAM activities\n2. Check for unauthorized access patterns\n3. Rotate potentially compromised credentials\n4. Enable MFA for all users',
      contributing_factors: [
        { factor: 'IAM Anomalies', value: '8 detected', weight: 0.8 },
        { factor: 'Security Events', value: '5 in 7 days', weight: 0.2 }
      ],
      indicators: { iamAnomalies: 8, securityEvents: 5 },
      status: 'active',
      created_at: now,
      _isDemo: true
    }
  ];

  return {
    _isDemo: true,
    success: true,
    predictions_count: predictions.length,
    predictions,
    summary: {
      total: predictions.length,
      critical: 1,
      high: 1,
      medium: 2,
      low: 0
    },
    analyzedData: {
      alerts: 25,
      criticalFindings: 3,
      highFindings: 8,
      recentDrifts: 15,
      costDataPoints: 7,
      failedEndpoints: 5,
      securityEvents: 5,
      iamAnomalies: 8
    },
    executionTime: '1.85s'
  };
}

/**
 * Gera dados de análise inteligente de alertas para demonstração
 */
export function generateDemoIntelligentAlertsAnalysis() {
  const now = new Date();
  
  const analyzedAlerts = [
    {
      alertId: 'demo-alert-001',
      title: 'Cost spike detected for Amazon EC2',
      severity: 'medium',
      triggeredAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      analysis: {
        isFalsePositive: true,
        confidence: 0.85,
        reason: 'Cost variation is within normal range (<10%)',
        recommendation: 'Adjust alert threshold to reduce noise'
      },
      _isDemo: true
    },
    {
      alertId: 'demo-alert-002',
      title: 'Endpoint /api/health degraded',
      severity: 'high',
      triggeredAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      analysis: {
        isFalsePositive: true,
        confidence: 0.75,
        reason: 'Endpoint recovered quickly (<1 minute), likely transient issue',
        recommendation: 'Consider increasing alert threshold'
      },
      _isDemo: true
    },
    {
      alertId: 'demo-alert-003',
      title: 'Security Group modified',
      severity: 'critical',
      triggeredAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      analysis: {
        isFalsePositive: false,
        confidence: 0.92,
        reason: 'Alert appears legitimate - unauthorized port opened',
        recommendation: 'Review and take appropriate action immediately'
      },
      _isDemo: true
    },
    {
      alertId: 'demo-alert-004',
      title: 'RDS CPU utilization high',
      severity: 'medium',
      triggeredAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      analysis: {
        isFalsePositive: true,
        confidence: 0.90,
        reason: 'Multiple similar alerts in 24h indicate recurring issue or misconfiguration',
        recommendation: 'Review alert rule or fix underlying issue'
      },
      _isDemo: true
    },
    {
      alertId: 'demo-alert-005',
      title: 'Lambda function errors increased',
      severity: 'high',
      triggeredAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      analysis: {
        isFalsePositive: false,
        confidence: 0.88,
        reason: 'Alert appears legitimate - error rate above threshold',
        recommendation: 'Review Lambda logs and recent deployments'
      },
      _isDemo: true
    }
  ];

  return {
    _isDemo: true,
    success: true,
    alertsAnalyzed: analyzedAlerts.length,
    falsePositives: analyzedAlerts.filter(a => a.analysis.isFalsePositive).length,
    autoResolved: analyzedAlerts.filter(a => a.analysis.isFalsePositive && a.analysis.confidence > 0.8).length,
    alerts: analyzedAlerts
  };
}

export default {
  isOrganizationInDemoMode,
  generateDemoSecurityFindings,
  generateDemoCostData,
  generateDemoWafEvents,
  generateDemoExecutiveDashboard,
  generateDemoComplianceData,
  generateDemoRISPAnalysis,
  generateDemoCostOptimizations,
  generateDemoAnomalyDetection,
  generateDemoMLWasteDetection,
  generateDemoWellArchitectedData,
  generateDemoBudgetForecast,
  generateDemoPredictIncidents,
  generateDemoIntelligentAlertsAnalysis,
  getDemoOrRealData
};
