/**
 * Azure App Service Security Scanner
 * 
 * Scans Azure App Services (Web Apps) for security misconfigurations including:
 * - HTTPS Only enforcement
 * - Managed Identity configuration
 * - VNet Integration
 * - Minimum TLS version
 * - Authentication configuration
 * - FTP state
 * - Remote debugging
 * - Client certificates
 * - HTTP/2 support
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';
import { getGlobalCache, CacheKeys } from '../utils/cache.js';
import { rateLimitedFetch } from '../utils/rate-limiter.js';

// Configuration constants
const AZURE_WEB_API_VERSION = '2023-01-01';
const MIN_TLS_VERSION = '1.2';

// Helper to extract resource group from Azure resource ID
function extractResourceGroup(resourceId: string): string {
  return resourceId?.split('/resourceGroups/')[1]?.split('/')[0] || 'unknown';
}

interface AppService {
  id: string;
  name: string;
  location: string;
  kind?: string;
  properties: {
    state?: string;
    hostNames?: string[];
    httpsOnly?: boolean;
    clientCertEnabled?: boolean;
    clientCertMode?: string;
    virtualNetworkSubnetId?: string;
    publicNetworkAccess?: string;
    ftpsState?: string;
    minTlsVersion?: string;
    http20Enabled?: boolean;
    siteConfig?: {
      remoteDebuggingEnabled?: boolean;
      httpLoggingEnabled?: boolean;
      detailedErrorLoggingEnabled?: boolean;
      requestTracingEnabled?: boolean;
      ftpsState?: string;
      minTlsVersion?: string;
      http20Enabled?: boolean;
      alwaysOn?: boolean;
      managedPipelineMode?: string;
      use32BitWorkerProcess?: boolean;
      cors?: {
        allowedOrigins?: string[];
        supportCredentials?: boolean;
      };
      ipSecurityRestrictions?: IpSecurityRestriction[];
      scmIpSecurityRestrictions?: IpSecurityRestriction[];
      scmIpSecurityRestrictionsUseMain?: boolean;
    };
  };
  identity?: {
    type?: string;
    principalId?: string;
    tenantId?: string;
    userAssignedIdentities?: Record<string, any>;
  };
  tags?: Record<string, string>;
}

interface IpSecurityRestriction {
  ipAddress?: string;
  action?: string;
  priority?: number;
  name?: string;
  description?: string;
  vnetSubnetResourceId?: string;
}

interface AuthSettings {
  id: string;
  properties: {
    enabled?: boolean;
    unauthenticatedClientAction?: string;
    defaultProvider?: string;
    tokenStoreEnabled?: boolean;
    allowedExternalRedirectUrls?: string[];
    clientId?: string;
    issuer?: string;
  };
}

async function fetchAppServices(context: AzureScanContext): Promise<AppService[]> {
  const cache = getGlobalCache();
  const cacheKey = CacheKeys.appServices(context.subscriptionId);
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.Web/sites?api-version=${AZURE_WEB_API_VERSION}`;
    
    const response = await rateLimitedFetch(url, {
      headers: {
        'Authorization': `Bearer ${context.accessToken}`,
        'Content-Type': 'application/json',
      },
    }, 'fetchAppServices');

    if (!response.ok) {
      throw new Error(`Failed to fetch App Services: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { value?: AppService[] };
    return data.value || [];
  });
}

async function fetchAuthSettings(context: AzureScanContext, appId: string): Promise<AuthSettings | null> {
  const cache = getGlobalCache();
  const cacheKey = `appservice-auth:${appId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${appId}/config/authsettingsV2?api-version=${AZURE_WEB_API_VERSION}`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchAuthSettings');

      if (!response.ok) return null;
      return await response.json() as AuthSettings;
    } catch {
      return null;
    }
  });
}

async function fetchAppServiceConfig(context: AzureScanContext, appId: string): Promise<any | null> {
  const cache = getGlobalCache();
  const cacheKey = `appservice-config:${appId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${appId}/config/web?api-version=${AZURE_WEB_API_VERSION}`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchAppServiceConfig');

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  });
}

export const appServiceScanner: AzureScanner = {
  name: 'azure-app-service',
  description: 'Scans Azure App Services for security misconfigurations',
  category: 'Compute',

  async scan(context: AzureScanContext): Promise<AzureScanResult> {
    const startTime = Date.now();
    const findings: AzureSecurityFinding[] = [];
    const errors: AzureScanError[] = [];
    let resourcesScanned = 0;

    try {
      logger.info('Starting App Service security scan', { subscriptionId: context.subscriptionId });

      const appServices = await fetchAppServices(context);
      resourcesScanned = appServices.length;

      for (const app of appServices) {
        const resourceGroup = extractResourceGroup(app.id);
        const props = app.properties;
        const siteConfig = props.siteConfig || {};

        // Skip function apps (handled by separate scanner)
        if (app.kind?.includes('functionapp')) {
          continue;
        }

        // Fetch additional config
        const [authSettings, webConfig] = await Promise.all([
          fetchAuthSettings(context, app.id),
          fetchAppServiceConfig(context, app.id),
        ]);

        const config = webConfig?.properties || siteConfig;

        // 1. Check HTTPS Only
        if (!props.httpsOnly) {
          findings.push({
            severity: 'HIGH',
            title: 'App Service HTTPS Only Disabled',
            description: `App Service ${app.name} does not enforce HTTPS-only traffic.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Enable "HTTPS Only" to redirect all HTTP traffic to HTTPS.',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD'],
          });
        }

        // 2. Check Minimum TLS Version
        const tlsVersion = config.minTlsVersion || props.minTlsVersion;
        if (!tlsVersion || tlsVersion < MIN_TLS_VERSION) {
          findings.push({
            severity: 'HIGH',
            title: 'App Service Allows Outdated TLS',
            description: `App Service ${app.name} allows TLS versions older than 1.2.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Set minimum TLS version to 1.2 or higher.',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
            metadata: { currentTlsVersion: tlsVersion },
          });
        }

        // 3. Check Managed Identity
        if (!app.identity || (app.identity.type !== 'SystemAssigned' && app.identity.type !== 'UserAssigned' && app.identity.type !== 'SystemAssigned, UserAssigned')) {
          findings.push({
            severity: 'MEDIUM',
            title: 'App Service Without Managed Identity',
            description: `App Service ${app.name} does not have a managed identity configured.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Enable system-assigned or user-assigned managed identity for secure Azure resource access.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 4. Check VNet Integration
        if (!props.virtualNetworkSubnetId) {
          findings.push({
            severity: 'MEDIUM',
            title: 'App Service Without VNet Integration',
            description: `App Service ${app.name} is not integrated with a Virtual Network.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Configure VNet integration for secure access to private resources.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 5. Check FTP State
        const ftpsState = config.ftpsState || props.ftpsState;
        if (ftpsState !== 'Disabled' && ftpsState !== 'FtpsOnly') {
          findings.push({
            severity: 'HIGH',
            title: 'App Service FTP Enabled',
            description: `App Service ${app.name} has insecure FTP enabled (state: ${ftpsState || 'AllAllowed'}).`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Disable FTP or use FTPS only. Prefer deployment via Azure DevOps, GitHub Actions, or ZIP deploy.',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
            metadata: { ftpsState },
          });
        }

        // 6. Check Remote Debugging
        if (config.remoteDebuggingEnabled) {
          findings.push({
            severity: 'HIGH',
            title: 'App Service Remote Debugging Enabled',
            description: `App Service ${app.name} has remote debugging enabled.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Disable remote debugging in production environments.',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          });
        }

        // 7. Check Authentication
        if (!authSettings?.properties?.enabled) {
          findings.push({
            severity: 'MEDIUM',
            title: 'App Service Authentication Not Configured',
            description: `App Service ${app.name} does not have built-in authentication configured.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Configure App Service Authentication (Easy Auth) or implement custom authentication.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        } else if (authSettings.properties.unauthenticatedClientAction === 'AllowAnonymous') {
          findings.push({
            severity: 'LOW',
            title: 'App Service Allows Anonymous Access',
            description: `App Service ${app.name} authentication allows anonymous requests.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Consider requiring authentication for all requests if appropriate.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 8. Check Client Certificates
        if (!props.clientCertEnabled) {
          findings.push({
            severity: 'LOW',
            title: 'App Service Client Certificates Disabled',
            description: `App Service ${app.name} does not require client certificates.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Consider enabling client certificates for mutual TLS authentication.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 9. Check HTTP/2
        if (!config.http20Enabled) {
          findings.push({
            severity: 'LOW',
            title: 'App Service HTTP/2 Disabled',
            description: `App Service ${app.name} does not have HTTP/2 enabled.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Enable HTTP/2 for improved performance and security.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 10. Check Always On
        if (!config.alwaysOn) {
          findings.push({
            severity: 'LOW',
            title: 'App Service Always On Disabled',
            description: `App Service ${app.name} does not have Always On enabled.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Enable Always On to prevent the app from being unloaded during idle periods.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 11. Check IP Restrictions
        const ipRestrictions = config.ipSecurityRestrictions || [];
        const hasIpRestrictions = ipRestrictions.some((r: IpSecurityRestriction) => 
          r.action === 'Deny' || (r.action === 'Allow' && r.ipAddress !== 'Any')
        );

        if (!hasIpRestrictions && props.publicNetworkAccess !== 'Disabled') {
          findings.push({
            severity: 'MEDIUM',
            title: 'App Service Without IP Restrictions',
            description: `App Service ${app.name} has no IP access restrictions configured.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Configure IP restrictions to limit access to known IP ranges.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 12. Check SCM (Kudu) IP Restrictions
        const scmRestrictions = config.scmIpSecurityRestrictions || [];
        const hasScmRestrictions = scmRestrictions.some((r: IpSecurityRestriction) => 
          r.action === 'Deny' || (r.action === 'Allow' && r.ipAddress !== 'Any')
        );

        if (!hasScmRestrictions && !config.scmIpSecurityRestrictionsUseMain) {
          findings.push({
            severity: 'MEDIUM',
            title: 'App Service SCM Without IP Restrictions',
            description: `App Service ${app.name} SCM (Kudu) site has no IP restrictions.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Configure SCM IP restrictions or use main site restrictions.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 13. Check CORS Configuration
        const cors = config.cors;
        if (cors?.allowedOrigins?.includes('*')) {
          findings.push({
            severity: 'MEDIUM',
            title: 'App Service CORS Allows All Origins',
            description: `App Service ${app.name} CORS configuration allows all origins (*).`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Restrict CORS to specific trusted origins.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 14. Check 32-bit Worker Process
        if (config.use32BitWorkerProcess) {
          findings.push({
            severity: 'LOW',
            title: 'App Service Using 32-bit Worker',
            description: `App Service ${app.name} is using 32-bit worker process.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Consider using 64-bit worker process for better performance.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 15. Check HTTP Logging
        if (!config.httpLoggingEnabled) {
          findings.push({
            severity: 'LOW',
            title: 'App Service HTTP Logging Disabled',
            description: `App Service ${app.name} does not have HTTP logging enabled.`,
            resourceType: 'Microsoft.Web/sites',
            resourceId: app.id,
            resourceName: app.name,
            resourceGroup,
            region: app.location,
            remediation: 'Enable HTTP logging for troubleshooting and security monitoring.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }
      }

      logger.info('App Service security scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Error scanning App Services', { error: errorMessage });
      errors.push({
        scanner: 'azure-app-service',
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

export default appServiceScanner;
