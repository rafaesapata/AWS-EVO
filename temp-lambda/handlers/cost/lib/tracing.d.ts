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
/**
 * Extract trace context from AWS X-Ray header or generate new
 */
export declare function extractTraceContext(headers: Record<string, string | undefined>): SpanContext;
/**
 * Create a new span
 */
export declare function startSpan(name: string, context?: SpanContext, attributes?: SpanAttributes): Span;
/**
 * End a span
 */
export declare function endSpan(span: Span, status?: 'OK' | 'ERROR'): void;
/**
 * Add an event to a span
 */
export declare function addSpanEvent(span: Span, name: string, attributes?: SpanAttributes): void;
/**
 * Set span attributes
 */
export declare function setSpanAttributes(span: Span, attributes: SpanAttributes): void;
/**
 * Record an error on a span
 */
export declare function recordError(span: Span, error: Error): void;
/**
 * Wrap a handler function with tracing
 */
export declare function withTracing<T extends (...args: any[]) => Promise<any>>(name: string, handler: T, attributes?: SpanAttributes): T;
/**
 * Create a child span for sub-operations
 */
export declare function createChildSpan(parentSpan: Span, name: string, attributes?: SpanAttributes): Span;
/**
 * Trace an async operation
 */
export declare function traceAsync<T>(parentSpan: Span, name: string, operation: () => Promise<T>, attributes?: SpanAttributes): Promise<T>;
export interface TracingMetrics {
    totalSpans: number;
    errorSpans: number;
    avgDuration: number;
    p95Duration: number;
}
export declare function recordSpanMetrics(span: Span): void;
export declare function getTracingMetrics(): TracingMetrics;
//# sourceMappingURL=tracing.d.ts.map