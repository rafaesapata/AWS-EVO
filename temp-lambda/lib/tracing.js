"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTraceContext = extractTraceContext;
exports.startSpan = startSpan;
exports.endSpan = endSpan;
exports.addSpanEvent = addSpanEvent;
exports.setSpanAttributes = setSpanAttributes;
exports.recordError = recordError;
exports.withTracing = withTracing;
exports.createChildSpan = createChildSpan;
exports.traceAsync = traceAsync;
exports.recordSpanMetrics = recordSpanMetrics;
exports.getTracingMetrics = getTracingMetrics;
const logging_js_1 = require("./logging.js");
// ============================================================================
// SPAN MANAGEMENT
// ============================================================================
const activeSpans = new Map();
function generateId(length = 16) {
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
function extractTraceContext(headers) {
    const xrayHeader = headers['x-amzn-trace-id'] || headers['X-Amzn-Trace-Id'];
    if (xrayHeader) {
        // Parse X-Ray trace header: Root=1-xxx-xxx;Parent=xxx;Sampled=1
        const parts = xrayHeader.split(';').reduce((acc, part) => {
            const [key, value] = part.split('=');
            acc[key] = value;
            return acc;
        }, {});
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
function startSpan(name, context, attributes) {
    const spanContext = context || {
        traceId: generateId(32),
        spanId: generateId(16),
        sampled: true,
    };
    const span = {
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
function endSpan(span, status = 'OK') {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;
    // Log span for X-Ray or other collectors
    if (span.attributes['sampled'] !== false) {
        logging_js_1.logger.info('Span completed', {
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
function addSpanEvent(span, name, attributes) {
    span.events.push({
        name,
        timestamp: Date.now(),
        attributes,
    });
}
/**
 * Set span attributes
 */
function setSpanAttributes(span, attributes) {
    Object.assign(span.attributes, attributes);
}
/**
 * Record an error on a span
 */
function recordError(span, error) {
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
function withTracing(name, handler, attributes) {
    return (async (...args) => {
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
        }
        catch (error) {
            recordError(span, error);
            endSpan(span, 'ERROR');
            throw error;
        }
    });
}
// ============================================================================
// CHILD SPAN HELPER
// ============================================================================
/**
 * Create a child span for sub-operations
 */
function createChildSpan(parentSpan, name, attributes) {
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
async function traceAsync(parentSpan, name, operation, attributes) {
    const childSpan = createChildSpan(parentSpan, name, attributes);
    try {
        const result = await operation();
        endSpan(childSpan, 'OK');
        return result;
    }
    catch (error) {
        recordError(childSpan, error);
        endSpan(childSpan, 'ERROR');
        throw error;
    }
}
const spanDurations = [];
let totalSpans = 0;
let errorSpans = 0;
function recordSpanMetrics(span) {
    totalSpans++;
    if (span.status === 'ERROR')
        errorSpans++;
    if (span.duration) {
        spanDurations.push(span.duration);
        // Keep only last 1000 durations
        if (spanDurations.length > 1000)
            spanDurations.shift();
    }
}
function getTracingMetrics() {
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
//# sourceMappingURL=tracing.js.map