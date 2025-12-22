/**
 * Lambda handler para otimização de custos
 * AWS Lambda Handler for cost-optimization
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { businessMetrics } from '../../lib/metrics.js';
import { EC2Client, DescribeInstancesCommand, DescribeVolumesCommand } from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';

interface Optimization {
  type: string;
  resource_id: string;
  resource_type: string;
  current_cost: number;
  optimized_cost: number;
  savings: number;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  
  logger.info('Cost optimization started', { 
    organizationId,
    userId: user.id,
    requestId: context.awsRequestId 
  });
  
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { accountId } = body;
    
    const prisma = getPrismaClient();
    
    const credential = await prisma.awsCredential.findFirst({
      where: {
        organization_id: organizationId,
        is_active: true,
        ...(accountId && { id: accountId }),
      },
      orderBy: { created_at: 'desc' },
    });
    
    if (!credential) {
      logger.warn('AWS credentials not found for cost optimization', { 
        organizationId, 
        accountId 
      });
      return badRequest('AWS credentials not found');
    }
    
    const regions = credential.regions || ['us-east-1'];
    const optimizations: Optimization[] = [];
    
    for (const region of regions) {
      const creds = await resolveAwsCredentials(credential, region);
      
      // EC2 Optimizations
      const ec2Client = new EC2Client({ region, credentials: toAwsCredentials(creds) });
      
      const instancesResponse = await ec2Client.send(new DescribeInstancesCommand({}));
      const instances = instancesResponse.Reservations?.flatMap(r => r.Instances || []) || [];
      
      // Stopped instances
      for (const instance of instances.filter(i => i.State?.Name === 'stopped')) {
        optimizations.push({
          type: 'terminate_stopped_instance',
          resource_id: instance.InstanceId || 'unknown',
          resource_type: 'EC2',
          current_cost: 10, // EBS cost estimate
          optimized_cost: 0,
          savings: 10,
          recommendation: 'Terminate stopped instance or create AMI and terminate',
          priority: 'medium',
          effort: 'low',
        });
      }
      
      // Old generation instances
      for (const instance of instances.filter(i => 
        i.State?.Name === 'running' && 
        (i.InstanceType?.startsWith('t2.') || i.InstanceType?.startsWith('m4.'))
      )) {
        const currentCost = estimateInstanceCost(instance.InstanceType || '');
        const newGenType = instance.InstanceType?.replace('t2.', 't3.').replace('m4.', 'm5.');
        const optimizedCost = estimateInstanceCost(newGenType || '');
        
        optimizations.push({
          type: 'upgrade_instance_generation',
          resource_id: instance.InstanceId || 'unknown',
          resource_type: 'EC2',
          current_cost: currentCost,
          optimized_cost: optimizedCost,
          savings: currentCost - optimizedCost,
          recommendation: `Upgrade from ${instance.InstanceType} to ${newGenType} for better price/performance`,
          priority: 'medium',
          effort: 'medium',
        });
      }
      
      // Unattached EBS volumes
      const volumesResponse = await ec2Client.send(new DescribeVolumesCommand({}));
      const unattachedVolumes = volumesResponse.Volumes?.filter(v => 
        v.State === 'available'
      ) || [];
      
      for (const volume of unattachedVolumes) {
        const monthlyCost = (volume.Size || 0) * 0.10; // $0.10/GB/month estimate
        
        optimizations.push({
          type: 'delete_unattached_volume',
          resource_id: volume.VolumeId || 'unknown',
          resource_type: 'EBS',
          current_cost: monthlyCost,
          optimized_cost: 0,
          savings: monthlyCost,
          recommendation: 'Delete unattached EBS volume or create snapshot',
          priority: 'high',
          effort: 'low',
        });
      }
      
      // RDS Optimizations
      const rdsClient = new RDSClient({ region, credentials: toAwsCredentials(creds) });
      const dbResponse = await rdsClient.send(new DescribeDBInstancesCommand({}));
      const databases = dbResponse.DBInstances || [];
      
      // Oversized databases
      for (const db of databases.filter(d => 
        d.DBInstanceClass?.includes('db.r5.') || d.DBInstanceClass?.includes('db.r6.')
      )) {
        const currentCost = estimateRDSCost(db.DBInstanceClass || '');
        const recommendedClass = db.DBInstanceClass?.replace('r5.', 't3.').replace('r6.', 't3.');
        const optimizedCost = estimateRDSCost(recommendedClass || '');
        
        optimizations.push({
          type: 'downsize_rds',
          resource_id: db.DBInstanceIdentifier || 'unknown',
          resource_type: 'RDS',
          current_cost: currentCost,
          optimized_cost: optimizedCost,
          savings: currentCost - optimizedCost,
          recommendation: `Consider downsizing from ${db.DBInstanceClass} to ${recommendedClass} if metrics allow`,
          priority: 'high',
          effort: 'medium',
        });
      }
    }
    
    // Sort by savings
    optimizations.sort((a, b) => b.savings - a.savings);
    
    const totalSavings = optimizations.reduce((sum, opt) => sum + opt.savings, 0);
    const duration = Date.now() - startTime;
    
    // Publish metrics
    await businessMetrics.costAnalysisCompleted(
      0, // Total cost analyzed - would need actual cost data
      totalSavings,
      organizationId
    );
    
    logger.info('Cost optimization completed', { 
      organizationId,
      optimizationsCount: optimizations.length,
      totalSavings: parseFloat(totalSavings.toFixed(2)),
      duration
    });
    
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
      },
    });
    
  } catch (err) {
    logger.error('Cost optimization error', err as Error, { 
      organizationId,
      userId: user.id,
      requestId: context.awsRequestId 
    });
    
    await businessMetrics.errorOccurred(
      'cost_optimization_error',
      'cost-optimization',
      organizationId
    );
    
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

function estimateInstanceCost(instanceType: string): number {
  const costs: Record<string, number> = {
    't2.micro': 8.5,
    't2.small': 17,
    't2.medium': 34,
    't3.micro': 7.5,
    't3.small': 15,
    't3.medium': 30,
    'm4.large': 73,
    'm5.large': 70,
  };
  
  return costs[instanceType] || 50;
}

function estimateRDSCost(instanceClass: string): number {
  const costs: Record<string, number> = {
    'db.t3.micro': 15,
    'db.t3.small': 30,
    'db.t3.medium': 60,
    'db.r5.large': 180,
    'db.r6.large': 170,
  };
  
  return costs[instanceClass] || 100;
}
