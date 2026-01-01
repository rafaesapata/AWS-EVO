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
import type { AuthorizedEvent, APIGatewayProxyResultV2 } from '../types/lambda.js';
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
/**
 * Get current request context
 */
export declare function getRequestContext(): RequestContext | undefined;
/**
 * Run function with request context
 */
export declare function runWithContext<T>(context: RequestContext, fn: () => T): T;
/**
 * Extract request context from Lambda event
 */
export declare function createRequestContext(event: AuthorizedEvent): RequestContext;
/**
 * Get headers to include in response
 */
export declare function getContextHeaders(context?: RequestContext): Record<string, string>;
/**
 * Get headers to propagate to downstream services
 */
export declare function getPropagationHeaders(context?: RequestContext): Record<string, string>;
/**
 * Middleware to wrap handler with request context
 */
export declare function withRequestContext(handler: (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>): (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>;
/**
 * Get context for structured logging
 */
export declare function getLoggingContext(): Record<string, any>;
/**
 * Add metadata to current request context
 */
export declare function addContextMetadata(key: string, value: any): void;
/**
 * Get request duration
 */
export declare function getRequestDuration(): number;
/**
 * Create a new span for tracing
 */
export declare function createSpan(name: string): {
    spanId: string;
    end: () => void;
};
/**
 * Run function within a span
 */
export declare function withSpan<T>(name: string, fn: () => Promise<T>): Promise<T>;
//# sourceMappingURL=request-context.d.ts.map