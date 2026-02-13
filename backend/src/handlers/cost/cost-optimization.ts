import { getHttpMethod } from '../../lib/middleware.js';
/**
 * Lambda handler para otimização de custos - Versão Expandida
 * Analisa múltiplos serviços AWS e fornece recomendações detalhadas
 * 
 * DEMO MODE: Suporta modo demonstração para organizações com demo_mode=true
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions, safeHandler } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logger.js';
import { businessMetrics } from '../../lib/metrics.js';
import { isOrganizationInDemoMode, generateDemoCostOptimizations } from '../../lib/demo-data-service.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { 
  EC2Client, 
  DescribeInstancesCommand, 
  DescribeVolumesCommand,
  DescribeSnapshotsCommand,
  DescribeAddressesCommand,
  DescribeNatGatewaysCommand
} from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand, DescribeDBSnapshotsCommand } from '@aws-sdk/client-rds';
import { S3Client, ListBucketsCommand, GetBucketLocationCommand } from '@aws-sdk/client-s3';
import { LambdaClient, ListFunctionsCommand, GetFunctionCommand } from '@aws-sdk/client-lambda';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand, DescribeTargetGroupsCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ECSClient, ListClustersCommand, DescribeClustersCommand, ListServicesCommand } from '@aws-sdk/client-ecs';
import { ElastiCacheClient, DescribeCacheClustersCommand } from '@aws-sdk/client-elasticache';
import { DynamoDBClient, ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

// Zod schema for cost optimization request
const costOptimizationSchema = z.object({
  accountId: z.string().uuid().nullish(),
});

interface Optimization {
  type: string;
  resource_id: string;
  resource_type: string;
  resource_name?: string;
  current_cost: number;
  optimized_cost: number;
  savings: number;
  recommendation: string;
  details?: string;
  priority: 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  category: string;
}

export const handler = safeHandler(async (
  event: AuthorizedEvent,
  context: LambdaContext
) => {
  const startTime = Date.now();
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  if (!event.requestContext?.authorizer) {
    logger.error('Missing authorizer context', { requestId: context.awsRequestId });
    return error('Unauthorized - invalid request context', 401);
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  
  logger.info('Cost optimization started', { organizationId, requestId: context.awsRequestId });
  
  try {
    const prisma = getPrismaClient();
    
    // =========================================================================
    // DEMO MODE CHECK - Retorna dados de demonstração se ativado
    // FAIL-SAFE: isOrganizationInDemoMode retorna false em caso de erro
    // IMPORTANTE: Deve rodar ANTES da validação do body, pois o frontend
    // envia accountId: 'demo' que não passa na validação UUID
    // =========================================================================
    const isDemoMode = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemoMode === true) {
      const demoData = generateDemoCostOptimizations();
      
      logger.info('Returning demo cost optimization data', { 
        organizationId, 
        isDemo: true,
        optimizationsCount: demoData.optimizations.length 
      });
      
      return success(demoData);
    }
    // =========================================================================
    
    const validation = parseAndValidateBody(costOptimizationSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    
    const { accountId } = validation.data;
    
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
    
    const regions = credential.regions || ['us-east-1'];
    const optimizations: Optimization[] = [];
    
    for (const region of regions) {
      const creds = await resolveAwsCredentials(credential, region);
      const awsCreds = toAwsCredentials(creds);
      
      // Parallel analysis for better performance
      const results = await Promise.allSettled([
        analyzeEC2(region, awsCreds, optimizations),
        analyzeEBS(region, awsCreds, optimizations),
        analyzeRDS(region, awsCreds, optimizations),
        analyzeElasticIPs(region, awsCreds, optimizations),
        analyzeNATGateways(region, awsCreds, optimizations),
        analyzeLoadBalancers(region, awsCreds, optimizations),
        analyzeLambda(region, awsCreds, optimizations),
        analyzeElastiCache(region, awsCreds, optimizations),
        analyzeSnapshots(region, awsCreds, optimizations),
      ]);
      
      // Log any failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.warn(`Analysis ${index} failed`, { error: result.reason?.message, region });
        }
      });
    }
    
    // Sort by savings (highest first)
    optimizations.sort((a, b) => b.savings - a.savings);
    
    // Save to database with all fields
    const prismaOptimizations = optimizations.map(opt => ({
      organization_id: organizationId,
      aws_account_id: credential.id,
      resource_type: opt.resource_type,
      resource_id: opt.resource_id,
      resource_name: opt.resource_name || opt.resource_id,
      optimization_type: opt.type,
      current_cost: opt.current_cost,
      optimized_cost: opt.optimized_cost,
      potential_savings: opt.savings,
      savings_percentage: opt.current_cost > 0 ? ((opt.savings / opt.current_cost) * 100) : 0,
      recommendation: opt.recommendation,
      details: opt.details,
      priority: opt.priority,
      effort: opt.effort,
      category: opt.category,
      status: 'pending'
    }));

    await prisma.costOptimization.deleteMany({
      where: { organization_id: organizationId, aws_account_id: credential.id }
    });

    if (prismaOptimizations.length > 0) {
      await prisma.costOptimization.createMany({ data: prismaOptimizations });
    }
    
    const totalSavings = optimizations.reduce((sum, opt) => sum + opt.savings, 0);
    const duration = Date.now() - startTime;
    
    await businessMetrics.costAnalysisCompleted(0, totalSavings, organizationId);
    
    logger.info('Cost optimization completed', { 
      organizationId, optimizationsCount: optimizations.length, totalSavings, duration 
    });
    
    // Group by category for summary
    const byCategory = optimizations.reduce((acc, opt) => {
      acc[opt.category] = (acc[opt.category] || 0) + opt.savings;
      return acc;
    }, {} as Record<string, number>);
    
    return success({
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
        analysis_duration_ms: duration,
      },
    });
    
  } catch (err) {
    logger.error('Cost optimization error', err as Error, { organizationId });
    await businessMetrics.errorOccurred('cost_optimization_error', 'cost-optimization', organizationId);
    return error('An unexpected error occurred. Please try again.', 500);
  }
});


// ============================================================================
// EC2 Analysis
// ============================================================================
async function analyzeEC2(region: string, creds: any, optimizations: Optimization[]): Promise<void> {
  const ec2 = new EC2Client({ region, credentials: creds });
  const response = await ec2.send(new DescribeInstancesCommand({}));
  const instances = response.Reservations?.flatMap(r => r.Instances || []) || [];
  
  for (const instance of instances) {
    const instanceId = instance.InstanceId || 'unknown';
    const instanceType = instance.InstanceType || '';
    const name = instance.Tags?.find(t => t.Key === 'Name')?.Value || instanceId;
    
    // 1. Stopped instances (paying for EBS)
    if (instance.State?.Name === 'stopped') {
      const daysStopped = instance.StateTransitionReason?.match(/\((\d{4}-\d{2}-\d{2})/);
      const stoppedDate = daysStopped ? new Date(daysStopped[1]) : new Date();
      const daysInactive = Math.floor((Date.now() - stoppedDate.getTime()) / (1000 * 60 * 60 * 24));
      
      optimizations.push({
        type: 'terminate_stopped_instance',
        resource_id: instanceId,
        resource_type: 'EC2',
        resource_name: name,
        current_cost: 15, // EBS + snapshot costs
        optimized_cost: 0,
        savings: 15,
        recommendation: `Terminate stopped instance "${name}" or create AMI and terminate`,
        details: daysInactive > 0 ? `Stopped for ${daysInactive} days` : 'Recently stopped',
        priority: daysInactive > 30 ? 'high' : 'medium',
        effort: 'low',
        category: 'Idle Resources',
      });
    }
    
    // 2. Old generation instances (t2, m4, c4, r4)
    if (instance.State?.Name === 'running') {
      const oldGenPrefixes = ['t2.', 'm4.', 'c4.', 'r4.', 'm3.', 'c3.'];
      const isOldGen = oldGenPrefixes.some(p => instanceType.startsWith(p));
      
      if (isOldGen) {
        const currentCost = estimateInstanceCost(instanceType);
        const newGenType = instanceType
          .replace('t2.', 't3.')
          .replace('m4.', 'm5.')
          .replace('c4.', 'c5.')
          .replace('r4.', 'r5.')
          .replace('m3.', 'm5.')
          .replace('c3.', 'c5.');
        const optimizedCost = estimateInstanceCost(newGenType) * 0.9; // New gen is ~10% cheaper
        
        optimizations.push({
          type: 'upgrade_instance_generation',
          resource_id: instanceId,
          resource_type: 'EC2',
          resource_name: name,
          current_cost: currentCost,
          optimized_cost: optimizedCost,
          savings: currentCost - optimizedCost,
          recommendation: `Upgrade "${name}" from ${instanceType} to ${newGenType}`,
          details: 'New generation offers better price/performance ratio',
          priority: 'medium',
          effort: 'medium',
          category: 'Modernization',
        });
      }
      
      // 3. Oversized instances (large+ without Reserved Instances)
      const oversizedTypes = ['xlarge', '2xlarge', '4xlarge', '8xlarge', '12xlarge', '16xlarge', '24xlarge'];
      if (oversizedTypes.some(t => instanceType.includes(t))) {
        const currentCost = estimateInstanceCost(instanceType);
        const smallerType = instanceType.replace(/(\d+)?xlarge/, (match) => {
          if (match === 'xlarge') return 'large';
          const num = parseInt(match);
          if (num >= 4) return `${Math.floor(num/2)}xlarge`;
          return 'xlarge';
        });
        const optimizedCost = estimateInstanceCost(smallerType);
        
        optimizations.push({
          type: 'rightsize_instance',
          resource_id: instanceId,
          resource_type: 'EC2',
          resource_name: name,
          current_cost: currentCost,
          optimized_cost: optimizedCost,
          savings: currentCost - optimizedCost,
          recommendation: `Consider rightsizing "${name}" from ${instanceType} to ${smallerType}`,
          details: 'Review CloudWatch metrics to confirm utilization before downsizing',
          priority: 'medium',
          effort: 'medium',
          category: 'Right-sizing',
        });
      }
      
      // 4. On-Demand instances that could use Savings Plans
      if (!instance.InstanceLifecycle) { // Not Spot
        const currentCost = estimateInstanceCost(instanceType);
        const savingsPlanCost = currentCost * 0.72; // ~28% savings with 1-year commitment
        
        optimizations.push({
          type: 'savings_plan_candidate',
          resource_id: instanceId,
          resource_type: 'EC2',
          resource_name: name,
          current_cost: currentCost,
          optimized_cost: savingsPlanCost,
          savings: currentCost - savingsPlanCost,
          recommendation: `Consider Savings Plan for "${name}" (${instanceType})`,
          details: '1-year Compute Savings Plan can save up to 28%',
          priority: 'low',
          effort: 'low',
          category: 'Commitment Discounts',
        });
      }
    }
  }
}

// ============================================================================
// EBS Analysis
// ============================================================================
async function analyzeEBS(region: string, creds: any, optimizations: Optimization[]): Promise<void> {
  const ec2 = new EC2Client({ region, credentials: creds });
  const response = await ec2.send(new DescribeVolumesCommand({}));
  const volumes = response.Volumes || [];
  
  for (const volume of volumes) {
    const volumeId = volume.VolumeId || 'unknown';
    const name = volume.Tags?.find(t => t.Key === 'Name')?.Value || volumeId;
    const sizeGB = volume.Size || 0;
    const volumeType = volume.VolumeType || 'gp2';
    
    // 1. Unattached volumes
    if (volume.State === 'available') {
      const monthlyCost = calculateEBSCost(sizeGB, volumeType);
      
      optimizations.push({
        type: 'delete_unattached_volume',
        resource_id: volumeId,
        resource_type: 'EBS',
        resource_name: name,
        current_cost: monthlyCost,
        optimized_cost: 0,
        savings: monthlyCost,
        recommendation: `Delete unattached volume "${name}" (${sizeGB}GB ${volumeType})`,
        details: 'Create snapshot before deletion if data might be needed',
        priority: 'high',
        effort: 'low',
        category: 'Idle Resources',
      });
    }
    
    // 2. gp2 to gp3 migration (gp3 is cheaper and faster)
    if (volumeType === 'gp2' && volume.State === 'in-use') {
      const gp2Cost = calculateEBSCost(sizeGB, 'gp2');
      const gp3Cost = calculateEBSCost(sizeGB, 'gp3');
      
      if (gp2Cost > gp3Cost) {
        optimizations.push({
          type: 'migrate_gp2_to_gp3',
          resource_id: volumeId,
          resource_type: 'EBS',
          resource_name: name,
          current_cost: gp2Cost,
          optimized_cost: gp3Cost,
          savings: gp2Cost - gp3Cost,
          recommendation: `Migrate "${name}" from gp2 to gp3`,
          details: 'gp3 offers 20% lower cost and better baseline performance',
          priority: 'medium',
          effort: 'low',
          category: 'Modernization',
        });
      }
    }
    
    // 3. Oversized volumes (low utilization)
    if (sizeGB > 100 && volume.State === 'in-use') {
      const currentCost = calculateEBSCost(sizeGB, volumeType);
      const reducedSize = Math.max(50, Math.floor(sizeGB * 0.5));
      const optimizedCost = calculateEBSCost(reducedSize, volumeType);
      
      optimizations.push({
        type: 'rightsize_volume',
        resource_id: volumeId,
        resource_type: 'EBS',
        resource_name: name,
        current_cost: currentCost,
        optimized_cost: optimizedCost,
        savings: currentCost - optimizedCost,
        recommendation: `Review volume "${name}" size (${sizeGB}GB)`,
        details: 'Check actual disk usage - may be oversized',
        priority: 'low',
        effort: 'medium',
        category: 'Right-sizing',
      });
    }
    
    // 4. io1/io2 volumes that could use gp3
    if ((volumeType === 'io1' || volumeType === 'io2') && (volume.Iops || 0) < 16000) {
      const currentCost = calculateEBSCost(sizeGB, volumeType, volume.Iops);
      const gp3Cost = calculateEBSCost(sizeGB, 'gp3', Math.min(volume.Iops || 3000, 16000));
      
      optimizations.push({
        type: 'migrate_io_to_gp3',
        resource_id: volumeId,
        resource_type: 'EBS',
        resource_name: name,
        current_cost: currentCost,
        optimized_cost: gp3Cost,
        savings: currentCost - gp3Cost,
        recommendation: `Consider migrating "${name}" from ${volumeType} to gp3`,
        details: `gp3 supports up to 16,000 IOPS at lower cost`,
        priority: 'medium',
        effort: 'medium',
        category: 'Modernization',
      });
    }
  }
}


// ============================================================================
// RDS Analysis
// ============================================================================
async function analyzeRDS(region: string, creds: any, optimizations: Optimization[]): Promise<void> {
  const rds = new RDSClient({ region, credentials: creds });
  const response = await rds.send(new DescribeDBInstancesCommand({}));
  const databases = response.DBInstances || [];
  
  for (const db of databases) {
    const dbId = db.DBInstanceIdentifier || 'unknown';
    const instanceClass = db.DBInstanceClass || '';
    const engine = db.Engine || '';
    const multiAZ = db.MultiAZ || false;
    const storageGB = db.AllocatedStorage || 0;
    
    // 1. Old generation RDS instances
    const oldGenClasses = ['db.m4.', 'db.r4.', 'db.t2.', 'db.m3.', 'db.r3.'];
    if (oldGenClasses.some(c => instanceClass.startsWith(c))) {
      const currentCost = estimateRDSCost(instanceClass);
      const newClass = instanceClass
        .replace('db.m4.', 'db.m5.')
        .replace('db.r4.', 'db.r5.')
        .replace('db.t2.', 'db.t3.')
        .replace('db.m3.', 'db.m5.')
        .replace('db.r3.', 'db.r5.');
      const optimizedCost = estimateRDSCost(newClass) * 0.9;
      
      optimizations.push({
        type: 'upgrade_rds_generation',
        resource_id: dbId,
        resource_type: 'RDS',
        resource_name: dbId,
        current_cost: currentCost,
        optimized_cost: optimizedCost,
        savings: currentCost - optimizedCost,
        recommendation: `Upgrade "${dbId}" from ${instanceClass} to ${newClass}`,
        details: 'New generation offers better performance at similar or lower cost',
        priority: 'medium',
        effort: 'medium',
        category: 'Modernization',
      });
    }
    
    // 2. Oversized RDS (r5/r6 classes for non-memory-intensive workloads)
    if (instanceClass.includes('db.r5.') || instanceClass.includes('db.r6g.')) {
      const currentCost = estimateRDSCost(instanceClass);
      const recommendedClass = instanceClass.replace(/db\.r[56]g?\./, 'db.m5.');
      const optimizedCost = estimateRDSCost(recommendedClass);
      
      optimizations.push({
        type: 'rightsize_rds',
        resource_id: dbId,
        resource_type: 'RDS',
        resource_name: dbId,
        current_cost: currentCost,
        optimized_cost: optimizedCost,
        savings: currentCost - optimizedCost,
        recommendation: `Consider "${dbId}" from ${instanceClass} to ${recommendedClass}`,
        details: 'R-class is memory-optimized - M-class may be sufficient',
        priority: 'medium',
        effort: 'medium',
        category: 'Right-sizing',
      });
    }
    
    // 3. Multi-AZ for non-production
    if (multiAZ && (dbId.includes('dev') || dbId.includes('test') || dbId.includes('staging'))) {
      const currentCost = estimateRDSCost(instanceClass) * 2; // Multi-AZ doubles cost
      const optimizedCost = estimateRDSCost(instanceClass);
      
      optimizations.push({
        type: 'disable_multiaz_nonprod',
        resource_id: dbId,
        resource_type: 'RDS',
        resource_name: dbId,
        current_cost: currentCost,
        optimized_cost: optimizedCost,
        savings: currentCost - optimizedCost,
        recommendation: `Disable Multi-AZ for non-production database "${dbId}"`,
        details: 'Multi-AZ doubles cost - not needed for dev/test environments',
        priority: 'high',
        effort: 'low',
        category: 'Configuration',
      });
    }
    
    // 4. Reserved Instance candidate
    const currentCost = estimateRDSCost(instanceClass);
    const riCost = currentCost * 0.58; // ~42% savings with 1-year RI
    
    optimizations.push({
      type: 'rds_reserved_instance',
      resource_id: dbId,
      resource_type: 'RDS',
      resource_name: dbId,
      current_cost: currentCost,
      optimized_cost: riCost,
      savings: currentCost - riCost,
      recommendation: `Consider Reserved Instance for "${dbId}"`,
      details: '1-year Reserved Instance can save up to 42%',
      priority: 'low',
      effort: 'low',
      category: 'Commitment Discounts',
    });
    
    // 5. Storage optimization (gp2 to gp3)
    if (db.StorageType === 'gp2' && storageGB > 0) {
      const gp2Cost = storageGB * 0.115;
      const gp3Cost = storageGB * 0.08;
      
      optimizations.push({
        type: 'rds_storage_gp3',
        resource_id: dbId,
        resource_type: 'RDS',
        resource_name: dbId,
        current_cost: gp2Cost,
        optimized_cost: gp3Cost,
        savings: gp2Cost - gp3Cost,
        recommendation: `Migrate "${dbId}" storage from gp2 to gp3`,
        details: 'gp3 storage is ~30% cheaper with better baseline performance',
        priority: 'medium',
        effort: 'low',
        category: 'Modernization',
      });
    }
  }
}

// ============================================================================
// Elastic IP Analysis
// ============================================================================
async function analyzeElasticIPs(region: string, creds: any, optimizations: Optimization[]): Promise<void> {
  const ec2 = new EC2Client({ region, credentials: creds });
  const response = await ec2.send(new DescribeAddressesCommand({}));
  const addresses = response.Addresses || [];
  
  for (const eip of addresses) {
    // Unassociated Elastic IPs cost $3.65/month
    if (!eip.AssociationId) {
      optimizations.push({
        type: 'release_unused_eip',
        resource_id: eip.AllocationId || eip.PublicIp || 'unknown',
        resource_type: 'Elastic IP',
        resource_name: eip.PublicIp || 'Unknown IP',
        current_cost: 3.65,
        optimized_cost: 0,
        savings: 3.65,
        recommendation: `Release unused Elastic IP ${eip.PublicIp}`,
        details: 'Unassociated Elastic IPs incur charges',
        priority: 'high',
        effort: 'low',
        category: 'Idle Resources',
      });
    }
  }
}

// ============================================================================
// NAT Gateway Analysis
// ============================================================================
async function analyzeNATGateways(region: string, creds: any, optimizations: Optimization[]): Promise<void> {
  const ec2 = new EC2Client({ region, credentials: creds });
  const response = await ec2.send(new DescribeNatGatewaysCommand({ Filter: [{ Name: 'state', Values: ['available'] }] }));
  const natGateways = response.NatGateways || [];
  
  // NAT Gateways cost ~$32/month + data processing
  for (const nat of natGateways) {
    const natId = nat.NatGatewayId || 'unknown';
    const name = nat.Tags?.find(t => t.Key === 'Name')?.Value || natId;
    
    // Suggest NAT Instance for low-traffic scenarios
    optimizations.push({
      type: 'nat_gateway_to_instance',
      resource_id: natId,
      resource_type: 'NAT Gateway',
      resource_name: name,
      current_cost: 32,
      optimized_cost: 8, // t3.nano NAT instance
      savings: 24,
      recommendation: `Consider NAT Instance instead of NAT Gateway "${name}"`,
      details: 'For low-traffic VPCs, NAT Instance can be 75% cheaper',
      priority: 'low',
      effort: 'high',
      category: 'Architecture',
    });
  }
  
  // Multiple NAT Gateways in same AZ
  const natsByAZ = natGateways.reduce((acc, nat) => {
    const az = nat.SubnetId || 'unknown';
    acc[az] = (acc[az] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  for (const [az, count] of Object.entries(natsByAZ)) {
    if (count > 1) {
      optimizations.push({
        type: 'consolidate_nat_gateways',
        resource_id: az,
        resource_type: 'NAT Gateway',
        resource_name: `Multiple NATs in ${az}`,
        current_cost: count * 32,
        optimized_cost: 32,
        savings: (count - 1) * 32,
        recommendation: `Consolidate ${count} NAT Gateways in same subnet`,
        details: 'Multiple NAT Gateways in same AZ may be redundant',
        priority: 'medium',
        effort: 'medium',
        category: 'Architecture',
      });
    }
  }
}


// ============================================================================
// Load Balancer Analysis
// ============================================================================
async function analyzeLoadBalancers(region: string, creds: any, optimizations: Optimization[]): Promise<void> {
  const elbv2 = new ElasticLoadBalancingV2Client({ region, credentials: creds });
  
  try {
    const lbResponse = await elbv2.send(new DescribeLoadBalancersCommand({}));
    const loadBalancers = lbResponse.LoadBalancers || [];
    
    for (const lb of loadBalancers) {
      const lbArn = lb.LoadBalancerArn || '';
      const lbName = lb.LoadBalancerName || 'unknown';
      const lbType = lb.Type || 'application';
      
      // Get target groups for this LB
      const tgResponse = await elbv2.send(new DescribeTargetGroupsCommand({ LoadBalancerArn: lbArn }));
      const targetGroups = tgResponse.TargetGroups || [];
      
      // ALB costs ~$22/month, NLB ~$22/month
      const monthlyCost = lbType === 'network' ? 22 : 22;
      
      // Check for LBs with no target groups or empty target groups
      if (targetGroups.length === 0) {
        optimizations.push({
          type: 'delete_unused_lb',
          resource_id: lbArn,
          resource_type: 'Load Balancer',
          resource_name: lbName,
          current_cost: monthlyCost,
          optimized_cost: 0,
          savings: monthlyCost,
          recommendation: `Delete unused Load Balancer "${lbName}"`,
          details: 'No target groups attached',
          priority: 'high',
          effort: 'low',
          category: 'Idle Resources',
        });
      }
      
      // Suggest consolidation for multiple ALBs
      if (lbType === 'application') {
        optimizations.push({
          type: 'consolidate_albs',
          resource_id: lbArn,
          resource_type: 'Load Balancer',
          resource_name: lbName,
          current_cost: monthlyCost,
          optimized_cost: monthlyCost * 0.5,
          savings: monthlyCost * 0.5,
          recommendation: `Review if "${lbName}" can be consolidated with other ALBs`,
          details: 'Multiple ALBs can often be consolidated using host-based routing',
          priority: 'low',
          effort: 'medium',
          category: 'Architecture',
        });
      }
    }
  } catch (err) {
    logger.warn('Failed to analyze load balancers', { error: (err as Error).message, region });
  }
}

// ============================================================================
// Lambda Analysis
// ============================================================================
async function analyzeLambda(region: string, creds: any, optimizations: Optimization[]): Promise<void> {
  const lambda = new LambdaClient({ region, credentials: creds });
  
  try {
    const response = await lambda.send(new ListFunctionsCommand({}));
    const functions = response.Functions || [];
    
    for (const fn of functions) {
      const fnName = fn.FunctionName || 'unknown';
      const memoryMB = fn.MemorySize || 128;
      const runtime = fn.Runtime || '';
      
      // 1. Oversized memory (common issue)
      if (memoryMB >= 1024) {
        const currentCost = (memoryMB / 1024) * 0.0000166667 * 1000000; // Estimate per 1M invocations
        const optimizedCost = (512 / 1024) * 0.0000166667 * 1000000;
        
        optimizations.push({
          type: 'rightsize_lambda_memory',
          resource_id: fn.FunctionArn || fnName,
          resource_type: 'Lambda',
          resource_name: fnName,
          current_cost: currentCost,
          optimized_cost: optimizedCost,
          savings: currentCost - optimizedCost,
          recommendation: `Review memory allocation for "${fnName}" (${memoryMB}MB)`,
          details: 'Use AWS Lambda Power Tuning to find optimal memory',
          priority: 'medium',
          effort: 'low',
          category: 'Right-sizing',
        });
      }
      
      // 2. Deprecated runtimes
      const deprecatedRuntimes = ['python2.7', 'python3.6', 'nodejs10.x', 'nodejs12.x', 'dotnetcore2.1', 'ruby2.5'];
      if (deprecatedRuntimes.includes(runtime)) {
        optimizations.push({
          type: 'upgrade_lambda_runtime',
          resource_id: fn.FunctionArn || fnName,
          resource_type: 'Lambda',
          resource_name: fnName,
          current_cost: 0,
          optimized_cost: 0,
          savings: 5, // Nominal savings for security/performance
          recommendation: `Upgrade "${fnName}" from deprecated runtime ${runtime}`,
          details: 'Deprecated runtimes may have security vulnerabilities and worse performance',
          priority: 'high',
          effort: 'medium',
          category: 'Modernization',
        });
      }
      
      // 3. ARM64 migration opportunity
      if (runtime.includes('nodejs') || runtime.includes('python')) {
        const currentCost = 10; // Estimate
        const armCost = currentCost * 0.8; // ARM is ~20% cheaper
        
        optimizations.push({
          type: 'lambda_arm64_migration',
          resource_id: fn.FunctionArn || fnName,
          resource_type: 'Lambda',
          resource_name: fnName,
          current_cost: currentCost,
          optimized_cost: armCost,
          savings: currentCost - armCost,
          recommendation: `Consider ARM64 (Graviton2) for "${fnName}"`,
          details: 'ARM64 offers 20% better price/performance for compatible runtimes',
          priority: 'low',
          effort: 'medium',
          category: 'Modernization',
        });
      }
    }
  } catch (err) {
    logger.warn('Failed to analyze Lambda functions', { error: (err as Error).message, region });
  }
}

// ============================================================================
// ElastiCache Analysis
// ============================================================================
async function analyzeElastiCache(region: string, creds: any, optimizations: Optimization[]): Promise<void> {
  const elasticache = new ElastiCacheClient({ region, credentials: creds });
  
  try {
    const response = await elasticache.send(new DescribeCacheClustersCommand({}));
    const clusters = response.CacheClusters || [];
    
    for (const cluster of clusters) {
      const clusterId = cluster.CacheClusterId || 'unknown';
      const nodeType = cluster.CacheNodeType || '';
      const numNodes = cluster.NumCacheNodes || 1;
      const engine = cluster.Engine || '';
      
      // 1. Old generation node types
      const oldGenTypes = ['cache.m4.', 'cache.r4.', 'cache.t2.', 'cache.m3.'];
      if (oldGenTypes.some(t => nodeType.startsWith(t))) {
        const currentCost = estimateElastiCacheCost(nodeType) * numNodes;
        const newType = nodeType
          .replace('cache.m4.', 'cache.m5.')
          .replace('cache.r4.', 'cache.r5.')
          .replace('cache.t2.', 'cache.t3.')
          .replace('cache.m3.', 'cache.m5.');
        const optimizedCost = estimateElastiCacheCost(newType) * numNodes * 0.9;
        
        optimizations.push({
          type: 'upgrade_elasticache_generation',
          resource_id: clusterId,
          resource_type: 'ElastiCache',
          resource_name: clusterId,
          current_cost: currentCost,
          optimized_cost: optimizedCost,
          savings: currentCost - optimizedCost,
          recommendation: `Upgrade "${clusterId}" from ${nodeType} to ${newType}`,
          details: 'New generation offers better performance at similar cost',
          priority: 'medium',
          effort: 'medium',
          category: 'Modernization',
        });
      }
      
      // 2. Reserved Node candidate
      const currentCost = estimateElastiCacheCost(nodeType) * numNodes;
      const reservedCost = currentCost * 0.65; // ~35% savings
      
      optimizations.push({
        type: 'elasticache_reserved_node',
        resource_id: clusterId,
        resource_type: 'ElastiCache',
        resource_name: clusterId,
        current_cost: currentCost,
        optimized_cost: reservedCost,
        savings: currentCost - reservedCost,
        recommendation: `Consider Reserved Node for "${clusterId}"`,
        details: '1-year Reserved Node can save up to 35%',
        priority: 'low',
        effort: 'low',
        category: 'Commitment Discounts',
      });
    }
  } catch (err) {
    logger.warn('Failed to analyze ElastiCache', { error: (err as Error).message, region });
  }
}

// ============================================================================
// Snapshot Analysis
// ============================================================================
async function analyzeSnapshots(region: string, creds: any, optimizations: Optimization[]): Promise<void> {
  const ec2 = new EC2Client({ region, credentials: creds });
  const rds = new RDSClient({ region, credentials: creds });
  
  try {
    // EBS Snapshots
    const ebsResponse = await ec2.send(new DescribeSnapshotsCommand({ OwnerIds: ['self'] }));
    const snapshots = ebsResponse.Snapshots || [];
    
    // Group snapshots by volume
    const snapshotsByVolume = snapshots.reduce((acc, snap) => {
      const volId = snap.VolumeId || 'deleted';
      if (!acc[volId]) acc[volId] = [];
      acc[volId].push(snap);
      return acc;
    }, {} as Record<string, typeof snapshots>);
    
    // Find volumes with many snapshots
    for (const [volumeId, volSnapshots] of Object.entries(snapshotsByVolume)) {
      if (volSnapshots.length > 10) {
        const totalSizeGB = volSnapshots.reduce((sum, s) => sum + (s.VolumeSize || 0), 0);
        const snapshotCost = totalSizeGB * 0.05; // $0.05/GB/month
        const optimizedCost = snapshotCost * 0.3; // Keep only 30%
        
        optimizations.push({
          type: 'cleanup_old_snapshots',
          resource_id: volumeId,
          resource_type: 'EBS Snapshot',
          resource_name: `Snapshots for ${volumeId}`,
          current_cost: snapshotCost,
          optimized_cost: optimizedCost,
          savings: snapshotCost - optimizedCost,
          recommendation: `Clean up ${volSnapshots.length} snapshots for volume ${volumeId}`,
          details: 'Implement snapshot lifecycle policy to retain only necessary snapshots',
          priority: 'medium',
          effort: 'low',
          category: 'Storage Optimization',
        });
      }
    }
    
    // Old snapshots (>90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const oldSnapshots = snapshots.filter(s => s.StartTime && new Date(s.StartTime) < ninetyDaysAgo);
    if (oldSnapshots.length > 5) {
      const totalSizeGB = oldSnapshots.reduce((sum, s) => sum + (s.VolumeSize || 0), 0);
      const snapshotCost = totalSizeGB * 0.05;
      
      optimizations.push({
        type: 'delete_old_snapshots',
        resource_id: 'multiple',
        resource_type: 'EBS Snapshot',
        resource_name: `${oldSnapshots.length} old snapshots`,
        current_cost: snapshotCost,
        optimized_cost: 0,
        savings: snapshotCost,
        recommendation: `Review ${oldSnapshots.length} snapshots older than 90 days`,
        details: 'Old snapshots may no longer be needed',
        priority: 'medium',
        effort: 'low',
        category: 'Storage Optimization',
      });
    }
  } catch (err) {
    logger.warn('Failed to analyze snapshots', { error: (err as Error).message, region });
  }
}


// ============================================================================
// Cost Estimation Functions
// ============================================================================

function estimateInstanceCost(instanceType: string): number {
  const costs: Record<string, number> = {
    // T-series
    't2.nano': 4.2, 't2.micro': 8.5, 't2.small': 17, 't2.medium': 34, 't2.large': 68, 't2.xlarge': 136,
    't3.nano': 3.8, 't3.micro': 7.5, 't3.small': 15, 't3.medium': 30, 't3.large': 60, 't3.xlarge': 120,
    't3a.nano': 3.4, 't3a.micro': 6.8, 't3a.small': 13.5, 't3a.medium': 27, 't3a.large': 54,
    // M-series
    'm4.large': 73, 'm4.xlarge': 146, 'm4.2xlarge': 292, 'm4.4xlarge': 584,
    'm5.large': 70, 'm5.xlarge': 140, 'm5.2xlarge': 280, 'm5.4xlarge': 560,
    'm5a.large': 63, 'm5a.xlarge': 126, 'm5a.2xlarge': 252,
    'm6i.large': 70, 'm6i.xlarge': 140, 'm6i.2xlarge': 280,
    // C-series
    'c4.large': 73, 'c4.xlarge': 146, 'c4.2xlarge': 292,
    'c5.large': 62, 'c5.xlarge': 124, 'c5.2xlarge': 248, 'c5.4xlarge': 496,
    'c6i.large': 62, 'c6i.xlarge': 124, 'c6i.2xlarge': 248,
    // R-series
    'r4.large': 97, 'r4.xlarge': 194, 'r4.2xlarge': 388,
    'r5.large': 91, 'r5.xlarge': 182, 'r5.2xlarge': 364, 'r5.4xlarge': 728,
    'r6i.large': 91, 'r6i.xlarge': 182, 'r6i.2xlarge': 364,
  };
  
  // Try exact match first
  if (costs[instanceType]) return costs[instanceType];
  
  // Estimate based on size
  const sizeMultipliers: Record<string, number> = {
    'nano': 0.5, 'micro': 1, 'small': 2, 'medium': 4, 'large': 8,
    'xlarge': 16, '2xlarge': 32, '4xlarge': 64, '8xlarge': 128,
    '12xlarge': 192, '16xlarge': 256, '24xlarge': 384,
  };
  
  for (const [size, mult] of Object.entries(sizeMultipliers)) {
    if (instanceType.includes(size)) {
      return mult * 4; // Base estimate
    }
  }
  
  return 50; // Default estimate
}

function estimateRDSCost(instanceClass: string): number {
  const costs: Record<string, number> = {
    // T-series
    'db.t2.micro': 13, 'db.t2.small': 26, 'db.t2.medium': 52, 'db.t2.large': 104,
    'db.t3.micro': 12, 'db.t3.small': 24, 'db.t3.medium': 48, 'db.t3.large': 96,
    'db.t4g.micro': 11, 'db.t4g.small': 22, 'db.t4g.medium': 44,
    // M-series
    'db.m4.large': 130, 'db.m4.xlarge': 260, 'db.m4.2xlarge': 520,
    'db.m5.large': 125, 'db.m5.xlarge': 250, 'db.m5.2xlarge': 500, 'db.m5.4xlarge': 1000,
    'db.m6g.large': 118, 'db.m6g.xlarge': 236, 'db.m6g.2xlarge': 472,
    // R-series
    'db.r4.large': 175, 'db.r4.xlarge': 350, 'db.r4.2xlarge': 700,
    'db.r5.large': 165, 'db.r5.xlarge': 330, 'db.r5.2xlarge': 660, 'db.r5.4xlarge': 1320,
    'db.r6g.large': 155, 'db.r6g.xlarge': 310, 'db.r6g.2xlarge': 620,
  };
  
  if (costs[instanceClass]) return costs[instanceClass];
  
  // Estimate based on class
  if (instanceClass.includes('xlarge')) return 300;
  if (instanceClass.includes('large')) return 150;
  if (instanceClass.includes('medium')) return 75;
  if (instanceClass.includes('small')) return 35;
  
  return 100;
}

function calculateEBSCost(sizeGB: number, volumeType: string, iops?: number): number {
  const baseCosts: Record<string, number> = {
    'gp2': 0.10,
    'gp3': 0.08,
    'io1': 0.125,
    'io2': 0.125,
    'st1': 0.045,
    'sc1': 0.025,
    'standard': 0.05,
  };
  
  const baseCost = (baseCosts[volumeType] || 0.10) * sizeGB;
  
  // Add IOPS cost for provisioned IOPS volumes
  if ((volumeType === 'io1' || volumeType === 'io2') && iops) {
    return baseCost + (iops * 0.065);
  }
  
  // gp3 additional IOPS/throughput
  if (volumeType === 'gp3' && iops && iops > 3000) {
    return baseCost + ((iops - 3000) * 0.005);
  }
  
  return baseCost;
}

function estimateElastiCacheCost(nodeType: string): number {
  const costs: Record<string, number> = {
    'cache.t2.micro': 12, 'cache.t2.small': 24, 'cache.t2.medium': 48,
    'cache.t3.micro': 11, 'cache.t3.small': 22, 'cache.t3.medium': 44,
    'cache.m4.large': 115, 'cache.m4.xlarge': 230,
    'cache.m5.large': 110, 'cache.m5.xlarge': 220, 'cache.m5.2xlarge': 440,
    'cache.r4.large': 155, 'cache.r4.xlarge': 310,
    'cache.r5.large': 145, 'cache.r5.xlarge': 290, 'cache.r5.2xlarge': 580,
    'cache.r6g.large': 135, 'cache.r6g.xlarge': 270,
  };
  
  if (costs[nodeType]) return costs[nodeType];
  
  if (nodeType.includes('xlarge')) return 250;
  if (nodeType.includes('large')) return 120;
  if (nodeType.includes('medium')) return 50;
  
  return 80;
}
