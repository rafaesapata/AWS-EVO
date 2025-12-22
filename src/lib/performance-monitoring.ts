/**
 * Performance Monitoring System
 * Provides comprehensive performance tracking and optimization
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from './logging';

export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  type: 'timing' | 'counter' | 'gauge' | 'histogram';
  tags?: Record<string, string>;
  unit?: string;
}

export interface PerformanceEntry {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
  children: PerformanceEntry[];
  parent?: PerformanceEntry;
}

export interface WebVitals {
  FCP?: number; // First Contentful Paint
  LCP?: number; // Largest Contentful Paint
  FID?: number; // First Input Delay
  CLS?: number; // Cumulative Layout Shift
  TTFB?: number; // Time to First Byte
  INP?: number; // Interaction to Next Paint
}

/**
 * Performance Monitor Class
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private entries: Map<string, PerformanceEntry> = new Map();
  private observers: PerformanceObserver[] = [];
  private webVitals: WebVitals = {};
  private isEnabled = true;

  constructor() {
    this.setupObservers();
    this.setupWebVitals();
  }

  private setupObservers(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    // Navigation timing
    try {
      const navObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordNavigationTiming(entry as PerformanceNavigationTiming);
        }
      });
      navObserver.observe({ entryTypes: ['navigation'] });
      this.observers.push(navObserver);
    } catch (error) {
      console.warn('Navigation timing observer not supported');
    }

    // Resource timing
    try {
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordResourceTiming(entry as PerformanceResourceTiming);
        }
      });
      resourceObserver.observe({ entryTypes: ['resource'] });
      this.observers.push(resourceObserver);
    } catch (error) {
      console.warn('Resource timing observer not supported');
    }

    // Long tasks
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordLongTask(entry);
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
      this.observers.push(longTaskObserver);
    } catch (error) {
      console.warn('Long task observer not supported');
    }

    // Layout shifts
    try {
      const layoutShiftObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordLayoutShift(entry as any);
        }
      });
      layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(layoutShiftObserver);
    } catch (error) {
      console.warn('Layout shift observer not supported');
    }
  }

  private setupWebVitals(): void {
    if (typeof window === 'undefined') return;

    // First Contentful Paint
    this.observeWebVital('first-contentful-paint', (value) => {
      this.webVitals.FCP = value;
      this.recordMetric('web_vitals_fcp', value, 'timing', { unit: 'ms' });
    });

    // Largest Contentful Paint
    this.observeWebVital('largest-contentful-paint', (value) => {
      this.webVitals.LCP = value;
      this.recordMetric('web_vitals_lcp', value, 'timing', { unit: 'ms' });
    });

    // First Input Delay
    this.observeWebVital('first-input', (value) => {
      this.webVitals.FID = value;
      this.recordMetric('web_vitals_fid', value, 'timing', { unit: 'ms' });
    });

    // Cumulative Layout Shift
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
      this.webVitals.CLS = clsValue;
      this.recordMetric('web_vitals_cls', clsValue, 'gauge');
    });
    
    try {
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(clsObserver);
    } catch (error) {
      console.warn('CLS observer not supported');
    }
  }

  private observeWebVital(entryType: string, callback: (value: number) => void): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          callback(entry.startTime);
        }
      });
      observer.observe({ entryTypes: [entryType] });
      this.observers.push(observer);
    } catch (error) {
      console.warn(`${entryType} observer not supported`);
    }
  }

  private recordNavigationTiming(entry: PerformanceNavigationTiming): void {
    const metrics = [
      { name: 'dns_lookup', value: entry.domainLookupEnd - entry.domainLookupStart },
      { name: 'tcp_connect', value: entry.connectEnd - entry.connectStart },
      { name: 'ssl_handshake', value: entry.connectEnd - entry.secureConnectionStart },
      { name: 'ttfb', value: entry.responseStart - entry.requestStart },
      { name: 'response_time', value: entry.responseEnd - entry.responseStart },
      { name: 'dom_parse', value: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart },
      { name: 'dom_ready', value: entry.domContentLoadedEventEnd - entry.navigationStart },
      { name: 'page_load', value: entry.loadEventEnd - entry.navigationStart },
    ];

    metrics.forEach(metric => {
      if (metric.value > 0) {
        this.recordMetric(`navigation_${metric.name}`, metric.value, 'timing', { unit: 'ms' });
      }
    });

    // Record TTFB for Web Vitals
    this.webVitals.TTFB = entry.responseStart - entry.requestStart;
  }

  private recordResourceTiming(entry: PerformanceResourceTiming): void {
    const duration = entry.responseEnd - entry.startTime;
    const resourceType = this.getResourceType(entry.name);
    
    this.recordMetric('resource_load_time', duration, 'timing', {
      resource_type: resourceType,
      resource_name: entry.name,
      unit: 'ms',
    });

    // Track slow resources
    if (duration > 1000) { // > 1 second
      logger.warn('Slow resource detected', {
        resource: entry.name,
        duration,
        type: resourceType,
      });
    }
  }

  private recordLongTask(entry: PerformanceEntry): void {
    this.recordMetric('long_task', entry.duration, 'timing', {
      unit: 'ms',
      threshold: '50ms',
    });

    logger.warn('Long task detected', {
      duration: entry.duration,
      startTime: entry.startTime,
    });
  }

  private recordLayoutShift(entry: any): void {
    if (!entry.hadRecentInput) {
      this.recordMetric('layout_shift', entry.value, 'gauge', {
        sources: entry.sources?.length || 0,
      });
    }
  }

  private getResourceType(url: string): string {
    if (url.includes('.js')) return 'script';
    if (url.includes('.css')) return 'stylesheet';
    if (url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|eot)$/)) return 'font';
    if (url.includes('/api/')) return 'api';
    return 'other';
  }

  recordMetric(
    name: string,
    value: number,
    type: PerformanceMetric['type'] = 'gauge',
    tags?: Record<string, string>,
    unit?: string
  ): void {
    if (!this.isEnabled) return;

    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      type,
      tags,
      unit,
    };

    this.metrics.push(metric);

    // Keep only recent metrics (last 1000)
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    logger.debug('Performance metric recorded', metric);
  }

  startTiming(name: string, metadata?: Record<string, any>): string {
    const id = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const entry: PerformanceEntry = {
      id,
      name,
      startTime: performance.now(),
      metadata,
      children: [],
    };

    this.entries.set(id, entry);
    return id;
  }

  endTiming(id: string): number | null {
    const entry = this.entries.get(id);
    if (!entry) return null;

    entry.endTime = performance.now();
    entry.duration = entry.endTime - entry.startTime;

    this.recordMetric(`timing_${entry.name}`, entry.duration, 'timing', {
      operation: entry.name,
      unit: 'ms',
    });

    return entry.duration;
  }

  measureFunction<T extends (...args: any[]) => any>(
    fn: T,
    name?: string
  ): T {
    const functionName = name || fn.name || 'anonymous';
    
    return ((...args: any[]) => {
      const timingId = this.startTiming(functionName, { args: args.length });
      
      try {
        const result = fn(...args);
        
        // Handle async functions
        if (result instanceof Promise) {
          return result.finally(() => {
            this.endTiming(timingId);
          });
        }
        
        // Handle sync functions
        this.endTiming(timingId);
        return result;
      } catch (error) {
        this.endTiming(timingId);
        this.recordMetric(`error_${functionName}`, 1, 'counter');
        throw error;
      }
    }) as T;
  }

  measureComponent(componentName: string) {
    return {
      onMount: () => this.startTiming(`${componentName}_mount`),
      onUnmount: (timingId: string) => {
        const duration = this.endTiming(timingId);
        if (duration && duration > 100) { // > 100ms
          logger.warn('Slow component mount', {
            component: componentName,
            duration,
          });
        }
      },
      onRender: () => this.startTiming(`${componentName}_render`),
      onRenderComplete: (timingId: string) => this.endTiming(timingId),
    };
  }

  getMetrics(filter?: {
    name?: string;
    type?: PerformanceMetric['type'];
    since?: number;
  }): PerformanceMetric[] {
    let filtered = this.metrics;

    if (filter) {
      if (filter.name) {
        filtered = filtered.filter(m => m.name.includes(filter.name!));
      }
      if (filter.type) {
        filtered = filtered.filter(m => m.type === filter.type);
      }
      if (filter.since) {
        filtered = filtered.filter(m => m.timestamp >= filter.since!);
      }
    }

    return filtered;
  }

  getWebVitals(): WebVitals {
    return { ...this.webVitals };
  }

  getPerformanceSummary(): {
    webVitals: WebVitals;
    averages: Record<string, number>;
    counts: Record<string, number>;
    slowOperations: Array<{ name: string; duration: number }>;
  } {
    const averages: Record<string, number> = {};
    const counts: Record<string, number> = {};
    const slowOperations: Array<{ name: string; duration: number }> = [];

    // Calculate averages and counts
    const metricGroups = this.metrics.reduce((acc, metric) => {
      if (!acc[metric.name]) {
        acc[metric.name] = [];
      }
      acc[metric.name].push(metric.value);
      return acc;
    }, {} as Record<string, number[]>);

    for (const [name, values] of Object.entries(metricGroups)) {
      counts[name] = values.length;
      averages[name] = values.reduce((sum, val) => sum + val, 0) / values.length;

      // Find slow operations (> 1 second)
      const maxValue = Math.max(...values);
      if (maxValue > 1000 && name.includes('timing_')) {
        slowOperations.push({ name, duration: maxValue });
      }
    }

    return {
      webVitals: this.webVitals,
      averages,
      counts,
      slowOperations: slowOperations.sort((a, b) => b.duration - a.duration),
    };
  }

  exportMetrics(): string {
    return JSON.stringify({
      timestamp: Date.now(),
      webVitals: this.webVitals,
      metrics: this.metrics,
      summary: this.getPerformanceSummary(),
    }, null, 2);
  }

  clearMetrics(): void {
    this.metrics = [];
    this.entries.clear();
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  destroy(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.clearMetrics();
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * React hook for performance monitoring
 */
export function usePerformanceMonitor() {
  const [webVitals, setWebVitals] = useState<WebVitals>({});
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setWebVitals(performanceMonitor.getWebVitals());
      setSummary(performanceMonitor.getPerformanceSummary());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const measureFunction = useCallback(<T extends (...args: any[]) => any>(
    fn: T,
    name?: string
  ): T => {
    return performanceMonitor.measureFunction(fn, name);
  }, []);

  const startTiming = useCallback((name: string, metadata?: Record<string, any>) => {
    return performanceMonitor.startTiming(name, metadata);
  }, []);

  const endTiming = useCallback((id: string) => {
    return performanceMonitor.endTiming(id);
  }, []);

  const recordMetric = useCallback((
    name: string,
    value: number,
    type?: PerformanceMetric['type'],
    tags?: Record<string, string>
  ) => {
    performanceMonitor.recordMetric(name, value, type, tags);
  }, []);

  return {
    webVitals,
    summary,
    measureFunction,
    startTiming,
    endTiming,
    recordMetric,
  };
}

/**
 * React hook for component performance monitoring
 */
export function useComponentPerformance(componentName: string) {
  const timingRef = useRef<string>();
  const renderTimingRef = useRef<string>();

  useEffect(() => {
    // Component mount
    timingRef.current = performanceMonitor.startTiming(`${componentName}_mount`);

    return () => {
      // Component unmount
      if (timingRef.current) {
        performanceMonitor.endTiming(timingRef.current);
      }
    };
  }, [componentName]);

  const startRender = useCallback(() => {
    renderTimingRef.current = performanceMonitor.startTiming(`${componentName}_render`);
  }, [componentName]);

  const endRender = useCallback(() => {
    if (renderTimingRef.current) {
      performanceMonitor.endTiming(renderTimingRef.current);
    }
  }, []);

  return { startRender, endRender };
}

/**
 * Performance monitoring HOC
 */
export function withPerformanceMonitoring<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
) {
  const name = componentName || Component.displayName || Component.name || 'Unknown';
  
  return function PerformanceMonitoredComponent(props: P) {
    const { startRender, endRender } = useComponentPerformance(name);
    
    useEffect(() => {
      startRender();
      endRender();
    });

    return <Component {...props} />;
  };
}

/**
 * Bundle size analyzer
 */
export async function analyzeBundleSize(): Promise<{
  totalSize: number;
  chunks: Array<{ name: string; size: number }>;
}> {
  try {
    // Get bundle information from build manifest or performance API
    const chunks: Array<{ name: string; size: number }> = [];
    
    // Check if we have access to performance navigation API
    if (typeof window !== 'undefined' && 'performance' in window) {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (entries.length > 0) {
        const entry = entries[0];
        chunks.push({
          name: 'main',
          size: entry.transferSize || 0
        });
      }
      
      // Get resource entries for additional chunks
      const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      resourceEntries
        .filter(entry => entry.name.includes('.js') || entry.name.includes('.css'))
        .forEach((entry, index) => {
          const name = entry.name.split('/').pop()?.split('.')[0] || `chunk-${index}`;
          chunks.push({
            name,
            size: entry.transferSize || 0
          });
        });
    }
    
    // Fallback: estimate based on document size
    if (chunks.length === 0) {
      const documentSize = typeof document !== 'undefined' 
        ? new Blob([document.documentElement.outerHTML]).size 
        : 0;
      
      chunks.push({
        name: 'estimated',
        size: documentSize
      });
    }
    
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    
    return { totalSize, chunks };
  } catch (error) {
    console.error('Bundle size analysis failed:', error);
    // Return minimal fallback data
    return {
      totalSize: 0,
      chunks: [{ name: 'unknown', size: 0 }]
    };
  }
}