/**
 * Get RI/SP Data - Fetch saved RI/SP analysis data from database
 * AWS Lambda Handler for get-ri-sp-data
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { isOrganizationInDemoMode, generateDemoRISPAnalysis } from '../../lib/demo-data-service.js';

interface GetRISPDataRequest {
  accountId: string;
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🔍 Get RI/SP Data started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    const body: GetRISPDataRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId } = body;
    
    const prisma = getPrismaClient();
    
    // Check if organization is in demo mode
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo) {
      logger.info('🎭 Returning demo RI/SP data', { organizationId });
      const demoData = generateDemoRISPAnalysis();
      return success({
        ...demoData,
        success: true,
        hasData: true,
      });
    }
    
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
      orderBy: { created_at: 'desc' },
    });
    
    // Fetch Savings Plans
    const savingsPlans = await prisma.savingsPlan.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
      },
      orderBy: { created_at: 'desc' },
    });
    
    // Fetch Recommendations
    const recommendations = await prisma.riSpRecommendation.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
        status: 'active',
      },
      orderBy: [
        { priority: 'asc' },
        { estimated_annual_savings: 'desc' },
      ],
    });
    
    // If no data found, return empty state
    if (reservedInstances.length === 0 && savingsPlans.length === 0 && recommendations.length === 0) {
      logger.info('No RI/SP data found for account');
      return success({
        success: true,
        hasData: false,
        message: 'No RI/SP analysis data found. Run a new analysis to generate recommendations.',
      });
    }
    
    // Calculate aggregated metrics
    const activeRIs = reservedInstances.filter(ri => ri.state === 'active');
    const activeSPs = savingsPlans.filter(sp => sp.state === 'active');
    
    const avgRIUtilization = activeRIs.length > 0
      ? activeRIs.reduce((sum, ri) => sum + (ri.utilization_percentage || 0), 0) / activeRIs.length
      : 0;
    
    const avgSPUtilization = activeSPs.length > 0
      ? activeSPs.reduce((sum, sp) => sum + (sp.utilization_percentage || 0), 0) / activeSPs.length
      : 0;
    
    const totalRISavings = activeRIs.reduce((sum, ri) => sum + (ri.net_savings || 0), 0);
    const totalSPSavings = activeSPs.reduce((sum, sp) => sum + (sp.net_savings || 0), 0);
    
    const totalPotentialSavings = recommendations.reduce((sum, rec) => sum + (rec.estimated_annual_savings || 0), 0);
    
    // Calculate coverage (simplified - based on active commitments)
    const overallCoverage = (avgRIUtilization + avgSPUtilization) / 2;
    
    // Group RIs by type
    const ec2RIs = reservedInstances.filter(ri => !ri.instance_type?.startsWith('db.'));
    const rdsRIs = reservedInstances.filter(ri => ri.instance_type?.startsWith('db.'));
    
    // Transform recommendations to match frontend format
    const transformedRecommendations = recommendations.map(rec => {
      const details = rec.recommendation_details as any;
      return {
        type: rec.recommendation_type === 'reserved_instance' ? 'ri_purchase' : 'sp_purchase',
        priority: rec.priority === 1 ? 'critical' : rec.priority === 2 ? 'high' : rec.priority === 3 ? 'medium' : 'low',
        service: rec.service,
        title: details?.title || `${rec.recommendation_type} recommendation`,
        description: details?.description || '',
        potentialSavings: {
          monthly: rec.estimated_monthly_savings || 0,
          annual: rec.estimated_annual_savings || 0,
          percentage: details?.potentialSavings?.percentage || 0,
        },
        implementation: details?.implementation || {
          difficulty: rec.implementation_effort || 'medium',
          timeToImplement: '1-2 hours',
          steps: [],
        },
        details: details?.details || {},
      };
    });
    
    // Generate executive summary
    const executiveSummary = {
      status: activeRIs.length > 0 || activeSPs.length > 0 ? 'optimized' : 'needs_attention',
      totalCommitments: activeRIs.length + activeSPs.length,
      coverageScore: overallCoverage,
      potentialAnnualSavings: totalPotentialSavings,
      recommendationsSummary: {
        total: recommendations.length,
        critical: recommendations.filter(r => r.priority === 1).length,
        high: recommendations.filter(r => r.priority === 2).length,
        quickWins: recommendations.filter(r => r.implementation_effort === 'easy').length,
      },
      keyInsights: [
        `${activeRIs.length} Reserved Instances ativas (utilização: ${avgRIUtilization.toFixed(1)}%)`,
        `${activeSPs.length} Savings Plans ativos (utilização: ${avgSPUtilization.toFixed(1)}%)`,
        `Score de cobertura: ${overallCoverage.toFixed(1)}%`,
        `${recommendations.length} oportunidades de otimização identificadas`,
        `Economia potencial anual: $${totalPotentialSavings.toFixed(2)}`,
      ],
    };
    
    logger.info(`✅ Retrieved RI/SP data: ${reservedInstances.length} RIs, ${savingsPlans.length} SPs, ${recommendations.length} recommendations`);
    
    return success({
      success: true,
      hasData: true,
      executiveSummary,
      reservedInstances: {
        ec2: ec2RIs.map(ri => ({
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
          hourlyCost: ri.usage_price || 0,
          monthlyCost: (ri.usage_price || 0) * 730,
        })),
        rds: rdsRIs.map(ri => ({
          id: ri.reserved_instance_id,
          dbInstanceClass: ri.instance_type,
          engine: ri.product_description,
          state: ri.state,
          start: ri.start_date,
          end: ri.end_date,
          instanceCount: ri.instance_count,
          offeringType: ri.offering_type,
          region: ri.region,
          hourlyCost: ri.usage_price || 0,
          monthlyCost: (ri.usage_price || 0) * 730,
        })),
        total: reservedInstances.length,
        active: activeRIs.length,
        averageUtilization: avgRIUtilization,
        totalMonthlySavings: totalRISavings,
      },
      savingsPlans: {
        plans: savingsPlans.map(sp => ({
          id: sp.savings_plan_id,
          type: sp.savings_plan_type,
          state: sp.state,
          commitment: sp.commitment,
          start: sp.start_date.toISOString(),
          end: sp.end_date?.toISOString() || '',
          paymentOption: sp.payment_option,
          region: sp.region,
          utilizationPercentage: sp.utilization_percentage,
        })),
        total: savingsPlans.length,
        active: activeSPs.length,
        averageUtilization: avgSPUtilization,
        totalMonthlySavings: totalSPSavings,
      },
      coverage: {
        reservedInstances: avgRIUtilization,
        savingsPlans: avgSPUtilization,
        overall: overallCoverage,
      },
      recommendations: transformedRecommendations,
      potentialSavings: {
        monthly: totalPotentialSavings / 12,
        annual: totalPotentialSavings,
        maxPercentage: Math.max(...transformedRecommendations.map(r => r.potentialSavings.percentage), 0),
      },
      analysisMetadata: {
        accountId,
        // Use the most recent timestamp from recommendations (which are recreated on each analysis)
        timestamp: recommendations[0]?.generated_at?.toISOString() || 
                   recommendations[0]?.created_at?.toISOString() || 
                   reservedInstances[0]?.updated_at?.toISOString() ||
                   new Date().toISOString(),
        dataSource: 'database',
      },
    });
    
  } catch (err) {
    logger.error('❌ Get RI/SP Data error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
