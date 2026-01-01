"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Generate Cost Forecast started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, forecastDays = 30 } = body;
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar custos históricos dos últimos 90 dias
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const historicalCosts = await prisma.dailyCost.groupBy({
            by: ['date'],
            where: {
                organization_id: organizationId,
                ...(accountId && { account_id: accountId }),
                date: {
                    gte: ninetyDaysAgo,
                },
            },
            _sum: {
                cost: true,
            },
            orderBy: {
                date: 'asc',
            },
        });
        if (historicalCosts.length < 7) {
            return (0, response_js_1.error)('Insufficient historical data. Need at least 7 days of cost data.');
        }
        // Extrair valores de custo
        const costs = historicalCosts.map(c => Number(c._sum?.cost) || 0);
        // Calcular tendência usando regressão linear simples
        const n = costs.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = costs;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        // Calcular desvio padrão para intervalos de confiança
        const predictions = x.map(xi => slope * xi + intercept);
        const residuals = y.map((yi, i) => yi - predictions[i]);
        const variance = residuals.reduce((sum, r) => sum + r * r, 0) / n;
        const stdDev = Math.sqrt(variance);
        // Gerar previsões
        const forecast = [];
        const today = new Date();
        for (let i = 1; i <= forecastDays; i++) {
            const futureDate = new Date(today);
            futureDate.setDate(futureDate.getDate() + i);
            const x_future = n + i - 1;
            const predictedCost = slope * x_future + intercept;
            // Intervalo de confiança (95%)
            const margin = 1.96 * stdDev;
            forecast.push({
                date: futureDate.toISOString().split('T')[0],
                predictedCost: Math.max(0, predictedCost),
                confidence: Math.min(100, Math.max(0, 100 - (i * 2))), // Confiança diminui com o tempo
                lowerBound: Math.max(0, predictedCost - margin),
                upperBound: predictedCost + margin,
            });
        }
        // Calcular totais
        const totalPredicted = forecast.reduce((sum, f) => sum + f.predictedCost, 0);
        const avgDailyCost = totalPredicted / forecastDays;
        // Comparar com média histórica
        const avgHistoricalCost = costs.reduce((a, b) => a + b, 0) / costs.length;
        const trend = slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable';
        const trendPercentage = ((avgDailyCost - avgHistoricalCost) / avgHistoricalCost) * 100;
        logging_js_1.logger.info(`✅ Generated ${forecastDays}-day forecast: $${totalPredicted.toFixed(2)} total`);
        return (0, response_js_1.success)({
            success: true,
            forecast,
            summary: {
                forecastDays,
                totalPredicted: parseFloat(totalPredicted.toFixed(2)),
                avgDailyCost: parseFloat(avgDailyCost.toFixed(2)),
                avgHistoricalCost: parseFloat(avgHistoricalCost.toFixed(2)),
                trend,
                trendPercentage: parseFloat(trendPercentage.toFixed(2)),
                confidence: 'medium',
            },
            metadata: {
                historicalDays: costs.length,
                slope: parseFloat(slope.toFixed(4)),
                intercept: parseFloat(intercept.toFixed(2)),
                stdDev: parseFloat(stdDev.toFixed(2)),
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Generate Cost Forecast error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=generate-cost-forecast.js.map