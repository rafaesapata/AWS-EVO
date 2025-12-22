/**
 * Comprehensive API Versioning System
 * Provides semantic versioning, backward compatibility, and deprecation management
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types/lambda.js';
import { logger } from './logging.js';
import { error, badRequest } from './response.js';

export interface APIVersion {
  version: string;
  releaseDate: Date;
  status: VersionStatus;
  deprecationDate?: Date;
  sunsetDate?: Date;
  changelog: ChangelogEntry[];
  breakingChanges: BreakingChange[];
  compatibilityMatrix: CompatibilityEntry[];
}

export type VersionStatus = 'development' | 'beta' | 'stable' | 'deprecated' | 'sunset';

export interface ChangelogEntry {
  type: 'feature' | 'bugfix' | 'improvement' | 'security' | 'breaking';
  description: string;
  date: Date;
  author: string;
  issueNumber?: string;
}

export interface BreakingChange {
  description: string;
  migrationGuide: string;
  affectedEndpoints: string[];
  introducedIn: string;
  removedIn?: string;
}

export interface CompatibilityEntry {
  fromVersion: string;
  toVersion: string;
  compatible: boolean;
  migrationRequired: boolean;
  notes?: string;
}

export interface VersionedEndpoint {
  path: string;
  method: string;
  versions: Map<string, EndpointVersion>;
  defaultVersion: string;
  latestVersion: string;
}

export interface EndpointVersion {
  version: string;
  handler: (event: APIGatewayProxyEventV2, context: any) => Promise<APIGatewayProxyResultV2>;
  schema?: {
    request?: any;
    response?: any;
  };
  deprecated?: boolean;
  deprecationMessage?: string;
  migrationPath?: string;
}

export interface VersioningConfig {
  strategy: VersioningStrategy;
  defaultVersion: string;
  supportedVersions: string[];
  deprecationWarningPeriod: number; // days
  sunsetGracePeriod: number; // days
  headerName: string;
  queryParamName: string;
  pathPrefix: boolean;
}

export type VersioningStrategy = 'header' | 'query' | 'path' | 'accept_header' | 'subdomain';

/**
 * API Version Manager
 */
export class APIVersionManager {
  private versions: Map<string, APIVersion> = new Map();
  private endpoints: Map<string, VersionedEndpoint> = new Map();
  private config: VersioningConfig;

  constructor(config: VersioningConfig) {
    this.config = config;
    this.initializeDefaultVersions();
  }

  private initializeDefaultVersions(): void {
    // Initialize with current API versions
    const versions: APIVersion[] = [
      {
        version: '1.0.0',
        releaseDate: new Date('2024-01-01'),
        status: 'stable',
        changelog: [
          {
            type: 'feature',
            description: 'Initial API release',
            date: new Date('2024-01-01'),
            author: 'EVO UDS Team',
          },
        ],
        breakingChanges: [],
        compatibilityMatrix: [],
      },
      {
        version: '1.1.0',
        releaseDate: new Date('2024-06-01'),
        status: 'stable',
        changelog: [
          {
            type: 'feature',
            description: 'Added enhanced security scanning endpoints',
            date: new Date('2024-06-01'),
            author: 'EVO UDS Team',
          },
          {
            type: 'improvement',
            description: 'Improved error handling and validation',
            date: new Date('2024-06-01'),
            author: 'EVO UDS Team',
          },
        ],
        breakingChanges: [],
        compatibilityMatrix: [
          {
            fromVersion: '1.0.0',
            toVersion: '1.1.0',
            compatible: true,
            migrationRequired: false,
          },
        ],
      },
      {
        version: '2.0.0',
        releaseDate: new Date('2024-12-01'),
        status: 'beta',
        changelog: [
          {
            type: 'breaking',
            description: 'Restructured authentication flow',
            date: new Date('2024-12-01'),
            author: 'EVO UDS Team',
          },
          {
            type: 'feature',
            description: 'Added multi-tenant isolation',
            date: new Date('2024-12-01'),
            author: 'EVO UDS Team',
          },
        ],
        breakingChanges: [
          {
            description: 'Authentication endpoints now require different token format',
            migrationGuide: 'Update client to use new JWT token format. See migration guide at /docs/migration/v2',
            affectedEndpoints: ['/auth/login', '/auth/refresh'],
            introducedIn: '2.0.0',
          },
        ],
        compatibilityMatrix: [
          {
            fromVersion: '1.1.0',
            toVersion: '2.0.0',
            compatible: false,
            migrationRequired: true,
            notes: 'Breaking changes in authentication flow',
          },
        ],
      },
    ];

    versions.forEach(version => this.addVersion(version));
  }

  /**
   * Add a new API version
   */
  addVersion(version: APIVersion): void {
    this.versions.set(version.version, version);
    logger.info('API version added', {
      version: version.version,
      status: version.status,
      releaseDate: version.releaseDate,
    });
  }

  /**
   * Register a versioned endpoint
   */
  registerEndpoint(
    path: string,
    method: string,
    versions: Map<string, EndpointVersion>,
    defaultVersion?: string
  ): void {
    const endpointKey = `${method.toUpperCase()} ${path}`;
    const sortedVersions = Array.from(versions.keys()).sort(this.compareVersions.bind(this));
    
    const endpoint: VersionedEndpoint = {
      path,
      method: method.toUpperCase(),
      versions,
      defaultVersion: defaultVersion || this.config.defaultVersion,
      latestVersion: sortedVersions[sortedVersions.length - 1],
    };

    this.endpoints.set(endpointKey, endpoint);
    
    logger.info('Versioned endpoint registered', {
      path,
      method,
      versions: Array.from(versions.keys()),
      defaultVersion: endpoint.defaultVersion,
      latestVersion: endpoint.latestVersion,
    });
  }

  /**
   * Extract version from request
   */
  extractVersion(event: APIGatewayProxyEventV2): string {
    let version: string | undefined;

    switch (this.config.strategy) {
      case 'header':
        version = event.headers?.[this.config.headerName] || 
                 event.headers?.[this.config.headerName.toLowerCase()];
        break;

      case 'query':
        version = (event as any).queryStringParameters?.[this.config.queryParamName];
        break;

      case 'path':
        const pathMatch = event.rawPath.match(/^\/v(\d+(?:\.\d+)?(?:\.\d+)?)/);
        version = pathMatch ? pathMatch[1] : undefined;
        break;

      case 'accept_header':
        const acceptHeader = event.headers?.accept || event.headers?.Accept;
        if (acceptHeader) {
          const versionMatch = acceptHeader.match(/application\/vnd\.evo-uds\.v(\d+(?:\.\d+)?(?:\.\d+)?)\+json/);
          version = versionMatch ? versionMatch[1] : undefined;
        }
        break;

      case 'subdomain':
        const host = event.headers?.host || event.headers?.Host;
        if (host) {
          const subdomainMatch = host.match(/^v(\d+(?:\.\d+)?(?:\.\d+)?)\./);
          version = subdomainMatch ? subdomainMatch[1] : undefined;
        }
        break;
    }

    // Normalize version format (ensure semantic versioning)
    if (version) {
      version = this.normalizeVersion(version);
    }

    return version || this.config.defaultVersion;
  }

  /**
   * Route request to appropriate version handler
   */
  async routeRequest(
    event: APIGatewayProxyEventV2,
    context: any
  ): Promise<APIGatewayProxyResultV2> {
    const requestedVersion = this.extractVersion(event);
    const endpointKey = `${event.requestContext.http.method} ${this.normalizeEndpointPath(event.rawPath)}`;
    
    logger.debug('Routing versioned request', {
      endpointKey,
      requestedVersion,
      strategy: this.config.strategy,
    });

    // Find endpoint
    const endpoint = this.endpoints.get(endpointKey);
    if (!endpoint) {
      return error('Endpoint not found', 404, undefined, event.headers?.origin);
    }

    // Find compatible version
    const compatibleVersion = this.findCompatibleVersion(endpoint, requestedVersion);
    if (!compatibleVersion) {
      return badRequest(
        `API version ${requestedVersion} is not supported for this endpoint`,
        {
          supportedVersions: Array.from(endpoint.versions.keys()),
          requestedVersion,
        },
        event.headers?.origin
      );
    }

    const endpointVersion = endpoint.versions.get(compatibleVersion)!;

    // Check if version is deprecated
    const versionInfo = this.versions.get(compatibleVersion);
    let response: APIGatewayProxyResultV2;

    try {
      // Execute handler
      response = await endpointVersion.handler(event, context);

      // Add version headers
      response.headers = {
        ...response.headers,
        'API-Version': compatibleVersion,
        'API-Latest-Version': endpoint.latestVersion,
        'API-Supported-Versions': Array.from(endpoint.versions.keys()).join(', '),
      };

      // Add deprecation warnings
      if (versionInfo?.status === 'deprecated' || endpointVersion.deprecated) {
        response.headers['API-Deprecation-Warning'] = 'true';
        response.headers['API-Deprecation-Date'] = versionInfo?.deprecationDate?.toISOString() || '';
        response.headers['API-Sunset-Date'] = versionInfo?.sunsetDate?.toISOString() || '';
        
        if (endpointVersion.migrationPath) {
          response.headers['API-Migration-Guide'] = endpointVersion.migrationPath;
        }

        logger.warn('Deprecated API version used', {
          version: compatibleVersion,
          endpoint: endpointKey,
          deprecationDate: versionInfo?.deprecationDate,
          sunsetDate: versionInfo?.sunsetDate,
        });
      }

    } catch (error) {
      logger.error('Versioned endpoint handler failed', error as Error, {
        version: compatibleVersion,
        endpoint: endpointKey,
      });
      
      response = {
        statusCode: 500,
        headers: {
          'API-Version': compatibleVersion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          error: 'Internal server error',
          version: compatibleVersion,
        }),
      };
    }

    return response;
  }

  /**
   * Find compatible version for endpoint
   */
  private findCompatibleVersion(endpoint: VersionedEndpoint, requestedVersion: string): string | null {
    // Exact match
    if (endpoint.versions.has(requestedVersion)) {
      return requestedVersion;
    }

    // Find highest compatible version
    const availableVersions = Array.from(endpoint.versions.keys())
      .sort(this.compareVersions.bind(this))
      .reverse(); // Start with highest version

    for (const version of availableVersions) {
      if (this.isCompatible(requestedVersion, version)) {
        return version;
      }
    }

    return null;
  }

  /**
   * Check if versions are compatible
   */
  private isCompatible(requestedVersion: string, availableVersion: string): boolean {
    const requested = this.parseVersion(requestedVersion);
    const available = this.parseVersion(availableVersion);

    // Same major version is generally compatible
    if (requested.major === available.major) {
      // Available version should be >= requested version
      if (available.minor > requested.minor) return true;
      if (available.minor === requested.minor && available.patch >= requested.patch) return true;
    }

    // Check compatibility matrix
    for (const [version, apiVersion] of this.versions) {
      const compatibility = apiVersion.compatibilityMatrix.find(
        c => c.fromVersion === requestedVersion && c.toVersion === availableVersion
      );
      if (compatibility) {
        return compatibility.compatible;
      }
    }

    return false;
  }

  /**
   * Compare version strings for sorting
   */
  private compareVersions(a: string, b: string): number {
    const versionA = this.parseVersion(a);
    const versionB = this.parseVersion(b);

    if (versionA.major !== versionB.major) {
      return versionA.major - versionB.major;
    }
    if (versionA.minor !== versionB.minor) {
      return versionA.minor - versionB.minor;
    }
    return versionA.patch - versionB.patch;
  }

  /**
   * Parse version string into components
   */
  private parseVersion(version: string): { major: number; minor: number; patch: number } {
    const parts = version.split('.').map(Number);
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0,
    };
  }

  /**
   * Normalize version to semantic versioning format
   */
  private normalizeVersion(version: string): string {
    const parsed = this.parseVersion(version);
    return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  }

  /**
   * Normalize endpoint path for matching
   */
  private normalizeEndpointPath(path: string): string {
    // Remove version prefix if using path versioning
    if (this.config.strategy === 'path') {
      return path.replace(/^\/v\d+(?:\.\d+)?(?:\.\d+)?/, '');
    }
    return path;
  }

  /**
   * Get version information
   */
  getVersion(version: string): APIVersion | undefined {
    return this.versions.get(version);
  }

  /**
   * Get all versions
   */
  getAllVersions(): APIVersion[] {
    return Array.from(this.versions.values())
      .sort((a, b) => this.compareVersions(a.version, b.version));
  }

  /**
   * Get supported versions for endpoint
   */
  getSupportedVersions(path: string, method: string): string[] {
    const endpointKey = `${method.toUpperCase()} ${path}`;
    const endpoint = this.endpoints.get(endpointKey);
    return endpoint ? Array.from(endpoint.versions.keys()) : [];
  }

  /**
   * Mark version as deprecated
   */
  deprecateVersion(version: string, deprecationDate: Date, sunsetDate: Date): void {
    const versionInfo = this.versions.get(version);
    if (versionInfo) {
      versionInfo.status = 'deprecated';
      versionInfo.deprecationDate = deprecationDate;
      versionInfo.sunsetDate = sunsetDate;

      logger.info('API version deprecated', {
        version,
        deprecationDate,
        sunsetDate,
      });
    }
  }

  /**
   * Generate API version documentation
   */
  generateVersionDocumentation(): {
    versions: APIVersion[];
    endpoints: Array<{
      path: string;
      method: string;
      versions: string[];
      defaultVersion: string;
      latestVersion: string;
    }>;
    migrationGuides: BreakingChange[];
  } {
    const versions = this.getAllVersions();
    const endpoints = Array.from(this.endpoints.values()).map(endpoint => ({
      path: endpoint.path,
      method: endpoint.method,
      versions: Array.from(endpoint.versions.keys()),
      defaultVersion: endpoint.defaultVersion,
      latestVersion: endpoint.latestVersion,
    }));

    const migrationGuides = versions.flatMap(v => v.breakingChanges);

    return {
      versions,
      endpoints,
      migrationGuides,
    };
  }
}

/**
 * Version-aware middleware
 */
export function withVersioning(
  versionManager: APIVersionManager
) {
  return async (
    event: APIGatewayProxyEventV2,
    context: any
  ): Promise<APIGatewayProxyResultV2> => {
    return versionManager.routeRequest(event, context);
  };
}

/**
 * Helper to create versioned endpoint handlers
 */
export function createVersionedEndpoint(
  path: string,
  method: string,
  handlers: Record<string, (event: APIGatewayProxyEventV2, context: any) => Promise<APIGatewayProxyResultV2>>,
  options: {
    defaultVersion?: string;
    deprecatedVersions?: Array<{
      version: string;
      message?: string;
      migrationPath?: string;
    }>;
  } = {}
): { path: string; method: string; versions: Map<string, EndpointVersion> } {
  const versions = new Map<string, EndpointVersion>();

  for (const [version, handler] of Object.entries(handlers)) {
    const deprecatedInfo = options.deprecatedVersions?.find(d => d.version === version);
    
    versions.set(version, {
      version,
      handler,
      deprecated: !!deprecatedInfo,
      deprecationMessage: deprecatedInfo?.message,
      migrationPath: deprecatedInfo?.migrationPath,
    });
  }

  return { path, method, versions };
}

// Default versioning configuration
export const DEFAULT_VERSIONING_CONFIG: VersioningConfig = {
  strategy: 'header',
  defaultVersion: '1.1.0',
  supportedVersions: ['1.0.0', '1.1.0', '2.0.0'],
  deprecationWarningPeriod: 90, // 3 months
  sunsetGracePeriod: 180, // 6 months
  headerName: 'API-Version',
  queryParamName: 'version',
  pathPrefix: true,
};

// Global version manager
export const apiVersionManager = new APIVersionManager(DEFAULT_VERSIONING_CONFIG);

// Example versioned endpoints registration
export function registerDefaultEndpoints(): void {
  // Security scan endpoint with multiple versions
  const securityScanEndpoint = createVersionedEndpoint(
    '/security/scan',
    'POST',
    {
      '1.0.0': async (event, context) => {
        // V1 implementation - basic scan
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            version: '1.0.0',
            scanId: 'scan_v1_' + Date.now(),
            message: 'Basic security scan initiated',
          }),
        };
      },
      '1.1.0': async (event, context) => {
        // V1.1 implementation - enhanced scan
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            version: '1.1.0',
            scanId: 'scan_v11_' + Date.now(),
            message: 'Enhanced security scan initiated',
            features: ['vulnerability_detection', 'compliance_check'],
          }),
        };
      },
      '2.0.0': async (event, context) => {
        // V2 implementation - complete rewrite
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            version: '2.0.0',
            scanId: 'scan_v2_' + Date.now(),
            message: 'Advanced security scan initiated',
            features: ['ai_powered_detection', 'real_time_monitoring', 'auto_remediation'],
            tenantId: event.requestContext.authorizer?.jwt?.claims?.tenant_id,
          }),
        };
      },
    },
    {
      defaultVersion: '1.1.0',
      deprecatedVersions: [
        {
          version: '1.0.0',
          message: 'Version 1.0.0 is deprecated. Please upgrade to 1.1.0 or later.',
          migrationPath: '/docs/migration/v1.0-to-v1.1',
        },
      ],
    }
  );

  apiVersionManager.registerEndpoint(
    securityScanEndpoint.path,
    securityScanEndpoint.method,
    securityScanEndpoint.versions,
    '1.1.0'
  );

  logger.info('Default versioned endpoints registered');
}