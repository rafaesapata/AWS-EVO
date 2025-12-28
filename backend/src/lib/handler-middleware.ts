/**
 * Centralized Handler Middleware
 * Provides composable middleware for Lambda handlers
 * 
 * Features:
 * - Input validation with Zod
 * - Authentication and authorization
 * - Rate limiting
 * - Request context
 * - Error handling
 * - Circuit breaker
 * - API versioning
 */

import { z, ZodSchema } from 'zod';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2, CognitoUser } from '../types/lambda.js';
import { success, error, badRequest, unauthorized, forbidden, tooManyRequests, corsOptions } from './response.js';
import { getUserFromEvent, getOrganizationId, hasRole, hasAnyRole } from './auth.js';
import { checkRateLimit, checkMultipleRateLimits, type RateLimitContext } from './distributed-rate-limiter.js';
import { withRequestContext, createRequestContext, getContextHeaders, getLoggingContext } from './request-context.js';
import { withAwsCircuitBreaker } from './circuit-breaker.js';
import { withVersioning, extractVersion } from './api-versioning.js';
import { logger } from './logging.js';
import { sanitizeObject, validatePayloadSize, detectMaliciousPatterns } from './validation.js';
import { getHttpMethod } from './middleware.js';
import { getPrismaClient } from './database.js';
import type { PrismaClient } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface HandlerContext {
  user: CognitoUser;
  organizationId: string;
  prisma: PrismaClient;
  requestId: string;
  correlationId: string;
}

export interface HandlerOptions<TInput = any> {
  // Validation
  inputSchema?: ZodSchema<TInput>;
  
  // Authentication
  requireAuth?: boolean;
  requiredRoles?: string[];
  anyOfRoles?: string[];
  
  // Rate limiting
  rateLimit?: {
    enabled?: boolean;
    operationType?: string;
  };
  
  // Circuit breaker
  circuitBreaker?: {
    enabled?: boolean;
    serviceName?: string;
  };
  
  // API versioning
  versioning?: boolean;
  
  // CORS
  allowedOrigins?: string[];
  
  // Logging
  logInput?: boolean;
  logOutput?: boolean;
}

export type HandlerFunction<TInput = any, TOutput = any> = (
  input: TInput,
  context: HandlerContext,
  event: AuthorizedEvent
) => Promise<TOutput>;

// ============================================================================
// MIDDLEWARE COMPOSER
// ============================================================================

/**
 * Create a handler with all middleware applied
 */
export function createHandler<TInput = any, TOutput = any>(
  handler: HandlerFunction<TInput, TOutput>,
  options: HandlerOptions<TInput> = {}
): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2> {
  const {
    inputSchema,
    requireAuth = true,
    requiredRoles,
    anyOfRoles,
    rateLimit = { enabled: true, operationType: 'default' },
    circuitBreaker,
    versioning = false,
    logInput = false,
    logOutput = false,
  } = options;

  return async (event: AuthorizedEvent, lambdaContext: LambdaContext): Promise<APIGatewayProxyResultV2> => {
    const startTime = Date.now();
    const origin = event.headers?.origin || event.headers?.Origin || '*';
    
    // Handle CORS preflight
    if (getHttpMethod(event) === 'OPTIONS') {
      return corsOptions(origin);
    }

    // Create request context
    const requestContext = createRequestContext(event);
    const { requestId, correlationId } = requestContext;

    try {
      // 1. Validate payload size
      const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || 'application/json';
      const sizeValidation = validatePayloadSize(event.body ?? null, contentType);
      if (!sizeValidation.success) {
        return sizeValidation.error;
      }

      // 2. Check for malicious patterns
      if (event.body) {
        const maliciousCheck = detectMaliciousPatterns(event.body);
        if (maliciousCheck.isMalicious) {
          logger.warn('Malicious content detected', {
            requestId,
            patterns: maliciousCheck.patterns,
          });
          return badRequest('Invalid request content', undefined, origin);
        }
      }

      // 3. Authentication
      let user: CognitoUser | undefined;
      let organizationId: string | undefined;

      if (requireAuth) {
        try {
          user = getUserFromEvent(event);
          organizationId = getOrganizationId(user);
        } catch (authError) {
          logger.warn('Authentication failed', {
            requestId,
            error: (authError as Error).message,
          });
          return unauthorized('Authentication required', origin);
        }

        // 4. Authorization (role check)
        if (requiredRoles && requiredRoles.length > 0) {
          const hasRequiredRole = requiredRoles.every(role => hasRole(user!, role));
          if (!hasRequiredRole) {
            logger.warn('Authorization failed - missing required roles', {
              requestId,
              userId: user!.sub,
              requiredRoles,
            });
            return forbidden('Insufficient permissions', origin);
          }
        }

        if (anyOfRoles && anyOfRoles.length > 0) {
          if (!hasAnyRole(user!, anyOfRoles as any)) {
            logger.warn('Authorization failed - missing any of roles', {
              requestId,
              userId: user!.sub,
              anyOfRoles,
            });
            return forbidden('Insufficient permissions', origin);
          }
        }

        // 5. Rate limiting
        if (rateLimit.enabled !== false) {
          const rateLimitContext: RateLimitContext = {
            userId: user!.sub,
            organizationId,
            ipAddress: requestContext.ipAddress,
            operationType: rateLimit.operationType || 'default',
          };

          const rateLimitResult = await checkMultipleRateLimits(rateLimitContext);
          
          if (!rateLimitResult.allowed) {
            logger.warn('Rate limit exceeded', {
              requestId,
              userId: user!.sub,
              organizationId,
              retryAfter: rateLimitResult.retryAfter,
            });
            return tooManyRequests(
              'Rate limit exceeded',
              rateLimitResult.retryAfter,
              origin
            );
          }
        }
      }

      // 6. Parse and validate input
      let input: TInput = {} as TInput;
      
      if (event.body) {
        try {
          const parsed = JSON.parse(event.body);
          const sanitized = sanitizeObject(parsed);
          
          if (inputSchema) {
            const validation = inputSchema.safeParse(sanitized);
            if (!validation.success) {
              const errorMessages = validation.error.errors
                .map(err => `${err.path.join('.')}: ${err.message}`)
                .join(', ');
              
              logger.warn('Input validation failed', {
                requestId,
                errors: validation.error.errors,
              });
              
              return badRequest(`Validation error: ${errorMessages}`, undefined, origin);
            }
            input = validation.data;
          } else {
            input = sanitized as TInput;
          }
        } catch (parseError) {
          return badRequest('Invalid JSON format', undefined, origin);
        }
      }

      if (logInput) {
        logger.info('Handler input', {
          requestId,
          input: JSON.stringify(input).substring(0, 500),
        });
      }

      // 7. Create handler context
      const handlerContext: HandlerContext = {
        user: user!,
        organizationId: organizationId!,
        prisma: getPrismaClient(),
        requestId,
        correlationId,
      };

      // 8. Execute handler (with optional circuit breaker)
      let result: TOutput;
      
      if (circuitBreaker?.enabled && circuitBreaker.serviceName) {
        result = await withAwsCircuitBreaker(
          circuitBreaker.serviceName,
          () => handler(input, handlerContext, event)
        );
      } else {
        result = await handler(input, handlerContext, event);
      }

      if (logOutput) {
        logger.info('Handler output', {
          requestId,
          output: JSON.stringify(result).substring(0, 500),
        });
      }

      // 9. Build response
      const duration = Date.now() - startTime;
      const contextHeaders = getContextHeaders(requestContext);

      logger.info('Request completed', {
        requestId,
        correlationId,
        duration,
        path: requestContext.path,
        method: requestContext.method,
        userId: user?.sub,
        organizationId,
      });

      return {
        ...success(result, 200, origin),
        headers: {
          ...success(result, 200, origin).headers,
          ...contextHeaders,
          'X-Response-Time': `${duration}ms`,
        },
      };

    } catch (err) {
      const duration = Date.now() - startTime;
      
      logger.error('Handler error', {
        requestId,
        correlationId,
        error: (err as Error).message,
        stack: (err as Error).stack,
        duration,
      });

      const contextHeaders = getContextHeaders(requestContext);

      return {
        ...error((err as Error).message || 'Internal server error', 500, undefined, origin),
        headers: {
          ...error((err as Error).message || 'Internal server error', 500, undefined, origin).headers,
          ...contextHeaders,
          'X-Response-Time': `${duration}ms`,
        },
      };
    }
  };
}

// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

/**
 * Create a public handler (no auth required)
 */
export function createPublicHandler<TInput = any, TOutput = any>(
  handler: HandlerFunction<TInput, TOutput>,
  options: Omit<HandlerOptions<TInput>, 'requireAuth'> = {}
): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2> {
  return createHandler(handler, { ...options, requireAuth: false });
}

/**
 * Create an admin-only handler
 */
export function createAdminHandler<TInput = any, TOutput = any>(
  handler: HandlerFunction<TInput, TOutput>,
  options: Omit<HandlerOptions<TInput>, 'requiredRoles'> = {}
): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2> {
  return createHandler(handler, { ...options, anyOfRoles: ['admin', 'super_admin'] });
}

/**
 * Create a super admin-only handler
 */
export function createSuperAdminHandler<TInput = any, TOutput = any>(
  handler: HandlerFunction<TInput, TOutput>,
  options: Omit<HandlerOptions<TInput>, 'requiredRoles'> = {}
): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2> {
  return createHandler(handler, { ...options, requiredRoles: ['super_admin'] });
}

/**
 * Create a handler with specific rate limit
 */
export function createRateLimitedHandler<TInput = any, TOutput = any>(
  handler: HandlerFunction<TInput, TOutput>,
  operationType: string,
  options: HandlerOptions<TInput> = {}
): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2> {
  return createHandler(handler, {
    ...options,
    rateLimit: { enabled: true, operationType },
  });
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Common validation schemas
 */
export const schemas = {
  uuid: z.string().uuid(),
  email: z.string().email(),
  awsAccountId: z.string().regex(/^\d{12}$/),
  awsRegion: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/),
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
};

/**
 * Create a schema with organization_id automatically added
 */
export function withOrganizationId<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.extend({
    organization_id: z.string().uuid().optional(),
  });
}
