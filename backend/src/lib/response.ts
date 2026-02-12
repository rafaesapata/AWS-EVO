/**
 * Helpers para respostas HTTP padronizadas com segurança aprimorada
 */

import type { APIGatewayProxyResultV2 } from '../types/lambda.js';
import { generateCORSHeaders, SECURE_CORS_CONFIG } from './security-headers.js';

// Base headers with security considerations
const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Request context for tracking — reset at the start of each invocation
// to prevent state leaking between Lambda warm-start invocations
let currentRequestId: string | undefined;
let currentCorrelationId: string | undefined;

/**
 * Set request context for response headers.
 * MUST be called at the start of every Lambda invocation to avoid
 * stale tracking headers from a previous warm-start request.
 */
export function setRequestContext(requestId?: string, correlationId?: string): void {
  currentRequestId = requestId;
  currentCorrelationId = correlationId;
}

/**
 * Clear request context — call at the beginning of each handler
 * to guarantee no state leaks from previous Lambda warm-start invocations.
 */
export function clearRequestContext(): void {
  currentRequestId = undefined;
  currentCorrelationId = undefined;
}

/**
 * Get request context
 */
export function getRequestContext(): { requestId?: string; correlationId?: string } {
  return { requestId: currentRequestId, correlationId: currentCorrelationId };
}

/**
 * Generate response headers with CORS, security, and request tracking
 * CORS headers are ALWAYS included - uses '*' as fallback when origin is not provided
 */
function getResponseHeaders(origin?: string, additionalHeaders?: Record<string, string>): Record<string, string> {
  // Always generate CORS headers - use '*' as fallback for maximum compatibility
  const corsHeaders = generateCORSHeaders(origin || '*', SECURE_CORS_CONFIG);
  
  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    ...corsHeaders,
    ...additionalHeaders,
  };
  
  // Add request tracking headers
  if (currentRequestId) {
    headers['X-Request-ID'] = currentRequestId;
  }
  if (currentCorrelationId) {
    headers['X-Correlation-ID'] = currentCorrelationId;
  }
  
  return headers;
}

export function success<T = any>(
  data: T, 
  statusCode = 200, 
  origin?: string,
  additionalHeaders?: Record<string, string>
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: getResponseHeaders(origin, additionalHeaders),
    body: JSON.stringify({ 
      success: true, 
      data,
      timestamp: new Date().toISOString(),
    }),
  };
}

export function error(
  message: string, 
  statusCode = 500, 
  details?: any,
  origin?: string,
  additionalHeaders?: Record<string, string>
): APIGatewayProxyResultV2 {
  console.error('Error response:', { message, statusCode, details });
  
  // Never expose internal details to clients - always sanitize
  const sanitizedDetails = (process.env.NODE_ENV === 'development' && process.env.IS_LOCAL === 'true') ? details : undefined;
  
  // SECURITY: Sanitize error messages in production to prevent info leakage
  // Internal errors (DB, Prisma, AWS SDK) should not be exposed to clients
  const isProduction = process.env.NODE_ENV === 'production' || !process.env.IS_LOCAL;
  let sanitizedMessage = message;
  if (isProduction && statusCode >= 500) {
    // Check for common internal error patterns that should not be exposed
    const internalPatterns = [
      /prisma/i, /database/i, /connection.*refused/i, /ECONNREFUSED/i,
      /timeout.*exceeded/i, /socket.*hang/i, /ETIMEDOUT/i,
      /aws.*sdk/i, /credential.*error/i, /access.*denied.*aws/i,
      /stack.*at\s/i, /node_modules/i, /\.ts:\d+/i, /\.js:\d+/i,
    ];
    if (internalPatterns.some(pattern => pattern.test(message))) {
      sanitizedMessage = 'An internal error occurred. Please try again later.';
    }
  }
  
  return {
    statusCode,
    headers: getResponseHeaders(origin, additionalHeaders),
    body: JSON.stringify({
      success: false,
      error: sanitizedMessage,
      timestamp: new Date().toISOString(),
      ...(sanitizedDetails && { details: sanitizedDetails }),
    }),
  };
}

export function unauthorized(
  message = 'Authentication required',
  origin?: string
): APIGatewayProxyResultV2 {
  return error(message, 401, undefined, origin, {
    'WWW-Authenticate': 'Bearer realm="API"',
  });
}

export function forbidden(
  message = 'Access denied',
  origin?: string
): APIGatewayProxyResultV2 {
  return error(message, 403, undefined, origin);
}

export function notFound(
  message = 'Resource not found',
  origin?: string
): APIGatewayProxyResultV2 {
  return error(message, 404, undefined, origin);
}

export function badRequest(
  message: string, 
  details?: any,
  origin?: string
): APIGatewayProxyResultV2 {
  return error(message, 400, details, origin);
}

export function tooManyRequests(
  message = 'Rate limit exceeded',
  retryAfter?: number,
  origin?: string
): APIGatewayProxyResultV2 {
  const additionalHeaders: Record<string, string> = {};
  
  if (retryAfter) {
    additionalHeaders['Retry-After'] = retryAfter.toString();
  }
  
  return error(message, 429, undefined, origin, additionalHeaders);
}

export function corsOptions(origin?: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: getResponseHeaders(origin),
    body: '',
  };
}

export function healthCheck(
  status: 'healthy' | 'unhealthy' = 'healthy',
  details?: Record<string, any>,
  origin?: string
): APIGatewayProxyResultV2 {
  const statusCode = status === 'healthy' ? 200 : 503;
  
  return {
    statusCode,
    headers: getResponseHeaders(origin, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    }),
    body: JSON.stringify({
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ...(details && { details }),
    }),
  };
}

/**
 * Paginated response helper
 */
export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  origin?: string
): APIGatewayProxyResultV2 {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;
  
  return success({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext,
      hasPrev,
    },
  }, 200, origin);
}

/**
 * Streaming response for large datasets
 */
export function streamingResponse(
  data: any,
  isLast: boolean = false,
  origin?: string
): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: getResponseHeaders(origin, {
      'Transfer-Encoding': 'chunked',
      'X-Stream-End': isLast.toString(),
    }),
    body: JSON.stringify(data),
  };
}

/**
 * Safe handler wrapper — wraps any Lambda handler with a top-level try/catch
 * to prevent unhandled exceptions from causing raw 500 errors.
 * 
 * Usage:
 *   export const handler = safeHandler(async (event, context) => { ... });
 */
export function safeHandler(
  fn: (event: any, context: any) => Promise<APIGatewayProxyResultV2>
): (event: any, context: any) => Promise<APIGatewayProxyResultV2> {
  return async (event: any, context: any): Promise<APIGatewayProxyResultV2> => {
    try {
      return await fn(event, context);
    } catch (err: any) {
      console.error('Unhandled handler error:', err?.message || err, {
        requestId: context?.awsRequestId,
        functionName: context?.functionName,
      });
      return error('An internal error occurred. Please try again later.', 500);
    }
  };
}
