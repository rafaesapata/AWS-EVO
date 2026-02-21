/**
 * Get RI/SP Data - Fetch saved RI/SP analysis data from database
 * AWS Lambda Handler for get-ri-sp-data
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { isOrganizationInDemoMode, generateDemoRISPAnalysis } from '../../lib/demo-data-service.js';
import { cacheManager } from '../../lib/redis-cache.js';

const HOURS_PER_MONTH = 730;

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
    
    let body: GetRISPDataRequest;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
    } catch (parseErr) {
      logger.error('Failed to parse request body', parseErr);
      return error('Invalid request body', 400);
    }
    const { accountId } = body;
    
    const prisma = getPrismaClient();
    
    // Check if organization is in demo mode (FAIL-SAFE: returns false on any error)
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    if (isDemo === true) {
      logger.info('🎭 Returning demo RI/SP data', { organizationId });
      const demoData = generateDemoRISPAnalysis();
      return success({
        ...demoData,
        success: true,
        hasData: true,
      });
    }
    
    if (!accountId) {
      return error('Missing required parameter: accountId', 400);
    }

    // SWR Cache - return cached data instantly if fresh
    const cacheKey = `risp:${organizationId}:${accountId}`;
    const cached = await cacheManager.getSWR<any>(cacheKey, { prefix: 'cost' });
    if (cached && !cached.stale) {
      logger.info('RI/SP data cache hit (fresh)', { organizationId });
      return success({ ...cached.data, _fromCache: true });
    }

    // Verify account belongs to organization
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found', 404);
    }
    
    // Fetch all data in parallel
    const [reservedInstances, savingsPlans, recommendations] = await Promise.all([
      prisma.reservedInstance.findMany({
        where: {
          organization_id: organizationId,
          aws_account_id: accountId,
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.savingsPlan.findMany({
        where: {
          organization_id: organizationId,
          aws_account_id: accountId,
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.riSpRecommendation.findMany({
        where: {
          organization_id: organizationId,
          aws_account_id: accountId,
          status: 'active',
        },
        orderBy: [
          { priority: 'asc' },
          { estimated_annual_savings: 'desc' },
        ],
      }),
    ]);
    
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
    
    const totalRISavings = activeRIs.reduce((sum, ri) => {
      let savings = ri.net_savings || 0;
      // Normalize legacy data: if net_savings was calculated over the full RI duration
      // instead of monthly, divide by the number of months in the RI term
      const durationMonths = ri.duration_seconds ? ri.duration_seconds / (30.44 * 24 * 3600) : 0;
      if (durationMonths > 1.5 && savings > 0) {
        // Savings was likely calculated for the full term, normalize to monthly
        const monthlyHours = 730;
        const totalHours = ri.duration_seconds / 3600;
        if (totalHours > monthlyHours * 1.5) {
          savings = savings * (monthlyHours / totalHours);
        }
      }
      return sum + savings;
    }, 0);
    const totalSPSavings = activeSPs.reduce((sum, sp) => sum + (sp.net_savings || 0), 0);
    
    // BUG FIX: Sum monthly savings from recommendations, not annual
    const totalMonthlySavings = recommendations.reduce((sum, rec) => sum + (rec.estimated_monthly_savings || 0), 0);
    
    // Calculate coverage (simplified - based on active commitments)
    const overallCoverage = activeRIs.length > 0 && activeSPs.length > 0
      ? (avgRIUtilization + avgSPUtilization) / 2
      : activeRIs.length > 0 ? avgRIUtilization
      : activeSPs.length > 0 ? avgSPUtilization
      : 0;
    
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
      potentialAnnualSavings: totalMonthlySavings * 12,
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
        `Economia potencial anual: ${(totalMonthlySavings * 12).toFixed(2)}`,
      ],
    };
    
    logger.info(`✅ Retrieved RI/SP data: ${reservedInstances.length} RIs, ${savingsPlans.length} SPs, ${recommendations.length} recommendations`);
    
    const responseData = {
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
          monthlyCost: (ri.usage_price || 0) * HOURS_PER_MONTH,
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
          monthlyCost: (ri.usage_price || 0) * HOURS_PER_MONTH,
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
          start: sp.start_date ? new Date(sp.start_date).toISOString() : '',
          end: sp.end_date ? new Date(sp.end_date).toISOString() : '',
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
        monthly: totalMonthlySavings,
        annual: totalMonthlySavings * 12,
        maxPercentage: transformedRecommendations.length > 0
          ? Math.max(...transformedRecommendations.map(r => r.potentialSavings.percentage || 0))
          : 0,
      },
      analysisMetadata: {
        accountId,
        timestamp: (() => {
          try {
            if (recommendations[0]?.generated_at) return new Date(recommendations[0].generated_at).toISOString();
            if (recommendations[0]?.created_at) return new Date(recommendations[0].created_at).toISOString();
            if (reservedInstances[0]?.updated_at) return new Date(reservedInstances[0].updated_at).toISOString();
            return new Date().toISOString();
          } catch { return new Date().toISOString(); }
        })(),
        dataSource: 'database',
      },
    };

    // Save to SWR cache (freshFor: 600s = 10min, maxTTL: 24h)
    await cacheManager.setSWR(cacheKey, responseData, { prefix: 'cost', freshFor: 600, maxTTL: 86400 });

    return success(responseData);
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    logger.error('❌ Get RI/SP Data error:', { message: errorMessage, stack: errorStack });
    return error('An unexpected error occurred. Please try again.', 500);
  }
}
