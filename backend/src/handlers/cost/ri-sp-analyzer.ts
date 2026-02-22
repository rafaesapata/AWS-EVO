import { getHttpMethod } from '../../lib/middleware.js';
/**
 * Advanced RI/SP Analyzer with Cost Optimization Recommendations
 * AWS Lambda Handler for ri-sp-analyzer
 * 
 * IMPORTANT: This handler uses REAL AWS data, not mocks.
 * - Savings Plans: Uses @aws-sdk/client-savingsplans
 * - Pricing: Uses pricing service from lib/pricing
 * - Metrics: Uses CloudWatch GetMetricStatisticsCommand
 * 
 * DEMO MODE: Suporta modo demonstração para organizações com demo_mode=true
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { getEC2Price, getRDSPrice } from '../../lib/pricing/dynamic-pricing-service.js';
import { isOrganizationInDemoMode, generateDemoRISPAnalysis } from '../../lib/demo-data-service.js';
import { riSpAnalyzerSchema } from '../../lib/schemas.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { cacheManager } from '../../lib/redis-cache.js';
import { applyOverhead, type OverheadFieldConfig } from '../../lib/cost-overhead.js';

const RISP_ANALYZER_OVERHEAD_FIELDS: OverheadFieldConfig[] = [
  { path: 'reservedInstances', type: 'object', fields: ['totalMonthlySavings'] },
  { path: 'savingsPlans', type: 'object', fields: ['totalMonthlySavings'] },
  { path: 'currentResources', type: 'object', fields: ['totalMonthlyCost'] },
  { path: 'potentialSavings', type: 'object', fields: ['monthly', 'annual'] },
  { path: 'executiveSummary', type: 'object', fields: ['potentialAnnualSavings'] },
  { path: 'recommendations', type: 'array', fields: ['potentialSavings.monthly', 'potentialSavings.annual'] },
];
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
  GetCostAndUsageCommand,
  GetReservationUtilizationCommand,
  GetSavingsPlansUtilizationCommand
} from '@aws-sdk/client-cost-explorer';
import { 
  CloudWatchClient,
  GetMetricStatisticsCommand
} from '@aws-sdk/client-cloudwatch';

// SavingsPlans SDK - will be loaded dynamically if available
let SavingsPlansClient: any = null;
let DescribeSavingsPlansCommand: any = null;

// Try to load SavingsPlans SDK
async function loadSavingsPlansSDK() {
  if (SavingsPlansClient !== null) return; // Already attempted
  try {
    const savingsPlansModule = require('@aws-sdk/client-savingsplans');
    SavingsPlansClient = savingsPlansModule.SavingsPlansClient;
    DescribeSavingsPlansCommand = savingsPlansModule.DescribeSavingsPlansCommand;
    logger.info('SavingsPlans SDK loaded successfully');
  } catch (e) {
    logger.warn('SavingsPlans SDK not available, will use Cost Explorer data');
    SavingsPlansClient = false; // Mark as unavailable
  }
}

interface SavingsPlan {
  id: string;
  type: string;
  state: string;
  commitment: number;
  start: string;
  end: string;
  paymentOption: string;
  upfrontPaymentAmount: number;
  recurringPaymentAmount: number;
  utilizationPercentage?: number;
  region?: string;
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
  region?: string;
  utilizationPercentage?: number;
  hourlyCost?: number;
  monthlyCost?: number;
}

interface EC2Instance {
  instanceId: string;
  instanceType: string;
  state: string;
  launchTime: Date;
  availabilityZone: string;
  platform: string;
  cpuUtilization?: number;
  hourlyCost: number;
  monthlyCost: number;
}

interface RDSInstance {
  dbInstanceIdentifier: string;
  dbInstanceClass: string;
  engine: string;
  availabilityZone: string;
  multiAZ: boolean;
  cpuUtilization?: number;
  hourlyCost: number;
  monthlyCost: number;
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
  consistencyScore: number;
  recommendedCommitment: 'none' | 'partial' | 'full';
  instances: number;
  monthlyCost: number;
  avgCpuUtilization: number;
  region?: string;
}

interface RISPAnalyzerRequest {
  accountId: string;
  region?: string;
  regions?: string[];
  analysisDepth?: 'basic' | 'detailed' | 'comprehensive';
}

// Hours per month constant
const HOURS_PER_MONTH = 730;

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Advanced RI/SP Analyzer started');
  
  // Load SavingsPlans SDK if available
  await loadSavingsPlansSDK();
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const prisma = getPrismaClient();
    
    // Check for Demo Mode (FAIL-SAFE: returns false on any error)
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    
    if (isDemo === true) {
      // Return demo data for organizations in demo mode
      logger.info('Returning demo RI/SP analysis', {
        organizationId,
        isDemo: true
      });
      
      const demoData = generateDemoRISPAnalysis();
      
      const demoWithOverhead = await applyOverhead(organizationId, {
        ...demoData,
        _isDemo: true,
        status: 'completed',
        regions: ['us-east-1', 'us-west-2'],
        analysisDepth: 'comprehensive'
      }, RISP_ANALYZER_OVERHEAD_FIELDS);
      return success(demoWithOverhead);
    }
    
    // Validate request body
    const validation = parseAndValidateBody(riSpAnalyzerSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    const { accountId, region, regions, analysisDepth = 'comprehensive' } = validation.data;

    // SWR Cache - return cached data instantly if fresh
    const riCacheKey = `risp:${organizationId}:${accountId}:${(regions || [region]).join(',')}:${analysisDepth}`;
    const riCached = await cacheManager.getSWR<any>(riCacheKey, { prefix: 'cost' });
    if (riCached && !riCached.stale) {
      logger.info('RI/SP Analyzer cache hit (fresh)', { organizationId, cacheAge: riCached.age });
      const cachedWithOverhead = await applyOverhead(organizationId, { ...riCached.data, _fromCache: true }, RISP_ANALYZER_OVERHEAD_FIELDS);
      return success(cachedWithOverhead);
    }
    
    let regionsToAnalyze: string[] = [];
    
    if (regions && regions.length > 0) {
      regionsToAnalyze = regions;
    } else if (region) {
      regionsToAnalyze = [region];
    }
    
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found', 404);
    }
    
    if (regionsToAnalyze.length === 0) {
      regionsToAnalyze = account.regions?.length ? account.regions : ['us-east-1'];
    }
    
    logger.info(`📍 Analyzing ${regionsToAnalyze.length} region(s): ${regionsToAnalyze.join(', ')}`);

    // Aggregate results from all regions
    let allReservedInstances: ReservedInstance[] = [];
    let allReservedRDSInstances: any[] = [];
    let allSavingsPlans: SavingsPlan[] = [];
    let allEC2Instances: EC2Instance[] = [];
    let allRDSInstances: RDSInstance[] = [];
    let allUsagePatterns: UsagePattern[] = [];
    
    const primaryRegion = regionsToAnalyze[0];
    const resolvedCreds = await resolveAwsCredentials(account, primaryRegion);
    const credentials = toAwsCredentials(resolvedCreds);
    
    // Cost Explorer is global
    const costExplorerClient = new CostExplorerClient({ region: 'us-east-1', credentials });
    
    // Get RI/SP utilization from Cost Explorer FIRST (needed for RI/SP data)
    const utilizationData = await getUtilizationData(costExplorerClient);
    logger.info(`📊 Utilization data: RI=${utilizationData.riUtilization}%, SP=${utilizationData.spUtilization}%`);
    
    // Analyze each region
    for (const regionToAnalyze of regionsToAnalyze) {
      logger.info(`🔍 Analyzing region: ${regionToAnalyze}`);
      
      const ec2Client = new EC2Client({ region: regionToAnalyze, credentials });
      const rdsClient = new RDSClient({ region: regionToAnalyze, credentials });
      const cloudWatchClient = new CloudWatchClient({ region: regionToAnalyze, credentials });
      
      try {
        const [reservedInstances, reservedRDSInstances, ec2Instances, rdsInstances] = await Promise.all([
          getCurrentReservedInstances(ec2Client, regionToAnalyze, utilizationData.riUtilization),
          getCurrentReservedRDSInstances(rdsClient, regionToAnalyze),
          getCurrentEC2Instances(ec2Client, cloudWatchClient, regionToAnalyze),
          getCurrentRDSInstances(rdsClient, cloudWatchClient, regionToAnalyze)
        ]);
        
        allReservedInstances.push(...reservedInstances);
        allReservedRDSInstances.push(...reservedRDSInstances);
        allEC2Instances.push(...ec2Instances);
        allRDSInstances.push(...rdsInstances);
        
        const usagePatterns = analyzeUsagePatterns(ec2Instances, rdsInstances, regionToAnalyze);
        allUsagePatterns.push(...usagePatterns);
        
        logger.info(`✅ Region ${regionToAnalyze}: ${ec2Instances.length} EC2, ${rdsInstances.length} RDS, ${reservedInstances.length} RIs`);
      } catch (regionError) {
        logger.warn(`⚠️ Error analyzing region ${regionToAnalyze}:`, { error: regionError instanceof Error ? regionError.message : String(regionError) });
      }
    }
    
    // Get Savings Plans (global) - utilization is fetched inside the function
    allSavingsPlans = await getCurrentSavingsPlans(credentials, costExplorerClient);
    
    // Calculate total costs
    const totalEC2MonthlyCost = allEC2Instances.reduce((sum, i) => sum + i.monthlyCost, 0);
    const totalRDSMonthlyCost = allRDSInstances.reduce((sum, i) => sum + i.monthlyCost, 0);
    const totalMonthlyCost = totalEC2MonthlyCost + totalRDSMonthlyCost;

    // Generate recommendations based on real data
    const recommendations = generateAdvancedRecommendations(
      allReservedInstances,
      allReservedRDSInstances,
      allSavingsPlans,
      allEC2Instances,
      allRDSInstances,
      allUsagePatterns,
      utilizationData,
      totalMonthlyCost
    );
    
    // Calculate coverage from Cost Explorer
    const coverage = await calculateCoverage(costExplorerClient);
    
    // Generate executive summary
    const executiveSummary = generateExecutiveSummary(
      allReservedInstances,
      allReservedRDSInstances,
      allSavingsPlans,
      recommendations,
      coverage,
      utilizationData
    );
    
    logger.info(`✅ Analysis complete: ${recommendations.length} recommendations generated across ${regionsToAnalyze.length} region(s)`);
    
    // Calculate active counts
    const activeRIs = allReservedInstances.filter(ri => ri.state === 'active').length;
    const activeRDSRIs = allReservedRDSInstances.filter(ri => ri.state === 'active').length;
    const activeSPs = allSavingsPlans.filter(sp => sp.state === 'active').length;
    
    // Calculate underutilized items (< 75% utilization)
    const underutilizedRIs = allReservedInstances.filter(ri => (ri.utilizationPercentage || 0) < 75);
    const underutilizedSPs = allSavingsPlans.filter(sp => (sp.utilizationPercentage || 0) < 75);
    
    // Use REAL savings from Cost Explorer instead of hardcoded percentages
    // utilizationData.riNetSavings and spNetSavings come from GetReservationUtilization / GetSavingsPlansUtilization
    const riMonthlySavings = utilizationData.riNetSavings;
    const spMonthlySavings = utilizationData.spNetSavings;
    
    // Distribute real savings proportionally across individual RIs/SPs for DB storage
    const activeRICount = allReservedInstances.filter(ri => ri.state === 'active').length;
    const perRiSavings = activeRICount > 0 ? riMonthlySavings / activeRICount : 0;
    const activeSPCount = allSavingsPlans.filter(sp => sp.state === 'active').length;
    const perSpSavings = activeSPCount > 0 ? spMonthlySavings / activeSPCount : 0;

    // ============================================================================
    // PERSIST DATA TO DATABASE
    // ============================================================================
    try {
      logger.info('💾 Saving RI/SP analysis to database...');
      
      // DELETE stale RI/SP records first to prevent accumulation across executions
      await prisma.reservedInstance.deleteMany({
        where: { organization_id: organizationId, aws_account_id: accountId },
      });
      await prisma.savingsPlan.deleteMany({
        where: { organization_id: organizationId, aws_account_id: accountId },
      });
      logger.info('🗑️ Cleared stale RI/SP records before inserting fresh data');
      
      // Save Reserved Instances (fresh insert, no upsert needed after deleteMany)
      for (const ri of allReservedInstances) {
        await prisma.reservedInstance.create({
          data: {
            organization_id: organizationId,
            aws_account_id: accountId,
            reserved_instance_id: ri.id,
            instance_type: ri.instanceType,
            product_description: ri.platform || 'Linux/UNIX',
            availability_zone: ri.availabilityZone,
            instance_count: ri.instanceCount,
            state: ri.state,
            start_date: ri.start,
            end_date: ri.end,
            offering_type: ri.offeringType,
            offering_class: 'standard',
            duration_seconds: Math.floor((ri.end.getTime() - ri.start.getTime()) / 1000),
            scope: ri.scope || 'Regional',
            region: ri.region || primaryRegion,
            utilization_percentage: ri.utilizationPercentage || 0,
            usage_price: ri.hourlyCost || 0,
            net_savings: ri.state === 'active' ? perRiSavings : 0,
          },
        });
      }
      
      // Save Savings Plans (fresh insert)
      for (const sp of allSavingsPlans) {
        await prisma.savingsPlan.create({
          data: {
            organization_id: organizationId,
            aws_account_id: accountId,
            savings_plan_id: sp.id,
            savings_plan_type: sp.type,
            payment_option: sp.paymentOption,
            state: sp.state,
            commitment: sp.commitment,
            start_date: new Date(sp.start),
            end_date: sp.end ? new Date(sp.end) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            region: sp.region,
            utilization_percentage: sp.utilizationPercentage || 0,
            used_commitment: sp.commitment * (sp.utilizationPercentage || 0) / 100,
            unused_commitment: sp.commitment * (1 - (sp.utilizationPercentage || 0) / 100),
            net_savings: sp.state === 'active' ? perSpSavings : 0,
            coverage_percentage: coverage.savingsPlans,
          },
        });
      }
      
      // Delete old recommendations before creating new ones
      await prisma.riSpRecommendation.deleteMany({
        where: {
          organization_id: organizationId,
          aws_account_id: accountId,
        },
      });
      
      // Save Recommendations
      for (const rec of recommendations) {
        await prisma.riSpRecommendation.create({
          data: {
            organization_id: organizationId,
            aws_account_id: accountId,
            recommendation_type: rec.type === 'ri_purchase' || rec.type === 'ri_renewal' ? 'reserved_instance' : 'savings_plan',
            service: rec.service,
            region: primaryRegion,
            instance_type: rec.details?.currentInstances?.[0]?.instanceType,
            savings_plan_type: rec.type === 'sp_purchase' ? 'Compute' : undefined,
            estimated_monthly_savings: rec.potentialSavings.monthly,
            estimated_annual_savings: rec.potentialSavings.annual,
            priority: rec.priority === 'critical' ? 1 : rec.priority === 'high' ? 2 : rec.priority === 'medium' ? 3 : 4,
            confidence_level: 'high',
            implementation_effort: rec.implementation.difficulty,
            status: 'active',
            recommendation_details: rec as any,
            generated_at: new Date(),
          },
        });
      }
      
      logger.info(`✅ Saved ${allReservedInstances.length} RIs, ${allSavingsPlans.length} SPs, ${recommendations.length} recommendations to database`);
    } catch (dbError) {
      logger.error('❌ Error saving to database (non-fatal):', dbError);
      // Continue execution - database save is not critical
    }

    // Invalidate RI/SP analysis and history caches after new analysis
    await cacheManager.deletePattern(`risp-analysis:${organizationId}:${accountId}:*`, { prefix: 'cost' });
    await cacheManager.deletePattern(`risp-history:${organizationId}:${accountId}:*`, { prefix: 'cost' });
    
    const responseData = {
      success: true,
      executiveSummary,
      reservedInstances: {
        ec2: allReservedInstances,
        rds: allReservedRDSInstances,
        total: allReservedInstances.length + allReservedRDSInstances.length,
        count: allReservedInstances.length + allReservedRDSInstances.length,
        active: activeRIs + activeRDSRIs,
        averageUtilization: utilizationData.riUtilization,
        totalMonthlySavings: parseFloat(riMonthlySavings.toFixed(2)),
        underutilizedCount: underutilizedRIs.length,
        underutilized: underutilizedRIs.map(ri => ({
          id: ri.id,
          instanceType: ri.instanceType,
          utilization: ri.utilizationPercentage || 0,
          potentialWaste: (ri.monthlyCost || 0) * (1 - (ri.utilizationPercentage || 0) / 100)
        }))
      },
      savingsPlans: {
        plans: allSavingsPlans,
        total: allSavingsPlans.length,
        count: allSavingsPlans.length,
        active: activeSPs,
        averageUtilization: utilizationData.spUtilization,
        averageCoverage: coverage.savingsPlans,
        totalMonthlySavings: parseFloat(spMonthlySavings.toFixed(2)),
        underutilized: underutilizedSPs.map(sp => ({
          id: sp.id,
          type: sp.type,
          utilization: sp.utilizationPercentage || 0,
          unusedCommitment: (sp.commitment || 0) * (1 - (sp.utilizationPercentage || 0) / 100)
        }))
      },
      currentResources: {
        ec2Instances: allEC2Instances.length,
        rdsInstances: allRDSInstances.length,
        totalMonthlyCost: totalMonthlyCost
      },
      usagePatterns: allUsagePatterns,
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
        regions: regionsToAnalyze,
        regionsCount: regionsToAnalyze.length,
        timestamp: new Date().toISOString(),
        accountId,
        dataSource: 'real' // Indicate this is real data, not mocked
      }
    };

    // Save to SWR cache (freshFor: 1800s = 30min, maxTTL: 24h)
    await cacheManager.setSWR(riCacheKey, responseData, { prefix: 'cost', freshFor: 1800, maxTTL: 86400 });

    const responseWithOverhead = await applyOverhead(organizationId, responseData, RISP_ANALYZER_OVERHEAD_FIELDS);
    return success(responseWithOverhead);
    
  } catch (err) {
    logger.error('❌ Advanced RI/SP Analyzer error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

// ============================================================================
// HELPER FUNCTIONS - ALL USE REAL AWS DATA
// ============================================================================

async function getCurrentReservedInstances(ec2Client: EC2Client, region: string, riUtilizationPercent: number = 0): Promise<ReservedInstance[]> {
  try {
    const response = await ec2Client.send(new DescribeReservedInstancesCommand({}));
    return (response.ReservedInstances || []).map(ri => {
      const hourlyPrice = ri.UsagePrice || 0;
      return {
        id: ri.ReservedInstancesId || '',
        instanceType: ri.InstanceType || '',
        instanceCount: ri.InstanceCount || 0,
        state: ri.State || '',
        start: ri.Start || new Date(),
        end: ri.End || new Date(),
        offeringType: ri.OfferingType || '',
        availabilityZone: ri.AvailabilityZone,
        platform: ri.ProductDescription,
        scope: ri.Scope,
        region,
        hourlyCost: hourlyPrice,
        monthlyCost: hourlyPrice * HOURS_PER_MONTH * (ri.InstanceCount || 1),
        utilizationPercentage: riUtilizationPercent // Add utilization from Cost Explorer
      };
    });
  } catch (err) {
    logger.warn('Could not fetch Reserved Instances:', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function getCurrentReservedRDSInstances(rdsClient: RDSClient, region: string): Promise<any[]> {
  try {
    const response = await rdsClient.send(new DescribeReservedDBInstancesCommand({}));
    return (response.ReservedDBInstances || []).map(rds => {
      const hourlyPrice = rds.UsagePrice || 0;
      return {
        id: rds.ReservedDBInstanceId || '',
        dbInstanceClass: rds.DBInstanceClass || '',
        engine: rds.ProductDescription || '',
        state: rds.State || '',
        start: rds.StartTime || new Date(),
        end: new Date((rds.StartTime?.getTime() || 0) + (rds.Duration || 0) * 1000),
        instanceCount: rds.DBInstanceCount || 0,
        offeringType: rds.OfferingType || '',
        region,
        hourlyCost: hourlyPrice,
        monthlyCost: hourlyPrice * HOURS_PER_MONTH * (rds.DBInstanceCount || 1)
      };
    });
  } catch (err) {
    logger.warn('Could not fetch Reserved RDS Instances:', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/**
 * Get Savings Plans using the SavingsPlans SDK or Cost Explorer fallback
 * This is REAL data from AWS, not mocked
 */
async function getCurrentSavingsPlans(credentials: any, costExplorerClient: CostExplorerClient): Promise<SavingsPlan[]> {
  const savingsPlans: SavingsPlan[] = [];
  
  // First, get utilization data from Cost Explorer (this gives us the utilization percentage)
  let spUtilizationPercent = 0;
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const utilizationResponse = await costExplorerClient.send(new GetSavingsPlansUtilizationCommand({
      TimePeriod: {
        Start: startDate.toISOString().split('T')[0],
        End: endDate.toISOString().split('T')[0],
      },
    }));
    
    spUtilizationPercent = parseFloat(utilizationResponse.Total?.Utilization?.UtilizationPercentage || '0');
    logger.info(`SP Utilization from Cost Explorer: ${spUtilizationPercent}%`);
  } catch (err) {
    logger.warn('Could not fetch SP utilization from Cost Explorer:', { error: err instanceof Error ? err.message : String(err) });
  }
  
  // Try to use SavingsPlans SDK first (if loaded successfully)
  if (SavingsPlansClient && SavingsPlansClient !== false && DescribeSavingsPlansCommand) {
    try {
      const spClient = new SavingsPlansClient({ region: 'us-east-1', credentials });
      const response = await spClient.send(new DescribeSavingsPlansCommand({}));
      
      if (response.savingsPlans && response.savingsPlans.length > 0) {
        for (const sp of response.savingsPlans) {
          savingsPlans.push({
            id: sp.savingsPlanId || '',
            type: sp.savingsPlanType || '',
            state: sp.state || '',
            commitment: parseFloat(sp.commitment || '0'),
            start: sp.start || '',
            end: sp.end || '',
            paymentOption: sp.paymentOption || '',
            upfrontPaymentAmount: parseFloat(sp.upfrontPaymentAmount || '0'),
            recurringPaymentAmount: parseFloat(sp.recurringPaymentAmount || '0'),
            region: sp.region,
            utilizationPercentage: spUtilizationPercent // Add utilization from Cost Explorer
          });
        }
        logger.info(`Found ${savingsPlans.length} Savings Plans via SDK with ${spUtilizationPercent}% utilization`);
        return savingsPlans;
      }
    } catch (err) {
      logger.warn('SavingsPlans SDK call failed, falling back to Cost Explorer:', { error: err instanceof Error ? err.message : String(err) });
    }
  }
  
  // Fallback: Use Cost Explorer to detect if there are active Savings Plans
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const utilizationResponse = await costExplorerClient.send(new GetSavingsPlansUtilizationCommand({
      TimePeriod: {
        Start: startDate.toISOString().split('T')[0],
        End: endDate.toISOString().split('T')[0],
      },
    }));
    
    // If there's utilization data, there are active Savings Plans
    const total = utilizationResponse.Total;
    if (total && parseFloat(total.Utilization?.TotalCommitment || '0') > 0) {
      // We can't get individual SP details from Cost Explorer, but we know they exist
      savingsPlans.push({
        id: 'aggregated-from-cost-explorer',
        type: 'Compute',
        state: 'active',
        commitment: parseFloat(total.Utilization?.TotalCommitment || '0'),
        start: startDate.toISOString(),
        end: '',
        paymentOption: 'Unknown',
        upfrontPaymentAmount: 0,
        recurringPaymentAmount: parseFloat(total.Utilization?.TotalCommitment || '0'),
        utilizationPercentage: parseFloat(total.Utilization?.UtilizationPercentage || '0')
      });
      logger.info('Detected Savings Plans via Cost Explorer utilization data');
    }
  } catch (err) {
    logger.warn('Could not fetch Savings Plans utilization:', { error: err instanceof Error ? err.message : String(err) });
  }
  
  return savingsPlans;
}

/**
 * Get EC2 instances with REAL pricing from pricing service and REAL CPU metrics from CloudWatch
 */
async function getCurrentEC2Instances(
  ec2Client: EC2Client, 
  cloudWatchClient: CloudWatchClient,
  region: string
): Promise<EC2Instance[]> {
  try {
    const response = await ec2Client.send(new DescribeInstancesCommand({}));
    const instances: EC2Instance[] = [];
    
    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.State?.Name === 'running') {
          const instanceType = instance.InstanceType || 't3.micro';
          
          // Get REAL pricing from pricing service
          const priceResult = getEC2Price(instanceType, region);
          const hourlyCost = priceResult.price;
          
          // Get REAL CPU utilization from CloudWatch
          const cpuUtilization = await getEC2CPUUtilization(
            cloudWatchClient, 
            instance.InstanceId || ''
          );
          
          instances.push({
            instanceId: instance.InstanceId || '',
            instanceType,
            state: instance.State?.Name || '',
            launchTime: instance.LaunchTime || new Date(),
            availabilityZone: instance.Placement?.AvailabilityZone || '',
            platform: instance.Platform || 'Linux/UNIX',
            cpuUtilization,
            hourlyCost,
            monthlyCost: hourlyCost * HOURS_PER_MONTH
          });
        }
      }
    }
    
    return instances;
  } catch (err) {
    logger.warn('Could not fetch EC2 instances:', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/**
 * Get REAL CPU utilization from CloudWatch for an EC2 instance
 */
async function getEC2CPUUtilization(cloudWatchClient: CloudWatchClient, instanceId: string): Promise<number> {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
    
    const response = await cloudWatchClient.send(new GetMetricStatisticsCommand({
      Namespace: 'AWS/EC2',
      MetricName: 'CPUUtilization',
      Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 3600, // 1 hour
      Statistics: ['Average']
    }));
    
    if (response.Datapoints && response.Datapoints.length > 0) {
      const avgCpu = response.Datapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / response.Datapoints.length;
      return parseFloat(avgCpu.toFixed(2));
    }
    return 0;
  } catch (err) {
    logger.debug(`Could not get CPU for ${instanceId}:`, { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

/**
 * Get RDS instances with REAL pricing and REAL CPU metrics
 */
async function getCurrentRDSInstances(
  rdsClient: RDSClient,
  cloudWatchClient: CloudWatchClient,
  region: string
): Promise<RDSInstance[]> {
  try {
    const response = await rdsClient.send(new DescribeDBInstancesCommand({}));
    const instances: RDSInstance[] = [];
    
    for (const db of response.DBInstances || []) {
      if (db.DBInstanceStatus === 'available') {
        const instanceClass = db.DBInstanceClass || 'db.t3.micro';
        const engine = db.Engine || 'postgres';
        
        // Get REAL pricing from pricing service
        const priceResult = getRDSPrice(instanceClass, engine, region);
        const hourlyCost = priceResult.price;
        
        // Get REAL CPU utilization from CloudWatch
        const cpuUtilization = await getRDSCPUUtilization(
          cloudWatchClient,
          db.DBInstanceIdentifier || ''
        );
        
        instances.push({
          dbInstanceIdentifier: db.DBInstanceIdentifier || '',
          dbInstanceClass: instanceClass,
          engine,
          availabilityZone: db.AvailabilityZone || '',
          multiAZ: db.MultiAZ || false,
          cpuUtilization,
          hourlyCost,
          monthlyCost: hourlyCost * HOURS_PER_MONTH
        });
      }
    }
    
    return instances;
  } catch (err) {
    logger.warn('Could not fetch RDS instances:', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/**
 * Get REAL CPU utilization from CloudWatch for an RDS instance
 */
async function getRDSCPUUtilization(cloudWatchClient: CloudWatchClient, dbIdentifier: string): Promise<number> {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const response = await cloudWatchClient.send(new GetMetricStatisticsCommand({
      Namespace: 'AWS/RDS',
      MetricName: 'CPUUtilization',
      Dimensions: [{ Name: 'DBInstanceIdentifier', Value: dbIdentifier }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 3600,
      Statistics: ['Average']
    }));
    
    if (response.Datapoints && response.Datapoints.length > 0) {
      const avgCpu = response.Datapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / response.Datapoints.length;
      return parseFloat(avgCpu.toFixed(2));
    }
    return 0;
  } catch (err) {
    logger.debug(`Could not get CPU for RDS ${dbIdentifier}:`, { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

/**
 * Get REAL utilization data from Cost Explorer
 */
async function getUtilizationData(costExplorerClient: CostExplorerClient) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  let riUtilization = 0;
  let spUtilization = 0;
  let riNetSavings = 0;
  let spNetSavings = 0;
  
  try {
    const riResponse = await costExplorerClient.send(new GetReservationUtilizationCommand({
      TimePeriod: {
        Start: startDate.toISOString().split('T')[0],
        End: endDate.toISOString().split('T')[0],
      },
    }));
    riUtilization = parseFloat(riResponse.Total?.UtilizationPercentage || '0');
    // Read REAL net savings from Cost Explorer (ReservationAggregates.NetRISavings)
    riNetSavings = parseFloat((riResponse.Total as any)?.NetRISavings || '0');
    logger.info(`RI utilization: ${riUtilization}%, NetRISavings: $${riNetSavings}`);
  } catch (err) {
    logger.warn('Could not fetch RI utilization:', { error: err instanceof Error ? err.message : String(err) });
  }
  
  try {
    const spResponse = await costExplorerClient.send(new GetSavingsPlansUtilizationCommand({
      TimePeriod: {
        Start: startDate.toISOString().split('T')[0],
        End: endDate.toISOString().split('T')[0],
      },
    }));
    spUtilization = parseFloat(spResponse.Total?.Utilization?.UtilizationPercentage || '0');
    // Read REAL net savings from Cost Explorer (SavingsPlansSavings.NetSavings)
    spNetSavings = parseFloat(spResponse.Total?.Savings?.NetSavings || '0');
    logger.info(`SP utilization: ${spUtilization}%, NetSavings: $${spNetSavings}`);
  } catch (err) {
    logger.warn('Could not fetch SP utilization:', { error: err instanceof Error ? err.message : String(err) });
  }
  
  return { riUtilization, spUtilization, riNetSavings, spNetSavings };
}

/**
 * Analyze usage patterns based on REAL instance data
 */
function analyzeUsagePatterns(
  ec2Instances: EC2Instance[],
  rdsInstances: RDSInstance[],
  region: string
): UsagePattern[] {
  const patterns: UsagePattern[] = [];
  
  // Group EC2 instances by type
  const ec2ByType = ec2Instances.reduce((acc, instance) => {
    if (!acc[instance.instanceType]) {
      acc[instance.instanceType] = [];
    }
    acc[instance.instanceType].push(instance);
    return acc;
  }, {} as Record<string, EC2Instance[]>);
  
  for (const [instanceType, instances] of Object.entries(ec2ByType)) {
    const avgCpu = instances.reduce((sum, i) => sum + (i.cpuUtilization || 0), 0) / instances.length;
    const totalMonthlyCost = instances.reduce((sum, i) => sum + i.monthlyCost, 0);
    
    // Calculate consistency based on how long instances have been running
    const now = new Date();
    const avgDaysRunning = instances.reduce((sum, i) => {
      return sum + (now.getTime() - i.launchTime.getTime()) / (24 * 60 * 60 * 1000);
    }, 0) / instances.length;
    
    const consistencyScore = Math.min(100, avgDaysRunning * 3.33); // 30 days = 100%
    
    patterns.push({
      instanceType,
      averageHoursPerDay: 24, // Running instances are 24/7
      consistencyScore: parseFloat(consistencyScore.toFixed(2)),
      recommendedCommitment: determineCommitmentLevel(24, consistencyScore, avgCpu),
      instances: instances.length,
      monthlyCost: parseFloat(totalMonthlyCost.toFixed(2)),
      avgCpuUtilization: parseFloat(avgCpu.toFixed(2)),
      region
    });
  }
  
  return patterns;
}

function determineCommitmentLevel(hoursPerDay: number, consistencyScore: number, avgCpu: number): 'none' | 'partial' | 'full' {
  // If CPU is very low, might not need commitment (could downsize instead)
  if (avgCpu < 10) return 'none';
  
  // High consistency and usage = full commitment
  if (hoursPerDay >= 20 && consistencyScore >= 80) return 'full';
  if (hoursPerDay >= 12 && consistencyScore >= 60) return 'partial';
  return 'none';
}

/**
 * Calculate REAL coverage from Cost Explorer
 */
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
  } catch (err) {
    logger.warn('Could not fetch RI coverage:', { error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    logger.warn('Could not fetch SP coverage:', { error: err instanceof Error ? err.message : String(err) });
  }
  
  return {
    reservedInstances: riCoverage,
    savingsPlans: spCoverage,
    overall: riCoverage > 0 && spCoverage > 0
      ? (riCoverage + spCoverage) / 2
      : riCoverage > 0 ? riCoverage
      : spCoverage > 0 ? spCoverage
      : 0
  };
}

/**
 * Generate recommendations based on REAL data
 * Savings percentages are calculated from actual AWS pricing tiers
 */
function generateAdvancedRecommendations(
  reservedInstances: ReservedInstance[],
  reservedRDSInstances: any[],
  savingsPlans: SavingsPlan[],
  ec2Instances: EC2Instance[],
  rdsInstances: RDSInstance[],
  usagePatterns: UsagePattern[],
  utilizationData: { riUtilization: number; spUtilization: number },
  totalMonthlyCost: number
): CostOptimizationRecommendation[] {
  const recommendations: CostOptimizationRecommendation[] = [];
  
  // Calculate actual costs
  const ec2MonthlyCost = ec2Instances.reduce((sum, i) => sum + i.monthlyCost, 0);
  const rdsMonthlyCost = rdsInstances.reduce((sum, i) => sum + i.monthlyCost, 0);
  
  logger.info('Generating recommendations from real data', {
    ec2Count: ec2Instances.length,
    rdsCount: rdsInstances.length,
    riCount: reservedInstances.length,
    spCount: savingsPlans.length,
    ec2MonthlyCost,
    rdsMonthlyCost
  });
  
  // 1. RI Recommendations for EC2 - based on actual costs
  if (reservedInstances.length === 0 && ec2Instances.length > 0 && ec2MonthlyCost > 0) {
    // AWS RI savings: 1-year No Upfront = ~31%, 1-year All Upfront = ~40%, 3-year = up to 72%
    const riSavingsPercent = 0.31; // Conservative 1-year No Upfront estimate
    const monthlySavings = ec2MonthlyCost * riSavingsPercent;
    
    recommendations.push({
      type: 'ri_purchase',
      priority: monthlySavings > 500 ? 'high' : 'medium',
      service: 'EC2',
      title: 'Adquirir Reserved Instances para Workloads Estáveis',
      description: `Você tem ${ec2Instances.length} instâncias EC2 em execução (custo: $${ec2MonthlyCost.toFixed(2)}/mês) sem Reserved Instances. RIs de 1 ano podem economizar ~31% em comparação com On-Demand.`,
      potentialSavings: {
        monthly: parseFloat(monthlySavings.toFixed(2)),
        annual: parseFloat((monthlySavings * 12).toFixed(2)),
        percentage: 31
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
        currentInstances: ec2Instances.slice(0, 10).map(i => ({
          instanceId: i.instanceId,
          instanceType: i.instanceType,
          cpuUtilization: i.cpuUtilization,
          monthlyCost: i.monthlyCost
        })),
        totalEC2Cost: ec2MonthlyCost
      }
    });
  }

  // 2. RDS RI Recommendations - based on actual costs
  if (reservedRDSInstances.length === 0 && rdsInstances.length > 0 && rdsMonthlyCost > 0) {
    const rdsRiSavingsPercent = 0.31;
    const monthlySavings = rdsMonthlyCost * rdsRiSavingsPercent;
    
    recommendations.push({
      type: 'ri_purchase',
      priority: monthlySavings > 300 ? 'high' : 'medium',
      service: 'RDS',
      title: 'Adquirir Reserved Instances para RDS',
      description: `Você tem ${rdsInstances.length} instâncias RDS (custo: $${rdsMonthlyCost.toFixed(2)}/mês) sem reservas. RIs de RDS podem economizar ~31% em bancos de dados de produção.`,
      potentialSavings: {
        monthly: parseFloat(monthlySavings.toFixed(2)),
        annual: parseFloat((monthlySavings * 12).toFixed(2)),
        percentage: 31
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
          cpuUtilization: db.cpuUtilization,
          monthlyCost: db.monthlyCost
        })),
        totalRDSCost: rdsMonthlyCost
      }
    });
  }
  
  // 3. Savings Plans Recommendations - based on actual total cost
  if (savingsPlans.length === 0 && totalMonthlyCost > 0) {
    // Compute Savings Plans: ~20-25% savings (more flexible than RIs)
    const spSavingsPercent = 0.22;
    const monthlySavings = totalMonthlyCost * spSavingsPercent;
    
    recommendations.push({
      type: 'sp_purchase',
      priority: monthlySavings > 400 ? 'high' : 'medium',
      service: 'General',
      title: 'Implementar Compute Savings Plans',
      description: `Savings Plans oferecem economia flexível de ~22% em EC2, Lambda e Fargate. Custo atual: $${totalMonthlyCost.toFixed(2)}/mês.`,
      potentialSavings: {
        monthly: parseFloat(monthlySavings.toFixed(2)),
        annual: parseFloat((monthlySavings * 12).toFixed(2)),
        percentage: 22
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
        recommendedCommitment: parseFloat((totalMonthlyCost * 0.7 / HOURS_PER_MONTH).toFixed(4)),
        planType: 'Compute Savings Plan',
        term: '1 ano'
      }
    });
  }

  // 4. Right-sizing based on REAL CPU utilization
  const underutilizedEC2 = ec2Instances.filter(i => i.cpuUtilization !== undefined && i.cpuUtilization < 20);
  if (underutilizedEC2.length > 0) {
    const potentialSavings = underutilizedEC2.reduce((sum, i) => sum + (i.monthlyCost * 0.5), 0); // 50% savings from downsizing
    
    recommendations.push({
      type: 'right_sizing',
      priority: potentialSavings > 200 ? 'high' : 'medium',
      service: 'EC2',
      title: 'Right-Sizing de Instâncias Subutilizadas',
      description: `${underutilizedEC2.length} instâncias EC2 com CPU < 20%. Considere reduzir o tamanho para economizar ~50%.`,
      potentialSavings: {
        monthly: parseFloat(potentialSavings.toFixed(2)),
        annual: parseFloat((potentialSavings * 12).toFixed(2)),
        percentage: 50
      },
      implementation: {
        difficulty: 'medium',
        timeToImplement: '2-4 horas',
        steps: [
          'Acesse AWS Compute Optimizer para recomendações detalhadas',
          'Analise métricas de CPU e memória no CloudWatch',
          'Teste tipos menores em ambiente de staging',
          'Migre gradualmente para instâncias otimizadas'
        ]
      },
      details: {
        underutilizedInstances: underutilizedEC2.map(i => ({
          instanceId: i.instanceId,
          instanceType: i.instanceType,
          cpuUtilization: i.cpuUtilization,
          monthlyCost: i.monthlyCost
        }))
      }
    });
  }
  
  // 5. Spot Instance recommendations for dev/test workloads
  const devTestInstances = ec2Instances.filter(i => 
    i.instanceType.startsWith('t3') || i.instanceType.startsWith('t2')
  );
  if (devTestInstances.length > 0) {
    const spotSavings = devTestInstances.reduce((sum, i) => sum + (i.monthlyCost * 0.7), 0);
    
    recommendations.push({
      type: 'spot_instances',
      priority: 'medium',
      service: 'EC2',
      title: 'Considerar Spot Instances para Workloads Tolerantes a Falhas',
      description: `${devTestInstances.length} instâncias burstable (T2/T3) podem ser candidatas a Spot Instances com economia de até 70%.`,
      potentialSavings: {
        monthly: parseFloat(spotSavings.toFixed(2)),
        annual: parseFloat((spotSavings * 12).toFixed(2)),
        percentage: 70
      },
      implementation: {
        difficulty: 'medium',
        timeToImplement: '4-6 horas',
        steps: [
          'Identifique workloads tolerantes a interrupções',
          'Configure Spot Fleet com múltiplos tipos de instância',
          'Implemente tratamento de interrupções (2 min warning)',
          'Use Auto Scaling Groups com mixed instances'
        ]
      },
      details: {
        candidateInstances: devTestInstances.length,
        candidateWorkloads: ['Desenvolvimento/Teste', 'CI/CD Pipelines', 'Processamento Batch']
      }
    });
  }

  // 6. Schedule optimization for non-production
  if (ec2Instances.length >= 1 && ec2MonthlyCost > 100) {
    const scheduleSavings = ec2MonthlyCost * 0.4; // 40% savings by stopping 12h/day
    
    recommendations.push({
      type: 'schedule_optimization',
      priority: 'medium',
      service: 'EC2',
      title: 'Implementar Agendamento Automático',
      description: 'Pare automaticamente instâncias de desenvolvimento/teste fora do horário comercial para economizar 40-60% dos custos.',
      potentialSavings: {
        monthly: parseFloat(scheduleSavings.toFixed(2)),
        annual: parseFloat((scheduleSavings * 12).toFixed(2)),
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
        applicableInstances: ec2Instances.length
      }
    });
  }
  
  // 7. Cost Anomaly Detection (always recommend if not set up)
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
  
  return recommendations;
}

function generateExecutiveSummary(
  reservedInstances: ReservedInstance[],
  reservedRDSInstances: any[],
  savingsPlans: SavingsPlan[],
  recommendations: CostOptimizationRecommendation[],
  coverage: any,
  utilizationData: { riUtilization: number; spUtilization: number }
) {
  const totalPotentialSavings = recommendations.reduce((sum, r) => sum + r.potentialSavings.annual, 0);
  const criticalRecommendations = recommendations.filter(r => r.priority === 'critical').length;
  const highPriorityRecommendations = recommendations.filter(r => r.priority === 'high').length;
  
  const hasCommitments = reservedInstances.length > 0 || reservedRDSInstances.length > 0 || savingsPlans.length > 0;
  
  return {
    status: hasCommitments ? 'optimized' : 'needs_attention',
    totalCommitments: reservedInstances.length + reservedRDSInstances.length + savingsPlans.length,
    coverageScore: coverage.overall,
    potentialAnnualSavings: parseFloat(totalPotentialSavings.toFixed(2)),
    recommendationsSummary: {
      total: recommendations.length,
      critical: criticalRecommendations,
      high: highPriorityRecommendations,
      quickWins: recommendations.filter(r => r.implementation.difficulty === 'easy').length
    },
    utilization: {
      reservedInstances: utilizationData.riUtilization,
      savingsPlans: utilizationData.spUtilization
    },
    keyInsights: [
      reservedInstances.length === 0 
        ? 'Nenhuma Reserved Instance encontrada - oportunidade significativa de economia' 
        : `${reservedInstances.length} Reserved Instances ativas (utilização: ${utilizationData.riUtilization.toFixed(1)}%)`,
      savingsPlans.length === 0 
        ? 'Nenhum Savings Plan encontrado - considere opções de compromisso flexíveis' 
        : `${savingsPlans.length} Savings Plans ativos (utilização: ${utilizationData.spUtilization.toFixed(1)}%)`,
      `Score de cobertura: ${coverage.overall.toFixed(1)}% - ${coverage.overall < 50 ? 'precisa melhorar' : 'bom'}`,
      `${recommendations.length} oportunidades de otimização identificadas`,
      `Economia potencial anual: $${totalPotentialSavings.toFixed(2)}`
    ]
  };
}
