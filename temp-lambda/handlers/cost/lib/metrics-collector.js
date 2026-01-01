"use strict";
/**
 * Metrics Collector - Sistema de coleta de métricas
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCollector = exports.metricsCollector = void 0;
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
class MetricsCollector {
    constructor(config) {
        this.metricsBatch = [];
        this.config = {
            batchSize: 20,
            flushInterval: 60000, // 1 minute
            ...config,
        };
        this.cloudWatch = new client_cloudwatch_1.CloudWatchClient({
            region: this.config.region || process.env.AWS_REGION || 'us-east-1',
        });
        // Auto-flush metrics periodically
        this.startAutoFlush();
    }
    /**
     * Record a metric
     */
    record(metric) {
        this.metricsBatch.push({
            ...metric,
            timestamp: metric.timestamp || new Date(),
        });
        // Flush if batch is full
        if (this.metricsBatch.length >= this.config.batchSize) {
            this.flush();
        }
    }
    /**
     * Record multiple metrics
     */
    recordBatch(metrics) {
        metrics.forEach(metric => this.record(metric));
    }
    /**
     * Flush metrics to CloudWatch
     */
    async flush() {
        if (this.metricsBatch.length === 0)
            return;
        const batch = this.metricsBatch.splice(0, this.config.batchSize);
        try {
            const metricData = batch.map(metric => ({
                MetricName: metric.name,
                Value: metric.value,
                Unit: metric.unit, // CloudWatch StandardUnit
                Timestamp: metric.timestamp,
                Dimensions: metric.dimensions ? Object.entries(metric.dimensions).map(([Name, Value]) => ({ Name, Value })) : undefined,
            }));
            await this.cloudWatch.send(new client_cloudwatch_1.PutMetricDataCommand({
                Namespace: this.config.namespace,
                MetricData: metricData,
            }));
            console.log(`Flushed ${batch.length} metrics to CloudWatch`);
        }
        catch (error) {
            console.error('Failed to flush metrics:', error);
            // Re-add metrics to batch for retry
            this.metricsBatch.unshift(...batch);
        }
    }
    /**
     * Start auto-flush timer
     */
    startAutoFlush() {
        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.config.flushInterval);
    }
    /**
     * Stop auto-flush and flush remaining metrics
     */
    async stop() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        await this.flush();
    }
    /**
     * Helper methods for common metrics
     */
    recordCounter(name, value = 1, dimensions) {
        this.record({
            name,
            value,
            unit: 'Count',
            dimensions,
        });
    }
    recordTimer(name, milliseconds, dimensions) {
        this.record({
            name,
            value: milliseconds,
            unit: 'Milliseconds',
            dimensions,
        });
    }
    recordGauge(name, value, dimensions) {
        this.record({
            name,
            value,
            unit: 'None',
            dimensions,
        });
    }
    recordBytes(name, bytes, dimensions) {
        this.record({
            name,
            value: bytes,
            unit: 'Bytes',
            dimensions,
        });
    }
    recordPercent(name, percent, dimensions) {
        this.record({
            name,
            value: percent,
            unit: 'Percent',
            dimensions,
        });
    }
}
exports.MetricsCollector = MetricsCollector;
// Global instance
exports.metricsCollector = new MetricsCollector({
    namespace: 'EVO-UDS',
    region: process.env.AWS_REGION || 'us-east-1',
});
//# sourceMappingURL=metrics-collector.js.map