"use strict";
/**
 * Handler para testar especificamente a coleta de métricas das Lambdas
 * Usado para debug e validação
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const logging_js_1 = require("../../lib/logging.js");
const middleware_js_1 = require("../../lib/middleware.js");
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const client_lambda_1 = require("@aws-sdk/client-lambda");
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    if (event.requestContext?.http?.method === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let user;
    let organizationId;
    try {
        user = (0, auth_js_1.getUserFromEvent)(event);
        organizationId = (0, auth_js_1.getOrganizationId)(user);
    }
    catch (authError) {
        return (0, response_js_1.error)('Unauthorized', 401, undefined, origin);
    }
    const prisma = (0, database_js_1.getPrismaClient)();
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, region = 'us-east-1', functionName } = body;
        if (!accountId) {
            return (0, response_js_1.error)('Missing accountId', 400, undefined, origin);
        }
        // Buscar credenciais AWS
        const credential = await prisma.awsCredential.findFirst({
            where: {
                id: accountId,
                organization_id: organizationId,
                is_active: true,
            },
        });
        if (!credential) {
            return (0, response_js_1.error)('AWS credentials not found', 404, undefined, origin);
        }
        const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(credential, region);
        const credentials = (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds);
        const lambdaClient = new client_lambda_1.LambdaClient({ region, credentials });
        const cwClient = new client_cloudwatch_1.CloudWatchClient({ region, credentials });
        const results = {
            region,
            accountId,
            functionName,
            lambdaFunctions: [],
            availableMetrics: [],
            metricData: [],
            errors: []
        };
        try {
            // 1. Listar funções Lambda
            logging_js_1.logger.info('Listing Lambda functions...');
            const functionsResponse = await lambdaClient.send(new client_lambda_1.ListFunctionsCommand({ MaxItems: 10 }));
            results.lambdaFunctions = (functionsResponse.Functions || []).map(fn => ({
                functionName: fn.FunctionName,
                runtime: fn.Runtime,
                state: fn.State,
                lastModified: fn.LastModified,
                memorySize: fn.MemorySize,
                timeout: fn.Timeout
            }));
            logging_js_1.logger.info(`Found ${results.lambdaFunctions.length} Lambda functions`);
            // 2. Se uma função específica foi solicitada, usar ela; senão usar a primeira
            const targetFunction = functionName || results.lambdaFunctions[0]?.functionName;
            if (!targetFunction) {
                return (0, response_js_1.success)({
                    message: 'No Lambda functions found in this region',
                    ...results
                }, 200, origin);
            }
            results.targetFunction = targetFunction;
            // 3. Listar métricas disponíveis para esta função
            logging_js_1.logger.info(`Listing available metrics for function: ${targetFunction}`);
            const metricsResponse = await cwClient.send(new client_cloudwatch_1.ListMetricsCommand({
                Namespace: 'AWS/Lambda',
                Dimensions: [{ Name: 'FunctionName', Value: targetFunction }]
            }));
            results.availableMetrics = (metricsResponse.Metrics || []).map(m => ({
                metricName: m.MetricName,
                dimensions: m.Dimensions,
                namespace: m.Namespace
            }));
            logging_js_1.logger.info(`Found ${results.availableMetrics.length} available metrics`);
            // 4. Buscar dados das métricas principais
            const metricsToTest = ['Invocations', 'Duration', 'Errors', 'Throttles', 'ConcurrentExecutions'];
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Últimas 24h
            for (const metricName of metricsToTest) {
                try {
                    logging_js_1.logger.info(`Fetching ${metricName} for ${targetFunction}`);
                    // Usar estatísticas apropriadas para cada métrica
                    let statistics = ['Average'];
                    if (['Invocations', 'Errors', 'Throttles'].includes(metricName)) {
                        statistics = ['Sum'];
                    }
                    else if (metricName === 'ConcurrentExecutions') {
                        statistics = ['Maximum'];
                    }
                    const metricResponse = await cwClient.send(new client_cloudwatch_1.GetMetricStatisticsCommand({
                        Namespace: 'AWS/Lambda',
                        MetricName: metricName,
                        Dimensions: [{ Name: 'FunctionName', Value: targetFunction }],
                        StartTime: startTime,
                        EndTime: endTime,
                        Period: 3600, // 1 hora
                        Statistics: statistics
                    }));
                    const datapoints = (metricResponse.Datapoints || []).map(dp => ({
                        timestamp: dp.Timestamp,
                        value: dp.Sum ?? dp.Average ?? dp.Maximum ?? 0,
                        unit: dp.Unit
                    }));
                    results.metricData.push({
                        metricName,
                        statistics,
                        datapointsCount: datapoints.length,
                        datapoints: datapoints.slice(0, 5), // Primeiros 5 pontos para debug
                        hasData: datapoints.length > 0
                    });
                    logging_js_1.logger.info(`${metricName}: ${datapoints.length} datapoints`);
                }
                catch (metricError) {
                    const errorMsg = metricError.message;
                    logging_js_1.logger.error(`Failed to fetch ${metricName}:`, errorMsg);
                    results.errors.push(`${metricName}: ${errorMsg}`);
                }
            }
            // 5. Verificar dados no banco
            const dbResources = await prisma.monitoredResource.findMany({
                where: {
                    organization_id: organizationId,
                    aws_account_id: accountId,
                    resource_type: 'lambda',
                    resource_id: targetFunction
                }
            });
            const dbMetrics = await prisma.resourceMetric.findMany({
                where: {
                    organization_id: organizationId,
                    aws_account_id: accountId,
                    resource_type: 'lambda',
                    resource_id: targetFunction
                },
                orderBy: { timestamp: 'desc' },
                take: 10
            });
            results.database = {
                resourcesFound: dbResources.length,
                metricsFound: dbMetrics.length,
                latestMetrics: dbMetrics.map(m => ({
                    metricName: m.metric_name,
                    value: m.metric_value,
                    timestamp: m.timestamp,
                    unit: m.metric_unit
                }))
            };
            return (0, response_js_1.success)({
                message: `Lambda metrics test completed for ${targetFunction}`,
                ...results
            }, 200, origin);
        }
        catch (testError) {
            const errorMsg = testError.message;
            logging_js_1.logger.error('Lambda metrics test failed:', errorMsg);
            results.errors.push(`Test failed: ${errorMsg}`);
            return (0, response_js_1.success)({
                message: 'Lambda metrics test completed with errors',
                ...results
            }, 200, origin);
        }
    }
    catch (err) {
        logging_js_1.logger.error('Test Lambda metrics handler failed:', err.message);
        return (0, response_js_1.error)('Test failed: ' + err.message, 500, undefined, origin);
    }
}
//# sourceMappingURL=test-lambda-metrics.js.map