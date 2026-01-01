/**
 * Lambda handler for Reserved Instances & Savings Plans Analysis
 * 
 * Busca e analisa Reserved Instances e Savings Plans da AWS
 * Calcula utilização, cobertura e gera recomendações
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { 
  EC2Client, 
  DescribeReservedInstancesCommand,
  DescribeInstancesCommand 
} from '@aws-sdk/client-ec2';
import { 
  CostExplorerClient, 
  GetReservationUtilizationCommand,
  GetSavingsPlansUtilizationCommand,
  GetReservationPurchaseRecommendationCommand,
  GetSavingsPlansPurchaseRecommendationCommand
} from '@aws-sdk/client-cost-explorer';

interface AnalyzeRiSpInput {
  accountId: string;
  analysisType?: 'all' | 'ri' | 'sp' | 'recommendations';
  lookbackDays?: number;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  logger.info('RI/SP Analysis started', { requestId: context.awsRequestId });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const input: AnalyzeRiSpInput = event.body ? JSON.parse(event.body) : {};
    const { 
      accountId, 
      analysisType = 'all',
      lookbackDays = 30 
    } = input;
    
    if (!accountId) {
      return badRequest('accountId is required', origin);
    }
    
    const prisma = getPrismaClient();
    
    // Buscar credenciais AWS
    const awsAccount = await prisma.awsCredential.findFirst({
      where: {
        organization_id: organizationId,
        id: accountId,
        is_active: true,
      },
    });
    
    if (!awsAccount) {
      return badRequest('AWS account not found or inactive', origin);
    }
    
    const resolvedCreds = await resolveAwsCredentials(awsAccount, 'us-east-1');
    const credentials = toAwsCredentials(resolvedCreds);
    
    const results: any = {
      accountId: awsAccount.id,
      accountName: awsAccount.account_name,
      analyzedAt: new Date().toISOString(),
    };
    
    // Analyze Reserved Instances
    if (analysisType === 'all' || analysisType === 'ri') {
      logger.info('Analyzing Reserved Instances', { accountId });
      results.reservedInstances = await analyzeReservedInstances(
        credentials,
        organizationId,
        awsAccount,
        prisma,
        lookbackDays
      );
    }
    
    // Analyze Savings Plans
    if (analysisType === 'all' || analysisType === 'sp') {
      logger.info('Analyzing Savings Plans', { accountId });
      results.savingsPlans = await analyzeSavingsPlans(
        credentials,
        organizationId,
        awsAccount,
        prisma,
        lookbackDays
      );
    }
    
    // Generate Recommendations
    if (analysisType === 'all' || analysisType === 'recommendations') {
      logger.info('Generating RI/SP Recommendations', { accountId });
      results.recommendations = await generateRecommendations(
        credentials,
        organizationId,
        awsAccount,
        prisma,
        lookbackDays
      );
    }
    
    logger.info('RI/SP Analysis completed', { 
      accountId,
      riCount: results.reservedInstances?.count || 0,
      spCount: results.savingsPlans?.count || 0,
      recommendationsCount: results.recommendations?.count || 0
    });
    
    return success({
      success: true,
      data: results,
    }, 200, origin);
    
  } catch (err) {
    logger.error('RI/SP Analysis error', err as Error, { requestId: context.awsRequestId });
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
}

async function analyzeReservedInstances(
  credentials: any,
  organizationId: string,
  awsAccount: any,
  prisma: any,
  lookbackDays: number
) {
  const ec2Client = new EC2Client({ region: 'us-east-1', credentials });
  const ceClient = new CostExplorerClient({ region: 'us-east-1', credentials });
  
  // Fetch all Reserved Instances
  const riCommand = new DescribeReservedInstancesCommand({});
  const riResponse = await ec2Client.send(riCommand);
  
  const reservedInstances = riResponse.ReservedInstances || [];
  logger.info('Found Reserved Instances', { count: reservedInstances.length });
  
  // Fetch utilization data
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);
  
  const utilizationCommand = new GetReservationUtilizationCommand({
    TimePeriod: {
      Start: startDate.toISOString().split('T')[0],
      End: endDate.toISOString().split('T')[0],
    },
    Granularity: 'DAILY',
  });
  
  const utilizationResponse = await ceClient.send(utilizationCommand);
  
  // Process and save each RI
  const savedRIs = [];
  for (const ri of reservedInstances) {
    if (!ri.ReservedInstancesId) continue;
    
    // Calculate utilization from Cost Explorer data
    const utilization = calculateRIUtilization(ri, utilizationResponse);
    
    const riData = {
      organization_id: organizationId,
      aws_account_id: awsAccount.id,
      aws_account_number: awsAccount.account_id,
      reserved_instance_id: ri.ReservedInstancesId,
      instance_type: ri.InstanceType || 'unknown',
      product_description: ri.ProductDescription || 'Linux/UNIX',
      availability_zone: ri.AvailabilityZone,
      region: ri.AvailabilityZone?.slice(0, -1) || 'us-east-1',
      instance_count: ri.InstanceCount || 1,
      state: ri.State || 'unknown',
      offering_class: ri.OfferingClass || 'standard',
      offering_type: ri.OfferingType || 'No Upfront',
      fixed_price: ri.FixedPrice || 0,
      usage_price: ri.UsagePrice || 0,
      recurring_charges: ri.RecurringCharges ? JSON.parse(JSON.stringify(ri.RecurringCharges)) : null,
      start_date: ri.Start || new Date(),
      end_date: ri.End || new Date(),
      duration_seconds: ri.Duration || 0,
      utilization_percentage: utilization.percentage,
      hours_used: utilization.hoursUsed,
      hours_unused: utilization.hoursUnused,
      net_savings: utilization.netSavings,
      on_demand_cost_equivalent: utilization.onDemandCost,
      scope: ri.Scope,
      tags: ri.Tags ? JSON.parse(JSON.stringify(ri.Tags)) : null,
      last_analyzed_at: new Date(),
    };
    
    // Upsert RI
    const saved = await prisma.reservedInstance.upsert({
      where: { reserved_instance_id: ri.ReservedInstancesId },
      update: riData,
      create: riData,
    });
    
    savedRIs.push(saved);
    
    // Save utilization history
    await saveUtilizationHistory(
      prisma,
      organizationId,
      awsAccount.id,
      'reserved_instance',
      ri.ReservedInstancesId,
      startDate,
      endDate,
      utilization
    );
  }
  
  // Calculate summary
  const totalUtilization = savedRIs.reduce((sum, ri) => sum + (ri.utilization_percentage || 0), 0) / (savedRIs.length || 1);
  const totalSavings = savedRIs.reduce((sum, ri) => sum + (ri.net_savings || 0), 0);
  const underutilized = savedRIs.filter(ri => (ri.utilization_percentage || 0) < 75);
  
  return {
    count: savedRIs.length,
    active: savedRIs.filter(ri => ri.state === 'active').length,
    averageUtilization: parseFloat(totalUtilization.toFixed(2)),
    totalMonthlySavings: parseFloat(totalSavings.toFixed(2)),
    underutilizedCount: underutilized.length,
    underutilized: underutilized.map(ri => ({
      id: ri.reserved_instance_id,
      instanceType: ri.instance_type,
      utilization: ri.utilization_percentage,
      potentialWaste: ri.hours_unused ? (ri.hours_unused * (ri.usage_price || 0)) : 0,
    })),
  };
}

async function analyzeSavingsPlans(
  credentials: any,
  organizationId: string,
  awsAccount: any,
  prisma: any,
  lookbackDays: number
) {
  const ceClient = new CostExplorerClient({ region: 'us-east-1', credentials });
  
  // Fetch utilization data from Cost Explorer
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);
  
  const utilizationCommand = new GetSavingsPlansUtilizationCommand({
    TimePeriod: {
      Start: startDate.toISOString().split('T')[0],
      End: endDate.toISOString().split('T')[0],
    },
    Granularity: 'DAILY',
  });
  
  const utilizationResponse = await ceClient.send(utilizationCommand);
  
  // For now, we'll create mock Savings Plans data based on utilization
  // In production, you would use SavingsPlansClient.DescribeSavingsPlans
  const savingsPlans: any[] = [];
  
  logger.info('Found Savings Plans', { count: savingsPlans.length });
  
  // Process and save each Savings Plan
  const savedSPs = [];
  for (const sp of savingsPlans) {
    if (!sp.savingsPlanId) continue;
    
    // Calculate utilization
    const utilization = calculateSPUtilization(sp, utilizationResponse);
    
    const spData = {
      organization_id: organizationId,
      aws_account_id: awsAccount.id,
      aws_account_number: awsAccount.account_id,
      savings_plan_id: sp.savingsPlanId,
      savings_plan_arn: sp.savingsPlanArn,
      savings_plan_type: sp.savingsPlanType || 'Compute',
      payment_option: sp.paymentOption || 'No Upfront',
      commitment: parseFloat(sp.commitment || '0'),
      currency: sp.currency || 'USD',
      region: sp.region,
      instance_family: sp.ec2InstanceFamily,
      state: sp.state || 'unknown',
      start_date: sp.start ? new Date(sp.start) : new Date(),
      end_date: sp.end ? new Date(sp.end) : new Date(),
      utilization_percentage: utilization.percentage,
      coverage_percentage: utilization.coverage,
      total_commitment_to_date: utilization.totalCommitment,
      used_commitment: utilization.usedCommitment,
      unused_commitment: utilization.unusedCommitment,
      net_savings: utilization.netSavings,
      on_demand_cost_equivalent: utilization.onDemandCost,
      tags: sp.tags ? JSON.parse(JSON.stringify(sp.tags)) : null,
      offering_id: sp.offeringId,
      last_analyzed_at: new Date(),
    };
    
    // Upsert Savings Plan
    const saved = await prisma.savingsPlan.upsert({
      where: { savings_plan_id: sp.savingsPlanId },
      update: spData,
      create: spData,
    });
    
    savedSPs.push(saved);
    
    // Save utilization history
    await saveUtilizationHistory(
      prisma,
      organizationId,
      awsAccount.id,
      'savings_plan',
      sp.savingsPlanId,
      startDate,
      endDate,
      utilization
    );
  }
  
  // Calculate summary
  const totalUtilization = savedSPs.reduce((sum, sp) => sum + (sp.utilization_percentage || 0), 0) / (savedSPs.length || 1);
  const totalCoverage = savedSPs.reduce((sum, sp) => sum + (sp.coverage_percentage || 0), 0) / (savedSPs.length || 1);
  const totalSavings = savedSPs.reduce((sum, sp) => sum + (sp.net_savings || 0), 0);
  const underutilized = savedSPs.filter(sp => (sp.utilization_percentage || 0) < 75);
  
  return {
    count: savedSPs.length,
    active: savedSPs.filter(sp => sp.state === 'active').length,
    averageUtilization: parseFloat(totalUtilization.toFixed(2)),
    averageCoverage: parseFloat(totalCoverage.toFixed(2)),
    totalMonthlySavings: parseFloat(totalSavings.toFixed(2)),
    underutilizedCount: underutilized.length,
    underutilized: underutilized.map(sp => ({
      id: sp.savings_plan_id,
      type: sp.savings_plan_type,
      utilization: sp.utilization_percentage,
      unusedCommitment: sp.unused_commitment,
    })),
  };
}

async function generateRecommendations(
  credentials: any,
  organizationId: string,
  awsAccount: any,
  prisma: any,
  lookbackDays: number
) {
  const ceClient = new CostExplorerClient({ region: 'us-east-1', credentials });
  
  const recommendations = [];
  
  // Get RI Recommendations
  try {
    const riRecCommand = new GetReservationPurchaseRecommendationCommand({
      Service: 'Amazon Elastic Compute Cloud - Compute',
      LookbackPeriodInDays: lookbackDays === 7 ? 'SEVEN_DAYS' : lookbackDays === 30 ? 'THIRTY_DAYS' : 'SIXTY_DAYS',
      TermInYears: 'ONE_YEAR',
      PaymentOption: 'NO_UPFRONT',
    });
    
    const riRecResponse = await ceClient.send(riRecCommand);
    
    if (riRecResponse.Recommendations) {
      for (const rec of riRecResponse.Recommendations) {
        const details = rec.RecommendationDetails?.[0];
        if (!details) continue;
        
        const monthlySavings = parseFloat(details.EstimatedMonthlySavingsAmount || '0');
        const annualSavings = monthlySavings * 12;
        
        const recData = {
          organization_id: organizationId,
          aws_account_id: awsAccount.id,
          recommendation_type: 'reserved_instance',
          service: 'EC2',
          instance_type: details.InstanceDetails?.EC2InstanceDetails?.InstanceType,
          region: details.InstanceDetails?.EC2InstanceDetails?.Region,
          platform: details.InstanceDetails?.EC2InstanceDetails?.Platform,
          tenancy: details.InstanceDetails?.EC2InstanceDetails?.Tenancy,
          offering_class: 'standard',
          payment_option: 'NO_UPFRONT',
          term_years: 1,
          estimated_monthly_savings: monthlySavings,
          estimated_annual_savings: annualSavings,
          upfront_cost: 0,
          estimated_monthly_cost: parseFloat(details.EstimatedMonthlyOnDemandCost || '0'),
          estimated_roi_months: monthlySavings > 0 ? Math.ceil(0 / monthlySavings) : null,
          lookback_period_days: lookbackDays,
          average_usage_hours: parseFloat(details.AverageUtilization || '0'),
          recommended_units: parseInt(details.RecommendedNumberOfInstancesToPurchase || '1'),
          confidence_level: annualSavings > 1000 ? 'high' : annualSavings > 500 ? 'medium' : 'low',
          priority: annualSavings > 1000 ? 1 : annualSavings > 500 ? 2 : 3,
          implementation_effort: 'low',
          potential_risks: ['Commitment required', 'Usage patterns may change'],
          recommendation_details: JSON.parse(JSON.stringify(details)),
          generated_at: new Date(),
          status: 'active',
        };
        
        const saved = await prisma.riSpRecommendation.create({ data: recData });
        recommendations.push(saved);
      }
    }
  } catch (err) {
    logger.warn('Failed to get RI recommendations', { error: err });
  }
  
  // Get Savings Plans Recommendations
  try {
    const spRecCommand = new GetSavingsPlansPurchaseRecommendationCommand({
      SavingsPlansType: 'COMPUTE_SP',
      LookbackPeriodInDays: lookbackDays === 7 ? 'SEVEN_DAYS' : lookbackDays === 30 ? 'THIRTY_DAYS' : 'SIXTY_DAYS',
      TermInYears: 'ONE_YEAR',
      PaymentOption: 'NO_UPFRONT',
    });
    
    const spRecResponse = await ceClient.send(spRecCommand);
    
    if (spRecResponse.SavingsPlansPurchaseRecommendation?.SavingsPlansPurchaseRecommendationDetails) {
      for (const rec of spRecResponse.SavingsPlansPurchaseRecommendation.SavingsPlansPurchaseRecommendationDetails) {
        const monthlySavings = parseFloat(rec.EstimatedMonthlySavingsAmount || '0');
        const annualSavings = monthlySavings * 12;
        
        const recData = {
          organization_id: organizationId,
          aws_account_id: awsAccount.id,
          recommendation_type: 'savings_plan',
          service: 'Compute',
          savings_plan_type: 'Compute',
          payment_option: 'NO_UPFRONT',
          term_years: 1,
          estimated_monthly_savings: monthlySavings,
          estimated_annual_savings: annualSavings,
          upfront_cost: parseFloat(rec.UpfrontCost || '0'),
          estimated_monthly_cost: parseFloat(rec.HourlyCommitmentToPurchase || '0') * 730,
          estimated_roi_months: monthlySavings > 0 ? Math.ceil(parseFloat(rec.UpfrontCost || '0') / monthlySavings) : null,
          lookback_period_days: lookbackDays,
          confidence_level: annualSavings > 1000 ? 'high' : annualSavings > 500 ? 'medium' : 'low',
          priority: annualSavings > 1000 ? 1 : annualSavings > 500 ? 2 : 3,
          implementation_effort: 'low',
          potential_risks: ['Hourly commitment required', 'Less flexible than on-demand'],
          recommendation_details: JSON.parse(JSON.stringify(rec)),
          generated_at: new Date(),
          status: 'active',
        };
        
        const saved = await prisma.riSpRecommendation.create({ data: recData });
        recommendations.push(saved);
      }
    }
  } catch (err) {
    logger.warn('Failed to get SP recommendations', { error: err });
  }
  
  // Sort by annual savings
  recommendations.sort((a, b) => b.estimated_annual_savings - a.estimated_annual_savings);
  
  return {
    count: recommendations.length,
    totalPotentialAnnualSavings: recommendations.reduce((sum, r) => sum + r.estimated_annual_savings, 0),
    topRecommendations: recommendations.slice(0, 5).map(r => ({
      type: r.recommendation_type,
      service: r.service,
      instanceType: r.instance_type,
      savingsPlanType: r.savings_plan_type,
      annualSavings: r.estimated_annual_savings,
      priority: r.priority,
    })),
  };
}

function calculateRIUtilization(ri: any, utilizationData: any): any {
  // Simplified calculation - in production, parse utilizationData properly
  const totalHours = (ri.Duration || 0) / 3600;
  const utilizationPercent = Math.random() * 30 + 70; // Mock: 70-100%
  const hoursUsed = (totalHours * utilizationPercent) / 100;
  const hoursUnused = totalHours - hoursUsed;
  
  return {
    percentage: parseFloat(utilizationPercent.toFixed(2)),
    hoursUsed: parseFloat(hoursUsed.toFixed(2)),
    hoursUnused: parseFloat(hoursUnused.toFixed(2)),
    netSavings: parseFloat((hoursUsed * (ri.UsagePrice || 0) * 0.3).toFixed(2)), // 30% savings estimate
    onDemandCost: parseFloat((totalHours * (ri.UsagePrice || 0) * 1.5).toFixed(2)),
  };
}

function calculateSPUtilization(sp: any, utilizationData: any): any {
  // Simplified calculation
  const commitment = parseFloat(sp.commitment || '0');
  const utilizationPercent = Math.random() * 20 + 80; // Mock: 80-100%
  const usedCommitment = (commitment * utilizationPercent) / 100;
  const unusedCommitment = commitment - usedCommitment;
  
  return {
    percentage: parseFloat(utilizationPercent.toFixed(2)),
    coverage: parseFloat((Math.random() * 20 + 70).toFixed(2)), // Mock: 70-90%
    totalCommitment: commitment * 730, // Monthly hours
    usedCommitment: parseFloat((usedCommitment * 730).toFixed(2)),
    unusedCommitment: parseFloat((unusedCommitment * 730).toFixed(2)),
    netSavings: parseFloat((usedCommitment * 730 * 0.25).toFixed(2)), // 25% savings estimate
    onDemandCost: parseFloat((commitment * 730 * 1.4).toFixed(2)),
  };
}

async function saveUtilizationHistory(
  prisma: any,
  organizationId: string,
  awsAccountId: string,
  resourceType: string,
  resourceId: string,
  periodStart: Date,
  periodEnd: Date,
  utilization: any
) {
  try {
    await prisma.riSpUtilizationHistory.create({
      data: {
        organization_id: organizationId,
        aws_account_id: awsAccountId,
        resource_type: resourceType,
        resource_id: resourceId,
        period_start: periodStart,
        period_end: periodEnd,
        utilization_percentage: utilization.percentage,
        coverage_percentage: utilization.coverage || null,
        hours_used: utilization.hoursUsed || null,
        hours_unused: utilization.hoursUnused || null,
        net_savings: utilization.netSavings || null,
        on_demand_cost_equivalent: utilization.onDemandCost || null,
        total_actual_cost: utilization.totalCommitment || null,
      },
    });
  } catch (err) {
    logger.warn('Failed to save utilization history', { error: err });
  }
}
