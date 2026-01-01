"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const client_cost_explorer_1 = require("@aws-sdk/client-cost-explorer");
async function handler(event, context) {
    logging_js_1.logger.info('📊 Budget forecast started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, months = 3 } = body;
        const prisma = (0, database_js_1.getPrismaClient)();
        const credential = await prisma.awsCredential.findFirst({
            where: {
                organization_id: organizationId,
                is_active: true,
                ...(accountId && { id: accountId }),
            },
            orderBy: { created_at: 'desc' },
        });
        if (!credential) {
            return (0, response_js_1.badRequest)('AWS credentials not found');
        }
        const creds = await (0, aws_helpers_js_1.resolveAwsCredentials)(credential, 'us-east-1');
        const costExplorerClient = new client_cost_explorer_1.CostExplorerClient({
            region: 'us-east-1',
            credentials: (0, aws_helpers_js_1.toAwsCredentials)(creds),
        });
        // Obter custos históricos (últimos 3 meses)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 3);
        const historicalResponse = await costExplorerClient.send(new client_cost_explorer_1.GetCostAndUsageCommand({
            TimePeriod: {
                Start: startDate.toISOString().split('T')[0],
                End: endDate.toISOString().split('T')[0],
            },
            Granularity: 'MONTHLY',
            Metrics: ['UnblendedCost'],
        }));
        // Calcular custos históricos
        const historicalCosts = historicalResponse.ResultsByTime?.map(result => ({
            month: result.TimePeriod?.Start,
            cost: parseFloat(result.Total?.UnblendedCost?.Amount || '0'),
        })) || [];
        // Obter previsão da AWS
        const forecastStartDate = new Date();
        const forecastEndDate = new Date();
        forecastEndDate.setMonth(forecastEndDate.getMonth() + months);
        const forecastResponse = await costExplorerClient.send(new client_cost_explorer_1.GetCostForecastCommand({
            TimePeriod: {
                Start: forecastStartDate.toISOString().split('T')[0],
                End: forecastEndDate.toISOString().split('T')[0],
            },
            Metric: 'UNBLENDED_COST',
            Granularity: 'MONTHLY',
        }));
        const forecastTotal = parseFloat(forecastResponse.Total?.Amount || '0');
        const forecastMonthly = forecastTotal / months;
        // Calcular tendência
        const avgHistorical = historicalCosts.reduce((sum, c) => sum + c.cost, 0) / historicalCosts.length;
        const trend = ((forecastMonthly - avgHistorical) / avgHistorical) * 100;
        // Gerar alertas
        const alerts = [];
        if (trend > 20) {
            alerts.push({
                type: 'warning',
                message: `Custo previsto ${trend.toFixed(1)}% maior que a média histórica`,
                severity: 'high',
            });
        }
        if (forecastMonthly > avgHistorical * 1.5) {
            alerts.push({
                type: 'critical',
                message: 'Custo previsto 50% acima da média - revisar recursos',
                severity: 'critical',
            });
        }
        logging_js_1.logger.info(`✅ Forecast completed: $${forecastMonthly.toFixed(2)}/month`);
        return (0, response_js_1.success)({
            historical: {
                months: historicalCosts,
                average: parseFloat(avgHistorical.toFixed(2)),
                total: parseFloat(historicalCosts.reduce((sum, c) => sum + c.cost, 0).toFixed(2)),
            },
            forecast: {
                months_ahead: months,
                monthly_average: parseFloat(forecastMonthly.toFixed(2)),
                total: parseFloat(forecastTotal.toFixed(2)),
                trend_percentage: parseFloat(trend.toFixed(2)),
            },
            alerts,
            recommendations: generateRecommendations(trend, forecastMonthly, avgHistorical),
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Budget forecast error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
function generateRecommendations(trend, forecast, historical) {
    const recommendations = [];
    if (trend > 20) {
        recommendations.push('Revisar recursos criados recentemente');
        recommendations.push('Verificar instâncias EC2 e RDS ociosas');
        recommendations.push('Considerar Reserved Instances para reduzir custos');
    }
    if (trend > 50) {
        recommendations.push('URGENTE: Investigar aumento significativo de custos');
        recommendations.push('Verificar possível uso não autorizado de recursos');
    }
    if (forecast > 1000) {
        recommendations.push('Considerar Savings Plans para economia de longo prazo');
        recommendations.push('Implementar políticas de auto-scaling');
    }
    if (recommendations.length === 0) {
        recommendations.push('Custos estáveis - continuar monitoramento regular');
    }
    return recommendations;
}
//# sourceMappingURL=budget-forecast.js.map