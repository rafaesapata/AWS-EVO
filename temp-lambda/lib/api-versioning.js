"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractVersion = extractVersion;
exports.getVersionConfig = getVersionConfig;
exports.getDeprecationHeaders = getDeprecationHeaders;
exports.createVersionedHandler = createVersionedHandler;
exports.withVersioning = withVersioning;
exports.validateVersion = validateVersion;
exports.isVersionDeprecated = isVersionDeprecated;
exports.getVersionSunsetDate = getVersionSunsetDate;
exports.deprecateVersion = deprecateVersion;
exports.getDeprecatedVersions = getDeprecatedVersions;
exports.getCurrentVersion = getCurrentVersion;
exports.getSupportedVersions = getSupportedVersions;
const logging_js_1 = require("./logging.js");
// ============================================================================
// VERSION CONFIGURATION
// ============================================================================
const VERSION_CONFIGS = {
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
const CURRENT_VERSION = 'v1';
const SUPPORTED_VERSIONS = ['v1', 'v2', 'v3'];
// ============================================================================
// VERSION EXTRACTION
// ============================================================================
/**
 * Extract API version from request
 * Priority: Path > Header > Default
 */
function extractVersion(event) {
    // 1. Try to extract from path (/api/v1/endpoint)
    const path = event.path || event.rawPath || '';
    const pathMatch = path.match(/\/api\/(v\d+)\//);
    if (pathMatch && SUPPORTED_VERSIONS.includes(pathMatch[1])) {
        return pathMatch[1];
    }
    // 2. Try to extract from header (X-API-Version: v1)
    const headerVersion = event.headers?.['x-api-version'] ||
        event.headers?.['X-API-Version'];
    if (headerVersion && SUPPORTED_VERSIONS.includes(headerVersion)) {
        return headerVersion;
    }
    // 3. Try to extract from Accept header (application/vnd.evo.v1+json)
    const acceptHeader = event.headers?.['accept'] || event.headers?.['Accept'] || '';
    const acceptMatch = acceptHeader.match(/application\/vnd\.evo\.(v\d+)\+json/);
    if (acceptMatch && SUPPORTED_VERSIONS.includes(acceptMatch[1])) {
        return acceptMatch[1];
    }
    // 4. Default to current version
    return CURRENT_VERSION;
}
/**
 * Get version configuration
 */
function getVersionConfig(version) {
    return VERSION_CONFIGS[version] || VERSION_CONFIGS[CURRENT_VERSION];
}
// ============================================================================
// DEPRECATION HEADERS
// ============================================================================
/**
 * Generate deprecation headers for response
 */
function getDeprecationHeaders(version) {
    const config = getVersionConfig(version);
    const headers = {
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
function createVersionedHandler(handlers) {
    return async (event, context) => {
        const version = extractVersion(event);
        const config = getVersionConfig(version);
        // Log version usage
        logging_js_1.logger.info('API version request', {
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
function withVersioning(handler) {
    return async (event, context) => {
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
function validateVersion(version) {
    return SUPPORTED_VERSIONS.includes(version);
}
/**
 * Check if version is deprecated
 */
function isVersionDeprecated(version) {
    return VERSION_CONFIGS[version]?.deprecated || false;
}
/**
 * Get sunset date for a version
 */
function getVersionSunsetDate(version) {
    return VERSION_CONFIGS[version]?.sunsetDate;
}
// ============================================================================
// DEPRECATION UTILITIES
// ============================================================================
/**
 * Mark a version as deprecated
 */
function deprecateVersion(version, sunsetDate, replacedBy) {
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
function getDeprecatedVersions() {
    return Object.entries(VERSION_CONFIGS)
        .filter(([_, config]) => config.deprecated)
        .map(([version]) => version);
}
/**
 * Get current stable version
 */
function getCurrentVersion() {
    return CURRENT_VERSION;
}
/**
 * Get all supported versions
 */
function getSupportedVersions() {
    return [...SUPPORTED_VERSIONS];
}
//# sourceMappingURL=api-versioning.js.map