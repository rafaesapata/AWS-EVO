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
import { logger } from './logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type APIVersion = 'v1' | 'v2' | 'v3';

export interface VersionConfig {
  version: APIVersion;
  deprecated?: boolean;
  sunsetDate?: string; // ISO date string
  replacedBy?: APIVersion;
  minClientVersion?: string;
}

export interface VersionedHandler<T = any> {
  v1?: (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>;
  v2?: (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>;
  v3?: (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>;
  default: (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>;
}

// ============================================================================
// VERSION CONFIGURATION
// ============================================================================

const VERSION_CONFIGS: Record<APIVersion, VersionConfig> = {
  v1: {
    version: 'v1',
    deprecated: false,
  },
  v2: {
    version: 'v2',
    deprecated: false,
  },
  v3: {
    version: 'v3',
    deprecated: false,
  },
};

const CURRENT_VERSION: APIVersion = 'v1';
const SUPPORTED_VERSIONS: APIVersion[] = ['v1', 'v2', 'v3'];

// ============================================================================
// VERSION EXTRACTION
// ============================================================================

/**
 * Extract API version from request
 * Priority: Path > Header > Default
 */
export function extractVersion(event: AuthorizedEvent): APIVersion {
  // 1. Try to extract from path (/api/v1/endpoint)
  const path = event.path || event.rawPath || '';
  const pathMatch = path.match(/\/api\/(v\d+)\//);
  if (pathMatch && SUPPORTED_VERSIONS.includes(pathMatch[1] as APIVersion)) {
    return pathMatch[1] as APIVersion;
  }

  // 2. Try to extract from header (X-API-Version: v1)
  const headerVersion = event.headers?.['x-api-version'] || 
                        event.headers?.['X-API-Version'];
  if (headerVersion && SUPPORTED_VERSIONS.includes(headerVersion as APIVersion)) {
    return headerVersion as APIVersion;
  }

  // 3. Try to extract from Accept header (application/vnd.evo.v1+json)
  const acceptHeader = event.headers?.['accept'] || event.headers?.['Accept'] || '';
  const acceptMatch = acceptHeader.match(/application\/vnd\.evo\.(v\d+)\+json/);
  if (acceptMatch && SUPPORTED_VERSIONS.includes(acceptMatch[1] as APIVersion)) {
    return acceptMatch[1] as APIVersion;
  }

  // 4. Default to current version
  return CURRENT_VERSION;
}

/**
 * Get version configuration
 */
export function getVersionConfig(version: APIVersion): VersionConfig {
  return VERSION_CONFIGS[version] || VERSION_CONFIGS[CURRENT_VERSION];
}

// ============================================================================
// DEPRECATION HEADERS
// ============================================================================

/**
 * Generate deprecation headers for response
 */
export function getDeprecationHeaders(version: APIVersion): Record<string, string> {
  const config = getVersionConfig(version);
  const headers: Record<string, string> = {
    'X-API-Version': version,
  };

  if (config.deprecated) {
    headers['Deprecation'] = 'true';
    headers['X-API-Deprecated'] = 'true';
    
    if (config.sunsetDate) {
      headers['Sunset'] = config.sunsetDate;
    }
    
    if (config.replacedBy) {
      headers['X-API-Replacement'] = config.replacedBy;
      headers['Link'] = `</api/${config.replacedBy}/>; rel="successor-version"`;
    }
  }

  return headers;
}

// ============================================================================
// VERSIONED HANDLER WRAPPER
// ============================================================================

/**
 * Create a versioned handler that routes to version-specific implementations
 */
export function createVersionedHandler(
  handlers: VersionedHandler
): (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2> {
  return async (event: AuthorizedEvent, context: any): Promise<APIGatewayProxyResultV2> => {
    const version = extractVersion(event);
    const config = getVersionConfig(version);

    // Log version usage
    logger.info('API version request', {
      version,
      deprecated: config.deprecated,
      path: event.path || event.rawPath,
    });

    // Select handler based on version
    const handler = handlers[version] || handlers.default;

    // Execute handler
    const response = await handler(event, context);

    // Add version headers to response
    const deprecationHeaders = getDeprecationHeaders(version);
    
    return {
      ...response,
      headers: {
        ...response.headers,
        ...deprecationHeaders,
      },
    };
  };
}

/**
 * Middleware to add version info to all responses
 */
export function withVersioning(
  handler: (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2>
): (event: AuthorizedEvent, context: any) => Promise<APIGatewayProxyResultV2> {
  return async (event: AuthorizedEvent, context: any): Promise<APIGatewayProxyResultV2> => {
    const version = extractVersion(event);
    const response = await handler(event, context);
    const deprecationHeaders = getDeprecationHeaders(version);

    return {
      ...response,
      headers: {
        ...response.headers,
        ...deprecationHeaders,
      },
    };
  };
}

// ============================================================================
// VERSION VALIDATION
// ============================================================================

/**
 * Validate that requested version is supported
 */
export function validateVersion(version: string): version is APIVersion {
  return SUPPORTED_VERSIONS.includes(version as APIVersion);
}

/**
 * Check if version is deprecated
 */
export function isVersionDeprecated(version: APIVersion): boolean {
  return VERSION_CONFIGS[version]?.deprecated || false;
}

/**
 * Get sunset date for a version
 */
export function getVersionSunsetDate(version: APIVersion): string | undefined {
  return VERSION_CONFIGS[version]?.sunsetDate;
}

// ============================================================================
// DEPRECATION UTILITIES
// ============================================================================

/**
 * Mark a version as deprecated
 */
export function deprecateVersion(
  version: APIVersion,
  sunsetDate: string,
  replacedBy?: APIVersion
): void {
  VERSION_CONFIGS[version] = {
    ...VERSION_CONFIGS[version],
    deprecated: true,
    sunsetDate,
    replacedBy,
  };
}

/**
 * Get all deprecated versions
 */
export function getDeprecatedVersions(): APIVersion[] {
  return Object.entries(VERSION_CONFIGS)
    .filter(([_, config]) => config.deprecated)
    .map(([version]) => version as APIVersion);
}

/**
 * Get current stable version
 */
export function getCurrentVersion(): APIVersion {
  return CURRENT_VERSION;
}

/**
 * Get all supported versions
 */
export function getSupportedVersions(): APIVersion[] {
  return [...SUPPORTED_VERSIONS];
}
