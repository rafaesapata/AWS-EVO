"use strict";
/**
 * Lambda handler para debug - verificar dados de daily_costs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
async function handler(event, context) {
    if (event.requestContext?.http?.method === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const prisma = (0, database_js_1.getPrismaClient)();
        logging_js_1.logger.info('Debug daily costs started', { organizationId });
        // 1. Contar total de registros
        const totalCount = await prisma.dailyCost.count({
            where: {
                organization_id: organizationId
            }
        });
        // 2. Buscar registros mais recentes
        const recentCosts = await prisma.dailyCost.findMany({
            where: {
                organization_id: organizationId
            },
            orderBy: {
                date: 'desc'
            },
            take: 10,
            select: {
                id: true,
                date: true,
                service: true,
                cost: true,
                aws_account_id: true,
                created_at: true
            }
        });
        // 3. Verificar contas AWS
        const awsAccounts = await prisma.awsCredential.findMany({
            where: {
                organization_id: organizationId,
                is_active: true
            },
            select: {
                id: true,
                account_name: true,
                account_id: true
            }
        });
        // 4. Contar registros por conta
        const costsByAccount = [];
        for (const account of awsAccounts) {
            const accountCosts = await prisma.dailyCost.count({
                where: {
                    organization_id: organizationId,
                    aws_account_id: account.id
                }
            });
            costsByAccount.push({
                accountId: account.id,
                accountName: account.account_name,
                awsAccountId: account.account_id,
                costsCount: accountCosts
            });
        }
        // 5. Verificar período de dados
        const dateRange = await prisma.dailyCost.aggregate({
            where: {
                organization_id: organizationId
            },
            _min: {
                date: true
            },
            _max: {
                date: true
            }
        });
        // 6. Testar query similar à do frontend
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        const startDateStr = last30Days.toISOString().split('T')[0];
        const endDateStr = new Date().toISOString().split('T')[0];
        const frontendQuery = await prisma.dailyCost.findMany({
            where: {
                organization_id: organizationId,
                date: {
                    gte: new Date(startDateStr),
                    lte: new Date(endDateStr)
                }
            },
            orderBy: {
                date: 'desc'
            },
            take: 5
        });
        const debugInfo = {
            organizationId,
            totalRecords: totalCount,
            awsAccounts,
            costsByAccount,
            dateRange: {
                min: dateRange._min.date?.toISOString().split('T')[0],
                max: dateRange._max.date?.toISOString().split('T')[0]
            },
            recentCosts: recentCosts.map(cost => ({
                date: cost.date.toISOString().split('T')[0],
                service: cost.service,
                cost: cost.cost,
                accountId: cost.aws_account_id,
                createdAt: cost.created_at
            })),
            frontendQueryTest: {
                queryPeriod: { start: startDateStr, end: endDateStr },
                resultsCount: frontendQuery.length,
                results: frontendQuery.map(cost => ({
                    date: cost.date.toISOString().split('T')[0],
                    service: cost.service,
                    cost: cost.cost,
                    accountId: cost.aws_account_id
                }))
            }
        };
        logging_js_1.logger.info('Debug daily costs completed', debugInfo);
        return (0, response_js_1.success)(debugInfo);
    }
    catch (err) {
        logging_js_1.logger.error('Debug daily costs error', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=check-daily-costs.js.map