/**
 * API Versioning System
 * Supports versioned endpoints with deprecation warnings
 *
 * Usage:
 * - /api/v1/security-scan (current)
 * - /api/v2/security-scan (next version)
 *
 * Features:
 * - Version extraction from path or header
 * - Deprecation warnings in response headers
 * - Version-specific handler routing
 * - Sunset date support
 */
import type { AuthorizedEvent, APIGatewayProxyResultV2 } from '../types/lambda.js';
export type APIVersion = 'v1' | 'v2' | 'v3';
export interface VersionConfig {
    version: APIVersion;
    deprecated?: boolean;
    sunsetDate?: string;
    replacedBy?: APIVersion;
    minClientVersion?: string;
}
export interface VersionedHandler<T = any> {
    v1?: (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>;
    v2?: (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>;
    v3?: (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>;
    default: (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>;
}
/**
 * Extract API version from request
 * Priority: Path > Header > Default
 */
export declare function extractVersion(event: AuthorizedEvent): APIVersion;
/**
 * Get version configuration
 */
export declare function getVersionConfig(version: APIVersion): VersionConfig;
/**
 * Generate deprecation headers for response
 */
export declare function getDeprecationHeaders(version: APIVersion): Record<string, string>;
/**
 * Create a versioned handler that routes to version-specific implementations
 */
export declare function createVersionedHandler(handlers: VersionedHandler): (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>;
/**
 * Middleware to add version info to all responses
 */
export declare function withVersioning(handler: (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>): (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>;
/**
 * Validate that requested version is supported
 */
export declare function validateVersion(version: string): version is APIVersion;
/**
 * Check if version is deprecated
 */
export declare function isVersionDeprecated(version: APIVersion): boolean;
/**
 * Get sunset date for a version
 */
export declare function getVersionSunsetDate(version: APIVersion): string | undefined;
/**
 * Mark a version as deprecated
 */
export declare function deprecateVersion(version: APIVersion, sunsetDate: string, replacedBy?: APIVersion): void;
/**
 * Get all deprecated versions
 */
export declare function getDeprecatedVersions(): APIVersion[];
/**
 * Get current stable version
 */
export declare function getCurrentVersion(): APIVersion;
/**
 * Get all supported versions
 */
export declare function getSupportedVersions(): APIVersion[];
//# sourceMappingURL=api-versioning.d.ts.map