/**
 * Helpers para respostas HTTP padronizadas com segurança aprimorada
 */
import type { APIGatewayProxyResultV2 } from '../types/lambda.js';
/**
 * Set request context for response headers
 */
export declare function setRequestContext(requestId?: string, correlationId?: string): void;
/**
 * Get request context
 */
export declare function getRequestContext(): {
    requestId?: string;
    correlationId?: string;
};
export declare function success<T = any>(data: T, statusCode?: number, origin?: string, additionalHeaders?: Record<string, string>): APIGatewayProxyResultV2;
export declare function error(message: string, statusCode?: number, details?: any, origin?: string, additionalHeaders?: Record<string, string>): APIGatewayProxyResultV2;
export declare function unauthorized(message?: string, origin?: string): APIGatewayProxyResultV2;
export declare function forbidden(message?: string, origin?: string): APIGatewayProxyResultV2;
export declare function notFound(message?: string, origin?: string): APIGatewayProxyResultV2;
export declare function badRequest(message: string, details?: any, origin?: string): APIGatewayProxyResultV2;
export declare function tooManyRequests(message?: string, retryAfter?: number, origin?: string): APIGatewayProxyResultV2;
export declare function corsOptions(origin?: string): APIGatewayProxyResultV2;
export declare function healthCheck(status?: 'healthy' | 'unhealthy', details?: Record<string, any>, origin?: string): APIGatewayProxyResultV2;
/**
 * Paginated response helper
 */
export declare function paginated<T>(data: T[], total: number, page: number, limit: number, origin?: string): APIGatewayProxyResultV2;
/**
 * Streaming response for large datasets
 */
export declare function streamingResponse(data: any, isLast?: boolean, origin?: string): APIGatewayProxyResultV2;
//# sourceMappingURL=response.d.ts.map