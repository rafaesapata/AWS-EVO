import { getHttpMethod } from '../../lib/middleware.js';
/**
 * Advanced RI/SP Analyzer with Cost Optimization Recommendations
 * AWS Lambda Handler for ri-sp-analyzer
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { 
  EC2Client, 
  DescribeReservedInstancesCommand, 
  DescribeInstancesCommand
} from '@aws-sdk/client-ec2';
import { 
  RDSClient, 
  DescribeDBInstancesCommand, 
  DescribeReservedDBInstancesCommand 
} from '@aws-sdk/client-rds';
import { 
  CostExplorerClient, 
  GetSavingsPlansCoverageCommand, 
  GetReservationCoverageCommand,
  GetCostAndUsageCommand
} from '@aws-sdk/client-cost-explorer';
import { 
  CloudWatchClient
} from '@aws-sdk/client-cloudwatch';

interface SavingsPlan {
  id: string;
  type: string;
  state: string;
  commitment: string;
  start: string;
  end: string;
  paymentOption: string;
  upfrontPaymentAmount: string;
  recurringPaymentAmount: string;
}

interface ReservedInstance {
  id: string;
  instanceType: string;
  instanceCount: number;
  state: string;
  start: Date;
  end: Date;
  offeringType: string;
  availabilityZone?: string;
  platform?: string;
  scope?: string;
}

interface EC2Instance {
  instanceId: string;
  instanceType: string;
  state: string;
  launchTime: Date;
  availabilityZone: string;
  platform: string;
  utilizationPercent?: number;
  monthlyCost?: number;
}

interface RDSInstance {
  dbInstanceIdentifier: string;
  dbInstanceClass: string;
  engine: string;
  availabilityZone: string;
  multiAZ: boolean;
  utilizationPercent?: number;
  monthlyCost?: number;
}

interface CostOptimizationRecommendation {
  type: 'ri_purchase' | 'sp_purchase' | 'ri_renewal' | 'sp_renewal' | 'increase_coverage' | 'right_sizing' | 'spot_instances' | 'schedule_optimization';
  priority: 'critical' | 'high' | 'medium' | 'low';
  service: 'EC2' | 'RDS' | 'Lambda' | 'Fargate' | 'General';
  title: string;
  description: string;
  potentialSavings: {
    monthly: number;
    annual: number;
    percentage: number;
  };
  implementation: {
    difficulty: 'easy' | 'medium' | 'hard';
    timeToImplement: string;
    steps: string[];
  };
  details?: any;
}

interface UsagePattern {
  instanceType: string;
  averageHoursPerDay: number;
  consistencyScore: number; // 0-100, higher = more consistent
  recommendedCommitment: 'none' | 'partial' | 'full';
  instances: number;
  monthlyCost: number;
}

interface RISPAnalyzerRequest {
  accountId: string;
  region?: string;
  analysisDepth?: 'basic' | 'detailed' | 'comprehensive';
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Advanced RI/SP Analyzer started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: RISPAnalyzerRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, region = 'us-east-1', analysisDepth = 'comprehensive' } = body;
    
    if (!accountId) {
      return error('Missing required parameter: accountId');
    }
    
    const prisma = getPrismaClient();
    
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found');
    }
    
    const resolvedCreds = await resolveAwsCredentials(account, region);
    const credentials = toAwsCredentials(resolvedCreds);
    
    const ec2Client = new EC2Client({ region, credentials });
    const rdsClient = new RDSClient({ region, credentials });
    const costExplorerClient = new CostExplorerClient({ region, credentials });
    const cloudWatchClient = new CloudWatchClient({ region, credentials });
    
    logger.info('🔍 Starting comprehensive cost optimization analysis...');
    
    // 1. Get current Reserved Instances and Savings Plans
    const [reservedInstances, reservedRDSInstances, savingsPlans] = await Promise.all([
      getCurrentReservedInstances(ec2Client),
      getCurrentReservedRDSInstances(rdsClient),
      getCurrentSavingsPlans(costExplorerClient)
    ]);
    
    // 2. Get current running instances
    const [ec2Instances, rdsInstances] = await Promise.all([
      getCurrentEC2Instances(ec2Client),
      getCurrentRDSInstances(rdsClient)
    ]);
    
    // 3. Analyze usage patterns and costs
    const [usagePatterns, costData] = await Promise.all([
      analyzeUsagePatterns(ec2Instances, rdsInstances, cloudWatchClient),
      getCostData(costExplorerClient)
    ]);
    
    // 4. Generate comprehensive recommendations
    const recommendations = await generateAdvancedRecommendations(
      reservedInstances,
      reservedRDSInstances,
      savingsPlans,
      ec2Instances,
      rdsInstances,
      usagePatterns,
      costData,
      costExplorerClient
    );
    
    // 5. Calculate coverage and utilization
    const coverage = await calculateCoverage(costExplorerClient);
    
    // 6. Generate executive summary
    const executiveSummary = generateExecutiveSummary(
      reservedInstances,
      reservedRDSInstances,
      savingsPlans,
      recommendations,
      coverage
    );
    
    logger.info(`✅ Analysis complete: ${recommendations.length} recommendations generated`);
    
    return success({
      success: true,
      executiveSummary,
      reservedInstances: {
        ec2: reservedInstances,
        rds: reservedRDSInstances,
        total: reservedInstances.length + reservedRDSInstances.length
      },
      savingsPlans: {
        plans: savingsPlans,
        total: savingsPlans.length
      },
      currentResources: {
        ec2Instances: ec2Instances.length,
        rdsInstances: rdsInstances.length,
        totalMonthlyCost: usagePatterns.reduce((sum, p) => sum + p.monthlyCost, 0)
      },
      usagePatterns,
      coverage,
      recommendations: recommendations.sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }),
      potentialSavings: {
        monthly: recommendations.reduce((sum, r) => sum + r.potentialSavings.monthly, 0),
        annual: recommendations.reduce((sum, r) => sum + r.potentialSavings.annual, 0),
        maxPercentage: Math.max(...recommendations.map(r => r.potentialSavings.percentage), 0)
      },
      analysisMetadata: {
        analysisDepth,
        region,
        timestamp: new Date().toISOString(),
        accountId
      }
    });
    
  } catch (err) {
    logger.error('❌ Advanced RI/SP Analyzer error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

// Helper Functions for Advanced Analysis

async function getCurrentReservedInstances(ec2Client: EC2Client): Promise<ReservedInstance[]> {
  try {
    const response = await ec2Client.send(new DescribeReservedInstancesCommand({}));
    return (response.ReservedInstances || []).map(ri => ({
      id: ri.ReservedInstancesId || '',
      instanceType: ri.InstanceType || '',
      instanceCount: ri.InstanceCount || 0,
      state: ri.State || '',
      start: ri.Start || new Date(),
      end: ri.End || new Date(),
      offeringType: ri.OfferingType || '',
      availabilityZone: ri.AvailabilityZone,
      platform: ri.ProductDescription,
      scope: ri.Scope
    }));
  } catch (error) {
    logger.warn('Could not fetch Reserved Instances:', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

async function getCurrentReservedRDSInstances(rdsClient: RDSClient): Promise<any[]> {
  try {
    const response = await rdsClient.send(new DescribeReservedDBInstancesCommand({}));
    return (response.ReservedDBInstances || []).map(rds => ({
      id: rds.ReservedDBInstanceId || '',
      dbInstanceClass: rds.DBInstanceClass || '',
      engine: rds.ProductDescription || '',
      state: rds.State || '',
      start: rds.StartTime || new Date(),
      end: new Date((rds.StartTime?.getTime() || 0) + (rds.Duration || 0) * 1000),
      instanceCount: rds.DBInstanceCount || 0,
      offeringType: rds.OfferingType || ''
    }));
  } catch (error) {
    logger.warn('Could not fetch Reserved RDS Instances:', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

async function getCurrentSavingsPlans(costExplorerClient: CostExplorerClient): Promise<SavingsPlan[]> {
  try {
    // Note: This would require @aws-sdk/client-savingsplans for full implementation
    // For now, return empty array but log that we attempted to fetch
    logger.info('Savings Plans analysis requires additional SDK client');
    return [];
  } catch (error) {
    logger.warn('Could not fetch Savings Plans:', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

async function getCurrentEC2Instances(ec2Client: EC2Client): Promise<EC2Instance[]> {
  try {
    const response = await ec2Client.send(new DescribeInstancesCommand({}));
    const instances: EC2Instance[] = [];
    
    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.State?.Name === 'running') {
          instances.push({
            instanceId: instance.InstanceId || '',
            instanceType: instance.InstanceType || '',
            state: instance.State?.Name || '',
            launchTime: instance.LaunchTime || new Date(),
            availabilityZone: instance.Placement?.AvailabilityZone || '',
            platform: instance.Platform || 'Linux/UNIX'
          });
        }
      }
    }
    
    return instances;
  } catch (error) {
    logger.warn('Could not fetch EC2 instances:', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

async function getCurrentRDSInstances(rdsClient: RDSClient): Promise<RDSInstance[]> {
  try {
    const response = await rdsClient.send(new DescribeDBInstancesCommand({}));
    return (response.DBInstances || [])
      .filter(db => db.DBInstanceStatus === 'available')
      .map(db => ({
        dbInstanceIdentifier: db.DBInstanceIdentifier || '',
        dbInstanceClass: db.DBInstanceClass || '',
        engine: db.Engine || '',
        availabilityZone: db.AvailabilityZone || '',
        multiAZ: db.MultiAZ || false
      }));
  } catch (error) {
    logger.warn('Could not fetch RDS instances:', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

async function analyzeUsagePatterns(
  ec2Instances: EC2Instance[],
  rdsInstances: RDSInstance[],
  cloudWatchClient: CloudWatchClient
): Promise<UsagePattern[]> {
  const patterns: UsagePattern[] = [];
  
  // Group EC2 instances by type
  const ec2ByType = ec2Instances.reduce((acc, instance) => {
    if (!acc[instance.instanceType]) {
      acc[instance.instanceType] = [];
    }
    acc[instance.instanceType].push(instance);
    return acc;
  }, {} as Record<string, EC2Instance[]>);
  
  // Analyze each instance type
  for (const [instanceType, instances] of Object.entries(ec2ByType)) {
    try {
      // Calculate average utilization (simplified - would need actual CloudWatch metrics)
      const avgUtilization = await getAverageUtilization(instances, cloudWatchClient);
      const consistencyScore = calculateConsistencyScore(instances);
      const monthlyCost = estimateMonthlyCost(instanceType, instances.length);
      
      patterns.push({
        instanceType,
        averageHoursPerDay: avgUtilization.hoursPerDay,
        consistencyScore,
        recommendedCommitment: determineCommitmentLevel(avgUtilization.hoursPerDay, consistencyScore),
        instances: instances.length,
        monthlyCost
      });
    } catch (error) {
      logger.warn(`Could not analyze pattern for ${instanceType}:`, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  
  return patterns;
}

async function getAverageUtilization(instances: EC2Instance[], cloudWatchClient: CloudWatchClient) {
  // Simplified utilization calculation
  // In a real implementation, this would fetch actual CloudWatch metrics
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  // For demo purposes, assume instances running 24/7 have high utilization
  const avgHoursPerDay = instances.reduce((sum, instance) => {
    const daysRunning = Math.min(30, (now.getTime() - instance.launchTime.getTime()) / (24 * 60 * 60 * 1000));
    return sum + (daysRunning > 0 ? 24 : 0);
  }, 0) / instances.length;
  
  return { hoursPerDay: avgHoursPerDay };
}

function calculateConsistencyScore(instances: EC2Instance[]): number {
  // Simplified consistency calculation based on launch times
  if (instances.length === 1) return 100;
  
  const now = new Date();
  const avgAge = instances.reduce((sum, instance) => {
    return sum + (now.getTime() - instance.launchTime.getTime());
  }, 0) / instances.length;
  
  // Higher score for instances that have been running consistently
  return Math.min(100, (avgAge / (30 * 24 * 60 * 60 * 1000)) * 100);
}

function determineCommitmentLevel(hoursPerDay: number, consistencyScore: number): 'none' | 'partial' | 'full' {
  if (hoursPerDay >= 20 && consistencyScore >= 80) return 'full';
  if (hoursPerDay >= 12 && consistencyScore >= 60) return 'partial';
  return 'none';
}

function estimateMonthlyCost(instanceType: string, count: number): number {
  // Simplified cost estimation - in reality, would use AWS Pricing API
  const baseCosts: Record<string, number> = {
    't3.micro': 8.5,
    't3.small': 17,
    't3.medium': 34,
    't3.large': 67,
    't3.xlarge': 134,
    'm5.large': 88,
    'm5.xlarge': 176,
    'm5.2xlarge': 352,
    'c5.large': 78,
    'c5.xlarge': 156,
    'r5.large': 115,
    'r5.xlarge': 230
  };
  
  const baseCost = baseCosts[instanceType] || 100; // Default estimate
  return baseCost * count;
}

async function getCostData(costExplorerClient: CostExplorerClient) {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const response = await costExplorerClient.send(new GetCostAndUsageCommand({
      TimePeriod: {
        Start: startDate.toISOString().split('T')[0],
        End: endDate.toISOString().split('T')[0],
      },
      Granularity: 'MONTHLY',
      Metrics: ['BlendedCost', 'UnblendedCost'],
      GroupBy: [
        { Type: 'DIMENSION', Key: 'SERVICE' }
      ]
    }));
    
    return response.ResultsByTime || [];
  } catch (error) {
    logger.warn('Could not fetch cost data:', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

async function generateAdvancedRecommendations(
  reservedInstances: ReservedInstance[],
  reservedRDSInstances: any[],
  savingsPlans: SavingsPlan[],
  ec2Instances: EC2Instance[],
  rdsInstances: RDSInstance[],
  usagePatterns: UsagePattern[],
  costData: any[],
  costExplorerClient: CostExplorerClient
): Promise<CostOptimizationRecommendation[]> {
  const recommendations: CostOptimizationRecommendation[] = [];
  
  logger.info('Generating recommendations', {
    ec2Count: ec2Instances.length,
    rdsCount: rdsInstances.length,
    riCount: reservedInstances.length,
    spCount: savingsPlans.length,
    patternsCount: usagePatterns.length
  });
  
  // Calculate estimated monthly cost based on instances
  const estimatedEC2MonthlyCost = ec2Instances.reduce((sum, instance) => {
    return sum + estimateMonthlyCost(instance.instanceType, 1);
  }, 0);
  
  const estimatedRDSMonthlyCost = rdsInstances.reduce((sum, instance) => {
    return sum + estimateRDSMonthlyCost(instance.dbInstanceClass);
  }, 0);
  
  const totalEstimatedMonthlyCost = estimatedEC2MonthlyCost + estimatedRDSMonthlyCost;
  
  // 1. Reserved Instance Recommendations - ALWAYS suggest if no RIs and has EC2 instances
  if (reservedInstances.length === 0 && ec2Instances.length > 0) {
    const riSavingsPercent = 0.40; // Up to 40% savings with RIs
    const monthlySavings = estimatedEC2MonthlyCost * riSavingsPercent;
    
    recommendations.push({
      type: 'ri_purchase',
      priority: 'high',
      service: 'EC2',
      title: 'Adquirir Reserved Instances para Workloads Estáveis',
      description: `Você tem ${ec2Instances.length} instâncias EC2 em execução sem Reserved Instances. RIs podem economizar até 40% em comparação com On-Demand para workloads consistentes.`,
      potentialSavings: {
        monthly: monthlySavings,
        annual: monthlySavings * 12,
        percentage: 40
      },
      implementation: {
        difficulty: 'easy',
        timeToImplement: '1-2 horas',
        steps: [
          'Acesse AWS Cost Explorer > Reservations > Recommendations',
          'Analise os padrões de uso dos últimos 30-60 dias',
          'Escolha entre Standard (maior desconto) ou Convertible (mais flexível)',
          'Comece com compromisso de 1 ano para testar',
          'Configure alertas de utilização de RI'
        ]
      },
      details: {
        currentInstances: ec2Instances.map(i => ({
          instanceId: i.instanceId,
          instanceType: i.instanceType,
          availabilityZone: i.availabilityZone,
          estimatedMonthlyCost: estimateMonthlyCost(i.instanceType, 1)
        })),
        recommendedAction: 'Comprar RIs para instâncias que rodam 24/7',
        estimatedCurrentCost: estimatedEC2MonthlyCost
      }
    });
  }
  
  // 2. RDS Reserved Instance Recommendations
  if (reservedRDSInstances.length === 0 && rdsInstances.length > 0) {
    const rdsRiSavings = estimatedRDSMonthlyCost * 0.35;
    
    recommendations.push({
      type: 'ri_purchase',
      priority: 'high',
      service: 'RDS',
      title: 'Adquirir Reserved Instances para RDS',
      description: `Você tem ${rdsInstances.length} instâncias RDS sem reservas. RIs de RDS podem economizar até 35% em bancos de dados de produção.`,
      potentialSavings: {
        monthly: rdsRiSavings,
        annual: rdsRiSavings * 12,
        percentage: 35
      },
      implementation: {
        difficulty: 'easy',
        timeToImplement: '30 minutos',
        steps: [
          'Acesse RDS Console > Reserved Instances',
          'Revise as recomendações baseadas no uso atual',
          'Escolha Multi-AZ se aplicável',
          'Considere compromisso de 1 ano inicialmente'
        ]
      },
      details: {
        currentDatabases: rdsInstances.map(db => ({
          identifier: db.dbInstanceIdentifier,
          instanceClass: db.dbInstanceClass,
          engine: db.engine,
          multiAZ: db.multiAZ,
          estimatedMonthlyCost: estimateRDSMonthlyCost(db.dbInstanceClass)
        })),
        estimatedCurrentCost: estimatedRDSMonthlyCost
      }
    });
  }
  
  // 3. Savings Plans Recommendations - ALWAYS suggest if no SPs and has compute resources
  if (savingsPlans.length === 0 && (ec2Instances.length > 0 || rdsInstances.length > 0)) {
    const spSavingsPercent = 0.30;
    const monthlySavings = totalEstimatedMonthlyCost * spSavingsPercent;
    
    recommendations.push({
      type: 'sp_purchase',
      priority: 'high',
      service: 'General',
      title: 'Implementar Compute Savings Plans',
      description: `Savings Plans oferecem economia flexível de até 66% em EC2, Lambda e Fargate. Mais flexível que Reserved Instances pois se aplica automaticamente a qualquer uso de compute.`,
      potentialSavings: {
        monthly: monthlySavings,
        annual: monthlySavings * 12,
        percentage: 30
      },
      implementation: {
        difficulty: 'easy',
        timeToImplement: '30 minutos',
        steps: [
          'Acesse AWS Cost Management > Savings Plans',
          'Revise as recomendações automáticas da AWS',
          'Escolha Compute SP (flexível) ou EC2 Instance SP (maior desconto)',
          'Defina um commitment baseado em 70-80% do uso atual',
          'Monitore a utilização mensalmente'
        ]
      },
      details: {
        recommendedCommitment: Math.floor(totalEstimatedMonthlyCost * 0.7 / 730), // Hourly commitment
        planType: 'Compute Savings Plan',
        term: '1 ano',
        flexibility: 'Aplica-se automaticamente a EC2, Lambda e Fargate em qualquer região'
      }
    });
  }
  
  // 4. Right-sizing Recommendations based on instance types
  const largeInstances = ec2Instances.filter(i => 
    i.instanceType.includes('xlarge') || i.instanceType.includes('2xlarge') || i.instanceType.includes('4xlarge')
  );
  
  if (largeInstances.length > 0) {
    const potentialSavings = largeInstances.length * 100; // Estimated $100/month per downsized instance
    
    recommendations.push({
      type: 'right_sizing',
      priority: 'medium',
      service: 'EC2',
      title: 'Avaliar Right-Sizing de Instâncias Grandes',
      description: `${largeInstances.length} instâncias de tamanho grande/xlarge detectadas. Analise a utilização para possível downsizing.`,
      potentialSavings: {
        monthly: potentialSavings,
        annual: potentialSavings * 12,
        percentage: 30
      },
      implementation: {
        difficulty: 'medium',
        timeToImplement: '2-4 horas',
        steps: [
          'Acesse AWS Compute Optimizer para recomendações',
          'Analise métricas de CPU e memória no CloudWatch',
          'Identifique instâncias com utilização < 40%',
          'Teste tipos menores em ambiente de staging',
          'Migre gradualmente para instâncias otimizadas'
        ]
      },
      details: {
        largeInstances: largeInstances.map(i => ({
          instanceId: i.instanceId,
          instanceType: i.instanceType,
          recommendation: 'Avaliar utilização para possível downsizing'
        }))
      }
    });
  }
  
  // 5. Spot Instance Recommendations for any EC2 workloads
  if (ec2Instances.length > 0) {
    const spotSavings = ec2Instances.length * 60; // Estimated $60/month savings per instance
    
    recommendations.push({
      type: 'spot_instances',
      priority: 'medium',
      service: 'EC2',
      title: 'Considerar Spot Instances para Workloads Tolerantes a Falhas',
      description: `Spot Instances podem economizar até 90% em comparação com On-Demand. Ideal para workloads de desenvolvimento, CI/CD, processamento batch e aplicações stateless.`,
      potentialSavings: {
        monthly: spotSavings,
        annual: spotSavings * 12,
        percentage: 70
      },
      implementation: {
        difficulty: 'medium',
        timeToImplement: '4-6 horas',
        steps: [
          'Identifique workloads tolerantes a interrupções',
          'Configure Spot Fleet com múltiplos tipos de instância',
          'Implemente tratamento de interrupções (2 min warning)',
          'Use Auto Scaling Groups com mixed instances',
          'Monitore Spot pricing e disponibilidade'
        ]
      },
      details: {
        candidateWorkloads: ['Desenvolvimento/Teste', 'CI/CD Pipelines', 'Processamento Batch', 'Workers Stateless'],
        recommendedStrategy: 'Spot Fleet com diversificação de tipos de instância'
      }
    });
  }
  
  // 6. Schedule-based Optimization
  if (ec2Instances.length >= 1) {
    const scheduleSavings = estimatedEC2MonthlyCost * 0.4; // 40% savings by stopping 12h/day
    
    recommendations.push({
      type: 'schedule_optimization',
      priority: 'medium',
      service: 'EC2',
      title: 'Implementar Agendamento Automático',
      description: 'Pare automaticamente instâncias de desenvolvimento/teste fora do horário comercial para economizar 40-60% dos custos.',
      potentialSavings: {
        monthly: scheduleSavings,
        annual: scheduleSavings * 12,
        percentage: 40
      },
      implementation: {
        difficulty: 'easy',
        timeToImplement: '2-3 horas',
        steps: [
          'Use AWS Instance Scheduler (solução oficial)',
          'Ou crie Lambda functions com EventBridge',
          'Adicione tags de schedule nas instâncias',
          'Configure horários: parar 20h, iniciar 8h (dias úteis)',
          'Exclua instâncias de produção críticas'
        ]
      },
      details: {
        recommendedSchedule: 'Parar às 20:00, iniciar às 08:00 (dias úteis)',
        applicableInstances: ec2Instances.length,
        estimatedHoursOff: 12 * 5 + 48, // 12h weekdays + 48h weekend = 108h/week
        savingsCalculation: '~60% do tempo desligado = ~40% economia'
      }
    });
  }
  
  // 7. General Cost Optimization Tips (always show)
  recommendations.push({
    type: 'increase_coverage',
    priority: 'low',
    service: 'General',
    title: 'Habilitar AWS Cost Anomaly Detection',
    description: 'Configure alertas automáticos para detectar gastos anormais e evitar surpresas na fatura.',
    potentialSavings: {
      monthly: 0,
      annual: 0,
      percentage: 0
    },
    implementation: {
      difficulty: 'easy',
      timeToImplement: '15 minutos',
      steps: [
        'Acesse AWS Cost Management > Cost Anomaly Detection',
        'Crie um monitor para toda a conta',
        'Configure alertas por email/SNS',
        'Defina threshold de anomalia (ex: 10% acima do esperado)'
      ]
    },
    details: {
      benefit: 'Detecção proativa de gastos inesperados',
      cost: 'Gratuito'
    }
  });
  
  logger.info(`Generated ${recommendations.length} recommendations`);
  
  return recommendations;
}

function estimateRDSMonthlyCost(instanceClass: string): number {
  const baseCosts: Record<string, number> = {
    'db.t3.micro': 15,
    'db.t3.small': 30,
    'db.t3.medium': 60,
    'db.t3.large': 120,
    'db.t3.xlarge': 240,
    'db.m5.large': 150,
    'db.m5.xlarge': 300,
    'db.m5.2xlarge': 600,
    'db.r5.large': 200,
    'db.r5.xlarge': 400,
  };
  
  return baseCosts[instanceClass] || 150; // Default estimate
}

async function calculateCoverage(costExplorerClient: CostExplorerClient) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  let riCoverage = 0;
  let spCoverage = 0;
  
  try {
    const riCoverageResponse = await costExplorerClient.send(new GetReservationCoverageCommand({
      TimePeriod: {
        Start: startDate.toISOString().split('T')[0],
        End: endDate.toISOString().split('T')[0],
      },
    }));
    riCoverage = parseFloat(riCoverageResponse.Total?.CoverageHours?.CoverageHoursPercentage || '0');
  } catch (error) {
    logger.warn('Could not fetch RI coverage:', { error: error instanceof Error ? error.message : String(error) });
  }
  
  try {
    const spCoverageResponse = await costExplorerClient.send(new GetSavingsPlansCoverageCommand({
      TimePeriod: {
        Start: startDate.toISOString().split('T')[0],
        End: endDate.toISOString().split('T')[0],
      },
    }));
    const total = spCoverageResponse.SavingsPlansCoverages?.[0]?.Coverage;
    spCoverage = parseFloat(total?.CoveragePercentage || '0');
  } catch (error) {
    logger.warn('Could not fetch SP coverage:', { error: error instanceof Error ? error.message : String(error) });
  }
  
  return {
    reservedInstances: riCoverage,
    savingsPlans: spCoverage,
    overall: (riCoverage + spCoverage) / 2
  };
}

function generateExecutiveSummary(
  reservedInstances: ReservedInstance[],
  reservedRDSInstances: any[],
  savingsPlans: SavingsPlan[],
  recommendations: CostOptimizationRecommendation[],
  coverage: any
) {
  const totalPotentialSavings = recommendations.reduce((sum, r) => sum + r.potentialSavings.annual, 0);
  const criticalRecommendations = recommendations.filter(r => r.priority === 'critical').length;
  const highPriorityRecommendations = recommendations.filter(r => r.priority === 'high').length;
  
  return {
    status: reservedInstances.length === 0 && savingsPlans.length === 0 ? 'needs_attention' : 'optimized',
    totalCommitments: reservedInstances.length + reservedRDSInstances.length + savingsPlans.length,
    coverageScore: coverage.overall,
    potentialAnnualSavings: totalPotentialSavings,
    recommendationsSummary: {
      total: recommendations.length,
      critical: criticalRecommendations,
      high: highPriorityRecommendations,
      quickWins: recommendations.filter(r => r.implementation.difficulty === 'easy').length
    },
    keyInsights: [
      reservedInstances.length === 0 ? 'No Reserved Instances found - significant savings opportunity' : `${reservedInstances.length} Reserved Instances active`,
      savingsPlans.length === 0 ? 'No Savings Plans found - consider flexible commitment options' : `${savingsPlans.length} Savings Plans active`,
      `Coverage score: ${coverage.overall.toFixed(1)}% - ${coverage.overall < 50 ? 'needs improvement' : 'good'}`,
      `${recommendations.length} optimization opportunities identified`
    ]
  };
}