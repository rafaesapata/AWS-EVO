/**
 * Lambda handler para FinOps Copilot
 * AWS Lambda Handler for finops-copilot
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { logger } from '../../lib/logging.js';

interface FinOpsCopilotRequest {
  accountId?: string;
  analysisType?: 'overview' | 'detailed' | 'recommendations';
}

interface CostRecommendation {
  type: string;
  title: string;
  description: string;
  potential_savings: number;
  priority: 'high' | 'medium' | 'low';
  resource_id?: string;
  action: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('FinOps Copilot started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: FinOpsCopilotRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, analysisType = 'overview' } = body;
    
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
    
    logger.info('Starting FinOps analysis', { analysisType });
    
    const creds = await resolveAwsCredentials(credential, 'us-east-1');
    
    // Get cost data from Cost Explorer
    const costExplorerClient = new CostExplorerClient({
      region: 'us-east-1',
      credentials: toAwsCredentials(creds),
    });
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Last 30 days
    
    const costResponse = await costExplorerClient.send(
      new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startDate.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'DAILY',
        Metrics: ['UnblendedCost', 'UsageQuantity'],
        GroupBy: [
          {
            Type: 'DIMENSION',
            Key: 'SERVICE',
          },
        ],
      })
    );
    
    // Calculate total cost
    let totalCost = 0;
    const costByService: Record<string, number> = {};
    
    if (costResponse.ResultsByTime) {
      for (const result of costResponse.ResultsByTime) {
        if (result.Groups) {
          for (const group of result.Groups) {
            const service = group.Keys?.[0] || 'Unknown';
            const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
            
            totalCost += cost;
            costByService[service] = (costByService[service] || 0) + cost;
          }
        }
      }
    }
    
    logger.info('Cost analysis completed', { totalCost: totalCost.toFixed(2), period: '30 days' });
    
    // Get resource inventory for recommendations
    const recommendations: CostRecommendation[] = [];
    
    if (analysisType === 'recommendations' || analysisType === 'detailed') {
      const regions = credential.regions || ['us-east-1'];
      
      for (const region of regions) {
        try {
          const regionCreds = await resolveAwsCredentials(credential, region);
          
          // Check EC2 instances
          const ec2Client = new EC2Client({
            region,
            credentials: toAwsCredentials(regionCreds),
          });
          
          const instancesResponse = await ec2Client.send(new DescribeInstancesCommand({}));
          const instances = instancesResponse.Reservations?.flatMap(r => r.Instances || []) || [];
          
          // Identify stopped instances
          const stoppedInstances = instances.filter(i => i.State?.Name === 'stopped');
          
          if (stoppedInstances.length > 0) {
            recommendations.push({
              type: 'ec2_stopped',
              title: `${stoppedInstances.length} Instâncias EC2 Paradas`,
              description: `Instâncias paradas ainda geram custos de EBS. Considere terminá-las ou criar AMIs.`,
              potential_savings: stoppedInstances.length * 10, // Estimativa: $10/mês por instância
              priority: 'medium',
              action: 'Revisar instâncias paradas e terminar as não utilizadas',
            });
          }
          
          // Identify old generation instances
          const oldGenInstances = instances.filter(i => 
            i.State?.Name === 'running' && 
            (i.InstanceType?.startsWith('t2.') || i.InstanceType?.startsWith('m4.'))
          );
          
          if (oldGenInstances.length > 0) {
            recommendations.push({
              type: 'ec2_old_generation',
              title: `${oldGenInstances.length} Instâncias de Geração Antiga`,
              description: `Instâncias t2/m4 podem ser migradas para t3/m5 com melhor custo-benefício.`,
              potential_savings: oldGenInstances.length * 20, // Estimativa: $20/mês por instância
              priority: 'medium',
              action: 'Migrar para instâncias de nova geração (t3, m5, etc.)',
            });
          }
          
          // Check RDS instances
          const rdsClient = new RDSClient({
            region,
            credentials: toAwsCredentials(regionCreds),
          });
          
          const dbResponse = await rdsClient.send(new DescribeDBInstancesCommand({}));
          const databases = dbResponse.DBInstances || [];
          
          // Identify single-AZ production databases
          const singleAzDbs = databases.filter(db => 
            !db.MultiAZ && 
            db.DBInstanceClass?.includes('db.t3.') === false // Não é dev
          );
          
          if (singleAzDbs.length > 0) {
            recommendations.push({
              type: 'rds_single_az',
              title: `${singleAzDbs.length} Databases RDS Single-AZ`,
              description: `Databases de produção devem usar Multi-AZ para alta disponibilidade.`,
              potential_savings: 0, // Não é economia, é melhoria de disponibilidade
              priority: 'high',
              action: 'Habilitar Multi-AZ para databases de produção',
            });
          }
          
          // Identify over-provisioned databases
          const largeDbs = databases.filter(db => 
            db.DBInstanceClass?.includes('db.r5.') || 
            db.DBInstanceClass?.includes('db.r6.')
          );
          
          if (largeDbs.length > 0) {
            recommendations.push({
              type: 'rds_oversized',
              title: `${largeDbs.length} Databases Potencialmente Superdimensionados`,
              description: `Databases r5/r6 são caros. Verificar se o tamanho é realmente necessário.`,
              potential_savings: largeDbs.length * 100, // Estimativa: $100/mês por database
              priority: 'high',
              action: 'Analisar métricas de CPU/Memory e considerar downsize',
            });
          }
          
        } catch (regionError) {
          logger.error('Error analyzing region', regionError as Error, { region });
          continue;
        }
      }
    }
    
    // Calculate potential total savings
    const totalPotentialSavings = recommendations.reduce(
      (sum, rec) => sum + rec.potential_savings,
      0
    );
    
    // Sort recommendations by priority and savings
    recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      
      if (priorityDiff !== 0) return priorityDiff;
      return b.potential_savings - a.potential_savings;
    });
    
    logger.info('FinOps analysis completed', { 
      recommendationCount: recommendations.length, 
      potentialSavings: totalPotentialSavings.toFixed(2) 
    });
    
    return success({
      analysis_type: analysisType,
      cost_summary: {
        total_cost_30d: parseFloat(totalCost.toFixed(2)),
        cost_by_service: Object.entries(costByService)
          .map(([service, cost]) => ({
            service,
            cost: parseFloat(cost.toFixed(2)),
            percentage: parseFloat(((cost / totalCost) * 100).toFixed(2)),
          }))
          .sort((a, b) => b.cost - a.cost)
          .slice(0, 10), // Top 10 services
      },
      recommendations,
      potential_savings: {
        monthly: parseFloat(totalPotentialSavings.toFixed(2)),
        annual: parseFloat((totalPotentialSavings * 12).toFixed(2)),
      },
      recommendations_count: {
        high: recommendations.filter(r => r.priority === 'high').length,
        medium: recommendations.filter(r => r.priority === 'medium').length,
        low: recommendations.filter(r => r.priority === 'low').length,
      },
    });
    
  } catch (err) {
    logger.error('FinOps Copilot error', err as Error);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
