"use strict";
/**
 * CloudWatch Custom Metrics Implementation
 * Provides business metrics and operational insights
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationalMetrics = exports.businessMetrics = void 0;
exports.publishMetric = publishMetric;
exports.withMetrics = withMetrics;
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const logging_js_1 = require("./logging.js");
const cloudwatch = new client_cloudwatch_1.CloudWatchClient({});
const NAMESPACE = 'EVO-UDS';
async function publishMetric(name, value, unit, dimensions) {
    try {
        await cloudwatch.send(new client_cloudwatch_1.PutMetricDataCommand({
            Namespace: NAMESPACE,
            MetricData: [{
                    MetricName: name,
                    Value: value,
                    Unit: unit,
                    Dimensions: dimensions ?
                        Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value })) :
                        undefined,
                    Timestamp: new Date(),
                }],
        }));
    }
    catch (error) {
        logging_js_1.logger.error('Failed to publish metric', error, { name, value, unit });
    }
}
// Métricas de negócio
exports.businessMetrics = {
    async securityScanCompleted(duration, findingsCount, orgId, scanType) {
        await Promise.all([
            publishMetric('SecurityScanDuration', duration, 'Milliseconds', {
                OrgId: orgId,
                ScanType: scanType
            }),
            publishMetric('FindingsCount', findingsCount, 'Count', {
                OrgId: orgId,
                ScanType: scanType
            }),
            publishMetric('SecurityScansCompleted', 1, 'Count', {
                OrgId: orgId,
                ScanType: scanType
            }),
        ]);
    },
    async costAnalysisCompleted(totalCost, savingsIdentified, orgId) {
        await Promise.all([
            publishMetric('TotalCostAnalyzed', totalCost, 'Count', { OrgId: orgId }),
            publishMetric('SavingsIdentified', savingsIdentified, 'Count', { OrgId: orgId }),
            publishMetric('CostAnalysisCompleted', 1, 'Count', { OrgId: orgId }),
        ]);
    },
    async aiRequestLatency(duration, model, requestType) {
        await Promise.all([
            publishMetric('AIRequestLatency', duration, 'Milliseconds', {
                Model: model,
                RequestType: requestType
            }),
            publishMetric('AIRequestsCount', 1, 'Count', {
                Model: model,
                RequestType: requestType
            }),
        ]);
    },
    async userActivity(action, orgId, userId) {
        await publishMetric('UserActivity', 1, 'Count', {
            Action: action,
            OrgId: orgId,
            UserId: userId,
        });
    },
    async errorOccurred(errorType, handler, orgId) {
        await publishMetric('ErrorsCount', 1, 'Count', {
            ErrorType: errorType,
            Handler: handler,
            OrgId: orgId || 'unknown',
        });
    },
    async databaseQuery(duration, queryType, success) {
        await Promise.all([
            publishMetric('DatabaseQueryDuration', duration, 'Milliseconds', {
                QueryType: queryType,
                Success: success.toString(),
            }),
            publishMetric('DatabaseQueriesCount', 1, 'Count', {
                QueryType: queryType,
                Success: success.toString(),
            }),
        ]);
    },
    async awsApiCall(service, operation, duration, success) {
        await Promise.all([
            publishMetric('AWSAPICallDuration', duration, 'Milliseconds', {
                Service: service,
                Operation: operation,
                Success: success.toString(),
            }),
            publishMetric('AWSAPICallsCount', 1, 'Count', {
                Service: service,
                Operation: operation,
                Success: success.toString(),
            }),
        ]);
    },
};
// Métricas operacionais
exports.operationalMetrics = {
    async lambdaColdStart(functionName, duration) {
        await publishMetric('ColdStartDuration', duration, 'Milliseconds', {
            FunctionName: functionName,
        });
    },
    async memoryUtilization(functionName, memoryUsed, memoryAllocated) {
        const utilizationPercent = (memoryUsed / memoryAllocated) * 100;
        await publishMetric('MemoryUtilization', utilizationPercent, 'Percent', {
            FunctionName: functionName,
        });
    },
    async rateLimitHit(endpoint, orgId) {
        await publishMetric('RateLimitHits', 1, 'Count', {
            Endpoint: endpoint,
            OrgId: orgId,
        });
    },
    async cacheHit(cacheType, hit) {
        await publishMetric('CacheOperations', 1, 'Count', {
            CacheType: cacheType,
            Result: hit ? 'hit' : 'miss',
        });
    },
};
// Wrapper para medir duração automaticamente
function withMetrics(fn, metricName, dimensions) {
    return (async (...args) => {
        const startTime = Date.now();
        let success = true;
        try {
            const result = await fn(...args);
            return result;
        }
        catch (error) {
            success = false;
            throw error;
        }
        finally {
            const duration = Date.now() - startTime;
            await publishMetric(metricName, duration, 'Milliseconds', {
                ...dimensions,
                Success: success.toString(),
            });
        }
    });
}
//# sourceMappingURL=metrics.js.map