/**
 * Lambda handler para sugestão de orçamento por IA
 * Calcula orçamento sugerido baseado em gasto do mês anterior e savings propostos
 * de cost-optimization, waste-detection e RI/SP recommendations.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { parseEventBody } from '../../lib/request-parser.js';

/** Fator de realização: 75% dos savings propostos são realizáveis */
const REALIZATION_FACTOR = 0.75;
/** Fallback: 85% do gasto anterior quando suggested <= 0 */
const FALLBACK_RATIO = 0.85;
/** Janela de lookback para savings recentes (30 dias) */
const SAVINGS_LOOKBACK_DAYS = 30;

interface AISuggestionRequest {
  provider?: string; // 'AWS' | 'AZURE', default 'AWS'
}

interface AISuggestionResponse {
  suggested_amount: number;
  previous_month_spend: number;
  total_proposed_savings: number;
  realization_factor: number;
  savings_breakdown: {
    cost_optimization: number;
    waste_detection: number;
    ri_sp_optimization: number;
  };
  calculation: string;
  data_available: boolean;
}

/**
 * Returns the previous closed month's year-month string and date range.
 */
function getPreviousClosedMonth(): { yearMonth: string; startDate: Date; endDate: Date } {
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const yearMonth = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
  return {
    yearMonth,
    startDate: new Date(prevYear, prevMonth, 1),
    endDate: new Date(prevYear, prevMonth + 1, 0), // last day of prev month
  };
}

/**
 * Returns Prisma where clause for filtering by cloud provider on daily_costs.
 */
function getProviderFilter(provider: string) {
  return provider === 'AZURE'
    ? { cloud_provider: 'AZURE' as const }
    : { OR: [{ cloud_provider: 'AWS' as const }, { cloud_provider: null }] };
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') return corsOptions();

  const prisma = getPrismaClient();

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const body = parseEventBody<AISuggestionRequest>(event, {} as AISuggestionRequest, 'ai-budget-suggestion');
    const provider = (body.provider || 'AWS').toUpperCase();

    // 1. Gasto total do mês anterior fechado
    const { yearMonth, startDate, endDate } = getPreviousClosedMonth();

    const spendResult = await prisma.dailyCost.aggregate({
      where: {
        organization_id: organizationId,
        date: { gte: startDate, lte: endDate },
        ...getProviderFilter(provider),
      },
      _sum: { cost: true },
    });
    const previousMonthSpend = Number(spendResult._sum?.cost || 0);

    // Se não há dados do mês anterior, retornar data_available: false
    if (previousMonthSpend <= 0) {
      logger.info('AI suggestion: no previous month data', { organizationId, provider, yearMonth });
      return success({
        suggested_amount: 0,
        previous_month_spend: 0,
        total_proposed_savings: 0,
        realization_factor: REALIZATION_FACTOR,
        savings_breakdown: {
          cost_optimization: 0,
          waste_detection: 0,
          ri_sp_optimization: 0,
        },
        calculation: 'Insufficient data from previous month',
        data_available: false,
      } satisfies AISuggestionResponse);
    }

    // 2. Savings propostos (últimos 30 dias)
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - SAVINGS_LOOKBACK_DAYS);

    // 2a. Cost optimizations: SUM(potential_savings)
    const costOptResult = await prisma.costOptimization.aggregate({
      where: {
        organization_id: organizationId,
        created_at: { gte: lookbackDate },
      },
      _sum: { potential_savings: true },
    });
    const costOptSavings = Number(costOptResult._sum?.potential_savings || 0);

    // 2b. Waste detections: SUM(estimated_savings)
    const wasteResult = await prisma.wasteDetection.aggregate({
      where: {
        organization_id: organizationId,
        detected_at: { gte: lookbackDate },
      },
      _sum: { estimated_savings: true },
    });
    const wasteSavings = Number(wasteResult._sum?.estimated_savings || 0);

    // 2c. RI/SP recommendations: SUM(estimated_monthly_savings)
    const riSpResult = await prisma.riSpRecommendation.aggregate({
      where: {
        organization_id: organizationId,
        created_at: { gte: lookbackDate },
      },
      _sum: { estimated_monthly_savings: true },
    });
    const riSpSavings = Number(riSpResult._sum?.estimated_monthly_savings || 0);

    // 3. Cálculo
    const totalSavings = costOptSavings + wasteSavings + riSpSavings;
    let suggestedAmount = previousMonthSpend - (totalSavings * REALIZATION_FACTOR);

    // 4. Fallback: se suggested <= 0, usar 85% do gasto anterior
    let calculation: string;
    if (suggestedAmount <= 0) {
      suggestedAmount = previousMonthSpend * FALLBACK_RATIO;
      calculation = `Fallback: $${previousMonthSpend.toFixed(2)} × ${FALLBACK_RATIO} = $${suggestedAmount.toFixed(2)} (savings exceeded spend)`;
    } else {
      calculation = `$${previousMonthSpend.toFixed(2)} - ($${totalSavings.toFixed(2)} × ${REALIZATION_FACTOR}) = $${suggestedAmount.toFixed(2)}`;
    }

    // Arredondar para 2 casas decimais, garantir mínimo de $0.01
    suggestedAmount = Math.max(0.01, Math.round(suggestedAmount * 100) / 100);

    logger.info('AI budget suggestion calculated', {
      organizationId, provider, yearMonth,
      previousMonthSpend, totalSavings, suggestedAmount,
    });

    return success({
      suggested_amount: suggestedAmount,
      previous_month_spend: previousMonthSpend,
      total_proposed_savings: totalSavings,
      realization_factor: REALIZATION_FACTOR,
      savings_breakdown: {
        cost_optimization: costOptSavings,
        waste_detection: wasteSavings,
        ri_sp_optimization: riSpSavings,
      },
      calculation,
      data_available: true,
    } satisfies AISuggestionResponse);
  } catch (err: any) {
    logger.error('ai-budget-suggestion error', err);
    return error('Failed to calculate AI budget suggestion', 500);
  }
}
