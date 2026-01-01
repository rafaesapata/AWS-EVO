/**
 * Metrics Collector - Sistema de coleta de métricas
 */
export interface Metric {
    name: string;
    value: number;
    unit: string;
    dimensions?: Record<string, string>;
    timestamp?: Date;
}
export interface MetricsConfig {
    namespace: string;
    region?: string;
    batchSize?: number;
    flushInterval?: number;
}
declare class MetricsCollector {
    private cloudWatch;
    private config;
    private metricsBatch;
    private flushTimer?;
    constructor(config: MetricsConfig);
    /**
     * Record a metric
     */
    record(metric: Metric): void;
    /**
     * Record multiple metrics
     */
    recordBatch(metrics: Metric[]): void;
    /**
     * Flush metrics to CloudWatch
     */
    flush(): Promise<void>;
    /**
     * Start auto-flush timer
     */
    private startAutoFlush;
    /**
     * Stop auto-flush and flush remaining metrics
     */
    stop(): Promise<void>;
    /**
     * Helper methods for common metrics
     */
    recordCounter(name: string, value?: number, dimensions?: Record<string, string>): void;
    recordTimer(name: string, milliseconds: number, dimensions?: Record<string, string>): void;
    recordGauge(name: string, value: number, dimensions?: Record<string, string>): void;
    recordBytes(name: string, bytes: number, dimensions?: Record<string, string>): void;
    recordPercent(name: string, percent: number, dimensions?: Record<string, string>): void;
}
export declare const metricsCollector: MetricsCollector;
export { MetricsCollector };
//# sourceMappingURL=metrics-collector.d.ts.map