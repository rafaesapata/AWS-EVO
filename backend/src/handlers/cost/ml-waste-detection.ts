import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for ML Waste Detection
 * AWS Lambda Handler for ml-waste-detection
 * 
 * Usa machine learning para detectar recursos AWS desperdiçados
 * Otimizado para executar dentro do limite de 29s do API Gateway
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { businessMetrics } from '../../lib/metrics.js';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';

interface MLWasteDetectionRequest {
  accountId?: string;
  regions?: string[];
  threshold?: number; // CPU threshold (default: 5%)
  maxInstances?: number; // Limit instances to analyze (default: 20)
}

interface WasteItem {
  resourceId: string;
  resourceType: string;
  resourceName: string | null;
  region: string;
  wasteType: 'idle' | 'underutilized' | 'oversized' | 'zombie';
  confidence: number; // 0-100
  estimatedMonthlyCost: number;
  estimatedSavings: number;
  metrics: any;
  recommendation: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 25000; // 25 seconds to stay under API Gateway 29s limit
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  
  logger.info('ML Waste Detection started', { 
    organizationId,
    userId: user.id,
    requestId: context.awsRequestId 
  });
  
  try {
    const body: MLWasteDetectionRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, regions: requestedRegions, threshold = 5, maxInstances = 20 } = body;
    
    const prisma = getPrismaClient();
    
    // Buscar credenciais AWS ativas
    const awsAccounts = await prisma.awsCredential.findMany({
      where: {
        organization_id: organizationId,
        is_active: true,
        ...(accountId && { id: accountId }),
      },
      take: 1, // Process one account at a time for speed
    });
    
    if (awsAccounts.length === 0) {
      return success({
        success: true,
        message: 'No AWS credentials configured',
        wasteItems: [],
        totalSavings: 0,
        analyzed_resources: 0,
        total_monthly_savings: 0,
      });
    }
    
    const allWasteItems: WasteItem[] = [];
    let totalAnalyzed = 0;
    
    // Processar a conta AWS (apenas uma para manter dentro do timeout)
    const account = awsAccounts[0];
    const regions = requestedRegions || (account.regions as string[]) || ['us-east-1'];
    
    try {
      const resolvedCreds = await resolveAwsCredentials(account, regions[0]);
      
      // Analisar apenas a primeira região para manter rápido
      const region = regions[0];
      
      // Check time before processing
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        logger.warn('Approaching timeout, returning partial results');
        return success({
          success: true,
          partial: true,
          message: 'Partial results due to time constraints',
          wasteItems: allWasteItems,
          analyzed_resources: totalAnalyzed,
          total_monthly_savings: allWasteItems.reduce((sum, item) => sum + item.estimatedSavings, 0),
        });
      }
      
      logger.info('Analyzing waste in region', { organizationId, region, accountId: account.id });
      
      const { wasteItems, analyzed } = await detectWasteInRegionFast(
        account.id,
        region,
        resolvedCreds,
        threshold,
        maxInstances,
        MAX_EXECUTION_TIME - (Date.now() - startTime)
      );
      
      allWasteItems.push(...wasteItems);
      totalAnalyzed += analyzed;
      
      logger.info('Account analysis completed', { 
        organizationId, 
        accountId: account.id,
        accountName: account.account_name,
        wasteItemsFound: wasteItems.length
      });
      
    } catch (err) {
      logger.error('Error analyzing account', err as Error, { 
        organizationId, 
        accountId: account.id 
      });
    }
    
    // Salvar waste items detectados (em batch para velocidade)
    if (allWasteItems.length > 0) {
      try {
        // Delete old detections for this account first
        await prisma.wasteDetection.deleteMany({
          where: {
            organization_id: organizationId,
            account_id: account.id,
          }
        });
        
        // Insert new ones
        await prisma.wasteDetection.createMany({
          data: allWasteItems.map(item => ({
            organization_id: organizationId,
            account_id: account.id,
            resource_id: item.resourceId,
            resource_type: item.resourceType,
            resource_name: item.resourceName,
            region: item.region,
            waste_type: item.wasteType,
            confidence: item.confidence,
            estimated_monthly_cost: item.estimatedMonthlyCost,
            estimated_savings: item.estimatedSavings,
            metrics: item.metrics as any,
            recommendation: item.recommendation
          })),
          skipDuplicates: true,
        });
      } catch (dbErr) {
        logger.error('Error saving waste detections', dbErr as Error);
      }
    }
    
    // Calcular estatísticas
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const totalSavings = allWasteItems.reduce((sum, item) => sum + item.estimatedSavings, 0);
    const byType = {
      idle: allWasteItems.filter(i => i.wasteType === 'idle').length,
      underutilized: allWasteItems.filter(i => i.wasteType === 'underutilized').length,
      oversized: allWasteItems.filter(i => i.wasteType === 'oversized').length,
      zombie: allWasteItems.filter(i => i.wasteType === 'zombie').length,
    };
    
    logger.info('ML Waste Detection completed', { 
      organizationId,
      wasteItemsCount: allWasteItems.length,
      totalSavings: parseFloat(totalSavings.toFixed(2)),
      executionTime
    });
    
    return success({
      success: true,
      wasteItems: allWasteItems,
      analyzed_resources: totalAnalyzed,
      total_monthly_savings: parseFloat(totalSavings.toFixed(2)),
      summary: {
        totalItems: allWasteItems.length,
        totalSavings: parseFloat(totalSavings.toFixed(2)),
        byType,
        executionTime,
      },
    });
    
  } catch (err) {
    logger.error('ML Waste Detection error', err as Error, { 
      organizationId,
      userId: user.id,
      requestId: context.awsRequestId 
    });
    
    await businessMetrics.errorOccurred(
      'ml_waste_detection_error',
      'ml-waste-detection',
      organizationId
    );
    
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

async function detectWasteInRegionFast(
  accountId: string,
  region: string,
  credentials: any,
  cpuThreshold: number,
  maxInstances: number,
  remainingTime: number
): Promise<{ wasteItems: WasteItem[], analyzed: number }> {
  const wasteItems: WasteItem[] = [];
  let analyzed = 0;
  const startTime = Date.now();
  
  try {
    const ec2Client = new EC2Client({
      region,
      credentials: toAwsCredentials(credentials),
    });
    
    const cwClient = new CloudWatchClient({
      region,
      credentials: toAwsCredentials(credentials),
    });
    
    // Obter instâncias EC2 running
    const response = await ec2Client.send(new DescribeInstancesCommand({
      Filters: [{ Name: 'instance-state-name', Values: ['running'] }],
      MaxResults: maxInstances,
    }));
    
    if (response.Reservations) {
      for (const reservation of response.Reservations) {
        if (reservation.Instances) {
          for (const instance of reservation.Instances) {
            // Check remaining time
            if (Date.now() - startTime > remainingTime - 2000) {
              logger.warn('Time limit reached, returning partial results');
              return { wasteItems, analyzed };
            }
            
            const instanceId = instance.InstanceId!;
            const instanceType = instance.InstanceType!;
            const instanceName = instance.Tags?.find(t => t.Key === 'Name')?.Value || null;
            
            analyzed++;
            
            // Obter métricas de CPU dos últimos 3 dias (mais rápido que 7)
            const endTime = new Date();
            const startTimeMetrics = new Date(endTime.getTime() - 3 * 24 * 60 * 60 * 1000);
            
            try {
              const metricsCommand = new GetMetricStatisticsCommand({
                Namespace: 'AWS/EC2',
                MetricName: 'CPUUtilization',
                Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
                StartTime: startTimeMetrics,
                EndTime: endTime,
                Period: 3600 * 6, // 6 hours (fewer datapoints)
                Statistics: ['Average', 'Maximum'],
              });
              
              const metricsResponse = await cwClient.send(metricsCommand);
              
              if (metricsResponse.Datapoints && metricsResponse.Datapoints.length > 0) {
                const avgCpu = metricsResponse.Datapoints.reduce(
                  (sum, dp) => sum + (dp.Average || 0),
                  0
                ) / metricsResponse.Datapoints.length;
                
                const maxCpu = Math.max(
                  ...metricsResponse.Datapoints.map(dp => dp.Maximum || 0)
                );
                
                // Detectar waste baseado em CPU
                if (avgCpu < cpuThreshold) {
                  const estimatedCost = getInstanceMonthlyCost(instanceType);
                  const confidence = calculateConfidence(avgCpu, maxCpu, cpuThreshold);
                  
                  let wasteType: 'idle' | 'underutilized' | 'oversized' | 'zombie' = 'idle';
                  let recommendation = '';
                  let savingsPercent = 0;
                  
                  if (avgCpu < 1 && maxCpu < 5) {
                    wasteType = 'zombie';
                    recommendation = `Stop or terminate this instance. CPU usage is extremely low (avg: ${avgCpu.toFixed(2)}%, max: ${maxCpu.toFixed(2)}%)`;
                    savingsPercent = 100;
                  } else if (avgCpu < cpuThreshold) {
                    wasteType = 'underutilized';
                    recommendation = `Consider downsizing to a smaller instance type. Current avg CPU: ${avgCpu.toFixed(2)}%`;
                    savingsPercent = 50;
                  }
                  
                  wasteItems.push({
                    resourceId: instanceId,
                    resourceType: 'EC2::Instance',
                    resourceName: instanceName,
                    region,
                    wasteType,
                    confidence,
                    estimatedMonthlyCost: estimatedCost,
                    estimatedSavings: estimatedCost * (savingsPercent / 100),
                    metrics: {
                      avgCpu: parseFloat(avgCpu.toFixed(2)),
                      maxCpu: parseFloat(maxCpu.toFixed(2)),
                      instanceType,
                      datapoints: metricsResponse.Datapoints.length,
                    },
                    recommendation,
                  });
                }
              }
            } catch (metricErr) {
              logger.warn('Error getting metrics for instance', { instanceId, error: (metricErr as Error).message });
            }
          }
        }
      }
    }
    
  } catch (err) {
    logger.error('Error detecting waste in region', err as Error, { region });
  }
  
  return { wasteItems, analyzed };
}

function calculateConfidence(avgCpu: number, maxCpu: number, threshold: number): number {
  // Quanto menor o uso e mais consistente, maior a confiança
  const avgFactor = (threshold - avgCpu) / threshold;
  const maxFactor = (threshold - maxCpu) / threshold;
  const confidence = ((avgFactor * 0.7) + (maxFactor * 0.3)) * 100;
  return Math.max(0, Math.min(100, confidence));
}

function getInstanceMonthlyCost(instanceType: string): number {
  // Custos aproximados mensais (730 horas) em USD
  const costs: Record<string, number> = {
    't2.micro': 8.5,
    't2.small': 17,
    't2.medium': 34,
    't2.large': 68,
    't3.micro': 7.5,
    't3.small': 15,
    't3.medium': 30,
    't3.large': 60,
    'm5.large': 70,
    'm5.xlarge': 140,
    'm5.2xlarge': 280,
    'c5.large': 62,
    'c5.xlarge': 124,
    'r5.large': 91,
    'r5.xlarge': 182,
  };
  
  return costs[instanceType] || 50; // Default estimate
}
