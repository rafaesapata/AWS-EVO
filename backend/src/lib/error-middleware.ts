/**
 * EVO Platform - Error Monitoring Middleware
 *
 * Wraps any Lambda handler to provide:
 * 1. Automatic exception capture and structured logging
 * 2. HTTP status code monitoring (4xx, 5xx)
 * 3. Request duration measurement
 * 4. Correlation ID injection
 * 5. Safe error responses (no internal details leaked)
 *
 * Usage:
 *   export const handler = withErrorMonitoring('run-sql', async (event, context) => {
 *     // ... handler logic
 *   });
 */

import type { APIGatewayProxyResultV2 } from '../types/lambda.js';
import { logger } from './logger.js';
import { getUserFromEvent } from './auth.js';
import { randomUUID } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

type HandlerFn = (event: any, context: any) => Promise<APIGatewayProxyResultV2>;

interface ErrorMonitoringOptions {
  /** Threshold in ms to log slow requests (default: 5000) */
  slowThresholdMs?: number;
  /** Whether to extract userId from event (default: true) */
  extractUser?: boolean;
  /** Whether to extract organizationId from event (default: true) */
  extractOrg?: boolean;
  /** Custom error response message for 500s (default: 'Internal Server Error') */
  errorMessage?: string;
}

// Known client errors that don't need full stack traces
const KNOWN_CLIENT_ERRORS = [
  'ZodError',
  'ValidationError',
  'UnauthorizedError',
  'ForbiddenError',
  'NotFoundError',
  'AuthValidationError',
  'RateLimitError',
];

// ============================================================================
// MIDDLEWARE
// ============================================================================

export function withErrorMonitoring(
  handlerName: string,
  handler: HandlerFn,
  options: ErrorMonitoringOptions = {},
): HandlerFn {
  const {
    slowThresholdMs = 5000,
    extractUser = true,
    extractOrg = true,
    errorMessage = 'Internal Server Error',
  } = options;

  return async (event: any, context: any): Promise<APIGatewayProxyResultV2> => {
    const startTime = Date.now();
    const correlationId = randomUUID();

    // ── Initialize logger context ──────────────────────────────────────
    logger.clearContext();
    logger.initFromLambda(event, context);
    logger.appendContext({
      handler: handlerName,
      correlationId,
    });

    // Extract user info safely (don't fail if auth not present)
    if (extractUser || extractOrg) {
      try {
        const user = getUserFromEvent(event);
        if (user) {
          if (extractUser) logger.appendContext({ userId: user.sub });
          if (extractOrg) logger.appendContext({ organizationId: user['custom:organization_id'] });
        }
      } catch {
        // Pre-auth handler (e.g., login, register) — no user yet
      }
    }

    // ── Execute handler ────────────────────────────────────────────────
    try {
      const response = await handler(event, context);
      const durationMs = Date.now() - startTime;

      // Inject tracking headers into response
      const enrichedResponse = {
        ...response,
        headers: {
          ...response?.headers,
          'X-Request-ID': context?.awsRequestId || 'unknown',
          'X-Correlation-ID': correlationId,
          'X-Response-Time': `${durationMs}ms`,
        },
      };

      const statusCode = response?.statusCode || 200;

      // ── Log based on status code ───────────────────────────────────
      if (statusCode >= 500) {
        logger.error(`Handler returned ${statusCode}`, undefined, {
          statusCode,
          durationMs,
          errorType: 'SERVER_ERROR',
          responseBody: safeExtractErrorMessage(response?.body),
        });
      } else if (statusCode >= 400) {
        logger.warn(`Handler returned ${statusCode}`, {
          statusCode,
          durationMs,
          errorType: 'CLIENT_ERROR',
        });
      } else {
        logger.debug(`Handler completed ${statusCode}`, {
          statusCode,
          durationMs,
        });
      }

      // ── Slow request detection ─────────────────────────────────────
      if (durationMs > slowThresholdMs) {
        logger.slowOperation(handlerName, durationMs, slowThresholdMs);
      }

      return enrichedResponse;
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const error = err instanceof Error ? err : new Error(String(err));

      // ── Determine severity ─────────────────────────────────────────
      const isKnownClientError = KNOWN_CLIENT_ERRORS.includes(error.name);

      if (isKnownClientError) {
        // Map error names to appropriate HTTP status codes
        const statusCodeMap: Record<string, number> = {
          ForbiddenError: 403,
          UnauthorizedError: 401,
          NotFoundError: 404,
          RateLimitError: 429,
        };
        const statusCode = statusCodeMap[error.name] || 400;

        logger.warn(`Client error in ${handlerName}: ${error.message}`, {
          statusCode,
          durationMs,
          errorType: 'CLIENT_ERROR',
          errorName: error.name,
        });

        return {
          statusCode,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-ID': correlationId,
          },
          body: JSON.stringify({
            success: false,
            error: error.message,
            correlationId,
          }),
        };
      }

      // ── Unhandled server error: CRITICAL ───────────────────────────
      logger.critical(`Unhandled exception in ${handlerName}`, error, {
        statusCode: 500,
        durationMs,
        errorType: 'UNHANDLED_EXCEPTION',
      });

      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          'X-Response-Time': `${durationMs}ms`,
        },
        body: JSON.stringify({
          success: false,
          error: errorMessage,
          correlationId,
        }),
      };
    } finally {
      logger.clearContext();
    }
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/** Safely extract error message from response body for logging. */
function safeExtractErrorMessage(body?: string): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body);
    return typeof parsed.error === 'string'
      ? parsed.error.substring(0, 200)
      : typeof parsed.message === 'string'
        ? parsed.message.substring(0, 200)
        : undefined;
  } catch {
    return body.substring(0, 100);
  }
}
