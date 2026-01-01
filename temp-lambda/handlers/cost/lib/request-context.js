"use strict";
/**
 * Request Context Management
 * Provides end-to-end request tracking across all components
 *
 * Features:
 * - Unique request ID generation
 * - Correlation ID propagation
 * - Context storage for async operations
 * - Automatic header injection
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestContext = getRequestContext;
exports.runWithContext = runWithContext;
exports.createRequestContext = createRequestContext;
exports.getContextHeaders = getContextHeaders;
exports.getPropagationHeaders = getPropagationHeaders;
exports.withRequestContext = withRequestContext;
exports.getLoggingContext = getLoggingContext;
exports.addContextMetadata = addContextMetadata;
exports.getRequestDuration = getRequestDuration;
exports.createSpan = createSpan;
exports.withSpan = withSpan;
const crypto_1 = require("crypto");
// ============================================================================
// ASYNC LOCAL STORAGE (Node.js 16+)
// ============================================================================
const async_hooks_1 = require("async_hooks");
const asyncLocalStorage = new async_hooks_1.AsyncLocalStorage();
/**
 * Get current request context
 */
function getRequestContext() {
    return asyncLocalStorage.getStore();
}
/**
 * Run function with request context
 */
function runWithContext(context, fn) {
    return asyncLocalStorage.run(context, fn);
}
// ============================================================================
// CONTEXT CREATION
// ============================================================================
/**
 * Extract request context from Lambda event
 */
function createRequestContext(event) {
    const headers = event.headers || {};
    // Extract or generate request ID
    const requestId = headers['x-request-id'] ||
        headers['X-Request-ID'] ||
        headers['x-amzn-requestid'] ||
        headers['X-Amzn-RequestId'] ||
        (0, crypto_1.randomUUID)();
    // Extract or generate correlation ID (for distributed tracing)
    const correlationId = headers['x-correlation-id'] ||
        headers['X-Correlation-ID'] ||
        requestId;
    // Extract AWS X-Ray trace ID if available
    const traceId = headers['x-amzn-trace-id'] ||
        headers['X-Amzn-Trace-Id'] ||
        process.env._X_AMZN_TRACE_ID;
    // Extract user info from authorizer
    const claims = event.requestContext?.authorizer?.claims ||
        event.requestContext?.authorizer?.jwt?.claims;
    const userId = claims?.sub;
    const organizationId = claims?.['custom:organization_id'];
    // Extract client info
    const ipAddress = headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        event.requestContext?.identity?.sourceIp ||
        'unknown';
    const userAgent = headers['user-agent'] || headers['User-Agent'] || 'unknown';
    // Extract request info
    const path = event.path || event.rawPath || '/';
    const method = event.httpMethod || event.requestContext?.http?.method || 'UNKNOWN';
    return {
        requestId,
        correlationId,
        traceId,
        userId,
        organizationId,
        ipAddress,
        userAgent,
        path,
        method,
        startTime: Date.now(),
        metadata: {},
    };
}
// ============================================================================
// CONTEXT HEADERS
// ============================================================================
/**
 * Get headers to include in response
 */
function getContextHeaders(context) {
    const ctx = context || getRequestContext();
    if (!ctx) {
        return {};
    }
    const headers = {
        'X-Request-ID': ctx.requestId,
        'X-Correlation-ID': ctx.correlationId,
    };
    if (ctx.traceId) {
        headers['X-Amzn-Trace-Id'] = ctx.traceId;
    }
    // Add response time
    const responseTime = Date.now() - ctx.startTime;
    headers['X-Response-Time'] = `${responseTime}ms`;
    return headers;
}
/**
 * Get headers to propagate to downstream services
 */
function getPropagationHeaders(context) {
    const ctx = context || getRequestContext();
    if (!ctx) {
        return {};
    }
    return {
        'X-Request-ID': ctx.requestId,
        'X-Correlation-ID': ctx.correlationId,
        ...(ctx.traceId && { 'X-Amzn-Trace-Id': ctx.traceId }),
    };
}
// ============================================================================
// MIDDLEWARE
// ============================================================================
/**
 * Middleware to wrap handler with request context
 */
function withRequestContext(handler) {
    return async (event, lambdaContext) => {
        const requestContext = createRequestContext(event);
        // Add Lambda context info
        if (lambdaContext?.awsRequestId) {
            requestContext.metadata.lambdaRequestId = lambdaContext.awsRequestId;
        }
        return runWithContext(requestContext, async () => {
            const response = await handler(event, lambdaContext);
            // Add context headers to response
            const contextHeaders = getContextHeaders(requestContext);
            return {
                ...response,
                headers: {
                    ...response.headers,
                    ...contextHeaders,
                },
            };
        });
    };
}
// ============================================================================
// LOGGING INTEGRATION
// ============================================================================
/**
 * Get context for structured logging
 */
function getLoggingContext() {
    const ctx = getRequestContext();
    if (!ctx) {
        return {};
    }
    return {
        requestId: ctx.requestId,
        correlationId: ctx.correlationId,
        traceId: ctx.traceId,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        path: ctx.path,
        method: ctx.method,
        elapsedMs: Date.now() - ctx.startTime,
    };
}
/**
 * Add metadata to current request context
 */
function addContextMetadata(key, value) {
    const ctx = getRequestContext();
    if (ctx) {
        ctx.metadata[key] = value;
    }
}
/**
 * Get request duration
 */
function getRequestDuration() {
    const ctx = getRequestContext();
    return ctx ? Date.now() - ctx.startTime : 0;
}
// ============================================================================
// SPAN MANAGEMENT (for distributed tracing)
// ============================================================================
let spanCounter = 0;
/**
 * Create a new span for tracing
 */
function createSpan(name) {
    const ctx = getRequestContext();
    const spanId = `span-${++spanCounter}-${Date.now()}`;
    const startTime = Date.now();
    if (ctx) {
        ctx.spanId = spanId;
    }
    return {
        spanId,
        end: () => {
            const duration = Date.now() - startTime;
            // Log span completion
            console.log(JSON.stringify({
                type: 'span',
                name,
                spanId,
                parentSpanId: ctx?.parentSpanId,
                requestId: ctx?.requestId,
                correlationId: ctx?.correlationId,
                durationMs: duration,
            }));
        },
    };
}
/**
 * Run function within a span
 */
async function withSpan(name, fn) {
    const span = createSpan(name);
    try {
        return await fn();
    }
    finally {
        span.end();
    }
}
//# sourceMappingURL=request-context.js.map