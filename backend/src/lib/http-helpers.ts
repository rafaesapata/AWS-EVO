/**
 * HTTP helper utilities for Lambda handlers
 * Lightweight helpers without external dependencies (no zod)
 */

import type { AuthorizedEvent } from '../types/lambda.js';

/**
 * Helper to get HTTP method from event (supports both REST API v1 and HTTP API v2)
 */
export function getHttpMethod(event: AuthorizedEvent): string {
  return event.httpMethod || event.requestContext?.http?.method || 'UNKNOWN';
}

/**
 * Helper to get HTTP path from event (supports both REST API v1 and HTTP API v2)
 */
export function getHttpPath(event: AuthorizedEvent): string {
  return event.path || event.rawPath || event.requestContext?.http?.path || '/unknown';
}

/**
 * Helper to get origin from event headers
 */
export function getOriginFromEvent(event: AuthorizedEvent): string {
  const headers = event.headers || {};
  return headers['origin'] || headers['Origin'] || '*';
}

/**
 * Helper to get client IP from event
 */
export function getClientIp(event: AuthorizedEvent): string {
  const headers = event.headers || {};
  return headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
         event.requestContext?.identity?.sourceIp ||
         event.requestContext?.http?.sourceIp ||
         'unknown';
}

/**
 * Helper to get user agent from event
 */
export function getUserAgent(event: AuthorizedEvent): string {
  const headers = event.headers || {};
  return headers['user-agent'] || headers['User-Agent'] || 'unknown';
}
