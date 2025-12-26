/**
 * ML Waste Detection Lambda Handler
 * 
 * Uses machine learning analysis to detect AWS resource waste.
 * Analyzes EC2, RDS, and Lambda resources using CloudWatch metrics.
 * Optimized to execute within API Gateway 29s timeout.
 */

import { getHttpMethod } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { businessMetrics } from '../../lib/metrics.js';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { LambdaClient, ListFunctionsCommand, GetFunctionCommand } from '@aws-sdk/client-lambda';
import { CloudWatchClient, GetMetricStatisticsCommand, type Dimension } from '@aws-sdk/client-cloudwatch';
import { v4 as uuidv4 } from 'uuid';
import {
  analyzeUtilization,
  classifyWaste,
  generateUtilizationPatterns,
  getImplementationComplexity,
  type CloudWatchDatapoint,
  type UtilizationMetrics,
} from '../../lib/ml-analysis/index.js';
import { getMonthlyCost, getLambdaMonthlyCost } from '../../lib/cost/pricing.js';

interface MLWasteDetectionRequest {
  accountId?: string;
  regions?: string[];
  analysisDepth?: 'standard' | 'deep';
  maxResources?: number;
}

interface MLResult {
  resourceId: string;
  resourceName: string | null;
  resourceType: string;
  region: string;
  currentSize: string;
  currentMonthlyCost: number;
  recommendationType: 'terminate' | 'downsize' | 'auto-scale' | 'optimize';
  recommendedSize: string | null;
  potentialMonthlySavings: number;
  mlConfidence: number;
  utilizationPatterns: any;
  autoScalingEligible: boolean;
  autoScalingConfig: any | null;
  implementationComplexity: 'low' | 'medium' | 'high';
}

const DEFAULT_REGIONS = ['us-east-1'];
const MAX_EXECUTION_TIME = 25000; // 25 seconds

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  
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
    const { 
      accountId, 
      regions: requestedRegions, 
      analysisDepth = 'standard',
      maxResources = 50 
    } = body;
    
    const prisma = getPrismaClient();
    
    // Get AWS credentials
    const awsAccounts = await prisma.awsCredential.findMany({
      where: {
        organization_id: organizationId,
        is_active: true,
        ...(accountId && { id: accountId }),
      },
      take: 1,
    });
    
    if (awsAccounts.length === 0) {
      return success({
        success: true,
        message: 'No AWS credentials configured',
        analyzed_resources: 0,
        total_monthly_savings: 0,
        recommendations: [],
      });
    }
    
    const account = awsAccounts[0];
    const regions = requestedRegions || (account.regions as string[]) || DEFAULT_REGIONS;
    const allResults: MLResult[] = [];
    let totalAnalyzed = 0;
    
    logger.info('Starting ML analysis', { 
      organizationId, 
      accountId: account.id,
      regions,
      analysisDepth 
    });
    
    // Process each region
    for (const region of regions) {
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        logger.warn('Approaching timeout, returning partial results');
        break;
      }
      
      try {
        const resolvedCreds = await resolveAwsCredentials(account, region);
        const credentials = toAwsCredentials(resolvedCreds);
        
        // Analyze EC2 instances
        const ec2Results = await analyzeEC2Instances(
          credentials, 
          region, 
          maxResources,
          MAX_EXECUTION_TIME - (Date.now() - startTime)
        );
        allResults.push(...ec2Results);
        totalAnalyzed += ec2Results.length;
        
        // Check time before RDS
        if (Date.now() - startTime > MAX_EXECUTION_TIME) break;
        
        // Analyze RDS instances
        const rdsResults = await analyzeRDSInstances(
          credentials, 
          region,
          MAX_EXECUTION_TIME - (Date.now() - startTime)
        );
        allResults.push(...rdsResults);
        totalAnalyzed += rdsResults.length;
        
        // Check time before Lambda (only in deep analysis)
        if (analysisDepth === 'deep' && Date.now() - startTime < MAX_EXECUTION_TIME) {
          const lambdaResults = await analyzeLambdaFunctions(
            credentials, 
            region,
            20, // Limit Lambda analysis
            MAX_EXECUTION_TIME - (Date.now() - startTime)
          );
          allResults.push(...lambdaResults);
          totalAnalyzed += lambdaResults.length;
        }
        
      } catch (err) {
        logger.error('Error analyzing region', err as Error, { region });
      }
    }
    
    // Filter to only actionable recommendations (exclude 'optimize' with 0 savings)
    const actionableResults = allResults.filter(
      r => r.recommendationType !== 'optimize' || r.potentialMonthlySavings > 0
    );
    
    // Save results to database
    if (actionableResults.length > 0) {
      await saveMLResults(prisma, organizationId, account.id, actionableResults);
    }
    
    // Calculate summary
    const totalSavings = actionableResults.reduce((sum, r) => sum + r.potentialMonthlySavings, 0);
    const byType = {
      terminate: actionableResults.filter(r => r.recommendationType === 'terminate').length,
      downsize: actionableResults.filter(r => r.recommendationType === 'downsize').length,
      'auto-scale': actionableResults.filter(r => r.recommendationType === 'auto-scale').length,
      optimize: actionableResults.filter(r => r.recommendationType === 'optimize').length,
    };
    const byResourceType: Record<string, { count: number; savings: number }> = {};
    for (const r of actionableResults) {
      const type = r.resourceType.split('::')[0];
      if (!byResourceType[type]) byResourceType[type] = { count: 0, savings: 0 };
      byResourceType[type].count++;
      byResourceType[type].savings += r.potentialMonthlySavings;
    }
    
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info('ML Waste Detection completed', { 
      organizationId,
      totalAnalyzed,
      recommendationsCount: actionableResults.length,
      totalSavings: parseFloat(totalSavings.toFixed(2)),
      executionTime
    });
    
    return success({
      success: true,
      analyzed_resources: totalAnalyzed,
      total_monthly_savings: parseFloat(totalSavings.toFixed(2)),
      recommendations: actionableResults.map(r => ({
        id: uuidv4(),
        resource_id: r.resourceId,
        resource_name: r.resourceName,
        resource_type: r.resourceType,
        region: r.region,
        current_size: r.currentSize,
        recommended_size: r.recommendedSize,
        recommendation_type: r.recommendationType,
        potential_monthly_savings: r.potentialMonthlySavings,
        ml_confidence: r.mlConfidence,
        utilization_patterns: r.utilizationPatterns,
        auto_scaling_eligible: r.autoScalingEligible,
        auto_scaling_config: r.autoScalingConfig,
        implementation_complexity: r.implementationComplexity,
        analyzed_at: new Date().toISOString(),
      })),
      summary: {
        by_type: byResourceType,
        by_recommendation: byType,
        execution_time: executionTime,
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

/**
 * Analyze EC2 instances for waste
 */
async function analyzeEC2Instances(
  credentials: any,
  region: string,
  maxInstances: number,
  remainingTime: number
): Promise<MLResult[]> {
  const results: MLResult[] = [];
  const startTime = Date.now();
  
  try {
    const ec2Client = new EC2Client({ region, credentials });
    const cwClient = new CloudWatchClient({ region, credentials });
    
    const response = await ec2Client.send(new DescribeInstancesCommand({
      Filters: [{ Name: 'instance-state-name', Values: ['running'] }],
      MaxResults: maxInstances,
    }));
    
    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (Date.now() - startTime > remainingTime - 2000) {
          logger.warn('Time limit reached in EC2 analysis');
          return results;
        }
        
        const instanceId = instance.InstanceId!;
        const instanceType = instance.InstanceType!;
        const instanceName = instance.Tags?.find(t => t.Key === 'Name')?.Value || null;
        
        try {
          // Get 7-day CloudWatch metrics
          const cpuMetrics = await getCloudWatchMetrics(
            cwClient,
            'AWS/EC2',
            'CPUUtilization',
            [{ Name: 'InstanceId', Value: instanceId }],
            7
          );
          
          if (cpuMetrics.length === 0) continue;
          
          // Analyze utilization
          const utilization = analyzeUtilization(cpuMetrics);
          
          // Classify waste
          const recommendation = classifyWaste(utilization, 'EC2', instanceType);
          
          // Only include if there's a meaningful recommendation
          if (recommendation.type === 'optimize' && recommendation.savings === 0) {
            continue;
          }
          
          const currentCost = getMonthlyCost('EC2', instanceType);
          
          results.push({
            resourceId: instanceId,
            resourceName: instanceName,
            resourceType: 'EC2::Instance',
            region,
            currentSize: instanceType,
            currentMonthlyCost: parseFloat(currentCost.toFixed(2)),
            recommendationType: recommendation.type,
            recommendedSize: recommendation.recommendedSize || null,
            potentialMonthlySavings: parseFloat(recommendation.savings.toFixed(2)),
            mlConfidence: parseFloat(recommendation.confidence.toFixed(4)),
            utilizationPatterns: generateUtilizationPatterns(utilization),
            autoScalingEligible: recommendation.type === 'auto-scale',
            autoScalingConfig: recommendation.autoScalingConfig || null,
            implementationComplexity: recommendation.complexity,
          });
          
        } catch (metricErr) {
          logger.warn('Error getting metrics for EC2 instance', { 
            instanceId, 
            error: (metricErr as Error).message 
          });
        }
      }
    }
    
  } catch (err) {
    logger.error('Error in EC2 analysis', err as Error, { region });
  }
  
  return results;
}

/**
 * Analyze RDS instances for waste
 */
async function analyzeRDSInstances(
  credentials: any,
  region: string,
  remainingTime: number
): Promise<MLResult[]> {
  const results: MLResult[] = [];
  const startTime = Date.now();
  
  try {
    const rdsClient = new RDSClient({ region, credentials });
    const cwClient = new CloudWatchClient({ region, credentials });
    
    const response = await rdsClient.send(new DescribeDBInstancesCommand({}));
    
    for (const instance of response.DBInstances || []) {
      if (Date.now() - startTime > remainingTime - 2000) {
        logger.warn('Time limit reached in RDS analysis');
        return results;
      }
      
      const dbIdentifier = instance.DBInstanceIdentifier!;
      const instanceClass = instance.DBInstanceClass!;
      
      try {
        // Get CPU metrics
        const cpuMetrics = await getCloudWatchMetrics(
          cwClient,
          'AWS/RDS',
          'CPUUtilization',
          [{ Name: 'DBInstanceIdentifier', Value: dbIdentifier }],
          7
        );
        
        // Get connection metrics
        const connMetrics = await getCloudWatchMetrics(
          cwClient,
          'AWS/RDS',
          'DatabaseConnections',
          [{ Name: 'DBInstanceIdentifier', Value: dbIdentifier }],
          7
        );
        
        if (cpuMetrics.length === 0) continue;
        
        // Analyze utilization
        const utilization = analyzeUtilization(cpuMetrics);
        
        // Check for idle database (no connections)
        const avgConnections = connMetrics.length > 0
          ? connMetrics.reduce((sum, dp) => sum + (dp.Average || 0), 0) / connMetrics.length
          : -1;
        
        // If no connections, recommend terminate
        if (avgConnections >= 0 && avgConnections < 1) {
          const currentCost = getMonthlyCost('RDS', instanceClass);
          results.push({
            resourceId: dbIdentifier,
            resourceName: dbIdentifier,
            resourceType: 'RDS::DBInstance',
            region,
            currentSize: instanceClass,
            currentMonthlyCost: parseFloat(currentCost.toFixed(2)),
            recommendationType: 'terminate',
            recommendedSize: null,
            potentialMonthlySavings: parseFloat(currentCost.toFixed(2)),
            mlConfidence: 0.95,
            utilizationPatterns: {
              ...generateUtilizationPatterns(utilization),
              avgConnections: parseFloat(avgConnections.toFixed(2)),
            },
            autoScalingEligible: false,
            autoScalingConfig: null,
            implementationComplexity: 'medium',
          });
          continue;
        }
        
        // Classify waste based on CPU
        const recommendation = classifyWaste(utilization, 'RDS', instanceClass);
        
        if (recommendation.type === 'optimize' && recommendation.savings === 0) {
          continue;
        }
        
        const currentCost = getMonthlyCost('RDS', instanceClass);
        
        results.push({
          resourceId: dbIdentifier,
          resourceName: dbIdentifier,
          resourceType: 'RDS::DBInstance',
          region,
          currentSize: instanceClass,
          currentMonthlyCost: parseFloat(currentCost.toFixed(2)),
          recommendationType: recommendation.type,
          recommendedSize: recommendation.recommendedSize || null,
          potentialMonthlySavings: parseFloat(recommendation.savings.toFixed(2)),
          mlConfidence: parseFloat(recommendation.confidence.toFixed(4)),
          utilizationPatterns: {
            ...generateUtilizationPatterns(utilization),
            avgConnections: avgConnections >= 0 ? parseFloat(avgConnections.toFixed(2)) : undefined,
          },
          autoScalingEligible: false, // RDS auto-scaling is different
          autoScalingConfig: null,
          implementationComplexity: getImplementationComplexity(recommendation.type, 'RDS'),
        });
        
      } catch (metricErr) {
        logger.warn('Error getting metrics for RDS instance', { 
          dbIdentifier, 
          error: (metricErr as Error).message 
        });
      }
    }
    
  } catch (err) {
    logger.error('Error in RDS analysis', err as Error, { region });
  }
  
  return results;
}

/**
 * Analyze Lambda functions for waste
 */
async function analyzeLambdaFunctions(
  credentials: any,
  region: string,
  maxFunctions: number,
  remainingTime: number
): Promise<MLResult[]> {
  const results: MLResult[] = [];
  const startTime = Date.now();
  
  try {
    const lambdaClient = new LambdaClient({ region, credentials });
    const cwClient = new CloudWatchClient({ region, credentials });
    
    const response = await lambdaClient.send(new ListFunctionsCommand({
      MaxItems: maxFunctions,
    }));
    
    for (const fn of response.Functions || []) {
      if (Date.now() - startTime > remainingTime - 2000) {
        logger.warn('Time limit reached in Lambda analysis');
        return results;
      }
      
      const functionName = fn.FunctionName!;
      const memorySize = fn.MemorySize || 128;
      
      try {
        // Get invocation metrics
        const invocationMetrics = await getCloudWatchMetrics(
          cwClient,
          'AWS/Lambda',
          'Invocations',
          [{ Name: 'FunctionName', Value: functionName }],
          7
        );
        
        // Get duration metrics
        const durationMetrics = await getCloudWatchMetrics(
          cwClient,
          'AWS/Lambda',
          'Duration',
          [{ Name: 'FunctionName', Value: functionName }],
          7
        );
        
        // Calculate total invocations
        const totalInvocations = invocationMetrics.reduce(
          (sum, dp) => sum + (dp.Sum || 0), 
          0
        );
        
        // If no invocations in 7 days, recommend terminate
        if (totalInvocations === 0) {
          const estimatedCost = getLambdaMonthlyCost(0, 0, memorySize);
          results.push({
            resourceId: functionName,
            resourceName: functionName,
            resourceType: 'Lambda::Function',
            region,
            currentSize: `${memorySize}MB`,
            currentMonthlyCost: 0,
            recommendationType: 'terminate',
            recommendedSize: null,
            potentialMonthlySavings: 0, // No cost if not invoked
            mlConfidence: 0.90,
            utilizationPatterns: {
              avgCpuUsage: 0,
              avgMemoryUsage: 0,
              peakHours: [],
              hasRealMetrics: true,
              totalInvocations: 0,
              avgDuration: 0,
            },
            autoScalingEligible: false,
            autoScalingConfig: null,
            implementationComplexity: 'low',
          });
          continue;
        }
        
        // Calculate average duration
        const avgDuration = durationMetrics.length > 0
          ? durationMetrics.reduce((sum, dp) => sum + (dp.Average || 0), 0) / durationMetrics.length
          : 0;
        
        // Estimate monthly cost
        const monthlyInvocations = (totalInvocations / 7) * 30;
        const estimatedCost = getLambdaMonthlyCost(monthlyInvocations, avgDuration, memorySize);
        
        // Check if memory is oversized (if avg duration is very low)
        if (avgDuration < 100 && memorySize > 256) {
          const newMemory = Math.max(128, Math.floor(memorySize / 2));
          const newCost = getLambdaMonthlyCost(monthlyInvocations, avgDuration, newMemory);
          const savings = estimatedCost - newCost;
          
          if (savings > 1) { // Only if savings > $1/month
            results.push({
              resourceId: functionName,
              resourceName: functionName,
              resourceType: 'Lambda::Function',
              region,
              currentSize: `${memorySize}MB`,
              currentMonthlyCost: parseFloat(estimatedCost.toFixed(2)),
              recommendationType: 'downsize',
              recommendedSize: `${newMemory}MB`,
              potentialMonthlySavings: parseFloat(savings.toFixed(2)),
              mlConfidence: 0.70,
              utilizationPatterns: {
                avgCpuUsage: 0,
                avgMemoryUsage: 0,
                peakHours: [],
                hasRealMetrics: true,
                totalInvocations,
                avgDuration: parseFloat(avgDuration.toFixed(2)),
              },
              autoScalingEligible: false,
              autoScalingConfig: null,
              implementationComplexity: 'low',
            });
          }
        }
        
      } catch (metricErr) {
        logger.warn('Error getting metrics for Lambda function', { 
          functionName, 
          error: (metricErr as Error).message 
        });
      }
    }
    
  } catch (err) {
    logger.error('Error in Lambda analysis', err as Error, { region });
  }
  
  return results;
}

/**
 * Get CloudWatch metrics for a resource
 */
async function getCloudWatchMetrics(
  client: CloudWatchClient,
  namespace: string,
  metricName: string,
  dimensions: Dimension[],
  days: number
): Promise<CloudWatchDatapoint[]> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
  
  // Use 1-hour period for efficiency (168 datapoints for 7 days)
  const response = await client.send(new GetMetricStatisticsCommand({
    Namespace: namespace,
    MetricName: metricName,
    Dimensions: dimensions,
    StartTime: startTime,
    EndTime: endTime,
    Period: 3600, // 1 hour
    Statistics: ['Average', 'Maximum', 'Minimum', 'Sum'],
  }));
  
  return (response.Datapoints || []).map(dp => ({
    Timestamp: dp.Timestamp,
    Average: dp.Average,
    Maximum: dp.Maximum,
    Minimum: dp.Minimum,
    Sum: dp.Sum,
    SampleCount: dp.SampleCount,
  }));
}

/**
 * Save ML results to database
 */
async function saveMLResults(
  prisma: any,
  organizationId: string,
  accountId: string,
  results: MLResult[]
): Promise<void> {
  try {
    // Delete old results for this account
    await prisma.resourceUtilizationML.deleteMany({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
      },
    });
    
    // Insert new results
    for (const result of results) {
      await prisma.resourceUtilizationML.create({
        data: {
          id: uuidv4(),
          organization_id: organizationId,
          aws_account_id: accountId,
          resource_id: result.resourceId,
          resource_name: result.resourceName,
          resource_type: result.resourceType,
          region: result.region,
          current_size: result.currentSize,
          current_monthly_cost: result.currentMonthlyCost,
          recommendation_type: result.recommendationType,
          recommended_size: result.recommendedSize,
          potential_monthly_savings: result.potentialMonthlySavings,
          ml_confidence: result.mlConfidence,
          utilization_patterns: result.utilizationPatterns,
          auto_scaling_eligible: result.autoScalingEligible,
          auto_scaling_config: result.autoScalingConfig,
          implementation_complexity: result.implementationComplexity,
          analyzed_at: new Date(),
        },
      });
    }
    
    logger.info('ML results saved to database', { 
      organizationId, 
      accountId, 
      count: results.length 
    });
    
  } catch (err) {
    logger.error('Error saving ML results', err as Error);
  }
}
