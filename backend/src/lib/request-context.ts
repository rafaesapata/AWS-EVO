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

import { randomUUID } from 'crypto';
import type { AuthorizedEvent, APIGatewayProxyResultV2 } from '../types/lambda.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RequestContext {
  requestId: string;
  correlationId: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  userId?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
  path?: string;
  method?: string;
  startTime: number;
  metadata: Record<string, any>;
}

// ============================================================================
// ASYNC LOCAL STORAGE (Node.js 16+)
// ============================================================================

import { AsyncLocalStorage } from 'async_hooks';

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get current request context
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Run function with request context
 */
export function runWithContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return asyncLocalStorage.run(context, fn);
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

/**
 * Extract request context from Lambda event
 */
export function createRequestContext(event: AuthorizedEvent): RequestContext {
  const headers = event.headers || {};
  
  // Extract or generate request ID
  const requestId = headers['x-request-id'] || 
                    headers['X-Request-ID'] ||
                    headers['x-amzn-requestid'] ||
                    headers['X-Amzn-RequestId'] ||
                    randomUUID();

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
export function getContextHeaders(context?: RequestContext): Record<string, string> {
  const ctx = context || getRequestContext();
  
  if (!ctx) {
    return {};
  }

  const headers: Record<string, string> = {
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
export function getPropagationHeaders(context?: RequestContext): Record<string, string> {
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
export function withRequestContext(
  handler: (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>
): (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2> {
  return async (event: AuthorizedEvent, lambdaContext: any): Promise<APIGatewayProxyResultV2> => {
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
export function getLoggingContext(): Record<string, any> {
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
export function addContextMetadata(key: string, value: any): void {
  const ctx = getRequestContext();
  if (ctx) {
    ctx.metadata[key] = value;
  }
}

/**
 * Get request duration
 */
export function getRequestDuration(): number {
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
export function createSpan(name: string): {
  spanId: string;
  end: () => void;
} {
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
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const span = createSpan(name);
  try {
    return await fn();
  } finally {
    span.end();
  }
}
