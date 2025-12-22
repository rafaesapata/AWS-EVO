/**
 * Metrics Collector for System Observability
 * Tracks performance, errors, and usage metrics
 */

interface Metric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

interface AggregatedMetric {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: Map<string, number[]> = new Map();
  private readonly maxSamples = 1000;
  private readonly retentionMs = 60 * 60 * 1000; // 1 hour

  private constructor() {
    this.startCleanupInterval();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Record a metric value
   */
  record(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const samples = this.metrics.get(key)!;
    samples.push(value);

    // Keep only the most recent samples
    if (samples.length > this.maxSamples) {
      samples.shift();
    }
  }

  /**
   * Record timing metric in milliseconds
   */
  recordTiming(name: string, startTime: number, tags?: Record<string, string>): void {
    const duration = performance.now() - startTime;
    this.record(name, duration, tags);
  }

  /**
   * Increment a counter
   */
  increment(name: string, value: number = 1, tags?: Record<string, string>): void {
    this.record(name, value, tags);
  }

  /**
   * Get aggregated statistics for a metric
   */
  getStats(name: string, tags?: Record<string, string>): AggregatedMetric | null {
    const key = this.getKey(name, tags);
    const samples = this.metrics.get(key);

    if (!samples || samples.length === 0) {
      return null;
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);

    return {
      count: sorted.length,
      sum,
      avg: sum / sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  /**
   * Get all metrics as a summary
   */
  getAllStats(): Record<string, AggregatedMetric> {
    const stats: Record<string, AggregatedMetric> = {};

    this.metrics.forEach((_, key) => {
      const metric = this.getStats(key);
      if (metric) {
        stats[key] = metric;
      }
    });

    return stats;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Clear metrics for a specific name
   */
  clearMetric(name: string, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    this.metrics.delete(key);
  }

  private getKey(name: string, tags?: Record<string, string>): string {
    if (!tags) return name;
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return `${name}{${tagString}}`;
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  private startCleanupInterval(): void {
    // Clean up old metrics every minute
    setInterval(() => {
      const cutoff = Date.now() - this.retentionMs;
      // In a real implementation, we would track timestamps per sample
      // For simplicity, we're just limiting sample count
    }, 60000);
  }

  /**
   * Log metrics summary to console
   */
  logSummary(): void {
    const stats = this.getAllStats();
    console.group('📊 Metrics Summary');
    Object.entries(stats).forEach(([name, stat]) => {
      console.log(`${name}:`, {
        count: stat.count,
        avg: `${stat.avg.toFixed(2)}ms`,
        p50: `${stat.p50.toFixed(2)}ms`,
        p95: `${stat.p95.toFixed(2)}ms`,
        p99: `${stat.p99.toFixed(2)}ms`,
      });
    });
    console.groupEnd();
  }
}

export const metricsCollector = MetricsCollector.getInstance();

/**
 * Decorator to automatically track function execution time
 */
export function trackTiming(metricName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = performance.now();
      try {
        const result = await originalMethod.apply(this, args);
        metricsCollector.recordTiming(metricName, startTime);
        return result;
      } catch (error) {
        metricsCollector.increment(`${metricName}.error`);
        throw error;
      }
    };

    return descriptor;
  };
}
