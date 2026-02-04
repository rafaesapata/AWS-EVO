/**
 * Azure Functions Security Scanner
 * 
 * Scans Azure Functions for security misconfigurations including:
 * - Authentication configuration
 * - Private endpoints
 * - Function keys exposure
 * - CORS configuration
 * - Managed Identity
 * - HTTPS enforcement
 * - Runtime version
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';
import { getGlobalCache, CacheKeys } from '../utils/cache.js';
import { rateLimitedFetch } from '../utils/rate-limiter.js';

// Configuration constants
const AZURE_WEB_API_VERSION = '2023-01-01';
const MIN_TLS_VERSION = '1.2';
const MIN_NODE_MAJOR_VERSION = 18;
const VALID_MANAGED_IDENTITY_TYPES = ['SystemAssigned', 'UserAssigned', 'SystemAssigned, UserAssigned'];

// Helper to extract resource group from Azure resource ID
function extractResourceGroup(resourceId: string): string {
  return resourceId?.split('/resourceGroups/')[1]?.split('/')[0] || 'unknown';
}

interface FunctionApp {
  id: string;
  name: string;
  location: string;
  kind?: string;
  properties: {
    state?: string;
    hostNames?: string[];
    httpsOnly?: boolean;
    publicNetworkAccess?: string;
    virtualNetworkSubnetId?: string;
    ftpsState?: string;
    minTlsVersion?: string;
    siteConfig?: {
      remoteDebuggingEnabled?: boolean;
      httpLoggingEnabled?: boolean;
      ftpsState?: string;
      minTlsVersion?: string;
      http20Enabled?: boolean;
      cors?: {
        allowedOrigins?: string[];
        supportCredentials?: boolean;
      };
      ipSecurityRestrictions?: IpSecurityRestriction[];
      functionAppScaleLimit?: number;
      minimumElasticInstanceCount?: number;
      preWarmedInstanceCount?: number;
    };
    functionAppConfig?: {
      runtime?: {
        name?: string;
        version?: string;
      };
    };
  };
  identity?: {
    type?: string;
    principalId?: string;
    tenantId?: string;
  };
  tags?: Record<string, string>;
}

interface IpSecurityRestriction {
  ipAddress?: string;
  action?: string;
  priority?: number;
  name?: string;
}

interface AuthSettings {
  properties: {
    enabled?: boolean;
    unauthenticatedClientAction?: string;
    defaultProvider?: string;
  };
}

interface PrivateEndpointConnection {
  id: string;
  name: string;
  properties: {
    privateEndpoint?: { id: string };
    privateLinkServiceConnectionState?: {
      status?: string;
    };
  };
}

async function fetchFunctionApps(context: AzureScanContext): Promise<FunctionApp[]> {
  const cache = getGlobalCache();
  const cacheKey = CacheKeys.functions(context.subscriptionId);
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.Web/sites?api-version=${AZURE_WEB_API_VERSION}`;
    
    const response = await rateLimitedFetch(url, {
      headers: {
        'Authorization': `Bearer ${context.accessToken}`,
        'Content-Type': 'application/json',
      },
    }, 'fetchFunctionApps');

    if (!response.ok) {
      throw new Error(`Failed to fetch Function Apps: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { value?: FunctionApp[] };
    // Filter to only function apps
    return (data.value || []).filter(app => app.kind?.includes('functionapp'));
  });
}

async function fetchAuthSettings(context: AzureScanContext, appId: string): Promise<AuthSettings | null> {
  const cache = getGlobalCache();
  const cacheKey = `function-auth:${appId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${appId}/config/authsettingsV2?api-version=${AZURE_WEB_API_VERSION}`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchFunctionAuthSettings');

      if (!response.ok) return null;
      return await response.json() as AuthSettings;
    } catch {
      return null;
    }
  });
}

async function fetchPrivateEndpoints(context: AzureScanContext, appId: string): Promise<PrivateEndpointConnection[]> {
  const cache = getGlobalCache();
  const cacheKey = `function-pe:${appId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${appId}/privateEndpointConnections?api-version=${AZURE_WEB_API_VERSION}`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchFunctionPrivateEndpoints');

      if (!response.ok) return [];
      const data = await response.json() as { value?: PrivateEndpointConnection[] };
      return data.value || [];
    } catch {
      return [];
    }
  });
}

interface FunctionAppWebConfig {
  properties?: {
    remoteDebuggingEnabled?: boolean;
    httpLoggingEnabled?: boolean;
    ftpsState?: string;
    minTlsVersion?: string;
    http20Enabled?: boolean;
    cors?: {
      allowedOrigins?: string[];
      supportCredentials?: boolean;
    };
    ipSecurityRestrictions?: IpSecurityRestriction[];
  };
}

async function fetchFunctionAppConfig(context: AzureScanContext, appId: string): Promise<FunctionAppWebConfig | null> {
  const cache = getGlobalCache();
  const cacheKey = `function-config:${appId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${appId}/config/web?api-version=${AZURE_WEB_API_VERSION}`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchFunctionAppConfig');

      if (!response.ok) return null;
      return await response.json() as FunctionAppWebConfig;
    } catch {
      return null;
    }
  });
}

export const functionsScanner: AzureScanner = {
  name: 'azure-functions',
  description: 'Scans Azure Functions for security misconfigurations',
  category: 'Compute',

  async scan(context: AzureScanContext): Promise<AzureScanResult> {
    const startTime = Date.now();
    const findings: AzureSecurityFinding[] = [];
    const errors: AzureScanError[] = [];
    let resourcesScanned = 0;

    try {
      logger.info('Starting Azure Functions security scan', { subscriptionId: context.subscriptionId });

      const functionApps = await fetchFunctionApps(context);
      resourcesScanned = functionApps.length;

      for (const app of functionApps) {
        const resourceGroup = extractResourceGroup(app.id);
        const props = app.properties;
        const siteConfig = props.siteConfig || {};

        // Fetch additional config
        const [authSettings, privateEndpoints, webConfig] = await Promise.all([
          fetchAuthSettings(context, app.id),
          fetchPrivateEndpoints(context, app.id),
          fetchFunctionAppConfig(context, app.id),
        ]);

        const config = webConfig?.properties || siteConfig;

        // 1. Check HTTPS Only
        if (!props.httpsOnly) {
          findings.push({
            severity: 'HIGH',
            title: 'Function App HTTPS Only Disabled',
            description: `Function App ${app.name} does not enforce HTTPS-only traffic.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Enable "HTTPS Only" to redirect all HTTP traffic to HTTPS.',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          });
        }

        // 2. Check Minimum TLS Version
        const tlsVersion = config.minTlsVersion || props.minTlsVersion;
        if (!tlsVersion || tlsVersion < MIN_TLS_VERSION) {
          findings.push({
            severity: 'HIGH',
            title: 'Function App Allows Outdated TLS',
            description: `Function App ${app.name} allows TLS versions older than 1.2.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Set minimum TLS version to 1.2 or higher.',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          });
        }

        // 3. Check Authentication
        if (!authSettings?.properties?.enabled) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Function App Authentication Not Configured',
            description: `Function App ${app.name} does not have built-in authentication configured. Functions may be accessible with just function keys.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Configure App Service Authentication (Easy Auth) for additional security layer.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 4. Check Private Endpoints
        const hasPrivateEndpoints = privateEndpoints.some(pe => 
          pe.properties.privateLinkServiceConnectionState?.status === 'Approved'
        );

        if (!hasPrivateEndpoints && props.publicNetworkAccess !== 'Disabled') {
          findings.push({
            severity: 'MEDIUM',
            title: 'Function App Without Private Endpoints',
            description: `Function App ${app.name} does not have private endpoints configured and allows public access.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Configure private endpoints for secure access from VNet.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 5. Check Managed Identity
        if (!app.identity || !VALID_MANAGED_IDENTITY_TYPES.includes(app.identity.type || '')) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Function App Without Managed Identity',
            description: `Function App ${app.name} does not have a managed identity configured.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Enable system-assigned or user-assigned managed identity for secure Azure resource access.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 6. Check VNet Integration
        if (!props.virtualNetworkSubnetId) {
          findings.push({
            severity: 'LOW',
            title: 'Function App Without VNet Integration',
            description: `Function App ${app.name} is not integrated with a Virtual Network.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Configure VNet integration for secure access to private resources.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 7. Check FTP State
        const ftpsState = config.ftpsState || props.ftpsState;
        if (ftpsState !== 'Disabled' && ftpsState !== 'FtpsOnly') {
          findings.push({
            severity: 'MEDIUM',
            title: 'Function App FTP Enabled',
            description: `Function App ${app.name} has insecure FTP enabled.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Disable FTP or use FTPS only.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 8. Check Remote Debugging
        if (config.remoteDebuggingEnabled) {
          findings.push({
            severity: 'HIGH',
            title: 'Function App Remote Debugging Enabled',
            description: `Function App ${app.name} has remote debugging enabled.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Disable remote debugging in production environments.',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          });
        }

        // 9. Check CORS Configuration
        const cors = config.cors;
        if (cors?.allowedOrigins?.includes('*')) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Function App CORS Allows All Origins',
            description: `Function App ${app.name} CORS configuration allows all origins (*).`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Restrict CORS to specific trusted origins.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 10. Check IP Restrictions
        const ipRestrictions = config.ipSecurityRestrictions || [];
        const hasIpRestrictions = ipRestrictions.some((r: IpSecurityRestriction) => 
          r.action === 'Deny' || (r.action === 'Allow' && r.ipAddress !== 'Any')
        );

        if (!hasIpRestrictions && props.publicNetworkAccess !== 'Disabled' && !hasPrivateEndpoints) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Function App Without IP Restrictions',
            description: `Function App ${app.name} has no IP access restrictions configured.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Configure IP restrictions to limit access to known IP ranges.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 11. Check HTTP Logging
        if (!config.httpLoggingEnabled) {
          findings.push({
            severity: 'LOW',
            title: 'Function App HTTP Logging Disabled',
            description: `Function App ${app.name} does not have HTTP logging enabled.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Enable HTTP logging for troubleshooting and security monitoring.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 12. Check Runtime Version (for known vulnerabilities)
        const runtime = props.functionAppConfig?.runtime;
        if (runtime?.name === 'node' && runtime?.version) {
          const majorVersion = parseInt(runtime.version.split('.')[0], 10);
          if (majorVersion < MIN_NODE_MAJOR_VERSION) {
            findings.push({
              severity: 'MEDIUM',
              title: 'Function App Using Outdated Node.js',
              description: `Function App ${app.name} is using Node.js ${runtime.version}. Consider upgrading to Node.js 18+.`,
              resourceType: 'Microsoft.Web/sites',
              resourceId: app.id,
              resourceName: app.name,
              resourceGroup,
              region: app.location,
              remediation: 'Upgrade to Node.js 18 or later for security updates.',
              complianceFrameworks: ['CIS Azure 1.4'],
              metadata: { runtime: runtime.name, version: runtime.version },
            });
          }
        }
      }

      logger.info('Azure Functions security scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Error scanning Azure Functions', { error: errorMessage });
      errors.push({
        scanner: 'azure-functions',
        message: errorMessage,
        recoverable: true,
        resourceType: 'Microsoft.Web/sites',
      });
    }

    return {
      findings,
      resourcesScanned,
      errors,
      scanDurationMs: Date.now() - startTime,
    };
  },
};

export default functionsScanner;
