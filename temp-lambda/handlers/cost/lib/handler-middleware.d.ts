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
import type { PrismaClient } from '@prisma/client';
export interface HandlerContext {
    user: CognitoUser;
    organizationId: string;
    prisma: PrismaClient;
    requestId: string;
    correlationId: string;
}
export interface HandlerOptions<TInput = any> {
    inputSchema?: ZodSchema<TInput>;
    requireAuth?: boolean;
    requiredRoles?: string[];
    anyOfRoles?: string[];
    rateLimit?: {
        enabled?: boolean;
        operationType?: string;
    };
    circuitBreaker?: {
        enabled?: boolean;
        serviceName?: string;
    };
    versioning?: boolean;
    allowedOrigins?: string[];
    logInput?: boolean;
    logOutput?: boolean;
}
export type HandlerFunction<TInput = any, TOutput = any> = (input: TInput, context: HandlerContext, event: AuthorizedEvent) => Promise<TOutput>;
/**
 * Create a handler with all middleware applied
 */
export declare function createHandler<TInput = any, TOutput = any>(handler: HandlerFunction<TInput, TOutput>, options?: HandlerOptions<TInput>): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2>;
/**
 * Create a public handler (no auth required)
 */
export declare function createPublicHandler<TInput = any, TOutput = any>(handler: HandlerFunction<TInput, TOutput>, options?: Omit<HandlerOptions<TInput>, 'requireAuth'>): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2>;
/**
 * Create an admin-only handler
 */
export declare function createAdminHandler<TInput = any, TOutput = any>(handler: HandlerFunction<TInput, TOutput>, options?: Omit<HandlerOptions<TInput>, 'requiredRoles'>): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2>;
/**
 * Create a super admin-only handler
 */
export declare function createSuperAdminHandler<TInput = any, TOutput = any>(handler: HandlerFunction<TInput, TOutput>, options?: Omit<HandlerOptions<TInput>, 'requiredRoles'>): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2>;
/**
 * Create a handler with specific rate limit
 */
export declare function createRateLimitedHandler<TInput = any, TOutput = any>(handler: HandlerFunction<TInput, TOutput>, operationType: string, options?: HandlerOptions<TInput>): (event: AuthorizedEvent, context: LambdaContext) => Promise<APIGatewayProxyResultV2>;
/**
 * Common validation schemas
 */
export declare const schemas: {
    uuid: z.ZodString;
    email: z.ZodString;
    awsAccountId: z.ZodString;
    awsRegion: z.ZodString;
    pagination: z.ZodObject<{
        page: z.ZodDefault<z.ZodNumber>;
        limit: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        page: number;
        limit: number;
    }, {
        page?: number | undefined;
        limit?: number | undefined;
    }>;
    dateRange: z.ZodObject<{
        startDate: z.ZodOptional<z.ZodString>;
        endDate: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        startDate?: string | undefined;
        endDate?: string | undefined;
    }, {
        startDate?: string | undefined;
        endDate?: string | undefined;
    }>;
};
/**
 * Create a schema with organization_id automatically added
 */
export declare function withOrganizationId<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.ZodObject<z.objectUtil.extendShape<T, {
    organization_id: z.ZodOptional<z.ZodString>;
}>, z.UnknownKeysParam, z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<z.objectUtil.extendShape<T, {
    organization_id: z.ZodOptional<z.ZodString>;
}>>, any> extends infer T_1 ? { [k in keyof T_1]: T_1[k]; } : never, z.baseObjectInputType<z.objectUtil.extendShape<T, {
    organization_id: z.ZodOptional<z.ZodString>;
}>> extends infer T_2 ? { [k_1 in keyof T_2]: T_2[k_1]; } : never>;
//# sourceMappingURL=handler-middleware.d.ts.map