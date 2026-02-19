/**
 * Lambda handler para gerenciar orçamentos cloud (CRUD)
 * GET: retorna budget do mês atual
 * POST: cria/atualiza budget
 * 
 * Auto-fill: quando não existe budget, calcula 85% do gasto do mês anterior
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import type { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { parseEventBody } from '../../lib/request-parser.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { ensureNotDemoMode } from '../../lib/demo-data-service.js';

/** Auto-budget ratio: suggest 85% of previous month's spend */
const AUTO_BUDGET_RATIO = 0.85;
const MAX_BUDGET_MONTHS = 12;

interface BudgetRequest {
  action?: 'get' | 'save' | 'list';
  provider?: string;
  year_month?: string;
  amount?: number;
}

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPreviousYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** Returns Prisma where clause for filtering DailyCost by cloud provider */
function getProviderFilter(provider: string) {
  return provider === 'AZURE'
    ? { cloud_provider: 'AZURE' as const }
    : { OR: [{ cloud_provider: 'AWS' as const }, { cloud_provider: null }] };
}

/** Returns date range (first day, last day) for a given year-month string */
function getMonthDateRange(yearMonth: string): { startDate: Date; endDate: Date } {
  const [year, month] = yearMonth.split('-').map(Number);
  return {
    startDate: new Date(year, month - 1, 1),
    endDate: new Date(year, month, 0),
  };
}

/** Aggregates total spend for a given org/provider/month */
async function getMonthlySpend(
  prisma: PrismaClient,
  organizationId: string,
  provider: string,
  yearMonth: string
): Promise<number> {
  const { startDate, endDate } = getMonthDateRange(yearMonth);
  const result = await prisma.dailyCost.aggregate({
    where: {
      organization_id: organizationId,
      date: { gte: startDate, lte: endDate },
      ...getProviderFilter(provider),
    },
    _sum: { cost: true },
  });
  return Number(result._sum?.cost || 0);
}

/**
 * Calcula o budget automático baseado no gasto do mês anterior
 */
async function calculateAutoBudget(
  prisma: PrismaClient,
  organizationId: string,
  provider: string,
  yearMonth: string
): Promise<number | null> {
  const prevMonth = getPreviousYearMonth(yearMonth);
  const prevTotal = await getMonthlySpend(prisma, organizationId, provider, prevMonth);
  if (prevTotal <= 0) return null;
  return Math.round(prevTotal * AUTO_BUDGET_RATIO * 100) / 100;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') return corsOptions();

  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  const prisma = getPrismaClient();

  try {
    const body = parseEventBody<BudgetRequest>(event, {} as BudgetRequest, 'manage-cloud-budget');
    const action = body.action || 'get';
    const provider = (body.provider || 'AWS').toUpperCase();
    const yearMonth = body.year_month || getCurrentYearMonth();

    if (action === 'list') {
      // Generate last 12 months list
      const now = new Date();
      const allMonths: string[] = [];
      for (let i = 0; i < MAX_BUDGET_MONTHS; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        allMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      // Fetch existing budgets
      const budgets = await prisma.cloudBudget.findMany({
        where: {
          organization_id: organizationId,
          cloud_provider: provider,
        },
        orderBy: { year_month: 'desc' },
        take: MAX_BUDGET_MONTHS,
      });

      const budgetMap = new Map<string, typeof budgets[number]>();
      for (const b of budgets) {
        budgetMap.set(b.year_month, b);
      }

      // Return all 12 months with actual_spend using a single aggregated query
      const { startDate: rangeStart } = getMonthDateRange(allMonths[allMonths.length - 1]);
      const { endDate: rangeEnd } = getMonthDateRange(allMonths[0]);

      const monthlySpends = provider === 'AZURE'
        ? await prisma.$queryRaw<Array<{ ym: string; total: number }>>`
            SELECT to_char(date, 'YYYY-MM') as ym, COALESCE(SUM(cost), 0)::float as total
            FROM daily_costs
            WHERE organization_id = ${organizationId}::uuid
              AND date >= ${rangeStart} AND date <= ${rangeEnd}
              AND cloud_provider = 'AZURE'
            GROUP BY ym`
        : await prisma.$queryRaw<Array<{ ym: string; total: number }>>`
            SELECT to_char(date, 'YYYY-MM') as ym, COALESCE(SUM(cost), 0)::float as total
            FROM daily_costs
            WHERE organization_id = ${organizationId}::uuid
              AND date >= ${rangeStart} AND date <= ${rangeEnd}
              AND (cloud_provider = 'AWS' OR cloud_provider IS NULL)
            GROUP BY ym`;

      const spendMap = new Map<string, number>();
      for (const row of monthlySpends) {
        spendMap.set(row.ym, row.total);
      }

      const budgetsWithSpend = allMonths.map((ym) => {
        const b = budgetMap.get(ym);
        return {
          id: b?.id || null,
          year_month: ym,
          cloud_provider: provider,
          amount: b?.amount || 0,
          currency: b?.currency || 'USD',
          source: b?.source || null,
          actual_spend: spendMap.get(ym) || 0,
          updated_at: b?.updated_at || null,
        };
      });

      return success({ budgets: budgetsWithSpend, provider });
    }

    if (action === 'get') {
      // Buscar budget existente
      let budget = await prisma.cloudBudget.findUnique({
        where: {
          organization_id_cloud_provider_year_month: {
            organization_id: organizationId,
            cloud_provider: provider,
            year_month: yearMonth,
          },
        },
      });

      // Se não existe, tenta auto-fill com 85% do mês anterior
      if (!budget) {
        const autoAmount = await calculateAutoBudget(prisma, organizationId, provider, yearMonth);
        if (autoAmount !== null) {
          budget = await prisma.cloudBudget.create({
            data: {
              organization_id: organizationId,
              cloud_provider: provider,
              year_month: yearMonth,
              amount: autoAmount,
              source: 'auto',
              created_by: user.sub,
            },
          });
          logger.info('Auto-filled budget from previous month', {
            organizationId, provider, yearMonth, amount: autoAmount,
          });
        }
      }

      // Always include actual_spend so the frontend can display real costs
      const actualSpend = await getMonthlySpend(prisma, organizationId, provider, yearMonth);

      return success({
        budget: budget ? {
          id: budget.id,
          amount: budget.amount,
          currency: budget.currency,
          source: budget.source,
          year_month: budget.year_month,
          cloud_provider: budget.cloud_provider,
        } : null,
        actual_spend: actualSpend,
        year_month: yearMonth,
        provider,
      });
    }

    if (action === 'save') {
      // SECURITY: Block write operations in demo mode
      const demoCheck = await ensureNotDemoMode(prisma, organizationId);
      if (demoCheck.blocked) return demoCheck.response;

      if (body.amount === undefined || body.amount < 0) {
        return error('Amount is required and must be >= 0', 400);
      }

      const budget = await prisma.cloudBudget.upsert({
        where: {
          organization_id_cloud_provider_year_month: {
            organization_id: organizationId,
            cloud_provider: provider,
            year_month: yearMonth,
          },
        },
        create: {
          organization_id: organizationId,
          cloud_provider: provider,
          year_month: yearMonth,
          amount: body.amount,
          currency: 'USD',
          source: 'manual',
          created_by: user.sub,
        },
        update: {
          amount: body.amount,
          source: 'manual',
          created_by: user.sub,
        },
      });

      logAuditAsync({
        organizationId,
        userId: user.sub,
        action: 'BUDGET_UPDATE',
        resourceType: 'cloud_budget',
        resourceId: budget.id,
        details: { provider, yearMonth, amount: body.amount },
        ipAddress: getIpFromEvent(event),
        userAgent: getUserAgentFromEvent(event),
      });

      logger.info('Budget saved', { organizationId, provider, yearMonth, amount: body.amount });

      const actualSpend = await getMonthlySpend(prisma, organizationId, provider, yearMonth);

      return success({
        budget: {
          id: budget.id,
          amount: budget.amount,
          currency: budget.currency,
          source: budget.source,
          year_month: budget.year_month,
          cloud_provider: budget.cloud_provider,
        },
        actual_spend: actualSpend,
      });
    }

    return error('Invalid action. Use "get", "save" or "list"', 400);
  } catch (err: any) {
    logger.error('manage-cloud-budget error', err, { organizationId });
    return error('Failed to manage budget', 500);
  }
}
