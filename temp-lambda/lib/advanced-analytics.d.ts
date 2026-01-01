/**
 * Advanced Analytics and Reporting System
 * Military-grade analytics with AI-powered insights and comprehensive reporting
 */
export interface AnalyticsQuery {
    organizationId: string;
    timeRange: {
        start: Date;
        end: Date;
    };
    metrics: string[];
    groupBy?: string[];
    filters?: Record<string, any>;
    aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
}
export interface AnalyticsResult {
    query: AnalyticsQuery;
    data: Array<Record<string, any>>;
    metadata: {
        totalRecords: number;
        executionTime: number;
        cacheHit: boolean;
        dataFreshness: Date;
    };
    insights?: AIInsight[];
}
export interface AIInsight {
    type: 'trend' | 'anomaly' | 'prediction' | 'recommendation';
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    confidence: number;
    evidence: Record<string, any>;
    actionable: boolean;
    recommendation?: string;
}
export interface SecurityAnalytics {
    organizationId: string;
    timeRange: {
        start: Date;
        end: Date;
    };
    summary: {
        totalFindings: number;
        criticalFindings: number;
        resolvedFindings: number;
        averageResolutionTime: number;
        securityScore: number;
        trendDirection: 'improving' | 'stable' | 'declining';
    };
    topThreats: Array<{
        type: string;
        count: number;
        severity: string;
        trend: number;
    }>;
    complianceStatus: Record<string, {
        score: number;
        violations: number;
        trend: number;
    }>;
    riskHeatmap: Array<{
        service: string;
        region: string;
        riskLevel: number;
        findingsCount: number;
    }>;
}
export interface CostAnalytics {
    organizationId: string;
    timeRange: {
        start: Date;
        end: Date;
    };
    summary: {
        totalCost: number;
        projectedCost: number;
        potentialSavings: number;
        wastePercentage: number;
        costTrend: number;
    };
    serviceBreakdown: Array<{
        service: string;
        cost: number;
        percentage: number;
        trend: number;
    }>;
    regionBreakdown: Array<{
        region: string;
        cost: number;
        percentage: number;
    }>;
    optimizationOpportunities: Array<{
        type: string;
        description: string;
        potentialSavings: number;
        confidence: number;
    }>;
}
export interface PerformanceAnalytics {
    organizationId: string;
    timeRange: {
        start: Date;
        end: Date;
    };
    summary: {
        averageResponseTime: number;
        errorRate: number;
        throughput: number;
        availability: number;
        performanceScore: number;
    };
    trends: Array<{
        metric: string;
        values: Array<{
            timestamp: Date;
            value: number;
        }>;
        trend: 'up' | 'down' | 'stable';
        changePercentage: number;
    }>;
    bottlenecks: Array<{
        component: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        description: string;
        impact: string;
        recommendation: string;
    }>;
}
export declare class AdvancedAnalytics {
    private prisma;
    private queryCache;
    private readonly CACHE_TTL;
    /**
     * Execute analytics query with intelligent caching
     */
    executeQuery(query: AnalyticsQuery): Promise<AnalyticsResult>;
    /**
     * Get comprehensive security analytics
     */
    getSecurityAnalytics(organizationId: string, timeRange: {
        start: Date;
        end: Date;
    }): Promise<SecurityAnalytics>;
    /**
     * Get comprehensive cost analytics
     */
    getCostAnalytics(organizationId: string, timeRange: {
        start: Date;
        end: Date;
    }): Promise<CostAnalytics>;
    /**
     * Get comprehensive performance analytics
     */
    getPerformanceAnalytics(organizationId: string, timeRange: {
        start: Date;
        end: Date;
    }): Promise<PerformanceAnalytics>;
    /**
     * Generate AI-powered insights
     */
    private generateAIInsights;
    /**
     * Analyze trends in data
     */
    private analyzeTrends;
    /**
     * Detect anomalies in data
     */
    private detectAnomalies;
    /**
     * Generate predictive insights
     */
    private generatePredictions;
    /**
     * Generate actionable recommendations
     */
    private generateRecommendations;
    /**
     * Helper methods
     */
    private generateCacheKey;
    private getCachedResult;
    private cacheResult;
    private executeRawQuery;
    private mapSeverityToNumber;
    private calculateSecurityScore;
    private calculateSecurityTrend;
    private calculateThreatSeverity;
    private getSeverityWeight;
    private projectFutureCosts;
    private projectFutureCostsFromGrouped;
    private calculateCostTrend;
    private calculateCostTrendFromGrouped;
    private generateTrendData;
    private calculateLinearTrend;
}
export declare const advancedAnalytics: AdvancedAnalytics;
//# sourceMappingURL=advanced-analytics.d.ts.map