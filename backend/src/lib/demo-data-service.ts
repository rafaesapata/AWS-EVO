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
  http_method: string;
  severity: string;
  threat_type: string;
  rule_matched: string;
  is_campaign: boolean;
  user_agent: string;
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
  const httpMethods = ['GET', 'POST', 'PUT', 'DELETE'];
  const severities = ['critical', 'high', 'medium', 'low'];
  const threatTypes = ['sql_injection', 'xss', 'bot', 'rate_limit', 'geo_block', 'path_traversal'];
  const userAgents = [
    'Mozilla/5.0 (compatible; Googlebot/2.1)',
    'python-requests/2.28.0',
    'curl/7.88.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'sqlmap/1.7',
    'Nikto/2.1.6',
  ];

  const events: DemoWafEvent[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now - Math.random() * 24 * 60 * 60 * 1000).toISOString();
    const action = actions[Math.floor(Math.random() * actions.length)];
    const rule = rules[Math.floor(Math.random() * rules.length)];
    // Blocked requests get higher severity
    const severity = action === 'BLOCK' 
      ? severities[Math.floor(Math.random() * 2)] // critical or high
      : severities[2 + Math.floor(Math.random() * 2)]; // medium or low
    
    events.push({
      id: `${DEMO_ID_PREFIX}waf-${i.toString().padStart(4, '0')}`,
      timestamp,
      action,
      rule_id: rule,
      rule_matched: rule,
      source_ip: `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
      country: countries[Math.floor(Math.random() * countries.length)],
      uri: uris[Math.floor(Math.random() * uris.length)],
      http_method: httpMethods[Math.floor(Math.random() * httpMethods.length)],
      severity,
      threat_type: action === 'BLOCK' ? threatTypes[Math.floor(Math.random() * threatTypes.length)] : threatTypes[Math.floor(Math.random() * threatTypes.length)],
      is_campaign: Math.random() < 0.15, // 15% chance of being part of a campaign
      user_agent: userAgents[Math.floor(Math.random() * userAgents.length)],
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

/**
 * Gera dados de análise CloudTrail para demonstração
 */
export function generateDemoCloudTrailAnalysis() {
  const now = new Date();
  const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const events = [
    {
      event_name: 'AuthorizeSecurityGroupIngress',
      event_time: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      user_name: 'demo-developer',
      user_type: 'IAMUser',
      risk_level: 'high',
      risk_reasons: ['Evento de alto risco: AuthorizeSecurityGroupIngress', 'Modificação de Security Group'],
      error_code: null,
      source_ip_address: '203.0.113.50',
      aws_region: 'us-east-1',
      security_explanation: 'Regra de entrada adicionada ao Security Group, potencialmente expondo recursos.',
      remediation_suggestion: 'Revise as regras de entrada e remova acessos desnecessários.',
      _isDemo: true
    },
    {
      event_name: 'ConsoleLogin',
      event_time: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      user_name: 'root',
      user_type: 'Root',
      risk_level: 'critical',
      risk_reasons: ['Ação executada pelo usuário root', 'Login do usuário root no console'],
      error_code: null,
      source_ip_address: '198.51.100.25',
      aws_region: 'us-east-1',
      security_explanation: 'Login do usuário root detectado. O uso do root deve ser evitado.',
      remediation_suggestion: 'Crie usuários IAM com permissões específicas e habilite MFA no root.',
      _isDemo: true
    },
    {
      event_name: 'AttachUserPolicy',
      event_time: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      user_name: 'demo-admin',
      user_type: 'IAMUser',
      risk_level: 'high',
      risk_reasons: ['Evento de alto risco: AttachUserPolicy', 'Alteração de política IAM'],
      error_code: null,
      source_ip_address: '192.0.2.100',
      aws_region: 'us-east-1',
      security_explanation: 'Política IAM anexada a usuário, expandindo permissões.',
      remediation_suggestion: 'Revise a política anexada e aplique princípio de menor privilégio.',
      _isDemo: true
    },
    {
      event_name: 'PutBucketPolicy',
      event_time: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      user_name: 'demo-developer',
      user_type: 'IAMUser',
      risk_level: 'high',
      risk_reasons: ['Evento de alto risco: PutBucketPolicy'],
      error_code: null,
      source_ip_address: '203.0.113.50',
      aws_region: 'us-east-1',
      security_explanation: 'Política de bucket S3 modificada, pode expor dados.',
      remediation_suggestion: 'Verifique se a política não permite acesso público indevido.',
      _isDemo: true
    },
    {
      event_name: 'CreateAccessKey',
      event_time: new Date(now.getTime() - 10 * 60 * 60 * 1000),
      user_name: 'demo-service-account',
      user_type: 'IAMUser',
      risk_level: 'high',
      risk_reasons: ['Evento de alto risco: CreateAccessKey'],
      error_code: null,
      source_ip_address: '10.0.1.50',
      aws_region: 'us-east-1',
      security_explanation: 'Nova access key criada. Monitore o uso desta credencial.',
      remediation_suggestion: 'Implemente rotação automática de access keys.',
      _isDemo: true
    },
    {
      event_name: 'ConsoleLogin',
      event_time: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      user_name: 'demo-developer',
      user_type: 'IAMUser',
      risk_level: 'high',
      risk_reasons: ['Falha de login no console AWS'],
      error_code: 'AccessDenied',
      source_ip_address: '185.220.101.45',
      aws_region: 'us-east-1',
      security_explanation: 'Tentativa de login falhou. Pode indicar ataque de força bruta.',
      remediation_suggestion: 'Verifique se o IP é conhecido e considere bloquear IPs suspeitos.',
      _isDemo: true
    },
    {
      event_name: 'RunInstances',
      event_time: new Date(now.getTime() - 14 * 60 * 60 * 1000),
      user_name: 'demo-developer',
      user_type: 'IAMUser',
      risk_level: 'medium',
      risk_reasons: ['Evento de risco médio: RunInstances'],
      error_code: null,
      source_ip_address: '203.0.113.50',
      aws_region: 'us-east-1',
      security_explanation: 'Nova instância EC2 criada.',
      remediation_suggestion: 'Verifique se a instância segue as políticas de segurança.',
      _isDemo: true
    },
    {
      event_name: 'AssumeRole',
      event_time: new Date(now.getTime() - 16 * 60 * 60 * 1000),
      user_name: 'demo-lambda-role',
      user_type: 'AssumedRole',
      risk_level: 'medium',
      risk_reasons: ['Evento de risco médio: AssumeRole'],
      error_code: null,
      source_ip_address: null,
      aws_region: 'us-east-1',
      security_explanation: 'Role assumida por serviço AWS.',
      remediation_suggestion: 'Monitore padrões de uso de roles.',
      _isDemo: true
    },
    {
      event_name: 'DeleteBucket',
      event_time: new Date(now.getTime() - 18 * 60 * 60 * 1000),
      user_name: 'demo-admin',
      user_type: 'IAMUser',
      risk_level: 'medium',
      risk_reasons: ['Evento de risco médio: DeleteBucket'],
      error_code: null,
      source_ip_address: '192.0.2.100',
      aws_region: 'us-east-1',
      security_explanation: 'Bucket S3 deletado. Verifique se foi intencional.',
      remediation_suggestion: 'Habilite versionamento e MFA Delete em buckets críticos.',
      _isDemo: true
    },
    {
      event_name: 'DescribeInstances',
      event_time: new Date(now.getTime() - 20 * 60 * 60 * 1000),
      user_name: 'demo-readonly',
      user_type: 'IAMUser',
      risk_level: 'low',
      risk_reasons: [],
      error_code: null,
      source_ip_address: '10.0.1.100',
      aws_region: 'us-east-1',
      security_explanation: null,
      remediation_suggestion: null,
      _isDemo: true
    }
  ];

  return {
    _isDemo: true,
    success: true,
    events,
    summary: {
      total: events.length,
      critical: events.filter(e => e.risk_level === 'critical').length,
      high: events.filter(e => e.risk_level === 'high').length,
      medium: events.filter(e => e.risk_level === 'medium').length,
      low: events.filter(e => e.risk_level === 'low').length,
      errors: events.filter(e => e.error_code).length,
      topUsers: [
        { user: 'demo-developer', count: 4 },
        { user: 'demo-admin', count: 2 },
        { user: 'root', count: 1 },
        { user: 'demo-service-account', count: 1 },
        { user: 'demo-lambda-role', count: 1 },
        { user: 'demo-readonly', count: 1 }
      ],
      topEvents: [
        { event: 'ConsoleLogin', count: 2 },
        { event: 'AuthorizeSecurityGroupIngress', count: 1 },
        { event: 'AttachUserPolicy', count: 1 },
        { event: 'PutBucketPolicy', count: 1 },
        { event: 'CreateAccessKey', count: 1 },
        { event: 'RunInstances', count: 1 },
        { event: 'AssumeRole', count: 1 },
        { event: 'DeleteBucket', count: 1 },
        { event: 'DescribeInstances', count: 1 }
      ],
      timeRange: {
        start: startTime.toISOString(),
        end: now.toISOString(),
        hoursBack: 24
      },
      regionsScanned: ['us-east-1', 'us-west-2', 'eu-west-1']
    }
  };
}

/**
 * Gera dados de alertas para demonstração
 */
export function generateDemoAlerts() {
  const now = new Date();
  
  return [
    {
      id: 'demo-alert-001',
      organization_id: 'demo-org',
      rule_id: 'demo-rule-001',
      severity: 'critical',
      title: 'Security Group aberto para 0.0.0.0/0 na porta 22',
      message: 'O Security Group sg-demo-web-001 foi modificado para permitir acesso SSH de qualquer IP.',
      triggered_at: new Date(now.getTime() - 30 * 60 * 1000),
      acknowledged_at: null,
      resolved_at: null,
      metadata: { resource_id: 'sg-demo-web-001', port: 22, cidr: '0.0.0.0/0' },
      rule: { name: 'Security Group Open Access', type: 'security' },
      _isDemo: true
    },
    {
      id: 'demo-alert-002',
      organization_id: 'demo-org',
      rule_id: 'demo-rule-002',
      severity: 'high',
      title: 'Custo diário excedeu limite de $200',
      message: 'O custo diário atual é de $245.50, excedendo o limite configurado de $200.',
      triggered_at: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      acknowledged_at: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      resolved_at: null,
      metadata: { current_cost: 245.50, threshold: 200, currency: 'USD' },
      rule: { name: 'Daily Cost Threshold', type: 'cost' },
      _isDemo: true
    },
    {
      id: 'demo-alert-003',
      organization_id: 'demo-org',
      rule_id: 'demo-rule-003',
      severity: 'high',
      title: 'Endpoint /api/payments com latência elevada',
      message: 'O endpoint /api/payments está com latência média de 2.5s (limite: 500ms).',
      triggered_at: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      acknowledged_at: null,
      resolved_at: null,
      metadata: { endpoint: '/api/payments', latency_ms: 2500, threshold_ms: 500 },
      rule: { name: 'Endpoint Latency', type: 'performance' },
      _isDemo: true
    },
    {
      id: 'demo-alert-004',
      organization_id: 'demo-org',
      rule_id: 'demo-rule-004',
      severity: 'medium',
      title: 'RDS CPU acima de 80%',
      message: 'A instância RDS demo-database-prod está com CPU em 85% há mais de 15 minutos.',
      triggered_at: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      acknowledged_at: new Date(now.getTime() - 5 * 60 * 60 * 1000),
      resolved_at: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      metadata: { instance: 'demo-database-prod', cpu_percent: 85, threshold: 80 },
      rule: { name: 'RDS CPU Utilization', type: 'performance' },
      _isDemo: true
    },
    {
      id: 'demo-alert-005',
      organization_id: 'demo-org',
      rule_id: 'demo-rule-005',
      severity: 'low',
      title: 'Certificado SSL expira em 30 dias',
      message: 'O certificado SSL para api.demo.com expira em 30 dias.',
      triggered_at: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      acknowledged_at: null,
      resolved_at: null,
      metadata: { domain: 'api.demo.com', expires_in_days: 30 },
      rule: { name: 'SSL Certificate Expiry', type: 'compliance' },
      _isDemo: true
    }
  ];
}

/**
 * Gera dados de GuardDuty para demonstração
 */
export function generateDemoGuardDutyFindings() {
  return {
    _isDemo: true,
    findings_count: 8,
    critical: 1,
    high: 3,
    medium: 3,
    low: 1,
    regions_scanned: 3,
    findings: [
      {
        id: 'demo-gd-001',
        type: 'UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS',
        severity: 8.5,
        severity_label: 'Critical',
        title: 'Credentials from EC2 instance used from external IP',
        description: 'EC2 instance credentials are being used from an IP address outside of AWS.',
        resource_type: 'Instance',
        resource_id: 'i-demo-compromised-001',
        region: 'us-east-1',
        first_seen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        last_seen: new Date().toISOString(),
        count: 15,
        _isDemo: true
      },
      {
        id: 'demo-gd-002',
        type: 'Recon:EC2/PortProbeUnprotectedPort',
        severity: 5.0,
        severity_label: 'High',
        title: 'Unprotected port on EC2 instance is being probed',
        description: 'EC2 instance i-demo-web-001 has an unprotected port which is being probed by a known malicious host.',
        resource_type: 'Instance',
        resource_id: 'i-demo-web-001',
        region: 'us-east-1',
        first_seen: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        last_seen: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        count: 342,
        _isDemo: true
      },
      {
        id: 'demo-gd-003',
        type: 'UnauthorizedAccess:EC2/SSHBruteForce',
        severity: 5.0,
        severity_label: 'High',
        title: 'SSH brute force attack detected',
        description: 'EC2 instance i-demo-bastion-001 is being targeted by SSH brute force attacks.',
        resource_type: 'Instance',
        resource_id: 'i-demo-bastion-001',
        region: 'us-west-2',
        first_seen: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        last_seen: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        count: 1250,
        _isDemo: true
      },
      {
        id: 'demo-gd-004',
        type: 'CryptoCurrency:EC2/BitcoinTool.B!DNS',
        severity: 5.0,
        severity_label: 'High',
        title: 'EC2 instance querying cryptocurrency-related domain',
        description: 'EC2 instance i-demo-worker-001 is querying a domain associated with Bitcoin mining.',
        resource_type: 'Instance',
        resource_id: 'i-demo-worker-001',
        region: 'us-east-1',
        first_seen: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        last_seen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        count: 45,
        _isDemo: true
      },
      {
        id: 'demo-gd-005',
        type: 'Behavior:EC2/NetworkPortUnusual',
        severity: 3.0,
        severity_label: 'Medium',
        title: 'EC2 instance communicating on unusual port',
        description: 'EC2 instance i-demo-app-001 is communicating on port 6667 which is unusual for this instance.',
        resource_type: 'Instance',
        resource_id: 'i-demo-app-001',
        region: 'us-east-1',
        first_seen: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        last_seen: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        count: 28,
        _isDemo: true
      },
      {
        id: 'demo-gd-006',
        type: 'Persistence:IAMUser/AnomalousBehavior',
        severity: 3.0,
        severity_label: 'Medium',
        title: 'Anomalous IAM user behavior detected',
        description: 'IAM user demo-developer performed API calls that are anomalous compared to their baseline.',
        resource_type: 'AccessKey',
        resource_id: 'AKIADEMO12345',
        region: 'us-east-1',
        first_seen: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        last_seen: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        count: 12,
        _isDemo: true
      },
      {
        id: 'demo-gd-007',
        type: 'Policy:S3/BucketBlockPublicAccessDisabled',
        severity: 2.0,
        severity_label: 'Medium',
        title: 'S3 Block Public Access disabled',
        description: 'S3 bucket demo-public-assets had Block Public Access settings disabled.',
        resource_type: 'S3Bucket',
        resource_id: 'demo-public-assets',
        region: 'us-east-1',
        first_seen: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        last_seen: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        count: 1,
        _isDemo: true
      },
      {
        id: 'demo-gd-008',
        type: 'Recon:IAMUser/UserPermissions',
        severity: 0.5,
        severity_label: 'Low',
        title: 'IAM user enumerated permissions',
        description: 'IAM user demo-auditor performed permission enumeration API calls.',
        resource_type: 'AccessKey',
        resource_id: 'AKIADEMO67890',
        region: 'us-east-1',
        first_seen: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        last_seen: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        count: 5,
        _isDemo: true
      }
    ]
  };
}

/**
 * Gera dados de Drift Detection para demonstração
 */
export function generateDemoDriftDetection() {
  const now = new Date();
  
  const drifts = [
    {
      id: 'demo-drift-001',
      aws_account_id: 'demo-account',
      resource_id: 'i-demo-web-001',
      resource_type: 'EC2::Instance',
      resource_name: 'demo-web-server',
      drift_type: 'configuration_drift',
      detected_at: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      severity: 'high',
      diff: {
        field: 'instanceType',
        expected: 't3.medium',
        actual: 't3.xlarge'
      },
      expected_state: { instanceType: 't3.medium', state: 'running' },
      actual_state: { instanceType: 't3.xlarge', state: 'running' },
      _isDemo: true
    },
    {
      id: 'demo-drift-002',
      aws_account_id: 'demo-account',
      resource_id: 'sg-demo-web-001',
      resource_type: 'EC2::SecurityGroup',
      resource_name: 'demo-web-sg',
      drift_type: 'configuration_drift',
      detected_at: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      severity: 'critical',
      diff: {
        field: 'ingressRules',
        expected: [{ port: 443, cidr: '10.0.0.0/8' }],
        actual: [{ port: 443, cidr: '0.0.0.0/0' }, { port: 22, cidr: '0.0.0.0/0' }]
      },
      expected_state: { ingressRules: [{ port: 443, cidr: '10.0.0.0/8' }] },
      actual_state: { ingressRules: [{ port: 443, cidr: '0.0.0.0/0' }, { port: 22, cidr: '0.0.0.0/0' }] },
      _isDemo: true
    },
    {
      id: 'demo-drift-003',
      aws_account_id: 'demo-account',
      resource_id: 'i-demo-unknown-001',
      resource_type: 'EC2::Instance',
      resource_name: 'unknown-instance',
      drift_type: 'created',
      detected_at: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      severity: 'high',
      diff: {
        instanceType: 'm5.2xlarge',
        state: 'running',
        securityGroups: ['sg-demo-default']
      },
      expected_state: null,
      actual_state: { instanceType: 'm5.2xlarge', state: 'running' },
      _isDemo: true
    },
    {
      id: 'demo-drift-004',
      aws_account_id: 'demo-account',
      resource_id: 'demo-bucket-config',
      resource_type: 'S3::Bucket',
      resource_name: 'demo-bucket-config',
      drift_type: 'configuration_drift',
      detected_at: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      severity: 'medium',
      diff: {
        field: 'versioningEnabled',
        expected: true,
        actual: false
      },
      expected_state: { versioningEnabled: true, encryption: 'AES256' },
      actual_state: { versioningEnabled: false, encryption: 'AES256' },
      _isDemo: true
    },
    {
      id: 'demo-drift-005',
      aws_account_id: 'demo-account',
      resource_id: 'i-demo-deleted-001',
      resource_type: 'EC2::Instance',
      resource_name: 'demo-batch-processor',
      drift_type: 'deleted',
      detected_at: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      severity: 'critical',
      diff: { message: 'Resource no longer exists in AWS' },
      expected_state: { instanceType: 'c5.xlarge', state: 'running' },
      actual_state: null,
      _isDemo: true
    },
    {
      id: 'demo-drift-006',
      aws_account_id: 'demo-account',
      resource_id: 'arn:aws:iam::demo:policy/demo-admin-policy',
      resource_type: 'IAM::Policy',
      resource_name: 'demo-admin-policy',
      drift_type: 'configuration_drift',
      detected_at: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      severity: 'critical',
      diff: {
        field: 'policyDocument',
        expected: { Effect: 'Allow', Action: ['s3:GetObject'], Resource: '*' },
        actual: { Effect: 'Allow', Action: ['*'], Resource: '*' }
      },
      expected_state: { actions: ['s3:GetObject'] },
      actual_state: { actions: ['*'] },
      _isDemo: true
    }
  ];

  const createdCount = drifts.filter(d => d.drift_type === 'created').length;
  const modifiedCount = drifts.filter(d => d.drift_type === 'configuration_drift').length;
  const deletedCount = drifts.filter(d => d.drift_type === 'deleted').length;
  const criticalCount = drifts.filter(d => d.severity === 'critical').length;
  const highCount = drifts.filter(d => d.severity === 'high').length;

  return {
    _isDemo: true,
    success: true,
    drifts_detected: drifts.length,
    execution_time: '2.35',
    summary: {
      created: createdCount,
      configuration_drift: modifiedCount,
      deleted: deletedCount,
      critical: criticalCount,
      high: highCount,
    },
    drifts
  };
}

/**
 * Gera dados de Edge Services para demonstração
 */
export function generateDemoEdgeServices() {
  const now = new Date();
  
  return {
    _isDemo: true,
    success: true,
    message: 'Dados de demonstração - 8 serviços de borda',
    servicesFound: 8,
    metricsCollected: 8,
    breakdown: {
      cloudfront: 3,
      waf: 2,
      loadBalancer: 3
    },
    regionsScanned: ['us-east-1', 'us-west-2', 'eu-west-1', 'sa-east-1'],
    fromCache: false,
    services: [
      {
        id: 'demo-edge-cf-001',
        serviceType: 'cloudfront',
        serviceName: 'demo-main-distribution',
        serviceId: 'E1DEMO123456',
        status: 'active',
        region: 'global',
        domainName: 'd1demo123.cloudfront.net',
        originDomain: 'demo-origin.s3.amazonaws.com',
        metadata: {
          aliases: ['demo.example.com', 'www.demo.example.com'],
          priceClass: 'PriceClass_All',
          httpVersion: 'http2',
          isIPV6Enabled: true,
          webACLId: 'arn:aws:wafv2::demo:webacl/demo-waf-001',
          enabled: true
        },
        metrics: {
          requests: 125000,
          cacheHits: 106250,
          cacheMisses: 18750,
          bandwidthGb: 45.8,
          error4xx: 125,
          error5xx: 12
        },
        _isDemo: true
      },
      {
        id: 'demo-edge-cf-002',
        serviceType: 'cloudfront',
        serviceName: 'demo-api-distribution',
        serviceId: 'E2DEMO789012',
        status: 'active',
        region: 'global',
        domainName: 'd2demo456.cloudfront.net',
        originDomain: 'api.demo.example.com',
        metadata: {
          aliases: ['api.demo.example.com'],
          priceClass: 'PriceClass_100',
          httpVersion: 'http2and3',
          isIPV6Enabled: true,
          webACLId: 'arn:aws:wafv2::demo:webacl/demo-waf-001',
          enabled: true
        },
        metrics: {
          requests: 85000,
          cacheHits: 42500,
          cacheMisses: 42500,
          bandwidthGb: 12.3,
          error4xx: 850,
          error5xx: 42
        },
        _isDemo: true
      },
      {
        id: 'demo-edge-cf-003',
        serviceType: 'cloudfront',
        serviceName: 'demo-static-assets',
        serviceId: 'E3DEMO345678',
        status: 'active',
        region: 'global',
        domainName: 'd3demo789.cloudfront.net',
        originDomain: 'demo-assets.s3.amazonaws.com',
        metadata: {
          aliases: ['static.demo.example.com'],
          priceClass: 'PriceClass_200',
          httpVersion: 'http2',
          isIPV6Enabled: true,
          webACLId: null,
          enabled: true
        },
        metrics: {
          requests: 250000,
          cacheHits: 237500,
          cacheMisses: 12500,
          bandwidthGb: 125.5,
          error4xx: 25,
          error5xx: 0
        },
        _isDemo: true
      },
      {
        id: 'demo-edge-waf-001',
        serviceType: 'waf',
        serviceName: 'demo-waf-global',
        serviceId: 'demo-waf-global-001',
        status: 'active',
        region: 'global',
        metadata: {
          arn: 'arn:aws:wafv2::demo:global/webacl/demo-waf-global/abc123',
          scope: 'CLOUDFRONT',
          rulesCount: 12
        },
        metrics: {
          requests: 210000,
          blockedRequests: 4200,
          allowedRequests: 205800
        },
        _isDemo: true
      },
      {
        id: 'demo-edge-waf-002',
        serviceType: 'waf',
        serviceName: 'demo-waf-regional',
        serviceId: 'demo-waf-regional-001',
        status: 'active',
        region: 'us-east-1',
        metadata: {
          arn: 'arn:aws:wafv2:us-east-1:demo:regional/webacl/demo-waf-regional/def456',
          scope: 'REGIONAL',
          rulesCount: 8
        },
        metrics: {
          requests: 95000,
          blockedRequests: 1900,
          allowedRequests: 93100
        },
        _isDemo: true
      },
      {
        id: 'demo-edge-alb-001',
        serviceType: 'load_balancer',
        serviceName: 'demo-web-alb',
        serviceId: 'arn:aws:elasticloadbalancing:us-east-1:demo:loadbalancer/app/demo-web-alb/abc123',
        status: 'active',
        region: 'us-east-1',
        domainName: 'demo-web-alb-123456.us-east-1.elb.amazonaws.com',
        metadata: {
          type: 'application',
          scheme: 'internet-facing',
          vpcId: 'vpc-demo-001',
          availabilityZones: ['us-east-1a', 'us-east-1b'],
          securityGroups: ['sg-demo-alb-001'],
          ipAddressType: 'ipv4'
        },
        metrics: {
          requests: 75000,
          responseTime: 125,
          error4xx: 375,
          error5xx: 75
        },
        _isDemo: true
      },
      {
        id: 'demo-edge-alb-002',
        serviceType: 'load_balancer',
        serviceName: 'demo-api-alb',
        serviceId: 'arn:aws:elasticloadbalancing:us-east-1:demo:loadbalancer/app/demo-api-alb/def456',
        status: 'active',
        region: 'us-east-1',
        domainName: 'demo-api-alb-789012.us-east-1.elb.amazonaws.com',
        metadata: {
          type: 'application',
          scheme: 'internet-facing',
          vpcId: 'vpc-demo-001',
          availabilityZones: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
          securityGroups: ['sg-demo-alb-002'],
          ipAddressType: 'dualstack'
        },
        metrics: {
          requests: 120000,
          responseTime: 85,
          error4xx: 1200,
          error5xx: 120
        },
        _isDemo: true
      },
      {
        id: 'demo-edge-nlb-001',
        serviceType: 'load_balancer',
        serviceName: 'demo-tcp-nlb',
        serviceId: 'arn:aws:elasticloadbalancing:us-west-2:demo:loadbalancer/net/demo-tcp-nlb/ghi789',
        status: 'active',
        region: 'us-west-2',
        domainName: 'demo-tcp-nlb-345678.us-west-2.elb.amazonaws.com',
        metadata: {
          type: 'network',
          scheme: 'internet-facing',
          vpcId: 'vpc-demo-002',
          availabilityZones: ['us-west-2a', 'us-west-2b'],
          securityGroups: [],
          ipAddressType: 'ipv4'
        },
        metrics: {
          requests: 50000,
          bandwidthGb: 8.5
        },
        _isDemo: true
      }
    ]
  };
}

/**
 * Gera dados de métricas em tempo real para demonstração
 */
export function generateDemoRealtimeMetrics() {
  const now = new Date();
  
  return {
    _isDemo: true,
    success: true,
    metrics: [
      {
        resourceType: 'EC2',
        resourceId: 'i-demo-web-001',
        metrics: {
          cpuUtilization: 45.2 + Math.random() * 10,
          cpuMax: 78.5 + Math.random() * 5
        },
        timestamp: now.toISOString()
      },
      {
        resourceType: 'EC2',
        resourceId: 'i-demo-api-001',
        metrics: {
          cpuUtilization: 32.8 + Math.random() * 8,
          cpuMax: 65.2 + Math.random() * 10
        },
        timestamp: now.toISOString()
      },
      {
        resourceType: 'RDS',
        resourceId: 'demo-database-prod',
        metrics: {
          cpuUtilization: 28.5 + Math.random() * 5
        },
        timestamp: now.toISOString()
      },
      {
        resourceType: 'Lambda',
        resourceId: 'demo-api-handler',
        metrics: {
          invocations: Math.floor(150 + Math.random() * 50)
        },
        timestamp: now.toISOString()
      },
      {
        resourceType: 'Lambda',
        resourceId: 'demo-worker-function',
        metrics: {
          invocations: Math.floor(80 + Math.random() * 30)
        },
        timestamp: now.toISOString()
      }
    ],
    timestamp: now.toISOString()
  };
}

/**
 * Gera dados de métricas CloudWatch para demonstração
 */
export function generateDemoCloudWatchMetrics() {
  const now = new Date();
  const periodHours = 3;
  
  // Gerar recursos demo
  const resources = [
    { resourceId: 'i-demo-web-001', resourceName: 'demo-web-server', resourceType: 'ec2', region: 'us-east-1', status: 'running', metadata: { instanceType: 't3.medium' } },
    { resourceId: 'i-demo-api-001', resourceName: 'demo-api-server', resourceType: 'ec2', region: 'us-east-1', status: 'running', metadata: { instanceType: 't3.large' } },
    { resourceId: 'i-demo-worker-001', resourceName: 'demo-worker', resourceType: 'ec2', region: 'us-east-1', status: 'running', metadata: { instanceType: 'm5.xlarge' } },
    { resourceId: 'demo-database-prod', resourceName: 'demo-database-prod', resourceType: 'rds', region: 'us-east-1', status: 'available', metadata: { engine: 'postgres', instanceClass: 'db.r5.large' } },
    { resourceId: 'demo-database-replica', resourceName: 'demo-database-replica', resourceType: 'rds', region: 'us-east-1', status: 'available', metadata: { engine: 'postgres', instanceClass: 'db.r5.large' } },
    { resourceId: 'demo-api-handler', resourceName: 'demo-api-handler', resourceType: 'lambda', region: 'us-east-1', status: 'active', metadata: { runtime: 'nodejs18.x', memorySize: 512 } },
    { resourceId: 'demo-worker-function', resourceName: 'demo-worker-function', resourceType: 'lambda', region: 'us-east-1', status: 'active', metadata: { runtime: 'nodejs18.x', memorySize: 1024 } },
    { resourceId: 'demo-auth-function', resourceName: 'demo-auth-function', resourceType: 'lambda', region: 'us-east-1', status: 'active', metadata: { runtime: 'nodejs18.x', memorySize: 256 } },
    { resourceId: 'demo-redis-cluster', resourceName: 'demo-redis-cluster', resourceType: 'elasticache', region: 'us-east-1', status: 'available', metadata: { engine: 'redis', cacheNodeType: 'cache.r5.large' } },
    { resourceId: 'app/demo-web-alb/abc123', resourceName: 'demo-web-alb', resourceType: 'alb', region: 'us-east-1', status: 'active', metadata: { dnsName: 'demo-web-alb.us-east-1.elb.amazonaws.com', scheme: 'internet-facing' } }
  ];
  
  // Gerar métricas demo
  const metrics: any[] = [];
  const metricConfigs: Record<string, string[]> = {
    ec2: ['CPUUtilization', 'NetworkIn', 'NetworkOut'],
    rds: ['CPUUtilization', 'DatabaseConnections', 'FreeStorageSpace'],
    lambda: ['Invocations', 'Errors', 'Duration'],
    elasticache: ['CPUUtilization', 'CurrConnections'],
    alb: ['RequestCount', 'TargetResponseTime']
  };
  
  // Gerar datapoints para cada recurso e métrica
  for (const resource of resources) {
    const resourceMetrics = metricConfigs[resource.resourceType] || [];
    
    for (const metricName of resourceMetrics) {
      // Gerar 12 datapoints (5 min intervals for 1 hour)
      for (let i = 11; i >= 0; i--) {
        const timestamp = new Date(now.getTime() - i * 5 * 60 * 1000);
        let value = 0;
        
        // Gerar valores realistas baseados no tipo de métrica
        switch (metricName) {
          case 'CPUUtilization':
            value = 25 + Math.random() * 40 + Math.sin(i / 3) * 10;
            break;
          case 'NetworkIn':
          case 'NetworkOut':
            value = (500000 + Math.random() * 1000000) * (1 + Math.sin(i / 4) * 0.3);
            break;
          case 'DatabaseConnections':
            value = Math.floor(15 + Math.random() * 30);
            break;
          case 'FreeStorageSpace':
            value = 50000000000 - i * 100000000; // ~50GB diminuindo
            break;
          case 'Invocations':
            value = Math.floor(100 + Math.random() * 200);
            break;
          case 'Errors':
            value = Math.floor(Math.random() * 5);
            break;
          case 'Duration':
            value = 150 + Math.random() * 100;
            break;
          case 'CurrConnections':
            value = Math.floor(50 + Math.random() * 100);
            break;
          case 'RequestCount':
            value = Math.floor(500 + Math.random() * 1000);
            break;
          case 'TargetResponseTime':
            value = 0.05 + Math.random() * 0.15;
            break;
        }
        
        metrics.push({
          resourceId: resource.resourceId,
          resourceName: resource.resourceName,
          resourceType: resource.resourceType,
          metricName,
          value: parseFloat(value.toFixed(2)),
          timestamp,
          unit: getMetricUnit(metricName),
          _isDemo: true
        });
      }
    }
  }
  
  return {
    _isDemo: true,
    success: true,
    message: `Dados de demonstração - ${metrics.length} métricas de ${resources.length} recursos`,
    resourcesFound: resources.length,
    metricsCollected: metrics.length,
    regionsScanned: ['us-east-1'],
    resources: resources.map(r => ({ ...r, _isDemo: true })),
    metrics,
    duration: 1250
  };
}

// Helper para unidades de métricas
function getMetricUnit(metricName: string): string {
  const units: Record<string, string> = {
    CPUUtilization: 'Percent',
    NetworkIn: 'Bytes',
    NetworkOut: 'Bytes',
    DatabaseConnections: 'Count',
    FreeStorageSpace: 'Bytes',
    Invocations: 'Count',
    Errors: 'Count',
    Duration: 'Milliseconds',
    CurrConnections: 'Count',
    RequestCount: 'Count',
    TargetResponseTime: 'Seconds'
  };
  return units[metricName] || 'None';
}

/**
 * Gera dados de Security Scans para demonstração
 * 
 * IMPORTANTE: Esta função gera dados demo completos para a página de Security Scans
 */
export function generateDemoSecurityScans() {
  const now = new Date();
  
  const scans = [
    {
      id: 'demo-scan-001',
      organization_id: 'demo-org',
      aws_account_id: 'demo-account',
      scan_type: 'deep',
      status: 'completed',
      started_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      completed_at: new Date(now.getTime() - 1.5 * 60 * 60 * 1000).toISOString(),
      findings_count: 30,
      critical_count: 2,
      high_count: 5,
      medium_count: 8,
      low_count: 15,
      scan_config: { level: 'deep', frameworks: ['CIS', 'LGPD', 'PCI-DSS'] },
      created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-scan-002',
      organization_id: 'demo-org',
      aws_account_id: 'demo-account',
      scan_type: 'standard',
      status: 'completed',
      started_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      completed_at: new Date(now.getTime() - 23.5 * 60 * 60 * 1000).toISOString(),
      findings_count: 25,
      critical_count: 1,
      high_count: 4,
      medium_count: 10,
      low_count: 10,
      scan_config: { level: 'standard', frameworks: ['CIS'] },
      created_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-scan-003',
      organization_id: 'demo-org',
      aws_account_id: 'demo-account',
      scan_type: 'quick',
      status: 'completed',
      started_at: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      completed_at: new Date(now.getTime() - 47.9 * 60 * 60 * 1000).toISOString(),
      findings_count: 18,
      critical_count: 2,
      high_count: 3,
      medium_count: 6,
      low_count: 7,
      scan_config: { level: 'quick' },
      created_at: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      _isDemo: true
    }
  ];
  
  return {
    _isDemo: true,
    scans,
    total: scans.length,
    summary: {
      running: 0,
      completed: 3,
      failed: 0,
      totalFindings: 73,
      criticalFindings: 5
    }
  };
}

/**
 * Gera dados de Monitored Endpoints para demonstração
 */
export function generateDemoMonitoredEndpoints() {
  const now = new Date();
  const DEMO_ORG_ID = 'demo-organization-id';
  
  // Gerar histórico de checks para cada endpoint
  const generateCheckHistory = (endpointId: string, status: 'up' | 'down' | 'degraded', avgResponseTime: number) => {
    const history = [];
    for (let i = 0; i < 10; i++) {
      const checkedAt = new Date(now.getTime() - i * 5 * 60 * 1000); // 5 min intervals
      const isUp = status === 'up' || (status === 'degraded' && Math.random() > 0.3);
      const responseTime = isUp 
        ? avgResponseTime + Math.floor((Math.random() - 0.5) * avgResponseTime * 0.4)
        : 0;
      
      history.push({
        id: `${DEMO_ID_PREFIX}check-${endpointId}-${i}`,
        endpoint_id: endpointId,
        status: isUp ? 'up' : 'down',
        status_code: isUp ? 200 : (status === 'down' ? 503 : 504),
        response_time: responseTime,
        error: isUp ? null : (status === 'down' ? 'Connection refused' : 'Gateway timeout'),
        checked_at: checkedAt.toISOString(),
        _isDemo: true
      });
    }
    return history;
  };
  
  const endpoints = [
    {
      id: `${DEMO_ID_PREFIX}endpoint-001`,
      organization_id: DEMO_ORG_ID,
      name: 'API Principal',
      url: 'https://api.demo-company.com/health',
      timeout: 5000,
      is_active: true,
      alert_on_failure: true,
      monitor_ssl: true,
      ssl_alert_days: 30,
      ssl_expiry_date: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days
      ssl_issuer: 'Let\'s Encrypt',
      ssl_valid: true,
      last_status: 'up',
      last_checked_at: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
      last_response_time: 145,
      created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      check_history: generateCheckHistory('endpoint-001', 'up', 145),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}endpoint-002`,
      organization_id: DEMO_ORG_ID,
      name: 'Portal do Cliente',
      url: 'https://portal.demo-company.com',
      timeout: 5000,
      is_active: true,
      alert_on_failure: true,
      monitor_ssl: true,
      ssl_alert_days: 30,
      ssl_expiry_date: new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000).toISOString(), // 120 days
      ssl_issuer: 'DigiCert',
      ssl_valid: true,
      last_status: 'up',
      last_checked_at: new Date(now.getTime() - 3 * 60 * 1000).toISOString(),
      last_response_time: 89,
      created_at: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      check_history: generateCheckHistory('endpoint-002', 'up', 89),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}endpoint-003`,
      organization_id: DEMO_ORG_ID,
      name: 'API de Pagamentos',
      url: 'https://payments.demo-company.com/status',
      timeout: 3000,
      is_active: true,
      alert_on_failure: true,
      monitor_ssl: true,
      ssl_alert_days: 14,
      ssl_expiry_date: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days - expiring soon!
      ssl_issuer: 'Amazon',
      ssl_valid: true,
      last_status: 'degraded',
      last_checked_at: new Date(now.getTime() - 1 * 60 * 1000).toISOString(),
      last_response_time: 2850,
      created_at: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      check_history: generateCheckHistory('endpoint-003', 'degraded', 2500),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}endpoint-004`,
      organization_id: DEMO_ORG_ID,
      name: 'Webhook Service',
      url: 'https://webhooks.demo-company.com/ping',
      timeout: 5000,
      is_active: true,
      alert_on_failure: true,
      monitor_ssl: true,
      ssl_alert_days: 30,
      ssl_expiry_date: new Date(now.getTime() + 200 * 24 * 60 * 60 * 1000).toISOString(),
      ssl_issuer: 'Cloudflare',
      ssl_valid: true,
      last_status: 'up',
      last_checked_at: new Date(now.getTime() - 4 * 60 * 1000).toISOString(),
      last_response_time: 52,
      created_at: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      check_history: generateCheckHistory('endpoint-004', 'up', 52),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}endpoint-005`,
      organization_id: DEMO_ORG_ID,
      name: 'CDN Assets',
      url: 'https://cdn.demo-company.com/health',
      timeout: 5000,
      is_active: true,
      alert_on_failure: false,
      monitor_ssl: true,
      ssl_alert_days: 30,
      ssl_expiry_date: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      ssl_issuer: 'Amazon CloudFront',
      ssl_valid: true,
      last_status: 'up',
      last_checked_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      last_response_time: 28,
      created_at: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      check_history: generateCheckHistory('endpoint-005', 'up', 28),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}endpoint-006`,
      organization_id: DEMO_ORG_ID,
      name: 'Legacy API (Deprecated)',
      url: 'https://legacy-api.demo-company.com/v1/status',
      timeout: 10000,
      is_active: false,
      alert_on_failure: false,
      monitor_ssl: false,
      ssl_alert_days: 30,
      ssl_expiry_date: null,
      ssl_issuer: null,
      ssl_valid: null,
      last_status: 'down',
      last_checked_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      last_response_time: null,
      created_at: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      check_history: generateCheckHistory('endpoint-006', 'down', 0),
      _isDemo: true
    }
  ];
  
  return endpoints;
}

/**
 * Gera dados de Monitored Resources para demonstração
 * Retorna recursos no formato esperado pelo frontend
 */
export function generateDemoMonitoredResources() {
  const now = new Date();
  const DEMO_ORG_ID = 'demo-organization-id';
  const DEMO_ACCOUNT_ID = 'demo-aws-account';
  
  const resources = [
    {
      id: `${DEMO_ID_PREFIX}resource-001`,
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      resource_id: 'i-demo-web-001',
      resource_name: 'demo-web-server',
      resource_type: 'ec2',
      region: 'us-east-1',
      status: 'running',
      metadata: { instanceType: 't3.medium' },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}resource-002`,
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      resource_id: 'i-demo-api-001',
      resource_name: 'demo-api-server',
      resource_type: 'ec2',
      region: 'us-east-1',
      status: 'running',
      metadata: { instanceType: 't3.large' },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}resource-003`,
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      resource_id: 'i-demo-worker-001',
      resource_name: 'demo-worker',
      resource_type: 'ec2',
      region: 'us-east-1',
      status: 'running',
      metadata: { instanceType: 'm5.xlarge' },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}resource-004`,
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      resource_id: 'demo-database-prod',
      resource_name: 'demo-database-prod',
      resource_type: 'rds',
      region: 'us-east-1',
      status: 'available',
      metadata: { engine: 'postgres', instanceClass: 'db.r5.large' },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}resource-005`,
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      resource_id: 'demo-database-replica',
      resource_name: 'demo-database-replica',
      resource_type: 'rds',
      region: 'us-east-1',
      status: 'available',
      metadata: { engine: 'postgres', instanceClass: 'db.r5.large' },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}resource-006`,
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      resource_id: 'demo-api-handler',
      resource_name: 'demo-api-handler',
      resource_type: 'lambda',
      region: 'us-east-1',
      status: 'active',
      metadata: { runtime: 'nodejs18.x', memorySize: 512 },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}resource-007`,
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      resource_id: 'demo-worker-function',
      resource_name: 'demo-worker-function',
      resource_type: 'lambda',
      region: 'us-east-1',
      status: 'active',
      metadata: { runtime: 'nodejs18.x', memorySize: 1024 },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}resource-008`,
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      resource_id: 'demo-auth-function',
      resource_name: 'demo-auth-function',
      resource_type: 'lambda',
      region: 'us-east-1',
      status: 'active',
      metadata: { runtime: 'nodejs18.x', memorySize: 256 },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}resource-009`,
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      resource_id: 'demo-redis-cluster',
      resource_name: 'demo-redis-cluster',
      resource_type: 'elasticache',
      region: 'us-east-1',
      status: 'available',
      metadata: { engine: 'redis', cacheNodeType: 'cache.r5.large' },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: `${DEMO_ID_PREFIX}resource-010`,
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      resource_id: 'app/demo-web-alb/abc123',
      resource_name: 'demo-web-alb',
      resource_type: 'alb',
      region: 'us-east-1',
      status: 'active',
      metadata: { dnsName: 'demo-web-alb.us-east-1.elb.amazonaws.com', scheme: 'internet-facing' },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      _isDemo: true
    }
  ];
  
  return resources;
}

/**
 * Gera dados de Resource Metrics para demonstração
 * Retorna métricas no formato esperado pelo frontend
 */
export function generateDemoResourceMetrics() {
  const now = new Date();
  const DEMO_ORG_ID = 'demo-organization-id';
  const DEMO_ACCOUNT_ID = 'demo-aws-account';
  
  const metrics: any[] = [];
  
  // Configuração de métricas por tipo de recurso
  const resourceMetrics: Record<string, { resourceId: string; resourceName: string; resourceType: string; metrics: { name: string; baseValue: number; unit: string }[] }[]> = {
    ec2: [
      { resourceId: 'i-demo-web-001', resourceName: 'demo-web-server', resourceType: 'ec2', metrics: [
        { name: 'CPUUtilization', baseValue: 35, unit: 'Percent' },
        { name: 'NetworkIn', baseValue: 500000, unit: 'Bytes' },
        { name: 'NetworkOut', baseValue: 800000, unit: 'Bytes' }
      ]},
      { resourceId: 'i-demo-api-001', resourceName: 'demo-api-server', resourceType: 'ec2', metrics: [
        { name: 'CPUUtilization', baseValue: 45, unit: 'Percent' },
        { name: 'NetworkIn', baseValue: 1200000, unit: 'Bytes' },
        { name: 'NetworkOut', baseValue: 2500000, unit: 'Bytes' }
      ]},
      { resourceId: 'i-demo-worker-001', resourceName: 'demo-worker', resourceType: 'ec2', metrics: [
        { name: 'CPUUtilization', baseValue: 72, unit: 'Percent' },
        { name: 'NetworkIn', baseValue: 300000, unit: 'Bytes' },
        { name: 'NetworkOut', baseValue: 150000, unit: 'Bytes' }
      ]}
    ],
    rds: [
      { resourceId: 'demo-database-prod', resourceName: 'demo-database-prod', resourceType: 'rds', metrics: [
        { name: 'CPUUtilization', baseValue: 28, unit: 'Percent' },
        { name: 'DatabaseConnections', baseValue: 45, unit: 'Count' },
        { name: 'FreeStorageSpace', baseValue: 50000000000, unit: 'Bytes' }
      ]},
      { resourceId: 'demo-database-replica', resourceName: 'demo-database-replica', resourceType: 'rds', metrics: [
        { name: 'CPUUtilization', baseValue: 15, unit: 'Percent' },
        { name: 'DatabaseConnections', baseValue: 12, unit: 'Count' },
        { name: 'FreeStorageSpace', baseValue: 48000000000, unit: 'Bytes' }
      ]}
    ],
    lambda: [
      { resourceId: 'demo-api-handler', resourceName: 'demo-api-handler', resourceType: 'lambda', metrics: [
        { name: 'Invocations', baseValue: 1500, unit: 'Count' },
        { name: 'Errors', baseValue: 3, unit: 'Count' },
        { name: 'Duration', baseValue: 180, unit: 'Milliseconds' }
      ]},
      { resourceId: 'demo-worker-function', resourceName: 'demo-worker-function', resourceType: 'lambda', metrics: [
        { name: 'Invocations', baseValue: 800, unit: 'Count' },
        { name: 'Errors', baseValue: 1, unit: 'Count' },
        { name: 'Duration', baseValue: 450, unit: 'Milliseconds' }
      ]},
      { resourceId: 'demo-auth-function', resourceName: 'demo-auth-function', resourceType: 'lambda', metrics: [
        { name: 'Invocations', baseValue: 2200, unit: 'Count' },
        { name: 'Errors', baseValue: 0, unit: 'Count' },
        { name: 'Duration', baseValue: 85, unit: 'Milliseconds' }
      ]}
    ],
    elasticache: [
      { resourceId: 'demo-redis-cluster', resourceName: 'demo-redis-cluster', resourceType: 'elasticache', metrics: [
        { name: 'CPUUtilization', baseValue: 18, unit: 'Percent' },
        { name: 'CurrConnections', baseValue: 125, unit: 'Count' }
      ]}
    ],
    alb: [
      { resourceId: 'app/demo-web-alb/abc123', resourceName: 'demo-web-alb', resourceType: 'alb', metrics: [
        { name: 'RequestCount', baseValue: 5000, unit: 'Count' },
        { name: 'TargetResponseTime', baseValue: 0.12, unit: 'Seconds' }
      ]}
    ]
  };
  
  // Gerar métricas para cada recurso
  let metricId = 1;
  for (const [_type, resources] of Object.entries(resourceMetrics)) {
    for (const resource of resources) {
      for (const metric of resource.metrics) {
        // Gerar 12 datapoints (últimos 60 minutos, 5 min intervals)
        for (let i = 11; i >= 0; i--) {
          const timestamp = new Date(now.getTime() - i * 5 * 60 * 1000);
          const variation = 0.8 + Math.random() * 0.4; // ±20% variation
          const value = metric.baseValue * variation;
          
          metrics.push({
            id: `${DEMO_ID_PREFIX}metric-${metricId++}`,
            organization_id: DEMO_ORG_ID,
            aws_account_id: DEMO_ACCOUNT_ID,
            resource_id: resource.resourceId,
            resource_name: resource.resourceName,
            resource_type: resource.resourceType,
            metric_name: metric.name,
            metric_value: parseFloat(value.toFixed(2)),
            metric_unit: metric.unit,
            timestamp: timestamp.toISOString(),
            created_at: timestamp.toISOString(),
            _isDemo: true
          });
        }
      }
    }
  }
  
  return metrics;
}

/**
 * Gera dados de Azure Edge Services para demonstração
 */
export function generateDemoAzureEdgeServices() {
  return {
    _isDemo: true,
    success: true,
    message: 'Dados de demonstração - 10 serviços de borda Azure',
    servicesFound: 10,
    metricsCollected: 10,
    breakdown: {
      frontDoor: 2,
      applicationGateway: 2,
      loadBalancer: 2,
      natGateway: 2,
      apiManagement: 1,
      azureWaf: 1
    },
    fromCache: false,
    services: [
      {
        id: 'demo-azure-fd-001',
        serviceType: 'front_door',
        serviceName: 'demo-frontdoor-main',
        serviceId: '/subscriptions/demo-sub/resourceGroups/demo-rg/providers/Microsoft.Network/frontDoors/demo-fd-main',
        status: 'active',
        region: 'global',
        domainName: 'demo-fd-main.azurefd.net',
        metadata: {
          resourceState: 'Enabled',
          frontendEndpoints: ['demo-fd-main.azurefd.net', 'www.demo.com'],
          backendPools: ['api-pool', 'web-pool'],
          routingRules: 4,
          loadBalancingSettings: 2,
          healthProbeSettings: 2,
          hasWaf: true
        },
        metrics: {
          requests: 95000,
          blockedRequests: 1250,
          responseTime: 45,
          bandwidthGb: 28.5
        },
        _isDemo: true
      },
      {
        id: 'demo-azure-fd-002',
        serviceType: 'front_door',
        serviceName: 'demo-frontdoor-api',
        serviceId: '/subscriptions/demo-sub/resourceGroups/demo-rg/providers/Microsoft.Network/frontDoors/demo-fd-api',
        status: 'active',
        region: 'global',
        domainName: 'demo-fd-api.azurefd.net',
        metadata: {
          resourceState: 'Enabled',
          frontendEndpoints: ['demo-fd-api.azurefd.net', 'api.demo.com'],
          backendPools: ['api-backend'],
          routingRules: 2,
          loadBalancingSettings: 1,
          healthProbeSettings: 1,
          hasWaf: true
        },
        metrics: {
          requests: 65000,
          blockedRequests: 850,
          responseTime: 32,
          bandwidthGb: 15.2
        },
        _isDemo: true
      },
      {
        id: 'demo-azure-appgw-001',
        serviceType: 'application_gateway',
        serviceName: 'demo-appgw-web',
        serviceId: '/subscriptions/demo-sub/resourceGroups/demo-rg/providers/Microsoft.Network/applicationGateways/demo-appgw-web',
        status: 'active',
        region: 'eastus',
        metadata: {
          sku: 'WAF_v2',
          tier: 'WAF_v2',
          capacity: 2,
          operationalState: 'Running',
          provisioningState: 'Succeeded',
          frontendPorts: [80, 443],
          backendPools: 3,
          httpListeners: 4,
          requestRoutingRules: 4,
          sslCertificates: 2,
          hasWaf: true,
          wafMode: 'Prevention'
        },
        metrics: {
          requests: 45000,
          blockedRequests: 320,
          responseTime: 28,
          bandwidthGb: 8.7
        },
        _isDemo: true
      },
      {
        id: 'demo-azure-appgw-002',
        serviceType: 'application_gateway',
        serviceName: 'demo-appgw-internal',
        serviceId: '/subscriptions/demo-sub/resourceGroups/demo-rg/providers/Microsoft.Network/applicationGateways/demo-appgw-internal',
        status: 'active',
        region: 'westeurope',
        metadata: {
          sku: 'Standard_v2',
          tier: 'Standard_v2',
          capacity: 1,
          operationalState: 'Running',
          provisioningState: 'Succeeded',
          frontendPorts: [443],
          backendPools: 2,
          httpListeners: 2,
          requestRoutingRules: 2,
          sslCertificates: 1,
          hasWaf: false
        },
        metrics: {
          requests: 22000,
          blockedRequests: 0,
          responseTime: 35,
          bandwidthGb: 4.2
        },
        _isDemo: true
      },
      {
        id: 'demo-azure-lb-001',
        serviceType: 'load_balancer',
        serviceName: 'demo-lb-public',
        serviceId: '/subscriptions/demo-sub/resourceGroups/demo-rg/providers/Microsoft.Network/loadBalancers/demo-lb-public',
        status: 'active',
        region: 'eastus',
        metadata: {
          sku: 'Standard',
          tier: 'Regional',
          provisioningState: 'Succeeded',
          isPublic: true,
          frontendIPConfigurations: 2,
          backendAddressPools: 3,
          loadBalancingRules: 4,
          probes: 3,
          inboundNatRules: 2,
          outboundRules: 1
        },
        metrics: {
          requests: 180000,
          bandwidthGb: 42.5
        },
        _isDemo: true
      },
      {
        id: 'demo-azure-lb-002',
        serviceType: 'load_balancer',
        serviceName: 'demo-lb-internal',
        serviceId: '/subscriptions/demo-sub/resourceGroups/demo-rg/providers/Microsoft.Network/loadBalancers/demo-lb-internal',
        status: 'active',
        region: 'eastus',
        metadata: {
          sku: 'Standard',
          tier: 'Regional',
          provisioningState: 'Succeeded',
          isPublic: false,
          frontendIPConfigurations: 1,
          backendAddressPools: 2,
          loadBalancingRules: 3,
          probes: 2,
          inboundNatRules: 0,
          outboundRules: 0
        },
        metrics: {
          requests: 95000,
          bandwidthGb: 18.3
        },
        _isDemo: true
      },
      {
        id: 'demo-azure-nat-001',
        serviceType: 'nat_gateway',
        serviceName: 'demo-natgw-main',
        serviceId: '/subscriptions/demo-sub/resourceGroups/demo-rg/providers/Microsoft.Network/natGateways/demo-natgw-main',
        status: 'active',
        region: 'eastus',
        metadata: {
          sku: 'Standard',
          provisioningState: 'Succeeded',
          idleTimeoutInMinutes: 10,
          publicIpAddresses: 2,
          publicIpPrefixes: 0,
          subnets: 4,
          zones: ['1', '2', '3']
        },
        metrics: {
          requests: 250000,
          error5xx: 125,
          bandwidthGb: 85.2
        },
        _isDemo: true
      },
      {
        id: 'demo-azure-nat-002',
        serviceType: 'nat_gateway',
        serviceName: 'demo-natgw-secondary',
        serviceId: '/subscriptions/demo-sub/resourceGroups/demo-rg/providers/Microsoft.Network/natGateways/demo-natgw-secondary',
        status: 'active',
        region: 'westeurope',
        metadata: {
          sku: 'Standard',
          provisioningState: 'Succeeded',
          idleTimeoutInMinutes: 5,
          publicIpAddresses: 1,
          publicIpPrefixes: 0,
          subnets: 2,
          zones: ['1']
        },
        metrics: {
          requests: 120000,
          error5xx: 45,
          bandwidthGb: 32.8
        },
        _isDemo: true
      },
      {
        id: 'demo-azure-apim-001',
        serviceType: 'api_management',
        serviceName: 'demo-apim-main',
        serviceId: '/subscriptions/demo-sub/resourceGroups/demo-rg/providers/Microsoft.ApiManagement/service/demo-apim-main',
        status: 'active',
        region: 'eastus',
        domainName: 'demo-apim-main.azure-api.net',
        metadata: {
          sku: 'Premium',
          skuCapacity: 2,
          provisioningState: 'Succeeded',
          gatewayUrl: 'https://demo-apim-main.azure-api.net',
          portalUrl: 'https://demo-apim-main.portal.azure-api.net',
          managementApiUrl: 'https://demo-apim-main.management.azure-api.net',
          developerPortalUrl: 'https://demo-apim-main.developer.azure-api.net',
          publicIpAddresses: ['20.185.xxx.xxx'],
          virtualNetworkType: 'External',
          platformVersion: 'stv2'
        },
        metrics: {
          requests: 75000,
          cacheHits: 68000,
          error4xx: 450,
          error5xx: 25,
          responseTime: 42
        },
        _isDemo: true
      },
      {
        id: 'demo-azure-waf-001',
        serviceType: 'azure_waf',
        serviceName: 'WAF - demo-frontdoor-main',
        serviceId: '/subscriptions/demo-sub/resourceGroups/demo-rg/providers/Microsoft.Network/FrontDoorWebApplicationFirewallPolicies/demo-waf-policy',
        status: 'active',
        region: 'global',
        metadata: {
          associatedWith: 'front_door',
          frontDoorName: 'demo-frontdoor-main',
          policyMode: 'Prevention',
          customRules: 5,
          managedRules: 3,
          requestBodyCheck: true
        },
        metrics: {
          requests: 95000,
          blockedRequests: 1250
        },
        _isDemo: true
      }
    ]
  };
}

/**
 * Gera dados de Edge Services para tabela (formato banco de dados)
 * Usado pelo query-table quando a organização está em modo demo
 */
export function generateDemoEdgeServicesTable() {
  const now = new Date();
  const DEMO_ORG_ID = 'demo-organization-id';
  const DEMO_ACCOUNT_ID = 'demo-aws-account';
  
  return [
    {
      id: 'demo-edge-cf-001',
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      service_type: 'cloudfront',
      service_name: 'demo-main-distribution',
      service_id: 'E1DEMO123456',
      status: 'active',
      region: 'global',
      domain_name: 'd1demo123.cloudfront.net',
      origin_domain: 'demo-origin.s3.amazonaws.com',
      requests_per_minute: 2083,
      cache_hit_rate: 85.0,
      error_rate: 0.11,
      blocked_requests: 0,
      metadata: { aliases: ['demo.example.com'], priceClass: 'PriceClass_All', httpVersion: 'http2' },
      last_updated: now.toISOString(),
      created_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-edge-cf-002',
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      service_type: 'cloudfront',
      service_name: 'demo-api-distribution',
      service_id: 'E2DEMO789012',
      status: 'active',
      region: 'global',
      domain_name: 'd2demo456.cloudfront.net',
      origin_domain: 'api.demo.example.com',
      requests_per_minute: 1417,
      cache_hit_rate: 50.0,
      error_rate: 1.05,
      blocked_requests: 0,
      metadata: { aliases: ['api.demo.example.com'], priceClass: 'PriceClass_100', httpVersion: 'http2and3' },
      last_updated: now.toISOString(),
      created_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-edge-cf-003',
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      service_type: 'cloudfront',
      service_name: 'demo-static-assets',
      service_id: 'E3DEMO345678',
      status: 'active',
      region: 'global',
      domain_name: 'd3demo789.cloudfront.net',
      origin_domain: 'demo-assets.s3.amazonaws.com',
      requests_per_minute: 4167,
      cache_hit_rate: 95.0,
      error_rate: 0.01,
      blocked_requests: 0,
      metadata: { aliases: ['static.demo.example.com'], priceClass: 'PriceClass_200', httpVersion: 'http2' },
      last_updated: now.toISOString(),
      created_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-edge-waf-001',
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      service_type: 'waf',
      service_name: 'demo-waf-global',
      service_id: 'demo-waf-global-001',
      status: 'active',
      region: 'global',
      domain_name: null,
      origin_domain: null,
      requests_per_minute: 3500,
      cache_hit_rate: 0,
      error_rate: 0,
      blocked_requests: 4200,
      metadata: { scope: 'CLOUDFRONT', rulesCount: 12 },
      last_updated: now.toISOString(),
      created_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-edge-waf-002',
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      service_type: 'waf',
      service_name: 'demo-waf-regional',
      service_id: 'demo-waf-regional-001',
      status: 'active',
      region: 'us-east-1',
      domain_name: null,
      origin_domain: null,
      requests_per_minute: 1583,
      cache_hit_rate: 0,
      error_rate: 0,
      blocked_requests: 1900,
      metadata: { scope: 'REGIONAL', rulesCount: 8 },
      last_updated: now.toISOString(),
      created_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-edge-alb-001',
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      service_type: 'load_balancer',
      service_name: 'demo-web-alb',
      service_id: 'arn:aws:elasticloadbalancing:us-east-1:demo:loadbalancer/app/demo-web-alb/abc123',
      status: 'active',
      region: 'us-east-1',
      domain_name: 'demo-web-alb-123456.us-east-1.elb.amazonaws.com',
      origin_domain: null,
      requests_per_minute: 1250,
      cache_hit_rate: 0,
      error_rate: 0.6,
      blocked_requests: 0,
      metadata: { type: 'application', scheme: 'internet-facing', vpcId: 'vpc-demo-001' },
      last_updated: now.toISOString(),
      created_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-edge-alb-002',
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      service_type: 'load_balancer',
      service_name: 'demo-api-alb',
      service_id: 'arn:aws:elasticloadbalancing:us-east-1:demo:loadbalancer/app/demo-api-alb/def456',
      status: 'active',
      region: 'us-east-1',
      domain_name: 'demo-api-alb-789012.us-east-1.elb.amazonaws.com',
      origin_domain: null,
      requests_per_minute: 2100,
      cache_hit_rate: 0,
      error_rate: 0.3,
      blocked_requests: 0,
      metadata: { type: 'application', scheme: 'internet-facing', vpcId: 'vpc-demo-001' },
      last_updated: now.toISOString(),
      created_at: now.toISOString(),
      _isDemo: true
    },
    {
      id: 'demo-edge-nlb-001',
      organization_id: DEMO_ORG_ID,
      aws_account_id: DEMO_ACCOUNT_ID,
      service_type: 'load_balancer',
      service_name: 'demo-tcp-nlb',
      service_id: 'arn:aws:elasticloadbalancing:us-east-1:demo:loadbalancer/net/demo-tcp-nlb/ghi789',
      status: 'active',
      region: 'us-east-1',
      domain_name: 'demo-tcp-nlb-345678.us-east-1.elb.amazonaws.com',
      origin_domain: null,
      requests_per_minute: 850,
      cache_hit_rate: 0,
      error_rate: 0.1,
      blocked_requests: 0,
      metadata: { type: 'network', scheme: 'internet-facing', vpcId: 'vpc-demo-001' },
      last_updated: now.toISOString(),
      created_at: now.toISOString(),
      _isDemo: true
    }
  ];
}

/**
 * Gera dados de Edge Metrics para tabela (formato banco de dados)
 * Usado pelo query-table quando a organização está em modo demo
 */
export function generateDemoEdgeMetricsTable() {
  const now = new Date();
  const DEMO_ORG_ID = 'demo-organization-id';
  const DEMO_ACCOUNT_ID = 'demo-aws-account';
  
  const metrics: any[] = [];
  let metricId = 1;
  
  // Serviços e suas métricas base
  const services = [
    { serviceId: 'demo-edge-cf-001', requests: 125000, cacheHits: 106250, cacheMisses: 18750, blocked: 0, responseTime: 45, bandwidth: 45.8, error4xx: 125, error5xx: 12 },
    { serviceId: 'demo-edge-cf-002', requests: 85000, cacheHits: 42500, cacheMisses: 42500, blocked: 0, responseTime: 120, bandwidth: 12.3, error4xx: 850, error5xx: 42 },
    { serviceId: 'demo-edge-cf-003', requests: 250000, cacheHits: 237500, cacheMisses: 12500, blocked: 0, responseTime: 25, bandwidth: 125.5, error4xx: 25, error5xx: 0 },
    { serviceId: 'demo-edge-waf-001', requests: 210000, cacheHits: 0, cacheMisses: 0, blocked: 4200, responseTime: 0, bandwidth: 0, error4xx: 0, error5xx: 0 },
    { serviceId: 'demo-edge-waf-002', requests: 95000, cacheHits: 0, cacheMisses: 0, blocked: 1900, responseTime: 0, bandwidth: 0, error4xx: 0, error5xx: 0 },
    { serviceId: 'demo-edge-alb-001', requests: 75000, cacheHits: 0, cacheMisses: 0, blocked: 0, responseTime: 125, bandwidth: 8.5, error4xx: 375, error5xx: 75 },
    { serviceId: 'demo-edge-alb-002', requests: 126000, cacheHits: 0, cacheMisses: 0, blocked: 0, responseTime: 95, bandwidth: 15.2, error4xx: 252, error5xx: 63 },
    { serviceId: 'demo-edge-nlb-001', requests: 51000, cacheHits: 0, cacheMisses: 0, blocked: 0, responseTime: 5, bandwidth: 125.0, error4xx: 0, error5xx: 0 }
  ];
  
  // Gerar 24 horas de métricas (1 por hora)
  for (const service of services) {
    for (let i = 23; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      timestamp.setMinutes(0, 0, 0);
      
      const variation = 0.7 + Math.random() * 0.6; // ±30% variation
      
      metrics.push({
        id: `demo-edge-metric-${metricId++}`,
        organization_id: DEMO_ORG_ID,
        aws_account_id: DEMO_ACCOUNT_ID,
        service_id: service.serviceId,
        timestamp: timestamp.toISOString(),
        requests: Math.round(service.requests * variation / 24),
        cache_hits: Math.round(service.cacheHits * variation / 24),
        cache_misses: Math.round(service.cacheMisses * variation / 24),
        blocked_requests: Math.round(service.blocked * variation / 24),
        response_time: service.responseTime > 0 ? parseFloat((service.responseTime * (0.8 + Math.random() * 0.4)).toFixed(2)) : 0,
        bandwidth_gb: service.bandwidth > 0 ? parseFloat((service.bandwidth * variation / 24).toFixed(3)) : 0,
        error_4xx: Math.round(service.error4xx * variation / 24),
        error_5xx: Math.round(service.error5xx * variation / 24),
        created_at: timestamp.toISOString(),
        _isDemo: true
      });
    }
  }
  
  return metrics;
}

/**
 * Gera dados de regras de alerta para demonstração
 * Usado pela página IntelligentAlerts para mostrar regras configuradas
 */
export function generateDemoAlertRules() {
  const now = new Date();
  
  return [
    {
      id: 'demo-rule-001',
      organization_id: 'demo-org',
      name: 'Security Group Open Access',
      description: 'Alerta quando um Security Group é configurado com acesso público (0.0.0.0/0) em portas sensíveis',
      type: 'security',
      condition: {
        metric: 'security_group_open',
        operator: 'eq',
        threshold: 1,
        period: 300
      },
      channels: ['email', 'slack'],
      is_active: true,
      created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      last_triggered: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      trigger_count: 5,
      _isDemo: true
    },
    {
      id: 'demo-rule-002',
      organization_id: 'demo-org',
      name: 'Daily Cost Threshold',
      description: 'Alerta quando o custo diário excede o limite configurado',
      type: 'cost',
      condition: {
        metric: 'daily_cost',
        operator: 'gt',
        threshold: 200,
        period: 86400
      },
      channels: ['email'],
      is_active: true,
      created_at: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      last_triggered: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      trigger_count: 12,
      _isDemo: true
    },
    {
      id: 'demo-rule-003',
      organization_id: 'demo-org',
      name: 'Endpoint Latency',
      description: 'Alerta quando a latência de um endpoint excede o limite',
      type: 'performance',
      condition: {
        metric: 'response_time',
        operator: 'gt',
        threshold: 500,
        period: 300
      },
      channels: ['email', 'slack', 'webhook'],
      is_active: true,
      created_at: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      last_triggered: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      trigger_count: 8,
      _isDemo: true
    },
    {
      id: 'demo-rule-004',
      organization_id: 'demo-org',
      name: 'RDS CPU Utilization',
      description: 'Alerta quando a utilização de CPU do RDS excede 80%',
      type: 'performance',
      condition: {
        metric: 'cpu_utilization',
        operator: 'gt',
        threshold: 80,
        period: 900
      },
      channels: ['email'],
      is_active: true,
      created_at: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      last_triggered: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      trigger_count: 3,
      _isDemo: true
    },
    {
      id: 'demo-rule-005',
      organization_id: 'demo-org',
      name: 'SSL Certificate Expiry',
      description: 'Alerta quando um certificado SSL está próximo de expirar',
      type: 'compliance',
      condition: {
        metric: 'ssl_expiry_days',
        operator: 'lt',
        threshold: 30,
        period: 86400
      },
      channels: ['email'],
      is_active: true,
      created_at: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      last_triggered: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      trigger_count: 2,
      _isDemo: true
    },
    {
      id: 'demo-rule-006',
      organization_id: 'demo-org',
      name: 'Critical Security Findings',
      description: 'Alerta quando novos findings críticos de segurança são detectados',
      type: 'security',
      condition: {
        metric: 'critical_findings',
        operator: 'gt',
        threshold: 0,
        period: 3600
      },
      channels: ['email', 'slack', 'sms'],
      is_active: false,
      created_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      last_triggered: null,
      trigger_count: 0,
      _isDemo: true
    },
    {
      id: 'demo-rule-007',
      organization_id: 'demo-org',
      name: 'Monthly Budget Alert',
      description: 'Alerta quando o gasto mensal atinge 80% do orçamento',
      type: 'cost',
      condition: {
        metric: 'monthly_cost',
        operator: 'gt',
        threshold: 4000,
        period: 86400
      },
      channels: ['email'],
      is_active: true,
      created_at: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      last_triggered: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      trigger_count: 6,
      _isDemo: true
    }
  ];
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
  generateDemoGuardDutyFindings,
  generateDemoDriftDetection,
  generateDemoCloudTrailAnalysis,
  generateDemoAlerts,
  generateDemoAlertRules,
  generateDemoEdgeServices,
  generateDemoAzureEdgeServices,
  generateDemoRealtimeMetrics,
  generateDemoCloudWatchMetrics,
  generateDemoSecurityScans,
  generateDemoMonitoredEndpoints,
  generateDemoMonitoredResources,
  generateDemoResourceMetrics,
  getDemoOrRealData
};
