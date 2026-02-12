/**
 * OpenTelemetry Tracing Module
 * Provides distributed tracing for Lambda functions
 * 
 * Features:
 * - Automatic span creation for handlers
 * - AWS X-Ray integration
 * - Custom attributes and events
 * - Error tracking
 */

import { logger } from './logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface Span {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  attributes: SpanAttributes;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: SpanAttributes;
}

// ============================================================================
// SPAN MANAGEMENT
// ============================================================================

const activeSpans = new Map<string, Span>();

function generateId(length: number = 16): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Extract trace context from AWS X-Ray header or generate new
 */
export function extractTraceContext(headers: Record<string, string | undefined>): SpanContext {
  const xrayHeader = headers['x-amzn-trace-id'] || headers['X-Amzn-Trace-Id'];
  
  if (xrayHeader) {
    // Parse X-Ray trace header: Root=1-xxx-xxx;Parent=xxx;Sampled=1
    const parts = xrayHeader.split(';').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    return {
      traceId: parts['Root'] || generateId(32),
      spanId: generateId(16),
      parentSpanId: parts['Parent'],
      sampled: parts['Sampled'] === '1',
    };
  }

  return {
    traceId: generateId(32),
    spanId: generateId(16),
    sampled: Math.random() < 0.1, // 10% sampling rate
  };
}

/**
 * Create a new span
 */
export function startSpan(
  name: string,
  context?: SpanContext,
  attributes?: SpanAttributes
): Span {
  const spanContext = context || {
    traceId: generateId(32),
    spanId: generateId(16),
    sampled: true,
  };

  const span: Span = {
    name,
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    parentSpanId: spanContext.parentSpanId,
    startTime: Date.now(),
    status: 'UNSET',
    attributes: {
      'service.name': 'evo-uds-backend',
      'service.version': process.env.APP_VERSION || '1.0.0',
      ...attributes,
    },
    events: [],
  };

  activeSpans.set(span.spanId, span);
  return span;
}

/**
 * End a span
 */
export function endSpan(span: Span, status: 'OK' | 'ERROR' = 'OK'): void {
  span.endTime = Date.now();
  span.duration = span.endTime - span.startTime;
  span.status = status;

  // Log span for X-Ray or other collectors
  if (span.attributes['sampled'] !== false) {
    logger.info('Span completed', {
      trace_id: span.traceId,
      span_id: span.spanId,
      parent_span_id: span.parentSpanId,
      name: span.name,
      duration_ms: span.duration,
      status: span.status,
      attributes: span.attributes,
      events: span.events,
    });
  }

  activeSpans.delete(span.spanId);
}

/**
 * Add an event to a span
 */
export function addSpanEvent(
  span: Span,
  name: string,
  attributes?: SpanAttributes
): void {
  span.events.push({
    name,
    timestamp: Date.now(),
    attributes,
  });
}

/**
 * Set span attributes
 */
export function setSpanAttributes(span: Span, attributes: SpanAttributes): void {
  Object.assign(span.attributes, attributes);
}

/**
 * Record an error on a span
 */
export function recordError(span: Span, error: Error): void {
  span.status = 'ERROR';
  addSpanEvent(span, 'exception', {
    'exception.type': error.name,
    'exception.message': error.message,
    'exception.stacktrace': error.stack,
  });
}

// ============================================================================
// HANDLER WRAPPER
// ============================================================================

/**
 * Wrap a handler function with tracing
 */
export function withTracing<T extends (...args: any[]) => Promise<any>>(
  name: string,
  handler: T,
  attributes?: SpanAttributes
): T {
  return (async (...args: Parameters<T>) => {
    const event = args[0];
    const headers = event?.headers || {};
    
    const context = extractTraceContext(headers);
    const span = startSpan(name, context, {
      'http.method': event?.httpMethod || event?.requestContext?.http?.method,
      'http.path': event?.path || event?.requestContext?.http?.path,
      'http.user_agent': headers['user-agent'] || headers['User-Agent'],
      ...attributes,
    });

    try {
      const result = await handler(...args);
      
      // Add response attributes
      setSpanAttributes(span, {
        'http.status_code': result?.statusCode,
      });
      
      endSpan(span, result?.statusCode >= 400 ? 'ERROR' : 'OK');
      return result;
    } catch (error) {
      recordError(span, error as Error);
      endSpan(span, 'ERROR');
      throw error;
    }
  }) as T;
}

// ============================================================================
// CHILD SPAN HELPER
// ============================================================================

/**
 * Create a child span for sub-operations
 */
export function createChildSpan(
  parentSpan: Span,
  name: string,
  attributes?: SpanAttributes
): Span {
  return startSpan(name, {
    traceId: parentSpan.traceId,
    spanId: generateId(16),
    parentSpanId: parentSpan.spanId,
    sampled: parentSpan.attributes['sampled'] !== false,
  }, attributes);
}

/**
 * Trace an async operation
 */
export async function traceAsync<T>(
  parentSpan: Span,
  name: string,
  operation: () => Promise<T>,
  attributes?: SpanAttributes
): Promise<T> {
  const childSpan = createChildSpan(parentSpan, name, attributes);
  
  try {
    const result = await operation();
    endSpan(childSpan, 'OK');
    return result;
  } catch (error) {
    recordError(childSpan, error as Error);
    endSpan(childSpan, 'ERROR');
    throw error;
  }
}

// ============================================================================
// METRICS HELPERS
// ============================================================================

export interface TracingMetrics {
  totalSpans: number;
  errorSpans: number;
  avgDuration: number;
  p95Duration: number;
}

const spanDurations: number[] = [];
let totalSpans = 0;
let errorSpans = 0;

export function recordSpanMetrics(span: Span): void {
  totalSpans++;
  if (span.status === 'ERROR') errorSpans++;
  if (span.duration) {
    spanDurations.push(span.duration);
    // Keep only last 1000 durations
    if (spanDurations.length > 1000) spanDurations.shift();
  }
}

export function getTracingMetrics(): TracingMetrics {
  const sorted = [...spanDurations].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  
  return {
    totalSpans,
    errorSpans,
    avgDuration: spanDurations.length > 0 
      ? spanDurations.reduce((a, b) => a + b, 0) / spanDurations.length 
      : 0,
    p95Duration: sorted[p95Index] || 0,
  };
}
