/**
 * Production-ready logging system for EVO UDS Backend
 * Supports multiple log levels, structured logging, and AWS CloudWatch integration
 */
export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}
export declare const logger: {
    debug(message: string, meta?: Record<string, any>): void;
    info(message: string, meta?: Record<string, any>): void;
    warn(message: string, meta?: Record<string, any>): void;
    error(message: string, error?: Error | unknown, meta?: Record<string, any>): void;
    audit(action: string, userId: string, organizationId: string, details?: Record<string, any>): void;
    security(event: string, details: Record<string, any>): void;
    performance(operation: string, duration: number, meta?: Record<string, any>): void;
    lambda: {
        start(functionName: string, requestId: string, event?: any): void;
        end(functionName: string, requestId: string, duration: number, statusCode?: number): void;
        error(functionName: string, requestId: string, error: Error): void;
    };
    database: {
        query(query: string, duration: number, params?: any[]): void;
        error(query: string, error: Error, params?: any[]): void;
        migration(name: string, direction: "up" | "down", duration?: number): void;
    };
    http: {
        request(method: string, url: string, statusCode: number, duration: number, userId?: string): void;
        error(method: string, url: string, error: Error, userId?: string): void;
    };
};
export declare function withLogging<T extends (...args: any[]) => any>(functionName: string, handler: T): T;
/**
 * Middleware for request ID tracking
 * Extracts request ID from headers or generates one, and includes it in response
 */
export declare function withRequestId<T extends (...args: any[]) => any>(handler: T): T;
export default logger;
//# sourceMappingURL=logging.d.ts.map