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
import { logger } from '../../lib/logger.js';
import { parseEventBody } from '../../lib/request-parser.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { ensureNotDemoMode } from '../../lib/demo-data-service.js';

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

/**
 * Calcula o budget automático: 85% do gasto do mês anterior
 */
async function calculateAutoBudget(
  prisma: any,
  organizationId: string,
  provider: string,
  yearMonth: string
): Promise<number | null> {
  const prevMonth = getPreviousYearMonth(yearMonth);
  const [year, month] = prevMonth.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // último dia do mês

  const providerFilter = provider === 'AZURE'
    ? { cloud_provider: 'AZURE' as const }
    : { cloud_provider: { in: ['AWS', null] as any } };

  const result = await prisma.dailyCost.aggregate({
    where: {
      organization_id: organizationId,
      date: { gte: startDate, lte: endDate },
      ...providerFilter,
    },
    _sum: { cost: true },
  });

  const prevTotal = Number(result._sum?.cost || 0);
  if (prevTotal <= 0) return null;

  // 85% do gasto do mês anterior como sugestão de budget
  return Math.round(prevTotal * 0.85 * 100) / 100;
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
      // Listar budgets dos últimos 12 meses
      const budgets = await prisma.cloudBudget.findMany({
        where: {
          organization_id: organizationId,
          cloud_provider: provider,
        },
        orderBy: { year_month: 'desc' },
        take: 12,
      });

      // Buscar gastos reais para cada mês
      const budgetsWithSpend = await Promise.all(
        budgets.map(async (b: any) => {
          const [y, m] = b.year_month.split('-').map(Number);
          const startDate = new Date(y, m - 1, 1);
          const endDate = new Date(y, m, 0);
          const provFilter = provider === 'AZURE'
            ? { cloud_provider: 'AZURE' as const }
            : { cloud_provider: { in: ['AWS', null] as any } };
          const spend = await prisma.dailyCost.aggregate({
            where: {
              organization_id: organizationId,
              date: { gte: startDate, lte: endDate },
              ...provFilter,
            },
            _sum: { cost: true },
          });
          return {
            id: b.id,
            year_month: b.year_month,
            cloud_provider: b.cloud_provider,
            amount: b.amount,
            currency: b.currency,
            source: b.source,
            actual_spend: Number(spend._sum?.cost || 0),
            updated_at: b.updated_at,
          };
        })
      );

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

      return success({
        budget: budget ? {
          id: budget.id,
          amount: budget.amount,
          currency: budget.currency,
          source: budget.source,
          year_month: budget.year_month,
          cloud_provider: budget.cloud_provider,
        } : null,
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

      return success({
        budget: {
          id: budget.id,
          amount: budget.amount,
          currency: budget.currency,
          source: budget.source,
          year_month: budget.year_month,
          cloud_provider: budget.cloud_provider,
        },
      });
    }

    return error('Invalid action. Use "get", "save" or "list"', 400);
  } catch (err: any) {
    logger.error('manage-cloud-budget error', err, { organizationId });
    return error('Failed to manage budget', 500);
  }
}
