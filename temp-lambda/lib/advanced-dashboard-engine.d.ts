/**
 * Advanced Dashboard Engine
 * Military-grade dashboard system with real-time data visualization and AI insights
 */
import { EventEmitter } from 'events';
export interface DashboardWidget {
    id: string;
    type: 'chart' | 'metric' | 'table' | 'heatmap' | 'gauge' | 'alert' | 'ai_insight';
    title: string;
    description: string;
    dataSource: string;
    config: WidgetConfig;
    position: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    refreshInterval: number;
    permissions: string[];
    organizationId?: string;
}
export interface WidgetConfig {
    chartType?: 'line' | 'bar' | 'pie' | 'area' | 'scatter' | 'heatmap';
    metrics: string[];
    timeRange?: {
        start: Date;
        end: Date;
    };
    filters?: Record<string, any>;
    aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
    thresholds?: Array<{
        value: number;
        color: string;
        label: string;
    }>;
    aiInsights?: boolean;
    realTime?: boolean;
}
export interface Dashboard {
    id: string;
    name: string;
    description: string;
    organizationId?: string;
    widgets: DashboardWidget[];
    layout: 'grid' | 'flex' | 'custom';
    theme: 'light' | 'dark' | 'military';
    permissions: string[];
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface DashboardData {
    widgetId: string;
    data: any;
    timestamp: Date;
    metadata: {
        executionTime: number;
        cacheHit: boolean;
        dataPoints: number;
        aiInsights?: any[];
    };
}
export interface RealTimeDashboard {
    dashboardId: string;
    connectedClients: number;
    lastUpdate: Date;
    updateFrequency: number;
    dataStreams: Map<string, any>;
}
export declare class AdvancedDashboardEngine extends EventEmitter {
    private prisma;
    private dashboards;
    private realTimeDashboards;
    private widgetCache;
    private updateIntervals;
    constructor();
    /**
     * Initialize default military-grade dashboards
     */
    private initializeDefaultDashboards;
    /**
     * Create a new dashboard
     */
    createDashboard(dashboard: Omit<Dashboard, 'createdAt' | 'updatedAt'>): Dashboard;
    /**
     * Get dashboard by ID
     */
    getDashboard(dashboardId: string, organizationId?: string): Promise<Dashboard | null>;
    /**
     * Get dashboard data with real-time updates
     */
    getDashboardData(dashboardId: string, organizationId?: string): Promise<DashboardData[]>;
    /**
     * Get widget data with caching and AI insights
     */
    private getWidgetData;
    /**
     * Initialize real-time dashboard updates
     */
    private initializeRealTimeDashboard;
    /**
     * Update real-time dashboard data
     */
    private updateRealTimeDashboard;
    /**
     * Data source implementations
     */
    private getSecurityData;
    private getPerformanceData;
    private getCostData;
    private getAIInsights;
    private getGenericData;
    /**
     * Generate AI insights for widget data
     */
    private generateWidgetInsights;
    /**
     * Start real-time updates
     */
    private startRealTimeUpdates;
    /**
     * Cleanup expired cache entries
     */
    private cleanupCache;
    /**
     * Helper methods
     */
    private calculateTrend;
    private detectDataAnomalies;
    /**
     * Get all dashboards for organization
     */
    getDashboards(organizationId?: string): Dashboard[];
    /**
     * Subscribe to real-time dashboard updates
     */
    subscribeToRealTimeUpdates(dashboardId: string, callback: (data: any) => void): void;
    /**
     * Cleanup resources
     */
    cleanup(): void;
}
export declare const advancedDashboardEngine: AdvancedDashboardEngine;
//# sourceMappingURL=advanced-dashboard-engine.d.ts.map