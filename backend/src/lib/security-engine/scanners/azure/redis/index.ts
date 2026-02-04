/**
 * Azure Cache for Redis Security Scanner
 * 
 * Scans Azure Cache for Redis for security misconfigurations including:
 * - SSL/TLS enforcement
 * - Authentication configuration
 * - Public network access
 * - Firewall rules
 * - Minimum TLS version
 * - Non-SSL port
 * - Private endpoints
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';
import { getGlobalCache, CacheKeys } from '../utils/cache.js';
import { rateLimitedFetch } from '../utils/rate-limiter.js';

// Configuration constants
const AZURE_REDIS_API_VERSION = '2023-08-01';
const MIN_TLS_VERSION = '1.2';
const MIN_REDIS_MAJOR_VERSION = 6;

// Helper to extract resource group from Azure resource ID
function extractResourceGroup(resourceId: string): string {
  return resourceId?.split('/resourceGroups/')[1]?.split('/')[0] || 'unknown';
}

interface RedisCache {
  id: string;
  name: string;
  location: string;
  properties: {
    provisioningState?: string;
    hostName?: string;
    port?: number;
    sslPort?: number;
    enableNonSslPort?: boolean;
    minimumTlsVersion?: string;
    publicNetworkAccess?: string;
    redisVersion?: string;
    sku?: {
      name?: string;
      family?: string;
      capacity?: number;
    };
    redisConfiguration?: {
      maxclients?: string;
      'maxmemory-reserved'?: string;
      'maxmemory-delta'?: string;
      'maxmemory-policy'?: string;
      'aad-enabled'?: string;
    };
    accessKeys?: {
      primaryKey?: string;
      secondaryKey?: string;
    };
    linkedServers?: any[];
    instances?: any[];
    privateEndpointConnections?: PrivateEndpointConnection[];
  };
  identity?: {
    type?: string;
    principalId?: string;
    tenantId?: string;
  };
  zones?: string[];
  tags?: Record<string, string>;
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

interface FirewallRule {
  id: string;
  name: string;
  properties: {
    startIP: string;
    endIP: string;
  };
}

async function fetchRedisCaches(context: AzureScanContext): Promise<RedisCache[]> {
  const cache = getGlobalCache();
  const cacheKey = CacheKeys.redis(context.subscriptionId);
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.Cache/redis?api-version=${AZURE_REDIS_API_VERSION}`;
    
    const response = await rateLimitedFetch(url, {
      headers: {
        'Authorization': `Bearer ${context.accessToken}`,
        'Content-Type': 'application/json',
      },
    }, 'fetchRedisCaches');

    if (!response.ok) {
      throw new Error(`Failed to fetch Redis caches: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { value?: RedisCache[] };
    return data.value || [];
  });
}

async function fetchFirewallRules(context: AzureScanContext, cacheId: string): Promise<FirewallRule[]> {
  const cache = getGlobalCache();
  const cacheKey = `redis-fw:${cacheId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${cacheId}/firewallRules?api-version=${AZURE_REDIS_API_VERSION}`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchRedisFirewallRules');

      if (!response.ok) return [];
      const data = await response.json() as { value?: FirewallRule[] };
      return data.value || [];
    } catch {
      return [];
    }
  });
}

export const redisScanner: AzureScanner = {
  name: 'azure-redis',
  description: 'Scans Azure Cache for Redis for security misconfigurations',
  category: 'Database',

  async scan(context: AzureScanContext): Promise<AzureScanResult> {
    const startTime = Date.now();
    const findings: AzureSecurityFinding[] = [];
    const errors: AzureScanError[] = [];
    let resourcesScanned = 0;

    try {
      logger.info('Starting Redis security scan', { subscriptionId: context.subscriptionId });

      const caches = await fetchRedisCaches(context);
      resourcesScanned = caches.length;

      for (const cache of caches) {
        const resourceGroup = extractResourceGroup(cache.id);
        const props = cache.properties;

        // Fetch firewall rules
        const firewallRules = await fetchFirewallRules(context, cache.id);

        // Check private endpoints
        const hasPrivateEndpoints = (props.privateEndpointConnections || []).some(pe => 
          pe.properties.privateLinkServiceConnectionState?.status === 'Approved'
        );

        // 1. Check Non-SSL Port
        if (props.enableNonSslPort === true) {
          findings.push({
            severity: 'CRITICAL',
            title: 'Redis Non-SSL Port Enabled',
            description: `Redis cache ${cache.name} has the non-SSL port (6379) enabled, allowing unencrypted connections.`,
            resourceType: 'Microsoft.Cache/redis',
            resourceId: cache.id,
            resourceName: cache.name,
            resourceGroup,
            region: cache.location,
            remediation: 'Disable the non-SSL port and use only SSL connections (port 6380).',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD'],
          });
        }

        // 2. Check Minimum TLS Version
        if (!props.minimumTlsVersion || props.minimumTlsVersion < MIN_TLS_VERSION) {
          findings.push({
            severity: 'HIGH',
            title: 'Redis Allows Outdated TLS',
            description: `Redis cache ${cache.name} allows TLS versions older than ${MIN_TLS_VERSION}.`,
            resourceType: 'Microsoft.Cache/redis',
            resourceId: cache.id,
            resourceName: cache.name,
            resourceGroup,
            region: cache.location,
            remediation: `Set minimum TLS version to ${MIN_TLS_VERSION}.`,
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
            metadata: { currentTlsVersion: props.minimumTlsVersion },
          });
        }

        // 3. Check Public Network Access
        if (props.publicNetworkAccess !== 'Disabled') {
          if (!hasPrivateEndpoints) {
            findings.push({
              severity: 'HIGH',
              title: 'Redis Public Network Access Enabled',
              description: `Redis cache ${cache.name} has public network access enabled without private endpoints.`,
              resourceType: 'Microsoft.Cache/redis',
              resourceId: cache.id,
              resourceName: cache.name,
              resourceGroup,
              region: cache.location,
              remediation: 'Disable public network access and use private endpoints.',
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
            });
          }
        }

        // 4. Check Firewall Rules
        if (firewallRules.length === 0 && props.publicNetworkAccess !== 'Disabled') {
          findings.push({
            severity: 'MEDIUM',
            title: 'Redis No Firewall Rules',
            description: `Redis cache ${cache.name} has no firewall rules configured.`,
            resourceType: 'Microsoft.Cache/redis',
            resourceId: cache.id,
            resourceName: cache.name,
            resourceGroup,
            region: cache.location,
            remediation: 'Configure firewall rules to restrict access to specific IP ranges.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check for overly permissive firewall rules
        for (const rule of firewallRules) {
          if (rule.properties.startIP === '0.0.0.0' && rule.properties.endIP === '255.255.255.255') {
            findings.push({
              severity: 'CRITICAL',
              title: 'Redis Firewall Allows All IPs',
              description: `Redis cache ${cache.name} has a firewall rule allowing all IP addresses.`,
              resourceType: 'Microsoft.Cache/redis',
              resourceId: cache.id,
              resourceName: cache.name,
              resourceGroup,
              region: cache.location,
              remediation: 'Remove the overly permissive rule and restrict to specific IP addresses.',
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
              metadata: { ruleName: rule.name },
            });
          }
        }

        // 5. Check Private Endpoints
        if (!hasPrivateEndpoints) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Redis Without Private Endpoints',
            description: `Redis cache ${cache.name} does not have private endpoints configured.`,
            resourceType: 'Microsoft.Cache/redis',
            resourceId: cache.id,
            resourceName: cache.name,
            resourceGroup,
            region: cache.location,
            remediation: 'Configure private endpoints for secure VNet access.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 6. Check Azure AD Authentication
        const aadEnabled = props.redisConfiguration?.['aad-enabled'];
        if (aadEnabled !== 'true') {
          findings.push({
            severity: 'MEDIUM',
            title: 'Redis Azure AD Authentication Disabled',
            description: `Redis cache ${cache.name} does not have Azure AD authentication enabled.`,
            resourceType: 'Microsoft.Cache/redis',
            resourceId: cache.id,
            resourceName: cache.name,
            resourceGroup,
            region: cache.location,
            remediation: 'Enable Azure AD authentication for enhanced security.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 7. Check Managed Identity
        if (!cache.identity || cache.identity.type === 'None') {
          findings.push({
            severity: 'LOW',
            title: 'Redis Without Managed Identity',
            description: `Redis cache ${cache.name} does not have a managed identity configured.`,
            resourceType: 'Microsoft.Cache/redis',
            resourceId: cache.id,
            resourceName: cache.name,
            resourceGroup,
            region: cache.location,
            remediation: 'Configure managed identity for secure access to other Azure resources.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 8. Check Zone Redundancy
        if (!cache.zones || cache.zones.length < 2) {
          findings.push({
            severity: 'LOW',
            title: 'Redis Not Zone Redundant',
            description: `Redis cache ${cache.name} is not deployed across multiple availability zones.`,
            resourceType: 'Microsoft.Cache/redis',
            resourceId: cache.id,
            resourceName: cache.name,
            resourceGroup,
            region: cache.location,
            remediation: 'Deploy Redis across multiple availability zones for high availability.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 9. Check SKU Tier
        const sku = props.sku;
        if (sku?.name === 'Basic') {
          findings.push({
            severity: 'MEDIUM',
            title: 'Redis Using Basic Tier',
            description: `Redis cache ${cache.name} is using the Basic tier without SLA or replication.`,
            resourceType: 'Microsoft.Cache/redis',
            resourceId: cache.id,
            resourceName: cache.name,
            resourceGroup,
            region: cache.location,
            remediation: 'Consider upgrading to Standard or Premium tier for production workloads.',
            complianceFrameworks: ['CIS Azure 1.4'],
            metadata: { currentSku: sku.name },
          });
        }

        // 10. Check Redis Version
        if (props.redisVersion) {
          const majorVersion = parseInt(props.redisVersion.split('.')[0], 10);
          if (majorVersion < MIN_REDIS_MAJOR_VERSION) {
            findings.push({
              severity: 'MEDIUM',
              title: 'Redis Using Outdated Version',
              description: `Redis cache ${cache.name} is using Redis version ${props.redisVersion}. Consider upgrading to Redis ${MIN_REDIS_MAJOR_VERSION}+.`,
              resourceType: 'Microsoft.Cache/redis',
              resourceId: cache.id,
              resourceName: cache.name,
              resourceGroup,
              region: cache.location,
              remediation: `Upgrade to Redis ${MIN_REDIS_MAJOR_VERSION} or later for security improvements.`,
              complianceFrameworks: ['CIS Azure 1.4'],
              metadata: { currentVersion: props.redisVersion },
            });
          }
        }
      }

      logger.info('Redis security scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error scanning Redis caches', { error: errorMessage });
      errors.push({
        scanner: 'azure-redis',
        message: errorMessage,
        recoverable: true,
        resourceType: 'Microsoft.Cache/redis',
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

export default redisScanner;
