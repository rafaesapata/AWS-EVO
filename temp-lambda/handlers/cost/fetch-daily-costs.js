"use strict";
/**
 * Lambda handler for Fetch Daily Costs
 * AWS Lambda Handler for fetch-daily-costs
 *
 * Busca custos diários da AWS usando Cost Explorer API
 * Suporta busca incremental - busca apenas datas que ainda não estão no banco
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const logging_js_1 = require("../../lib/logging.js");
const middleware_js_1 = require("../../lib/middleware.js");
const schemas_js_1 = require("../../lib/schemas.js");
const client_cost_explorer_1 = require("@aws-sdk/client-cost-explorer");
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    logging_js_1.logger.info('Fetch Daily Costs started', { requestId: context.awsRequestId });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        // Validar input com Zod
        const parseResult = schemas_js_1.fetchDailyCostsSchema.safeParse(event.body ? JSON.parse(event.body) : {});
        if (!parseResult.success) {
            const errorMessages = parseResult.error.errors
                .map(err => `${err.path.join('.')}: ${err.message}`)
                .join(', ');
            return (0, response_js_1.badRequest)(`Validation error: ${errorMessages}`, undefined, origin);
        }
        const { accountId, startDate: requestedStartDate, endDate = getDateDaysAgo(0), granularity = 'DAILY', incremental = true // Nova opção: busca incremental por padrão
         } = parseResult.data;
        // AWS Cost Explorer limita dados históricos a 14 meses
        const maxHistoricalDate = getDateDaysAgo(420); // ~14 meses
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar credenciais AWS ativas
        const awsAccounts = await prisma.awsCredential.findMany({
            where: {
                organization_id: organizationId,
                is_active: true,
                ...(accountId && { id: accountId }),
            },
        });
        if (awsAccounts.length === 0) {
            return (0, response_js_1.success)({
                success: true,
                message: 'No AWS credentials configured',
                costs: [],
                summary: { totalRecords: 0, newRecords: 0, skippedDays: 0 }
            });
        }
        const allCosts = [];
        let totalNewRecords = 0;
        let totalSkippedDays = 0;
        // Processar cada conta AWS
        for (const account of awsAccounts) {
            try {
                logging_js_1.logger.info('Processing account', {
                    accountId: account.id,
                    accountName: account.account_name,
                    incremental
                });
                // Determinar data de início baseado nos dados existentes
                let startDate = requestedStartDate || getDateDaysAgo(365); // Default: 1 ano
                // Garantir que não ultrapasse o limite de 14 meses da AWS
                if (startDate < maxHistoricalDate) {
                    startDate = maxHistoricalDate;
                    logging_js_1.logger.info('Adjusted start date to AWS limit', {
                        accountId: account.id,
                        requestedStart: requestedStartDate,
                        adjustedStart: startDate,
                        reason: '14-month historical data limit'
                    });
                }
                if (incremental) {
                    // Buscar a data mais recente no banco para esta conta
                    const latestCost = await prisma.dailyCost.findFirst({
                        where: {
                            organization_id: organizationId,
                            aws_account_id: account.id,
                        },
                        orderBy: { date: 'desc' },
                        select: { date: true }
                    });
                    if (latestCost?.date) {
                        // Começar do dia seguinte ao último registro
                        const lastDate = new Date(latestCost.date);
                        lastDate.setDate(lastDate.getDate() + 1);
                        const incrementalStart = lastDate.toISOString().split('T')[0];
                        // Usar a data mais recente entre a solicitada e a incremental
                        if (incrementalStart > startDate) {
                            const skippedDays = Math.floor((new Date(incrementalStart).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
                            totalSkippedDays += skippedDays;
                            startDate = incrementalStart;
                            logging_js_1.logger.info('Using incremental start date', {
                                accountId: account.id,
                                lastDateInDb: latestCost.date,
                                incrementalStart,
                                skippedDays
                            });
                        }
                    }
                }
                // Se a data de início é maior ou igual à data de fim, não há nada para buscar
                if (startDate >= endDate) {
                    logging_js_1.logger.info('No new dates to fetch for account', {
                        accountId: account.id,
                        startDate,
                        endDate
                    });
                    continue;
                }
                const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(account, 'us-east-1');
                const ceClient = new client_cost_explorer_1.CostExplorerClient({
                    region: 'us-east-1', // Cost Explorer sempre usa us-east-1
                    credentials: (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds),
                });
                logging_js_1.logger.info('Calling Cost Explorer API', {
                    accountId: account.id,
                    startDate,
                    endDate,
                    granularity
                });
                const command = new client_cost_explorer_1.GetCostAndUsageCommand({
                    TimePeriod: {
                        Start: startDate,
                        End: endDate,
                    },
                    Granularity: granularity,
                    Metrics: ['UnblendedCost', 'UsageQuantity'],
                    GroupBy: [
                        {
                            Type: 'DIMENSION',
                            Key: 'SERVICE',
                        },
                    ],
                });
                const response = await ceClient.send(command);
                logging_js_1.logger.info('Cost Explorer response', {
                    accountId: account.id,
                    resultsByTimeCount: response.ResultsByTime?.length || 0
                });
                // Processar resultados - agregar por dia
                if (response.ResultsByTime) {
                    for (const result of response.ResultsByTime) {
                        const date = result.TimePeriod?.Start;
                        if (!date)
                            continue;
                        // Agregar custos por serviço para este dia
                        const serviceBreakdown = {};
                        let dailyTotal = 0;
                        if (result.Groups) {
                            for (const group of result.Groups) {
                                const service = group.Keys?.[0] || 'Unknown';
                                const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
                                if (cost > 0) {
                                    serviceBreakdown[service] = cost;
                                    dailyTotal += cost;
                                    allCosts.push({
                                        accountId: account.id,
                                        accountName: account.account_name,
                                        date,
                                        service,
                                        cost,
                                        currency: group.Metrics?.UnblendedCost?.Unit || 'USD',
                                    });
                                }
                            }
                        }
                        // Salvar custos por serviço no banco (um registro por serviço/dia)
                        for (const [service, cost] of Object.entries(serviceBreakdown)) {
                            if (cost > 0) {
                                try {
                                    // Check if record exists first
                                    const existing = await prisma.dailyCost.findFirst({
                                        where: {
                                            organization_id: organizationId,
                                            aws_account_id: account.id,
                                            date: new Date(date),
                                            service: service,
                                        }
                                    });
                                    if (existing) {
                                        // Update existing record
                                        await prisma.dailyCost.update({
                                            where: { id: existing.id },
                                            data: { cost: cost, created_at: new Date() }
                                        });
                                    }
                                    else {
                                        // Create new record
                                        await prisma.dailyCost.create({
                                            data: {
                                                organization_id: organizationId,
                                                aws_account_id: account.id,
                                                date: new Date(date),
                                                service: service,
                                                cost: cost,
                                                currency: 'USD',
                                            }
                                        });
                                    }
                                    totalNewRecords++;
                                }
                                catch (dbErr) {
                                    logging_js_1.logger.warn('Failed to save daily cost', { date, service, error: dbErr });
                                }
                            }
                        }
                    }
                }
                logging_js_1.logger.info('Fetched costs for account', {
                    accountId: account.id,
                    accountName: account.account_name,
                    costsFound: allCosts.filter(c => c.accountId === account.id).length
                });
            }
            catch (err) {
                logging_js_1.logger.error('Error fetching costs for account', err, {
                    accountId: account.id,
                    errorName: err?.name,
                    errorMessage: err?.message,
                    errorCode: err?.Code || err?.$metadata?.httpStatusCode
                });
            }
        }
        // Calcular totais
        const totalCost = allCosts.reduce((sum, c) => sum + c.cost, 0);
        const uniqueDates = [...new Set(allCosts.map(c => c.date))].length;
        const uniqueServices = [...new Set(allCosts.map(c => c.service))].length;
        logging_js_1.logger.info('Daily costs fetch completed', {
            recordsCount: allCosts.length,
            newRecords: totalNewRecords,
            skippedDays: totalSkippedDays,
            totalCost: parseFloat(totalCost.toFixed(2))
        });
        return (0, response_js_1.success)({
            success: true,
            data: {
                dailyCosts: allCosts,
            },
            costs: allCosts,
            summary: {
                totalCost: parseFloat(totalCost.toFixed(2)),
                totalRecords: allCosts.length,
                newRecords: totalNewRecords,
                skippedDays: totalSkippedDays,
                dateRange: { start: requestedStartDate || getDateDaysAgo(365), end: endDate },
                uniqueDates,
                uniqueServices,
                accounts: awsAccounts.length,
                accountsProcessed: awsAccounts.map(a => ({ id: a.id, name: a.account_name })),
                incremental,
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('Fetch Daily Costs error', err, { requestId: context.awsRequestId });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
function getDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
}
//# sourceMappingURL=fetch-daily-costs.js.map