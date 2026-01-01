/**
 * Middleware utilities for Lambda handlers
 * Provides centralized authorization, validation, and error handling
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2, CognitoUser } from '../types/lambda.js';
import { TenantIsolatedPrisma } from './database.js';
/**
 * Helper to get HTTP method from event (supports both REST API v1 and HTTP API v2)
 */
export declare function getHttpMethod(event: AuthorizedEvent): string;
/**
 * Helper to get HTTP path from event (supports both REST API v1 and HTTP API v2)
 */
export declare function getHttpPath(event: AuthorizedEvent): string;
/**
 * Helper to get origin from event headers for CORS
 */
export declare function getOrigin(event: AuthorizedEvent): string;
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
export declare function withMiddleware(handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>, options?: MiddlewareOptions): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2>;
/**
 * Middleware specifically for admin operations
 */
export declare function withAdminMiddleware(handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2>;
/**
 * Middleware for security operations (stricter rate limiting)
 */
export declare function withSecurityMiddleware(handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2>;
/**
 * Middleware for cost operations
 */
export declare function withCostMiddleware(handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2>;
/**
 * Middleware for public endpoints (no auth required)
 */
export declare function withPublicMiddleware(handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2>;
/**
 * Audit logging middleware
 */
export declare function withAuditLog(action: string, handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>): (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>;
/**
 * Performance monitoring middleware
 */
export declare function withPerformanceMonitoring(handler: (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>): (event: AuthorizedEvent, context: LambdaContext, middleware: MiddlewareContext) => Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=middleware.d.ts.map