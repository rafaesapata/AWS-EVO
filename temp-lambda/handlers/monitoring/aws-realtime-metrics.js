"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const logging_js_1 = require("../../lib/logging.js");
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
async function handler(event, context) {
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('AWS Realtime Metrics started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, region: requestedRegion, resources = [] } = body;
        if (!accountId) {
            return (0, response_js_1.error)('Missing required parameter: accountId');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        const account = await prisma.awsCredential.findFirst({
            where: { id: accountId, organization_id: organizationId, is_active: true },
        });
        if (!account) {
            return (0, response_js_1.error)('AWS account not found');
        }
        // Usar região solicitada, ou primeira região da conta, ou padrão
        const accountRegions = account.regions;
        const region = requestedRegion ||
            (accountRegions && accountRegions.length > 0 ? accountRegions[0] : 'us-east-1');
        const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(account, region);
        const cwClient = new client_cloudwatch_1.CloudWatchClient({
            region,
            credentials: (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds),
        });
        const metrics = [];
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        // Se não especificou recursos, buscar métricas gerais
        if (resources.length === 0) {
            resources.push({ type: 'EC2', id: 'all' }, { type: 'RDS', id: 'all' }, { type: 'Lambda', id: 'all' });
        }
        for (const resource of resources) {
            try {
                let metricData;
                switch (resource.type) {
                    case 'EC2':
                        metricData = await getEC2Metrics(cwClient, resource.id, fiveMinutesAgo, now);
                        break;
                    case 'RDS':
                        metricData = await getRDSMetrics(cwClient, resource.id, fiveMinutesAgo, now);
                        break;
                    case 'Lambda':
                        metricData = await getLambdaMetrics(cwClient, resource.id, fiveMinutesAgo, now);
                        break;
                    default:
                        continue;
                }
                metrics.push({
                    resourceType: resource.type,
                    resourceId: resource.id,
                    metrics: metricData,
                    timestamp: now.toISOString(),
                });
            }
            catch (err) {
                logging_js_1.logger.error('Error fetching metrics for resource', err, {
                    organizationId,
                    resourceType: resource.type,
                    resourceId: resource.id
                });
            }
        }
        logging_js_1.logger.info('Realtime metrics fetched successfully', {
            organizationId,
            accountId,
            region,
            resourcesCount: metrics.length
        });
        return (0, response_js_1.success)({
            success: true,
            metrics,
            timestamp: now.toISOString(),
        });
    }
    catch (err) {
        logging_js_1.logger.error('AWS Realtime Metrics error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
async function getEC2Metrics(client, instanceId, start, end) {
    const command = new client_cloudwatch_1.GetMetricStatisticsCommand({
        Namespace: 'AWS/EC2',
        MetricName: 'CPUUtilization',
        ...(instanceId !== 'all' && {
            Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
        }),
        StartTime: start,
        EndTime: end,
        Period: 60,
        Statistics: ['Average', 'Maximum'],
    });
    const response = await client.send(command);
    const latest = response.Datapoints?.[response.Datapoints.length - 1];
    return {
        cpuUtilization: latest?.Average || 0,
        cpuMax: latest?.Maximum || 0,
    };
}
async function getRDSMetrics(client, dbId, start, end) {
    const command = new client_cloudwatch_1.GetMetricStatisticsCommand({
        Namespace: 'AWS/RDS',
        MetricName: 'CPUUtilization',
        ...(dbId !== 'all' && {
            Dimensions: [{ Name: 'DBInstanceIdentifier', Value: dbId }],
        }),
        StartTime: start,
        EndTime: end,
        Period: 60,
        Statistics: ['Average'],
    });
    const response = await client.send(command);
    const latest = response.Datapoints?.[response.Datapoints.length - 1];
    return {
        cpuUtilization: latest?.Average || 0,
    };
}
async function getLambdaMetrics(client, functionName, start, end) {
    const command = new client_cloudwatch_1.GetMetricStatisticsCommand({
        Namespace: 'AWS/Lambda',
        MetricName: 'Invocations',
        ...(functionName !== 'all' && {
            Dimensions: [{ Name: 'FunctionName', Value: functionName }],
        }),
        StartTime: start,
        EndTime: end,
        Period: 60,
        Statistics: ['Sum'],
    });
    const response = await client.send(command);
    const latest = response.Datapoints?.[response.Datapoints.length - 1];
    return {
        invocations: latest?.Sum || 0,
    };
}
//# sourceMappingURL=aws-realtime-metrics.js.map