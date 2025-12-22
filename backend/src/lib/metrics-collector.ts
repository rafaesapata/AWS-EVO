/**
 * Metrics Collector - Sistema de coleta de métricas
 */

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

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

class MetricsCollector {
  private cloudWatch: CloudWatchClient;
  private config: MetricsConfig;
  private metricsBatch: Metric[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: MetricsConfig) {
    this.config = {
      batchSize: 20,
      flushInterval: 60000, // 1 minute
      ...config,
    };

    this.cloudWatch = new CloudWatchClient({
      region: this.config.region || process.env.AWS_REGION || 'us-east-1',
    });

    // Auto-flush metrics periodically
    this.startAutoFlush();
  }

  /**
   * Record a metric
   */
  record(metric: Metric): void {
    this.metricsBatch.push({
      ...metric,
      timestamp: metric.timestamp || new Date(),
    });

    // Flush if batch is full
    if (this.metricsBatch.length >= this.config.batchSize!) {
      this.flush();
    }
  }

  /**
   * Record multiple metrics
   */
  recordBatch(metrics: Metric[]): void {
    metrics.forEach(metric => this.record(metric));
  }

  /**
   * Flush metrics to CloudWatch
   */
  async flush(): Promise<void> {
    if (this.metricsBatch.length === 0) return;

    const batch = this.metricsBatch.splice(0, this.config.batchSize!);
    
    try {
      const metricData = batch.map(metric => ({
        MetricName: metric.name,
        Value: metric.value,
        Unit: metric.unit as any, // CloudWatch StandardUnit
        Timestamp: metric.timestamp,
        Dimensions: metric.dimensions ? Object.entries(metric.dimensions).map(([Name, Value]) => ({ Name, Value })) : undefined,
      }));

      await this.cloudWatch.send(new PutMetricDataCommand({
        Namespace: this.config.namespace,
        MetricData: metricData,
      }));

      console.log(`Flushed ${batch.length} metrics to CloudWatch`);
    } catch (error) {
      console.error('Failed to flush metrics:', error);
      // Re-add metrics to batch for retry
      this.metricsBatch.unshift(...batch);
    }
  }

  /**
   * Start auto-flush timer
   */
  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval!);
  }

  /**
   * Stop auto-flush and flush remaining metrics
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }

  /**
   * Helper methods for common metrics
   */
  recordCounter(name: string, value: number = 1, dimensions?: Record<string, string>): void {
    this.record({
      name,
      value,
      unit: 'Count',
      dimensions,
    });
  }

  recordTimer(name: string, milliseconds: number, dimensions?: Record<string, string>): void {
    this.record({
      name,
      value: milliseconds,
      unit: 'Milliseconds',
      dimensions,
    });
  }

  recordGauge(name: string, value: number, dimensions?: Record<string, string>): void {
    this.record({
      name,
      value,
      unit: 'None',
      dimensions,
    });
  }

  recordBytes(name: string, bytes: number, dimensions?: Record<string, string>): void {
    this.record({
      name,
      value: bytes,
      unit: 'Bytes',
      dimensions,
    });
  }

  recordPercent(name: string, percent: number, dimensions?: Record<string, string>): void {
    this.record({
      name,
      value: percent,
      unit: 'Percent',
      dimensions,
    });
  }
}

// Global instance
export const metricsCollector = new MetricsCollector({
  namespace: 'EVO-UDS',
  region: process.env.AWS_REGION || 'us-east-1',
});

export { MetricsCollector };