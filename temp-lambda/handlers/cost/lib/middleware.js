"use strict";
/**
 * Middleware utilities for Lambda handlers
 * Provides centralized authorization, validation, and error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHttpMethod = getHttpMethod;
exports.getHttpPath = getHttpPath;
exports.getOrigin = getOrigin;
exports.withMiddleware = withMiddleware;
exports.withAdminMiddleware = withAdminMiddleware;
exports.withSecurityMiddleware = withSecurityMiddleware;
exports.withCostMiddleware = withCostMiddleware;
exports.withPublicMiddleware = withPublicMiddleware;
exports.withAuditLog = withAuditLog;
exports.withPerformanceMonitoring = withPerformanceMonitoring;
const auth_js_1 = require("./auth.js");
const validation_js_1 = require("./validation.js");
const response_js_1 = require("./response.js");
const database_js_1 = require("./database.js");
/**
 * Helper to get HTTP method from event (supports both REST API v1 and HTTP API v2)
 */
function getHttpMethod(event) {
    return event.httpMethod || event.requestContext?.http?.method || 'UNKNOWN';
}
/**
 * Helper to get HTTP path from event (supports both REST API v1 and HTTP API v2)
 */
function getHttpPath(event) {
    return event.path || event.rawPath || event.requestContext?.http?.path || '/unknown';
}
/**
 * Helper to get origin from event headers for CORS
 */
function getOrigin(event) {
    return event.headers?.origin || event.headers?.Origin || '*';
}
/**
 * Main middleware wrapper for Lambda handlers
 */
function withMiddleware(handler, options = {}) {
    return async (event, context) => {
        const startTime = Date.now();
        const requestId = context.awsRequestId;
        const httpMethod = getHttpMethod(event);
        const httpPath = getHttpPath(event);
        console.log(`🚀 Request started: ${httpMethod} ${httpPath} [${requestId}]`);
        try {
            // Handle CORS preflight
            if (httpMethod === 'OPTIONS') {
                return (0, response_js_1.corsOptions)();
            }
            // Authentication check
            if (options.requireAuth !== false) {
                const user = (0, auth_js_1.getUserFromEvent)(event);
                const organizationId = (0, auth_js_1.getOrganizationId)(user);
                console.log(`✅ User authenticated: ${user.sub} | Org: ${organizationId}`);
                // Role-based authorization
                if (options.requiredRoles && options.requiredRoles.length > 0) {
                    const hasRequiredRole = options.requiredRoles.some(role => (0, auth_js_1.hasRole)(user, role));
                    if (!hasRequiredRole) {
                        console.log(`❌ Access denied: User lacks required roles: ${options.requiredRoles.join(', ')}`);
                        return (0, response_js_1.forbidden)(`Access denied. Required roles: ${options.requiredRoles.join(', ')}`);
                    }
                }
                // Rate limiting
                if (options.rateLimit) {
                    const rateLimitCheck = (0, validation_js_1.checkRateLimit)(`${httpPath}:${user.sub}`, options.rateLimit.maxRequests, options.rateLimit.windowMs);
                    if (!rateLimitCheck.success) {
                        console.log(`⚠️ Rate limit exceeded for user: ${user.sub}`);
                        return rateLimitCheck.error;
                    }
                }
                // Organization validation
                if (options.validateOrganization !== false) {
                    const orgValidation = (0, validation_js_1.validateOrganizationContext)(organizationId, organizationId);
                    if (!orgValidation.success) {
                        return orgValidation.error;
                    }
                }
                // Create tenant-isolated Prisma client
                const prisma = new database_js_1.TenantIsolatedPrisma(organizationId);
                const middlewareContext = {
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
            }
            else {
                // No auth required - create minimal context
                const middlewareContext = {
                    user: {},
                    organizationId: '',
                    prisma: {},
                    requestId,
                    startTime,
                };
                const result = await handler(event, context, middlewareContext);
                const duration = Date.now() - startTime;
                console.log(`✅ Request completed (no auth): ${result.statusCode} in ${duration}ms [${requestId}]`);
                return result;
            }
        }
        catch (err) {
            const duration = Date.now() - startTime;
            console.error(`❌ Request failed in ${duration}ms [${requestId}]:`, err);
            // Handle specific error types
            if (err instanceof Error) {
                if (err.message.includes('No authentication claims')) {
                    return (0, response_js_1.badRequest)('Authentication required');
                }
                if (err.message.includes('User has no organization')) {
                    return (0, response_js_1.badRequest)('User not associated with an organization');
                }
                if (err.message.includes('Organization ID is required')) {
                    return (0, response_js_1.badRequest)('Invalid organization context');
                }
                return (0, response_js_1.error)(err.message);
            }
            return (0, response_js_1.error)('Internal server error');
        }
    };
}
/**
 * Middleware specifically for admin operations
 */
function withAdminMiddleware(handler) {
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
function withSecurityMiddleware(handler) {
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
function withCostMiddleware(handler) {
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
function withPublicMiddleware(handler) {
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
function withAuditLog(action, handler) {
    return async (event, context, middleware) => {
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
        }
        catch (err) {
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
function withPerformanceMonitoring(handler) {
    return async (event, context, middleware) => {
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
        }
        catch (err) {
            const duration = Date.now() - startTime;
            console.error(`📊 Performance [${requestId}]: FAILED in ${duration}ms`);
            throw err;
        }
    };
}
//# sourceMappingURL=middleware.js.map