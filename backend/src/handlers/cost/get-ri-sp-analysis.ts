/**
 * Get RI/SP Analysis from Database
 * 
 * Retrieves saved Reserved Instances, Savings Plans, Recommendations, and Utilization History
 * from the database.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

interface GetRiSpAnalysisInput {
  accountId: string;
  includeHistory?: boolean;
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();

    const body: GetRiSpAnalysisInput = JSON.parse(event.body || '{}');
    const { accountId, includeHistory = false } = body;

    if (!accountId) {
      return error('Missing required field: accountId', 400);
    }

    logger.info('Fetching RI/SP analysis from database', {
      organizationId,
      accountId,
      includeHistory,
    });

    // Fetch Reserved Instances
    const reservedInstances = await prisma.reservedInstance.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
      },
      orderBy: {
        last_analyzed_at: 'desc',
      },
    });

    // Fetch Savings Plans
    const savingsPlans = await prisma.savingsPlan.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
      },
      orderBy: {
        last_analyzed_at: 'desc',
      },
    });

    // Fetch Active Recommendations
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

    // Fetch Utilization History (last 90 days)
    let utilizationHistory: any[] = [];
    if (includeHistory) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      utilizationHistory = await prisma.riSpUtilizationHistory.findMany({
        where: {
          organization_id: organizationId,
          aws_account_id: accountId,
          period_start: {
            gte: ninetyDaysAgo,
          },
        },
        orderBy: {
          period_start: 'desc',
        },
      });
    }

    // Calculate summary metrics
    const riCount = reservedInstances.length;
    const spCount = savingsPlans.length;
    const activeRiCount = reservedInstances.filter(ri => ri.state === 'active').length;
    const activeSpCount = savingsPlans.filter(sp => sp.state === 'active').length;

    const avgRiUtilization = riCount > 0
      ? reservedInstances.reduce((sum, ri) => sum + (ri.utilization_percentage || 0), 0) / riCount
      : 0;

    const avgSpUtilization = spCount > 0
      ? savingsPlans.reduce((sum, sp) => sum + (sp.utilization_percentage || 0), 0) / spCount
      : 0;

    const avgSpCoverage = spCount > 0
      ? savingsPlans.reduce((sum, sp) => sum + (sp.coverage_percentage || 0), 0) / spCount
      : 0;

    const totalRiSavings = reservedInstances.reduce((sum, ri) => sum + (ri.net_savings || 0), 0);
    const totalSpSavings = savingsPlans.reduce((sum, sp) => sum + (sp.net_savings || 0), 0);

    const totalPotentialAnnualSavings = recommendations.reduce(
      (sum, rec) => sum + (rec.estimated_annual_savings || 0),
      0
    );

    // Find underutilized RIs (< 75%)
    const underutilizedRis = reservedInstances.filter(
      ri => ri.state === 'active' && (ri.utilization_percentage || 0) < 75
    );

    // Find underutilized SPs (< 75%)
    const underutilizedSps = savingsPlans.filter(
      sp => sp.state === 'active' && (sp.utilization_percentage || 0) < 75
    );

    const hasData = riCount > 0 || spCount > 0 || recommendations.length > 0;

    const response = {
      success: true,
      hasData,
      analyzedAt: reservedInstances[0]?.last_analyzed_at || savingsPlans[0]?.last_analyzed_at || new Date(),
      
      executiveSummary: {
        status: hasData ? 'analyzed' : 'no_data',
        totalCommitments: riCount + spCount,
        coverageScore: avgSpCoverage,
        potentialAnnualSavings: totalPotentialAnnualSavings,
        recommendationsSummary: {
          total: recommendations.length,
          critical: recommendations.filter(r => r.priority === 1).length,
          high: recommendations.filter(r => r.priority === 2).length,
          quickWins: recommendations.filter(r => r.implementation_effort === 'low').length,
        },
      },

      reservedInstances: {
        total: riCount,
        count: riCount,
        active: activeRiCount,
        averageUtilization: avgRiUtilization,
        totalMonthlySavings: totalRiSavings / 12,
        underutilized: underutilizedRis.map(ri => ({
          id: ri.reserved_instance_id,
          instanceType: ri.instance_type,
          utilization: ri.utilization_percentage,
          potentialWaste: (ri.on_demand_cost_equivalent || 0) * (1 - (ri.utilization_percentage || 0) / 100),
        })),
        underutilizedCount: underutilizedRis.length,
      },

      savingsPlans: {
        total: spCount,
        count: spCount,
        active: activeSpCount,
        averageUtilization: avgSpUtilization,
        averageCoverage: avgSpCoverage,
        totalMonthlySavings: totalSpSavings / 12,
        underutilized: underutilizedSps.map(sp => ({
          id: sp.savings_plan_id,
          type: sp.savings_plan_type,
          utilization: sp.utilization_percentage,
          unusedCommitment: sp.unused_commitment,
        })),
      },

      recommendations: recommendations.map(rec => {
        // Extract title and description from recommendation_details if available
        const details = rec.recommendation_details as Record<string, any> || {};
        
        // Generate title based on type if not in details
        const getTitle = () => {
          if (details.title) return details.title;
          switch (rec.recommendation_type) {
            case 'ri_purchase':
              return `Adquirir Reserved Instance para ${rec.service || 'EC2'}`;
            case 'sp_purchase':
              return `Implementar Savings Plan para ${rec.service || 'Compute'}`;
            case 'right_sizing':
              return `Right-Sizing de ${rec.instance_type || 'Instâncias'}`;
            case 'spot_instances':
              return 'Considerar Spot Instances';
            default:
              return `Otimização de ${rec.service || 'Custos'}`;
          }
        };
        
        // Generate description based on type if not in details
        const getDescription = () => {
          if (details.description) return details.description;
          const savings = rec.estimated_annual_savings || 0;
          switch (rec.recommendation_type) {
            case 'ri_purchase':
              return `Reserved Instances de 1 ano podem economizar ~31% em ${rec.service || 'EC2'}. Economia estimada: $${savings.toFixed(0)}/ano.`;
            case 'sp_purchase':
              return `Savings Plans oferecem economia flexível de ~22% em EC2, Lambda e Fargate. Economia estimada: $${savings.toFixed(0)}/ano.`;
            case 'right_sizing':
              return `Instâncias subutilizadas podem ser redimensionadas para economizar ~50%. Economia estimada: $${savings.toFixed(0)}/ano.`;
            case 'spot_instances':
              return `Workloads tolerantes a falhas podem usar Spot Instances com economia de até 70%. Economia estimada: $${savings.toFixed(0)}/ano.`;
            default:
              return `Oportunidade de otimização identificada. Economia estimada: $${savings.toFixed(0)}/ano.`;
          }
        };
        
        // Map implementation effort to difficulty
        const getDifficulty = () => {
          if (details.implementation?.difficulty) return details.implementation.difficulty;
          switch (rec.implementation_effort) {
            case 'low': return 'easy';
            case 'medium': return 'medium';
            case 'high': return 'hard';
            default: return 'medium';
          }
        };
        
        return {
          type: rec.recommendation_type,
          service: rec.service,
          instanceType: rec.instance_type,
          savingsPlanType: rec.savings_plan_type,
          priority: rec.priority,
          title: getTitle(),
          description: getDescription(),
          potentialSavings: {
            monthly: rec.estimated_monthly_savings,
            annual: rec.estimated_annual_savings,
          },
          annualSavings: rec.estimated_annual_savings,
          confidence: rec.confidence_level,
          implementationEffort: rec.implementation_effort,
          implementation: details.implementation || {
            difficulty: getDifficulty(),
            timeToImplement: rec.implementation_effort === 'low' ? '30 minutos' : rec.implementation_effort === 'high' ? '4-6 horas' : '1-2 horas',
          },
          details: rec.recommendation_details,
        };
      }),

      coverage: {
        reservedInstances: avgRiUtilization,
        savingsPlans: avgSpCoverage,
        overall: (avgRiUtilization + avgSpCoverage) / 2,
      },

      potentialSavings: {
        monthly: totalPotentialAnnualSavings / 12,
        annual: totalPotentialAnnualSavings,
      },

      ...(includeHistory && {
        utilizationHistory: utilizationHistory.map(h => ({
          resourceType: h.resource_type,
          resourceId: h.resource_id,
          periodStart: h.period_start,
          periodEnd: h.period_end,
          utilizationPercentage: h.utilization_percentage,
          coveragePercentage: h.coverage_percentage,
          netSavings: h.net_savings,
        })),
      }),
    };

    logger.info('RI/SP analysis fetched successfully', {
      riCount,
      spCount,
      recommendationsCount: recommendations.length,
    });

    return success(response);

  } catch (err) {
    logger.error('Error fetching RI/SP analysis', err as Error);
    return error('Failed to fetch RI/SP analysis');
  }
}
