/**
 * Get RI/SP Analysis from Database
 * AWS Lambda Handler for get-ri-sp-analysis
 * 
 * Returns saved RI/SP analysis data from database
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod } from '../../lib/middleware.js';

interface GetRiSpAnalysisRequest {
  accountId: string;
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('📊 Get RI/SP Analysis from database');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const body: GetRiSpAnalysisRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId } = body;
    
    if (!accountId) {
      return error('Missing required parameter: accountId');
    }
    
    const prisma = getPrismaClient();
    
    // Verify account belongs to organization
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found');
    }
    
    // Fetch Reserved Instances
    const reservedInstances = await prisma.reservedInstance.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
      },
      orderBy: { updated_at: 'desc' },
    });
    
    // Fetch Savings Plans
    const savingsPlans = await prisma.savingsPlan.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
      },
      orderBy: { updated_at: 'desc' },
    });
    
    // Fetch Recommendations
    const recommendations = await prisma.riSpRecommendation.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
        status: { in: ['pending', 'in_progress'] },
      },
      orderBy: [
        { priority: 'asc' },
        { estimated_annual_savings: 'desc' },
      ],
    });
    
    // Calculate metrics
    const activeRIs = reservedInstances.filter(ri => ri.state === 'active');
    const activeSPs = savingsPlans.filter(sp => sp.state === 'active');
    
    const avgRIUtilization = activeRIs.length > 0
      ? activeRIs.reduce((sum, ri) => sum + (ri.utilization_percentage || 0), 0) / activeRIs.length
      : 0;
    
    const avgSPUtilization = activeSPs.length > 0
      ? activeSPs.reduce((sum, sp) => sum + (sp.utilization_percentage || 0), 0) / activeSPs.length
      : 0;
    
    const avgSPCoverage = activeSPs.length > 0
      ? activeSPs.reduce((sum, sp) => sum + (sp.coverage_percentage || 0), 0) / activeSPs.length
      : 0;
    
    const totalRIMonthlySavings = activeRIs.reduce((sum, ri) => sum + (ri.net_savings || 0), 0);
    const totalSPMonthlySavings = activeSPs.reduce((sum, sp) => sum + (sp.net_savings || 0), 0);
    
    const underutilizedRIs = activeRIs.filter(ri => (ri.utilization_percentage || 0) < 75);
    const underutilizedSPs = activeSPs.filter(sp => (sp.utilization_percentage || 0) < 75);
    
    const totalPotentialAnnualSavings = recommendations.reduce(
      (sum, rec) => sum + (rec.estimated_annual_savings || 0),
      0
    );
    
    // Check if we have any data
    const hasData = reservedInstances.length > 0 || savingsPlans.length > 0 || recommendations.length > 0;
    
    if (!hasData) {
      return success({
        success: false,
        message: 'No RI/SP analysis data found. Please run the analysis first.',
        hasData: false,
      });
    }
    
    // Format response to match ri-sp-analyzer format
    return success({
      success: true,
      hasData: true,
      analyzedAt: reservedInstances[0]?.updated_at || savingsPlans[0]?.updated_at || new Date(),
      executiveSummary: {
        status: activeRIs.length > 0 || activeSPs.length > 0 ? 'optimized' : 'needs_attention',
        totalCommitments: activeRIs.length + activeSPs.length,
        coverageScore: avgSPCoverage,
        potentialAnnualSavings: totalPotentialAnnualSavings,
        recommendationsSummary: {
          total: recommendations.length,
          critical: recommendations.filter(r => r.priority === 1).length,
          high: recommendations.filter(r => r.priority === 2).length,
          quickWins: recommendations.filter(r => 
            r.recommendation_details && 
            (r.recommendation_details as any).implementation?.difficulty === 'easy'
          ).length,
        },
        keyInsights: [
          `${activeRIs.length} Reserved Instances ativas (utilização: ${avgRIUtilization.toFixed(1)}%)`,
          `${activeSPs.length} Savings Plans ativos (utilização: ${avgSPUtilization.toFixed(1)}%)`,
          `Score de cobertura: ${avgSPCoverage.toFixed(1)}%`,
          `${recommendations.length} oportunidades de otimização identificadas`,
          `Economia potencial anual: $${totalPotentialAnnualSavings.toFixed(2)}`,
        ],
      },
      reservedInstances: {
        ec2: reservedInstances.map(ri => ({
          id: ri.reserved_instance_id,
          instanceType: ri.instance_type,
          instanceCount: ri.instance_count,
          state: ri.state,
          start: ri.start_date,
          end: ri.end_date,
          offeringType: ri.offering_type,
          availabilityZone: ri.availability_zone,
          platform: ri.product_description,
          scope: ri.scope,
          region: ri.region,
          utilizationPercentage: ri.utilization_percentage,
          hourlyCost: ri.usage_price,
          monthlyCost: (ri.usage_price || 0) * 730,
        })),
        rds: [],
        total: reservedInstances.length,
        count: reservedInstances.length,
        active: activeRIs.length,
        averageUtilization: avgRIUtilization,
        totalMonthlySavings: totalRIMonthlySavings,
        underutilizedCount: underutilizedRIs.length,
        underutilized: underutilizedRIs.map(ri => ({
          id: ri.reserved_instance_id,
          instanceType: ri.instance_type,
          utilization: ri.utilization_percentage || 0,
          potentialWaste: ((ri.usage_price || 0) * 730) * (1 - (ri.utilization_percentage || 0) / 100),
        })),
      },
      savingsPlans: {
        plans: savingsPlans.map(sp => ({
          id: sp.savings_plan_id,
          type: sp.savings_plan_type,
          state: sp.state,
          commitment: sp.commitment,
          start: sp.start_date.toISOString(),
          end: sp.end_date.toISOString(),
          paymentOption: sp.payment_option,
          upfrontPaymentAmount: 0,
          recurringPaymentAmount: sp.commitment,
          utilizationPercentage: sp.utilization_percentage,
          region: sp.region,
        })),
        total: savingsPlans.length,
        count: savingsPlans.length,
        active: activeSPs.length,
        averageUtilization: avgSPUtilization,
        averageCoverage: avgSPCoverage,
        totalMonthlySavings: totalSPMonthlySavings,
        underutilized: underutilizedSPs.map(sp => ({
          id: sp.savings_plan_id,
          type: sp.savings_plan_type,
          utilization: sp.utilization_percentage || 0,
          unusedCommitment: (sp.commitment || 0) * (1 - (sp.utilization_percentage || 0) / 100),
        })),
      },
      recommendations: recommendations.map(rec => ({
        type: rec.recommendation_type === 'reserved_instance' ? 'ri_purchase' : 'sp_purchase',
        priority: rec.priority === 1 ? 'critical' : rec.priority === 2 ? 'high' : rec.priority === 3 ? 'medium' : 'low',
        service: rec.service,
        title: rec.recommendation_details ? (rec.recommendation_details as any).title : `${rec.recommendation_type} recommendation`,
        description: rec.recommendation_details ? (rec.recommendation_details as any).description : '',
        potentialSavings: {
          monthly: rec.estimated_monthly_savings,
          annual: rec.estimated_annual_savings,
          percentage: 0, // Not stored in database
        },
        implementation: rec.recommendation_details ? (rec.recommendation_details as any).implementation : {
          difficulty: 'medium',
          timeToImplement: '1-2 horas',
          steps: [],
        },
        details: rec.recommendation_details ? (rec.recommendation_details as any).details : {},
      })),
      potentialSavings: {
        monthly: totalPotentialAnnualSavings / 12,
        annual: totalPotentialAnnualSavings,
        maxPercentage: 0, // Not stored in database
      },
      coverage: {
        reservedInstances: avgRIUtilization,
        savingsPlans: avgSPCoverage,
        overall: (avgRIUtilization + avgSPCoverage) / 2,
      },
      analysisMetadata: {
        analysisDepth: 'comprehensive',
        accountId,
        timestamp: reservedInstances[0]?.updated_at?.toISOString() || new Date().toISOString(),
        dataSource: 'database',
      },
    });
    
  } catch (err) {
    logger.error('❌ Get RI/SP Analysis error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
