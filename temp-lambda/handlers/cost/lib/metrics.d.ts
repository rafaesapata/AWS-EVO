/**
 * CloudWatch Custom Metrics Implementation
 * Provides business metrics and operational insights
 */
export declare function publishMetric(name: string, value: number, unit: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent' | 'Seconds', dimensions?: Record<string, string>): Promise<void>;
export declare const businessMetrics: {
    securityScanCompleted(duration: number, findingsCount: number, orgId: string, scanType: string): Promise<void>;
    costAnalysisCompleted(totalCost: number, savingsIdentified: number, orgId: string): Promise<void>;
    aiRequestLatency(duration: number, model: string, requestType: string): Promise<void>;
    userActivity(action: string, orgId: string, userId: string): Promise<void>;
    errorOccurred(errorType: string, handler: string, orgId?: string): Promise<void>;
    databaseQuery(duration: number, queryType: string, success: boolean): Promise<void>;
    awsApiCall(service: string, operation: string, duration: number, success: boolean): Promise<void>;
};
export declare const operationalMetrics: {
    lambdaColdStart(functionName: string, duration: number): Promise<void>;
    memoryUtilization(functionName: string, memoryUsed: number, memoryAllocated: number): Promise<void>;
    rateLimitHit(endpoint: string, orgId: string): Promise<void>;
    cacheHit(cacheType: string, hit: boolean): Promise<void>;
};
export declare function withMetrics<T extends (...args: any[]) => Promise<any>>(fn: T, metricName: string, dimensions?: Record<string, string>): T;
//# sourceMappingURL=metrics.d.ts.map