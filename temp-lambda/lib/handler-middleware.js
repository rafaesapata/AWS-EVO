"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.schemas = void 0;
exports.createHandler = createHandler;
exports.createPublicHandler = createPublicHandler;
exports.createAdminHandler = createAdminHandler;
exports.createSuperAdminHandler = createSuperAdminHandler;
exports.createRateLimitedHandler = createRateLimitedHandler;
exports.withOrganizationId = withOrganizationId;
const zod_1 = require("zod");
const response_js_1 = require("./response.js");
const auth_js_1 = require("./auth.js");
const distributed_rate_limiter_js_1 = require("./distributed-rate-limiter.js");
const request_context_js_1 = require("./request-context.js");
const circuit_breaker_js_1 = require("./circuit-breaker.js");
const logging_js_1 = require("./logging.js");
const validation_js_1 = require("./validation.js");
const middleware_js_1 = require("./middleware.js");
const database_js_1 = require("./database.js");
// ============================================================================
// MIDDLEWARE COMPOSER
// ============================================================================
/**
 * Create a handler with all middleware applied
 */
function createHandler(handler, options = {}) {
    const { inputSchema, requireAuth = true, requiredRoles, anyOfRoles, rateLimit = { enabled: true, operationType: 'default' }, circuitBreaker, versioning = false, logInput = false, logOutput = false, } = options;
    return async (event, lambdaContext) => {
        const startTime = Date.now();
        const origin = event.headers?.origin || event.headers?.Origin || '*';
        // Handle CORS preflight
        if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
            return (0, response_js_1.corsOptions)(origin);
        }
        // Create request context
        const requestContext = (0, request_context_js_1.createRequestContext)(event);
        const { requestId, correlationId } = requestContext;
        try {
            // 1. Validate payload size
            const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || 'application/json';
            const sizeValidation = (0, validation_js_1.validatePayloadSize)(event.body ?? null, contentType);
            if (!sizeValidation.success) {
                return sizeValidation.error;
            }
            // 2. Check for malicious patterns
            if (event.body) {
                const maliciousCheck = (0, validation_js_1.detectMaliciousPatterns)(event.body);
                if (maliciousCheck.isMalicious) {
                    logging_js_1.logger.warn('Malicious content detected', {
                        requestId,
                        patterns: maliciousCheck.patterns,
                    });
                    return (0, response_js_1.badRequest)('Invalid request content', undefined, origin);
                }
            }
            // 3. Authentication
            let user;
            let organizationId;
            if (requireAuth) {
                try {
                    user = (0, auth_js_1.getUserFromEvent)(event);
                    organizationId = (0, auth_js_1.getOrganizationId)(user);
                }
                catch (authError) {
                    logging_js_1.logger.warn('Authentication failed', {
                        requestId,
                        error: authError.message,
                    });
                    return (0, response_js_1.unauthorized)('Authentication required', origin);
                }
                // 4. Authorization (role check)
                if (requiredRoles && requiredRoles.length > 0) {
                    const hasRequiredRole = requiredRoles.every(role => (0, auth_js_1.hasRole)(user, role));
                    if (!hasRequiredRole) {
                        logging_js_1.logger.warn('Authorization failed - missing required roles', {
                            requestId,
                            userId: user.sub,
                            requiredRoles,
                        });
                        return (0, response_js_1.forbidden)('Insufficient permissions', origin);
                    }
                }
                if (anyOfRoles && anyOfRoles.length > 0) {
                    if (!(0, auth_js_1.hasAnyRole)(user, anyOfRoles)) {
                        logging_js_1.logger.warn('Authorization failed - missing any of roles', {
                            requestId,
                            userId: user.sub,
                            anyOfRoles,
                        });
                        return (0, response_js_1.forbidden)('Insufficient permissions', origin);
                    }
                }
                // 5. Rate limiting
                if (rateLimit.enabled !== false) {
                    const rateLimitContext = {
                        userId: user.sub,
                        organizationId,
                        ipAddress: requestContext.ipAddress,
                        operationType: rateLimit.operationType || 'default',
                    };
                    const rateLimitResult = await (0, distributed_rate_limiter_js_1.checkMultipleRateLimits)(rateLimitContext);
                    if (!rateLimitResult.allowed) {
                        logging_js_1.logger.warn('Rate limit exceeded', {
                            requestId,
                            userId: user.sub,
                            organizationId,
                            retryAfter: rateLimitResult.retryAfter,
                        });
                        return (0, response_js_1.tooManyRequests)('Rate limit exceeded', rateLimitResult.retryAfter, origin);
                    }
                }
            }
            // 6. Parse and validate input
            let input = {};
            if (event.body) {
                try {
                    const parsed = JSON.parse(event.body);
                    const sanitized = (0, validation_js_1.sanitizeObject)(parsed);
                    if (inputSchema) {
                        const validation = inputSchema.safeParse(sanitized);
                        if (!validation.success) {
                            const errorMessages = validation.error.errors
                                .map(err => `${err.path.join('.')}: ${err.message}`)
                                .join(', ');
                            logging_js_1.logger.warn('Input validation failed', {
                                requestId,
                                errors: validation.error.errors,
                            });
                            return (0, response_js_1.badRequest)(`Validation error: ${errorMessages}`, undefined, origin);
                        }
                        input = validation.data;
                    }
                    else {
                        input = sanitized;
                    }
                }
                catch (parseError) {
                    return (0, response_js_1.badRequest)('Invalid JSON format', undefined, origin);
                }
            }
            if (logInput) {
                logging_js_1.logger.info('Handler input', {
                    requestId,
                    input: JSON.stringify(input).substring(0, 500),
                });
            }
            // 7. Create handler context
            const handlerContext = {
                user: user,
                organizationId: organizationId,
                prisma: (0, database_js_1.getPrismaClient)(),
                requestId,
                correlationId,
            };
            // 8. Execute handler (with optional circuit breaker)
            let result;
            if (circuitBreaker?.enabled && circuitBreaker.serviceName) {
                result = await (0, circuit_breaker_js_1.withAwsCircuitBreaker)(circuitBreaker.serviceName, () => handler(input, handlerContext, event));
            }
            else {
                result = await handler(input, handlerContext, event);
            }
            if (logOutput) {
                logging_js_1.logger.info('Handler output', {
                    requestId,
                    output: JSON.stringify(result).substring(0, 500),
                });
            }
            // 9. Build response
            const duration = Date.now() - startTime;
            const contextHeaders = (0, request_context_js_1.getContextHeaders)(requestContext);
            logging_js_1.logger.info('Request completed', {
                requestId,
                correlationId,
                duration,
                path: requestContext.path,
                method: requestContext.method,
                userId: user?.sub,
                organizationId,
            });
            return {
                ...(0, response_js_1.success)(result, 200, origin),
                headers: {
                    ...(0, response_js_1.success)(result, 200, origin).headers,
                    ...contextHeaders,
                    'X-Response-Time': `${duration}ms`,
                },
            };
        }
        catch (err) {
            const duration = Date.now() - startTime;
            logging_js_1.logger.error('Handler error', {
                requestId,
                correlationId,
                error: err.message,
                stack: err.stack,
                duration,
            });
            const contextHeaders = (0, request_context_js_1.getContextHeaders)(requestContext);
            return {
                ...(0, response_js_1.error)(err.message || 'Internal server error', 500, undefined, origin),
                headers: {
                    ...(0, response_js_1.error)(err.message || 'Internal server error', 500, undefined, origin).headers,
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
function createPublicHandler(handler, options = {}) {
    return createHandler(handler, { ...options, requireAuth: false });
}
/**
 * Create an admin-only handler
 */
function createAdminHandler(handler, options = {}) {
    return createHandler(handler, { ...options, anyOfRoles: ['admin', 'super_admin'] });
}
/**
 * Create a super admin-only handler
 */
function createSuperAdminHandler(handler, options = {}) {
    return createHandler(handler, { ...options, requiredRoles: ['super_admin'] });
}
/**
 * Create a handler with specific rate limit
 */
function createRateLimitedHandler(handler, operationType, options = {}) {
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
exports.schemas = {
    uuid: zod_1.z.string().uuid(),
    email: zod_1.z.string().email(),
    awsAccountId: zod_1.z.string().regex(/^\d{12}$/),
    awsRegion: zod_1.z.string().regex(/^[a-z]{2}-[a-z]+-\d$/),
    pagination: zod_1.z.object({
        page: zod_1.z.number().int().min(1).default(1),
        limit: zod_1.z.number().int().min(1).max(100).default(20),
    }),
    dateRange: zod_1.z.object({
        startDate: zod_1.z.string().datetime().optional(),
        endDate: zod_1.z.string().datetime().optional(),
    }),
};
/**
 * Create a schema with organization_id automatically added
 */
function withOrganizationId(schema) {
    return schema.extend({
        organization_id: zod_1.z.string().uuid().optional(),
    });
}
//# sourceMappingURL=handler-middleware.js.map