"use strict";
/**
 * Lambda handler for Fetch CloudWatch Metrics
 *
 * Coleta TODOS os recursos e métricas usando paralelismo otimizado
 * Sem limites artificiais - o usuário vê tudo
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const circuit_breaker_js_1 = require("../../lib/circuit-breaker.js");
const middleware_js_1 = require("../../lib/middleware.js");
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const client_ec2_1 = require("@aws-sdk/client-ec2");
const client_rds_1 = require("@aws-sdk/client-rds");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const client_ecs_1 = require("@aws-sdk/client-ecs");
const client_elasticache_1 = require("@aws-sdk/client-elasticache");
const client_elastic_load_balancing_v2_1 = require("@aws-sdk/client-elastic-load-balancing-v2");
const client_api_gateway_1 = require("@aws-sdk/client-api-gateway");
const crypto_1 = require("crypto");
// Métricas por tipo de recurso
const METRICS_CONFIG = {
    ec2: {
        namespace: 'AWS/EC2',
        metrics: ['CPUUtilization', 'NetworkIn', 'NetworkOut', 'DiskReadOps', 'DiskWriteOps'],
        dimensionKey: 'InstanceId',
    },
    rds: {
        namespace: 'AWS/RDS',
        metrics: ['CPUUtilization', 'DatabaseConnections', 'FreeStorageSpace', 'ReadIOPS', 'WriteIOPS'],
        dimensionKey: 'DBInstanceIdentifier',
    },
    lambda: {
        namespace: 'AWS/Lambda',
        metrics: ['Invocations', 'Errors', 'Duration', 'Throttles', 'ConcurrentExecutions'],
        dimensionKey: 'FunctionName',
    },
    ecs: {
        namespace: 'AWS/ECS',
        metrics: ['CPUUtilization', 'MemoryUtilization'],
        dimensionKey: 'ServiceName',
    },
    elasticache: {
        namespace: 'AWS/ElastiCache',
        metrics: ['CPUUtilization', 'NetworkBytesIn', 'NetworkBytesOut', 'CurrConnections'],
        dimensionKey: 'CacheClusterId',
    },
    alb: {
        namespace: 'AWS/ApplicationELB',
        metrics: ['RequestCount', 'TargetResponseTime', 'HTTPCode_Target_2XX_Count'],
        dimensionKey: 'LoadBalancer',
    },
    nlb: {
        namespace: 'AWS/NetworkELB',
        metrics: ['ProcessedBytes', 'ActiveFlowCount', 'NewFlowCount'],
        dimensionKey: 'LoadBalancer',
    },
    apigateway: {
        namespace: 'AWS/ApiGateway',
        metrics: ['Count', 'Latency', '4XXError', '5XXError'],
        dimensionKey: 'ApiName',
    },
};
// Unidades de métricas
const METRIC_UNITS = {
    CPUUtilization: 'Percent',
    MemoryUtilization: 'Percent',
    NetworkIn: 'Bytes',
    NetworkOut: 'Bytes',
    NetworkBytesIn: 'Bytes',
    NetworkBytesOut: 'Bytes',
    DiskReadOps: 'Count',
    DiskWriteOps: 'Count',
    DatabaseConnections: 'Count',
    FreeStorageSpace: 'Bytes',
    ReadIOPS: 'Count/Second',
    WriteIOPS: 'Count/Second',
    Invocations: 'Count',
    Errors: 'Count',
    Duration: 'Milliseconds',
    Throttles: 'Count',
    ConcurrentExecutions: 'Count',
    CurrConnections: 'Count',
    RequestCount: 'Count',
    TargetResponseTime: 'Seconds',
    HTTPCode_Target_2XX_Count: 'Count',
    ProcessedBytes: 'Bytes',
    ActiveFlowCount: 'Count',
    NewFlowCount: 'Count',
    Count: 'Count',
    Latency: 'Milliseconds',
    '4XXError': 'Count',
    '5XXError': 'Count',
};
/**
 * Handler principal
 */
async function fetchCloudwatchMetricsHandler(event, _context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let user;
    let organizationId;
    try {
        user = (0, auth_js_1.getUserFromEvent)(event);
    }
    catch (authError) {
        return (0, response_js_1.error)('Unauthorized - user not found', 401, undefined, origin);
    }
    try {
        organizationId = (0, auth_js_1.getOrganizationId)(user);
    }
    catch (orgError) {
        return (0, response_js_1.error)('Unauthorized - organization not found', 401, undefined, origin);
    }
    const prisma = (0, database_js_1.getPrismaClient)();
    const startTime = Date.now();
    logging_js_1.logger.info('Fetch CloudWatch Metrics started', { organizationId, userId: user.sub });
    try {
        // Parse request body
        let body;
        try {
            body = event.body ? JSON.parse(event.body) : {};
        }
        catch {
            return (0, response_js_1.badRequest)('Invalid JSON body', undefined, origin);
        }
        const { accountId, regions: requestedRegions, period = '3h' } = body;
        if (!accountId) {
            return (0, response_js_1.badRequest)('Missing required parameter: accountId', undefined, origin);
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
            return (0, response_js_1.badRequest)('AWS credentials not found', undefined, origin);
        }
        // Usar regiões da credencial se disponíveis, senão usar as solicitadas ou padrão
        const credentialRegions = credential.regions;
        const regions = requestedRegions ||
            (credentialRegions && credentialRegions.length > 0 ? credentialRegions : ['us-east-1']);
        logging_js_1.logger.info('Starting full resource discovery', {
            accountId: credential.account_name,
            regions,
            credentialRegions,
            period
        });
        // Descobrir TODOS os recursos em TODAS as regiões em paralelo
        const allResources = [];
        const allMetrics = [];
        const permissionErrors = [];
        // Processar TODAS as regiões em paralelo
        const regionResults = await Promise.allSettled(regions.map(async (region) => {
            const regionStart = Date.now();
            const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(credential, region);
            const credentials = (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds);
            // Descobrir TODOS os tipos de recursos em paralelo
            const discoveryFunctions = [
                { name: 'EC2', fn: () => discoverEC2(credentials, region) },
                { name: 'RDS', fn: () => discoverRDS(credentials, region) },
                { name: 'Lambda', fn: () => discoverLambda(credentials, region) },
                { name: 'ECS', fn: () => discoverECS(credentials, region) },
                { name: 'ElastiCache', fn: () => discoverElastiCache(credentials, region) },
                { name: 'LoadBalancers', fn: () => discoverLoadBalancers(credentials, region) },
                { name: 'APIGateway', fn: () => discoverAPIGateways(credentials, region) },
            ];
            const discoveryResults = await Promise.allSettled(discoveryFunctions.map(d => d.fn()));
            const resources = [];
            discoveryResults.forEach((result, index) => {
                const serviceName = discoveryFunctions[index].name;
                if (result.status === 'fulfilled') {
                    logging_js_1.logger.info(`${region}/${serviceName}: found ${result.value.length} resources`);
                    resources.push(...result.value);
                }
                else {
                    const errorMsg = result.reason?.message || 'Discovery failed';
                    logging_js_1.logger.warn(`${region}/${serviceName}: FAILED - ${errorMsg}`);
                    permissionErrors.push(`${region}/${serviceName}: ${errorMsg}`);
                }
            });
            logging_js_1.logger.info(`Region ${region}: discovered ${resources.length} resources in ${Date.now() - regionStart}ms`);
            return { region, resources, credentials };
        }));
        // Coletar recursos de todas as regiões
        const regionData = [];
        for (const result of regionResults) {
            if (result.status === 'fulfilled' && result.value) {
                allResources.push(...result.value.resources);
                regionData.push(result.value);
            }
        }
        logging_js_1.logger.info(`Total discovered: ${allResources.length} resources across ${regions.length} regions`);
        // Coletar métricas de TODOS os recursos em paralelo
        const periodHours = period === '7d' ? 168 : period === '24h' ? 24 : 3;
        // Processar métricas por região em paralelo
        const metricsResults = await Promise.allSettled(regionData.map(async ({ region, resources, credentials }) => {
            const cwClient = new client_cloudwatch_1.CloudWatchClient({ region, credentials });
            const regionMetrics = [];
            // Processar recursos em batches de 10 para não sobrecarregar
            const batches = chunk(resources, 10);
            for (const batch of batches) {
                const batchResults = await Promise.allSettled(batch.map(async (resource) => {
                    const config = METRICS_CONFIG[resource.resourceType];
                    if (!config) {
                        logging_js_1.logger.warn(`No metrics config for resource type: ${resource.resourceType}`);
                        return [];
                    }
                    const resourceMetrics = [];
                    // Buscar todas as métricas do recurso em paralelo
                    const metricResults = await Promise.allSettled(config.metrics.map(metricName => fetchMetric(cwClient, config.namespace, metricName, config.dimensionKey, resource, periodHours)));
                    for (const [index, result] of metricResults.entries()) {
                        const metricName = config.metrics[index];
                        if (result.status === 'fulfilled') {
                            resourceMetrics.push(...result.value);
                            if (result.value.length > 0) {
                                logging_js_1.logger.debug(`Collected ${result.value.length} datapoints for ${resource.resourceType}:${resource.resourceId}:${metricName}`);
                            }
                        }
                        else {
                            logging_js_1.logger.warn(`Failed to fetch metric ${metricName} for ${resource.resourceType}:${resource.resourceId}`, {
                                error: result.reason?.message || 'Unknown error'
                            });
                        }
                    }
                    return resourceMetrics;
                }));
                for (const [index, result] of batchResults.entries()) {
                    const resource = batch[index];
                    if (result.status === 'fulfilled') {
                        regionMetrics.push(...result.value);
                        if (result.value.length > 0) {
                            logging_js_1.logger.debug(`Resource ${resource.resourceType}:${resource.resourceId} contributed ${result.value.length} metrics`);
                        }
                        else {
                            logging_js_1.logger.warn(`Resource ${resource.resourceType}:${resource.resourceId} contributed 0 metrics`);
                        }
                    }
                    else {
                        logging_js_1.logger.error(`Failed to process metrics for resource ${resource.resourceType}:${resource.resourceId}`, {
                            error: result.reason?.message || 'Unknown error'
                        });
                    }
                }
            }
            return regionMetrics;
        }));
        // Coletar todas as métricas
        for (const result of metricsResults) {
            if (result.status === 'fulfilled') {
                allMetrics.push(...result.value);
            }
        }
        logging_js_1.logger.info(`Total collected: ${allMetrics.length} metrics`);
        // Salvar TODOS os recursos em batch
        if (allResources.length > 0) {
            await saveResourcesBatch(prisma, organizationId, accountId, allResources);
        }
        // Salvar TODAS as métricas em batch
        if (allMetrics.length > 0) {
            await saveMetricsBatch(prisma, organizationId, accountId, allMetrics);
        }
        const duration = Date.now() - startTime;
        logging_js_1.logger.info('Fetch CloudWatch Metrics completed', {
            organizationId,
            duration,
            resourcesFound: allResources.length,
            metricsCollected: allMetrics.length,
        });
        return (0, response_js_1.success)({
            success: true,
            message: `Coletadas ${allMetrics.length} métricas de ${allResources.length} recursos`,
            resourcesFound: allResources.length,
            metricsCollected: allMetrics.length,
            regionsScanned: regions,
            resources: allResources,
            metrics: allMetrics,
            permissionErrors: permissionErrors.length > 0 ? permissionErrors : undefined,
            duration,
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Fetch CloudWatch Metrics failed', {
            error: err.message,
            stack: err.stack
        });
        return (0, response_js_1.error)('Fetch metrics failed: ' + err.message, 500, undefined, origin);
    }
}
// Utility: dividir array em chunks
function chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}
// Descobrir EC2
async function discoverEC2(credentials, region) {
    const client = new client_ec2_1.EC2Client({ region, credentials });
    const resources = [];
    let nextToken;
    do {
        const response = await client.send(new client_ec2_1.DescribeInstancesCommand({
            MaxResults: 100,
            NextToken: nextToken
        }));
        for (const reservation of response.Reservations || []) {
            for (const instance of reservation.Instances || []) {
                const nameTag = instance.Tags?.find(t => t.Key === 'Name');
                resources.push({
                    resourceId: instance.InstanceId || '',
                    resourceName: nameTag?.Value || instance.InstanceId || '',
                    resourceType: 'ec2',
                    region,
                    status: instance.State?.Name || 'unknown',
                    metadata: { instanceType: instance.InstanceType },
                });
            }
        }
        nextToken = response.NextToken;
    } while (nextToken);
    return resources;
}
// Descobrir RDS
async function discoverRDS(credentials, region) {
    const client = new client_rds_1.RDSClient({ region, credentials });
    const resources = [];
    let marker;
    do {
        const response = await client.send(new client_rds_1.DescribeDBInstancesCommand({
            MaxRecords: 100,
            Marker: marker
        }));
        for (const db of response.DBInstances || []) {
            resources.push({
                resourceId: db.DBInstanceIdentifier || '',
                resourceName: db.DBInstanceIdentifier || '',
                resourceType: 'rds',
                region,
                status: db.DBInstanceStatus || 'unknown',
                metadata: { engine: db.Engine, instanceClass: db.DBInstanceClass },
            });
        }
        marker = response.Marker;
    } while (marker);
    return resources;
}
// Descobrir Lambda
async function discoverLambda(credentials, region) {
    const client = new client_lambda_1.LambdaClient({ region, credentials });
    const resources = [];
    let marker;
    try {
        do {
            const response = await client.send(new client_lambda_1.ListFunctionsCommand({
                MaxItems: 50,
                Marker: marker
            }));
            for (const fn of response.Functions || []) {
                // Validar que temos dados essenciais
                if (!fn.FunctionName) {
                    logging_js_1.logger.warn(`Lambda function without name found in ${region}`, { functionArn: fn.FunctionArn });
                    continue;
                }
                resources.push({
                    resourceId: fn.FunctionName,
                    resourceName: fn.FunctionName,
                    resourceType: 'lambda',
                    region,
                    status: fn.State === 'Active' ? 'active' : (fn.State || 'unknown').toLowerCase(),
                    metadata: {
                        runtime: fn.Runtime,
                        memorySize: fn.MemorySize,
                        timeout: fn.Timeout,
                        lastModified: fn.LastModified,
                        functionArn: fn.FunctionArn
                    },
                });
            }
            marker = response.NextMarker;
        } while (marker);
        logging_js_1.logger.info(`Discovered ${resources.length} Lambda functions in ${region}`);
        return resources;
    }
    catch (error) {
        logging_js_1.logger.error(`Failed to discover Lambda functions in ${region}`, {
            error: error.message,
            stack: error.stack
        });
        throw error; // Re-throw para que o erro seja capturado no nível superior
    }
}
// Descobrir ECS
async function discoverECS(credentials, region) {
    const client = new client_ecs_1.ECSClient({ region, credentials });
    const resources = [];
    const clustersResponse = await client.send(new client_ecs_1.ListClustersCommand({}));
    for (const clusterArn of clustersResponse.clusterArns || []) {
        const servicesResponse = await client.send(new client_ecs_1.ListServicesCommand({ cluster: clusterArn }));
        if (servicesResponse.serviceArns && servicesResponse.serviceArns.length > 0) {
            const describeResponse = await client.send(new client_ecs_1.DescribeServicesCommand({
                cluster: clusterArn,
                services: servicesResponse.serviceArns,
            }));
            for (const service of describeResponse.services || []) {
                resources.push({
                    resourceId: service.serviceName || '',
                    resourceName: service.serviceName || '',
                    resourceType: 'ecs',
                    region,
                    status: service.status || 'unknown',
                    metadata: { clusterArn, desiredCount: service.desiredCount, runningCount: service.runningCount },
                });
            }
        }
    }
    return resources;
}
// Descobrir ElastiCache
async function discoverElastiCache(credentials, region) {
    const client = new client_elasticache_1.ElastiCacheClient({ region, credentials });
    const response = await client.send(new client_elasticache_1.DescribeCacheClustersCommand({}));
    return (response.CacheClusters || []).map(cluster => ({
        resourceId: cluster.CacheClusterId || '',
        resourceName: cluster.CacheClusterId || '',
        resourceType: 'elasticache',
        region,
        status: cluster.CacheClusterStatus || 'unknown',
        metadata: { engine: cluster.Engine, cacheNodeType: cluster.CacheNodeType },
    }));
}
// Descobrir Load Balancers
async function discoverLoadBalancers(credentials, region) {
    const client = new client_elastic_load_balancing_v2_1.ElasticLoadBalancingV2Client({ region, credentials });
    const response = await client.send(new client_elastic_load_balancing_v2_1.DescribeLoadBalancersCommand({}));
    return (response.LoadBalancers || []).map(lb => {
        const type = lb.Type === 'application' ? 'alb' : lb.Type === 'network' ? 'nlb' : 'elb';
        const arnParts = lb.LoadBalancerArn?.split(':loadbalancer/') || [];
        const lbDimension = arnParts[1] || lb.LoadBalancerName || '';
        return {
            resourceId: lbDimension,
            resourceName: lb.LoadBalancerName || '',
            resourceType: type,
            region,
            status: lb.State?.Code || 'unknown',
            metadata: { dnsName: lb.DNSName, scheme: lb.Scheme },
        };
    });
}
// Descobrir API Gateways
async function discoverAPIGateways(credentials, region) {
    const client = new client_api_gateway_1.APIGatewayClient({ region, credentials });
    const response = await client.send(new client_api_gateway_1.GetRestApisCommand({}));
    return (response.items || []).map(api => ({
        resourceId: api.name || api.id || '',
        resourceName: api.name || '',
        resourceType: 'apigateway',
        region,
        status: 'active',
        metadata: { apiId: api.id, description: api.description },
    }));
}
// Buscar métrica do CloudWatch
async function fetchMetric(client, namespace, metricName, dimensionKey, resource, periodHours) {
    try {
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - periodHours * 60 * 60 * 1000);
        const aggregationPeriod = periodHours > 24 ? 3600 : periodHours > 3 ? 900 : 300;
        // Para Lambda, usar estatísticas específicas por métrica
        let statistics = ['Average'];
        if (resource.resourceType === 'lambda') {
            if (['Invocations', 'Errors', 'Throttles'].includes(metricName)) {
                statistics = ['Sum']; // Métricas de contagem
            }
            else if (metricName === 'Duration') {
                statistics = ['Average', 'Maximum']; // Duração
            }
            else if (metricName === 'ConcurrentExecutions') {
                statistics = ['Maximum']; // Execuções concorrentes
            }
        }
        else {
            statistics = ['Average', 'Sum', 'Maximum'];
        }
        logging_js_1.logger.debug(`Fetching ${metricName} for ${resource.resourceType}:${resource.resourceId}`, {
            namespace,
            dimensionKey,
            statistics,
            period: aggregationPeriod
        });
        const response = await client.send(new client_cloudwatch_1.GetMetricStatisticsCommand({
            Namespace: namespace,
            MetricName: metricName,
            Dimensions: [{ Name: dimensionKey, Value: resource.resourceId }],
            StartTime: startTime,
            EndTime: endTime,
            Period: aggregationPeriod,
            Statistics: statistics,
        }));
        const datapoints = (response.Datapoints || [])
            .filter(dp => dp.Timestamp && (dp.Average !== undefined || dp.Sum !== undefined || dp.Maximum !== undefined))
            .map(dp => {
            // Escolher o valor correto baseado na estatística
            let value = 0;
            if (resource.resourceType === 'lambda') {
                if (['Invocations', 'Errors', 'Throttles'].includes(metricName)) {
                    value = dp.Sum ?? 0;
                }
                else if (metricName === 'Duration') {
                    value = dp.Average ?? 0; // Usar média para duração
                }
                else if (metricName === 'ConcurrentExecutions') {
                    value = dp.Maximum ?? 0;
                }
                else {
                    value = dp.Average ?? dp.Sum ?? dp.Maximum ?? 0;
                }
            }
            else {
                value = dp.Average ?? dp.Sum ?? dp.Maximum ?? 0;
            }
            return {
                resourceId: resource.resourceId,
                resourceName: resource.resourceName,
                resourceType: resource.resourceType,
                metricName,
                value,
                timestamp: dp.Timestamp,
                unit: METRIC_UNITS[metricName] || 'None',
            };
        });
        if (datapoints.length > 0) {
            logging_js_1.logger.debug(`Found ${datapoints.length} datapoints for ${resource.resourceType}:${resource.resourceId}:${metricName}`);
        }
        else {
            logging_js_1.logger.warn(`No datapoints found for ${resource.resourceType}:${resource.resourceId}:${metricName}`, {
                namespace,
                dimensionKey,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString()
            });
        }
        return datapoints;
    }
    catch (error) {
        logging_js_1.logger.error(`Failed to fetch metric ${metricName} for ${resource.resourceType}:${resource.resourceId}`, {
            error: error.message,
            namespace,
            dimensionKey
        });
        return [];
    }
}
// Salvar recursos em batch
async function saveResourcesBatch(prisma, organizationId, accountId, resources) {
    if (resources.length === 0)
        return;
    try {
        // Processar em batches de 50 para evitar timeout do Prisma
        const batches = chunk(resources, 50);
        for (const batch of batches) {
            await prisma.$transaction(batch.map(resource => prisma.monitoredResource.upsert({
                where: {
                    organization_id_aws_account_id_resource_id_resource_type: {
                        organization_id: organizationId,
                        aws_account_id: accountId,
                        resource_id: resource.resourceId,
                        resource_type: resource.resourceType,
                    },
                },
                update: {
                    resource_name: resource.resourceName,
                    status: resource.status,
                    region: resource.region,
                    metadata: resource.metadata,
                    updated_at: new Date(),
                },
                create: {
                    id: (0, crypto_1.randomUUID)(),
                    organization_id: organizationId,
                    aws_account_id: accountId,
                    resource_id: resource.resourceId,
                    resource_name: resource.resourceName,
                    resource_type: resource.resourceType,
                    region: resource.region,
                    status: resource.status,
                    metadata: resource.metadata,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            })));
        }
        logging_js_1.logger.info(`Saved ${resources.length} resources to DB`);
    }
    catch (err) {
        logging_js_1.logger.warn('Failed to save resources batch', { error: err.message });
    }
}
// Salvar métricas em batch
async function saveMetricsBatch(prisma, organizationId, accountId, metrics) {
    if (metrics.length === 0)
        return;
    try {
        // Processar em batches de 100 para evitar timeout
        const batches = chunk(metrics, 100);
        for (const batch of batches) {
            const data = batch.map(m => ({
                id: (0, crypto_1.randomUUID)(),
                organization_id: organizationId,
                aws_account_id: accountId,
                resource_id: m.resourceId,
                resource_name: m.resourceName,
                resource_type: m.resourceType,
                metric_name: m.metricName,
                metric_value: m.value,
                metric_unit: m.unit,
                timestamp: m.timestamp,
                created_at: new Date(),
            }));
            await prisma.resourceMetric.createMany({
                data,
                skipDuplicates: true,
            });
        }
        logging_js_1.logger.info(`Saved ${metrics.length} metrics to DB`);
    }
    catch (err) {
        logging_js_1.logger.warn('Failed to save metrics batch', { error: err.message });
    }
}
// Export com circuit breaker
const handler = async (event, context) => {
    return (0, circuit_breaker_js_1.withAwsCircuitBreaker)('fetch-cloudwatch-metrics', () => fetchCloudwatchMetricsHandler(event, context));
};
exports.handler = handler;
//# sourceMappingURL=fetch-cloudwatch-metrics.js.map