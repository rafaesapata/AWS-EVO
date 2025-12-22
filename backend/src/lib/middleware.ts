/**
 * Middleware utilities for Lambda handlers
 * Provides centralized authorization, validation, and error handling
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2, CognitoUser } from '../types/lambda.js';
import { getUserFromEvent, getOrganizationId, hasRole, requireRole } from './auth.js';
import { checkRateLimit, validateOrganizationContext } from './validation.js';
import { error, badRequest, forbidden, corsOptions } from './response.js';
import { TenantIsolatedPrisma } from './database.js';

export interface MiddlewareContext {
  user: CognitoUser;
  organizationId: string;
  prisma: TenantIsolatedPrisma;
  requestId: string;
  startTime: number;
}

export interface MiddlewareOptions {
  requireAuth?: boolean;
  requiredRoles?: string[];
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  validateOrganization?: boolean;
}

/**
 * Main middleware wrapper for Lambda handlers
 */
export function withMiddleware(
  handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>,
  options: MiddlewareOptions = {}
) {
  return async (event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2> => {
    const startTime = Date.now();
    const requestId = context.awsRequestId;
    
    console.log(`🚀 Request started: ${event.requestContext.http.method} ${event.requestContext.http.path} [${requestId}]`);
    
    try {
      // Handle CORS preflight
      if (event.requestContext.http.method === 'OPTIONS') {
        return corsOptions();
      }
      
      // Authentication check
      if (options.requireAuth !== false) {
        const user = getUserFromEvent(event);
        const organizationId = getOrganizationId(user);
        
        console.log(`✅ User authenticated: ${user.sub} | Org: ${organizationId}`);
        
        // Role-based authorization
        if (options.requiredRoles && options.requiredRoles.length > 0) {
          const hasRequiredRole = options.requiredRoles.some(role => hasRole(user, role));
          if (!hasRequiredRole) {
            console.log(`❌ Access denied: User lacks required roles: ${options.requiredRoles.join(', ')}`);
            return forbidden(`Access denied. Required roles: ${options.requiredRoles.join(', ')}`);
          }
        }
        
        // Rate limiting
        if (options.rateLimit) {
          const rateLimitCheck = checkRateLimit(
            `${event.requestContext.http.path}:${user.sub}`,
            options.rateLimit.maxRequests,
            options.rateLimit.windowMs
          );
          if (!rateLimitCheck.success) {
            console.log(`⚠️ Rate limit exceeded for user: ${user.sub}`);
            return rateLimitCheck.error;
          }
        }
        
        // Organization validation
        if (options.validateOrganization !== false) {
          const orgValidation = validateOrganizationContext(organizationId, organizationId);
          if (!orgValidation.success) {
            return orgValidation.error;
          }
        }
        
        // Create tenant-isolated Prisma client
        const prisma = new TenantIsolatedPrisma(organizationId);
        
        const middlewareContext: MiddlewareContext = {
          user,
          organizationId,
          prisma,
          requestId,
          startTime,
        };
        
        // Execute handler with middleware context
        const result = await handler(event, context, middlewareContext);
        
        const duration = Date.now() - startTime;
        console.log(`✅ Request completed: ${result.statusCode} in ${duration}ms [${requestId}]`);
        
        return result;
      } else {
        // No auth required - create minimal context
        const middlewareContext: MiddlewareContext = {
          user: {} as CognitoUser,
          organizationId: '',
          prisma: {} as TenantIsolatedPrisma,
          requestId,
          startTime,
        };
        
        const result = await handler(event, context, middlewareContext);
        
        const duration = Date.now() - startTime;
        console.log(`✅ Request completed (no auth): ${result.statusCode} in ${duration}ms [${requestId}]`);
        
        return result;
      }
      
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(`❌ Request failed in ${duration}ms [${requestId}]:`, err);
      
      // Handle specific error types
      if (err instanceof Error) {
        if (err.message.includes('No authentication claims')) {
          return badRequest('Authentication required');
        }
        if (err.message.includes('User has no organization')) {
          return badRequest('User not associated with an organization');
        }
        if (err.message.includes('Organization ID is required')) {
          return badRequest('Invalid organization context');
        }
        
        return error(err.message);
      }
      
      return error('Internal server error');
    }
  };
}

/**
 * Middleware specifically for admin operations
 */
export function withAdminMiddleware(
  handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>
) {
  return withMiddleware(handler, {
    requireAuth: true,
    requiredRoles: ['admin', 'super_admin'],
    rateLimit: {
      maxRequests: 50,
      windowMs: 60000, // 1 minute
    },
  });
}

/**
 * Middleware for security operations (stricter rate limiting)
 */
export function withSecurityMiddleware(
  handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>
) {
  return withMiddleware(handler, {
    requireAuth: true,
    rateLimit: {
      maxRequests: 10,
      windowMs: 60000, // 1 minute
    },
  });
}

/**
 * Middleware for cost operations
 */
export function withCostMiddleware(
  handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>
) {
  return withMiddleware(handler, {
    requireAuth: true,
    rateLimit: {
      maxRequests: 30,
      windowMs: 60000, // 1 minute
    },
  });
}

/**
 * Middleware for public endpoints (no auth required)
 */
export function withPublicMiddleware(
  handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>
) {
  return withMiddleware(handler, {
    requireAuth: false,
    rateLimit: {
      maxRequests: 100,
      windowMs: 60000, // 1 minute
    },
  });
}

/**
 * Audit logging middleware
 */
export function withAuditLog(
  action: string,
  handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>
) {
  return async (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext): Promise<APIGatewayProxyResultV2> => {
    const { user, organizationId, requestId } = middleware;
    
    // Log the action attempt
    console.log(`📋 Audit Log: ${action} attempted by ${user.sub} in org ${organizationId} [${requestId}]`);
    
    try {
      const result = await handler(event, context, middleware);
      
      // Log successful action
      console.log(`📋 Audit Log: ${action} completed successfully by ${user.sub} [${requestId}]`);
      
      // In production, store audit logs in database
      // await middleware.prisma.raw.auditLog.create({
      //   data: {
      //     user_id: user.sub,
      //     organization_id: organizationId,
      //     action,
      //     status: 'success',
      //     request_id: requestId,
      //     metadata: {
      //       method: event.requestContext.http.method,
      //       path: event.requestContext.http.path,
      //       statusCode: result.statusCode,
      //     },
      //   },
      // });
      
      return result;
    } catch (err) {
      // Log failed action
      console.error(`📋 Audit Log: ${action} failed for ${user.sub} [${requestId}]:`, err);
      
      // In production, store failed audit logs
      // await middleware.prisma.raw.auditLog.create({
      //   data: {
      //     user_id: user.sub,
      //     organization_id: organizationId,
      //     action,
      //     status: 'failed',
      //     request_id: requestId,
      //     error_message: err instanceof Error ? err.message : 'Unknown error',
      //     metadata: {
      //       method: event.requestContext.http.method,
      //       path: event.requestContext.http.path,
      //     },
      //   },
      // });
      
      throw err;
    }
  };
}

/**
 * Performance monitoring middleware
 */
export function withPerformanceMonitoring(
  handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>
) {
  return async (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext): Promise<APIGatewayProxyResultV2> => {
    const { requestId, startTime } = middleware;
    
    const memoryBefore = process.memoryUsage();
    
    try {
      const result = await handler(event, context, middleware);
      
      const memoryAfter = process.memoryUsage();
      const duration = Date.now() - startTime;
      
      // Log performance metrics
      console.log(`📊 Performance [${requestId}]: ${duration}ms | Memory: ${Math.round((memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024)}MB delta`);
      
      // Add performance headers
      return {
        ...result,
        headers: {
          ...result.headers,
          'X-Response-Time': `${duration}ms`,
          'X-Memory-Usage': `${Math.round(memoryAfter.heapUsed / 1024 / 1024)}MB`,
        },
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(`📊 Performance [${requestId}]: FAILED in ${duration}ms`);
      throw err;
    }
  };
}