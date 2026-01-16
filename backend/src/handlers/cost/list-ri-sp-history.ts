/**
 * List RI/SP Analysis History
 * 
 * Returns a list of all RI/SP analysis executions with summary metrics.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

interface ListRiSpHistoryInput {
  accountId: string;
  limit?: number;
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

    const body: ListRiSpHistoryInput = JSON.parse(event.body || '{}');
    const { accountId, limit = 50 } = body;

    if (!accountId) {
      return error('Missing required field: accountId', 400);
    }

    logger.info('Fetching RI/SP analysis history', {
      organizationId,
      accountId,
      limit,
    });

    // Get distinct analysis timestamps from Reserved Instances
    const riAnalyses = await prisma.reservedInstance.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
        last_analyzed_at: {
          not: null,
        },
      },
      select: {
        last_analyzed_at: true,
        utilization_percentage: true,
        net_savings: true,
        state: true,
      },
      orderBy: {
        last_analyzed_at: 'desc',
      },
      take: limit,
    });

    // Get distinct analysis timestamps from Savings Plans
    const spAnalyses = await prisma.savingsPlan.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
        last_analyzed_at: {
          not: null,
        },
      },
      select: {
        last_analyzed_at: true,
        utilization_percentage: true,
        coverage_percentage: true,
        net_savings: true,
        state: true,
      },
      orderBy: {
        last_analyzed_at: 'desc',
      },
      take: limit,
    });

    // Get recommendations history
    const recommendationsHistory = await prisma.riSpRecommendation.findMany({
      where: {
        organization_id: organizationId,
        aws_account_id: accountId,
      },
      select: {
        generated_at: true,
        status: true,
        estimated_annual_savings: true,
        recommendation_type: true,
      },
      orderBy: {
        generated_at: 'desc',
      },
      take: limit,
    });

    // Group by analysis date
    const analysisMap = new Map<string, any>();

    // Process RI analyses
    for (const ri of riAnalyses) {
      if (!ri.last_analyzed_at) continue;
      
      const dateKey = ri.last_analyzed_at.toISOString().split('T')[0];
      if (!analysisMap.has(dateKey)) {
        analysisMap.set(dateKey, {
          date: ri.last_analyzed_at,
          riCount: 0,
          spCount: 0,
          activeRiCount: 0,
          activeSpCount: 0,
          avgRiUtilization: 0,
          avgSpUtilization: 0,
          avgSpCoverage: 0,
          totalSavings: 0,
          recommendationsCount: 0,
          potentialSavings: 0,
          riUtilizations: [],
          spUtilizations: [],
          spCoverages: [],
          riSavings: [],
          spSavings: [],
        });
      }

      const entry = analysisMap.get(dateKey);
      entry.riCount++;
      if (ri.state === 'active') entry.activeRiCount++;
      if (ri.utilization_percentage) entry.riUtilizations.push(ri.utilization_percentage);
      if (ri.net_savings) {
        entry.riSavings.push(ri.net_savings);
        entry.totalSavings += ri.net_savings;
      }
    }

    // Process SP analyses
    for (const sp of spAnalyses) {
      if (!sp.last_analyzed_at) continue;
      
      const dateKey = sp.last_analyzed_at.toISOString().split('T')[0];
      if (!analysisMap.has(dateKey)) {
        analysisMap.set(dateKey, {
          date: sp.last_analyzed_at,
          riCount: 0,
          spCount: 0,
          activeRiCount: 0,
          activeSpCount: 0,
          avgRiUtilization: 0,
          avgSpUtilization: 0,
          avgSpCoverage: 0,
          totalSavings: 0,
          recommendationsCount: 0,
          potentialSavings: 0,
          riUtilizations: [],
          spUtilizations: [],
          spCoverages: [],
          riSavings: [],
          spSavings: [],
        });
      }

      const entry = analysisMap.get(dateKey);
      entry.spCount++;
      if (sp.state === 'active') entry.activeSpCount++;
      if (sp.utilization_percentage) entry.spUtilizations.push(sp.utilization_percentage);
      if (sp.coverage_percentage) entry.spCoverages.push(sp.coverage_percentage);
      if (sp.net_savings) {
        entry.spSavings.push(sp.net_savings);
        entry.totalSavings += sp.net_savings;
      }
    }

    // Process recommendations
    for (const rec of recommendationsHistory) {
      const dateKey = rec.generated_at.toISOString().split('T')[0];
      if (analysisMap.has(dateKey)) {
        const entry = analysisMap.get(dateKey);
        if (rec.status === 'active') {
          entry.recommendationsCount++;
          entry.potentialSavings += rec.estimated_annual_savings || 0;
        }
      }
    }

    // Calculate averages and format results
    const history = Array.from(analysisMap.values())
      .map(entry => {
        entry.avgRiUtilization = entry.riUtilizations.length > 0
          ? entry.riUtilizations.reduce((a: number, b: number) => a + b, 0) / entry.riUtilizations.length
          : 0;
        
        entry.avgSpUtilization = entry.spUtilizations.length > 0
          ? entry.spUtilizations.reduce((a: number, b: number) => a + b, 0) / entry.spUtilizations.length
          : 0;
        
        entry.avgSpCoverage = entry.spCoverages.length > 0
          ? entry.spCoverages.reduce((a: number, b: number) => a + b, 0) / entry.spCoverages.length
          : 0;

        // Remove temporary arrays
        delete entry.riUtilizations;
        delete entry.spUtilizations;
        delete entry.spCoverages;
        delete entry.riSavings;
        delete entry.spSavings;

        return entry;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, limit);

    logger.info('RI/SP analysis history fetched successfully', {
      historyCount: history.length,
    });

    return success({
      history,
      total: history.length,
    });

  } catch (err) {
    logger.error('Error fetching RI/SP analysis history', err as Error);
    return error('Failed to fetch RI/SP analysis history');
  }
}
