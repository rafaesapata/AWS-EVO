/**
 * Security Headers Implementation
 * Provides comprehensive security headers for all API responses
 */
import type { APIGatewayProxyResultV2 } from '../types/lambda.js';
export interface SecurityHeadersConfig {
    contentSecurityPolicy?: string;
    strictTransportSecurity?: string;
    xFrameOptions?: string;
    xContentTypeOptions?: string;
    referrerPolicy?: string;
    permissionsPolicy?: string;
    crossOriginEmbedderPolicy?: string;
    crossOriginOpenerPolicy?: string;
    crossOriginResourcePolicy?: string;
    enableHSTS?: boolean;
    enableCSP?: boolean;
    enableXSSProtection?: boolean;
}
/**
 * Default security headers configuration
 */
export declare const DEFAULT_SECURITY_HEADERS: SecurityHeadersConfig;
/**
 * Security Headers Manager
 */
export declare class SecurityHeadersManager {
    private config;
    constructor(config?: SecurityHeadersConfig);
    /**
     * Generate security headers object
     */
    getHeaders(environment?: string): Record<string, string>;
    /**
     * Apply security headers to Lambda response
     */
    applyHeaders(response: APIGatewayProxyResultV2, environment?: string): APIGatewayProxyResultV2;
    /**
     * Create CSP nonce for inline scripts/styles
     */
    generateNonce(): string;
    /**
     * Update CSP with nonce
     */
    updateCSPWithNonce(nonce: string): void;
    /**
     * Validate security headers
     */
    validateHeaders(headers: Record<string, string>): {
        valid: boolean;
        issues: string[];
        recommendations: string[];
    };
}
export declare const securityHeaders: SecurityHeadersManager;
/**
 * Middleware for applying security headers
 */
export declare function withSecurityHeaders(handler: (event: any, context: any) => Promise<APIGatewayProxyResultV2>, config?: SecurityHeadersConfig): (event: any, context: any) => Promise<APIGatewayProxyResultV2>;
/**
 * CORS configuration with security considerations
 */
export interface CORSConfig {
    allowedOrigins: string[];
    allowedMethods: string[];
    allowedHeaders: string[];
    exposedHeaders?: string[];
    maxAge?: number;
    credentials?: boolean;
}
export declare const SECURE_CORS_CONFIG: CORSConfig;
/**
 * Generate CORS headers - SECURITY HARDENED
 * Never allows '*' origin in production when credentials are enabled
 */
export declare function generateCORSHeaders(origin: string | undefined, config?: CORSConfig): Record<string, string>;
/**
 * Security audit for headers
 */
export declare function auditSecurityHeaders(url: string): Promise<{
    score: number;
    grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
    headers: Record<string, string>;
    issues: string[];
    recommendations: string[];
}>;
/**
 * Rate limiting headers
 */
export declare function generateRateLimitHeaders(limit: number, remaining: number, resetTime: number): Record<string, string>;
//# sourceMappingURL=security-headers.d.ts.map