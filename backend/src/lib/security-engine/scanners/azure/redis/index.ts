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
import { CacheKeys } from '../utils/cache.js';
import { fetchAzurePagedList } from '../utils/paginated-fetch.js';
import { extractResourceGroup, fetchAzureSubResourceList } from '../utils/azure-helpers.js';

// Configuration constants
const AZURE_REDIS_API_VERSION = '2023-08-01';
const MIN_TLS_VERSION = '1.2';
const MIN_REDIS_MAJOR_VERSION = 6;

function buildFinding(
  cache: RedisCache,
  resourceGroup: string,
  overrides: Pick<AzureSecurityFinding, 'severity' | 'title' | 'description' | 'remediation' | 'complianceFrameworks'> & { metadata?: Record<string, unknown> }
): AzureSecurityFinding {
  return {
    resourceType: 'Microsoft.Cache/redis',
    resourceId: cache.id,
    resourceName: cache.name,
    resourceGroup,
    region: cache.location,
    ...overrides,
  };
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
  return fetchAzurePagedList<RedisCache>(
    context,
    `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.Cache/redis?api-version=${AZURE_REDIS_API_VERSION}`,
    { cacheKey: CacheKeys.redis(context.subscriptionId), operationName: 'fetchRedisCaches' }
  );
}

async function fetchFirewallRules(context: AzureScanContext, cacheId: string): Promise<FirewallRule[]> {
  const url = `https://management.azure.com${cacheId}/firewallRules?api-version=${AZURE_REDIS_API_VERSION}`;
  return fetchAzureSubResourceList<FirewallRule>(
    context,
    url,
    `redis-fw:${cacheId}`,
    'fetchRedisFirewallRules'
  );
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
          findings.push(buildFinding(cache, resourceGroup, {
            severity: 'CRITICAL',
            title: 'Redis Non-SSL Port Enabled',
            description: `Redis cache ${cache.name} has the non-SSL port (6379) enabled, allowing unencrypted connections.`,
            remediation: 'Disable the non-SSL port and use only SSL connections (port 6380).',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD'],
          }));
        }

        // 2. Check Minimum TLS Version
        if (!props.minimumTlsVersion || props.minimumTlsVersion < MIN_TLS_VERSION) {
          findings.push(buildFinding(cache, resourceGroup, {
            severity: 'HIGH',
            title: 'Redis Allows Outdated TLS',
            description: `Redis cache ${cache.name} allows TLS versions older than ${MIN_TLS_VERSION}.`,
            remediation: `Set minimum TLS version to ${MIN_TLS_VERSION}.`,
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
            metadata: { currentTlsVersion: props.minimumTlsVersion },
          }));
        }

        // 3. Check Public Network Access
        if (props.publicNetworkAccess !== 'Disabled' && !hasPrivateEndpoints) {
          findings.push(buildFinding(cache, resourceGroup, {
            severity: 'HIGH',
            title: 'Redis Public Network Access Enabled',
            description: `Redis cache ${cache.name} has public network access enabled without private endpoints.`,
            remediation: 'Disable public network access and use private endpoints.',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          }));
        }

        // 4. Check Firewall Rules
        if (firewallRules.length === 0 && props.publicNetworkAccess !== 'Disabled') {
          findings.push(buildFinding(cache, resourceGroup, {
            severity: 'MEDIUM',
            title: 'Redis No Firewall Rules',
            description: `Redis cache ${cache.name} has no firewall rules configured.`,
            remediation: 'Configure firewall rules to restrict access to specific IP ranges.',
            complianceFrameworks: ['CIS Azure 1.4'],
          }));
        }

        // Check for overly permissive firewall rules
        for (const rule of firewallRules) {
          if (rule.properties.startIP === '0.0.0.0' && rule.properties.endIP === '255.255.255.255') {
            findings.push(buildFinding(cache, resourceGroup, {
              severity: 'CRITICAL',
              title: 'Redis Firewall Allows All IPs',
              description: `Redis cache ${cache.name} has a firewall rule allowing all IP addresses.`,
              remediation: 'Remove the overly permissive rule and restrict to specific IP addresses.',
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
              metadata: { ruleName: rule.name },
            }));
          }
        }

        // 5. Check Private Endpoints
        if (!hasPrivateEndpoints) {
          findings.push(buildFinding(cache, resourceGroup, {
            severity: 'MEDIUM',
            title: 'Redis Without Private Endpoints',
            description: `Redis cache ${cache.name} does not have private endpoints configured.`,
            remediation: 'Configure private endpoints for secure VNet access.',
            complianceFrameworks: ['CIS Azure 1.4'],
          }));
        }

        // 6. Check Azure AD Authentication
        const aadEnabled = props.redisConfiguration?.['aad-enabled'];
        if (aadEnabled !== 'true') {
          findings.push(buildFinding(cache, resourceGroup, {
            severity: 'MEDIUM',
            title: 'Redis Azure AD Authentication Disabled',
            description: `Redis cache ${cache.name} does not have Azure AD authentication enabled.`,
            remediation: 'Enable Azure AD authentication for enhanced security.',
            complianceFrameworks: ['CIS Azure 1.4'],
          }));
        }

        // 7. Check Managed Identity
        if (!cache.identity || cache.identity.type === 'None') {
          findings.push(buildFinding(cache, resourceGroup, {
            severity: 'LOW',
            title: 'Redis Without Managed Identity',
            description: `Redis cache ${cache.name} does not have a managed identity configured.`,
            remediation: 'Configure managed identity for secure access to other Azure resources.',
            complianceFrameworks: ['CIS Azure 1.4'],
          }));
        }

        // 8. Check Zone Redundancy
        if (!cache.zones || cache.zones.length < 2) {
          findings.push(buildFinding(cache, resourceGroup, {
            severity: 'LOW',
            title: 'Redis Not Zone Redundant',
            description: `Redis cache ${cache.name} is not deployed across multiple availability zones.`,
            remediation: 'Deploy Redis across multiple availability zones for high availability.',
            complianceFrameworks: ['CIS Azure 1.4'],
          }));
        }

        // 9. Check SKU Tier
        if (props.sku?.name === 'Basic') {
          findings.push(buildFinding(cache, resourceGroup, {
            severity: 'MEDIUM',
            title: 'Redis Using Basic Tier',
            description: `Redis cache ${cache.name} is using the Basic tier without SLA or replication.`,
            remediation: 'Consider upgrading to Standard or Premium tier for production workloads.',
            complianceFrameworks: ['CIS Azure 1.4'],
            metadata: { currentSku: props.sku.name },
          }));
        }

        // 10. Check Redis Version
        if (props.redisVersion) {
          const majorVersion = parseInt(props.redisVersion.split('.')[0], 10);
          if (majorVersion < MIN_REDIS_MAJOR_VERSION) {
            findings.push(buildFinding(cache, resourceGroup, {
              severity: 'MEDIUM',
              title: 'Redis Using Outdated Version',
              description: `Redis cache ${cache.name} is using Redis version ${props.redisVersion}. Consider upgrading to Redis ${MIN_REDIS_MAJOR_VERSION}+.`,
              remediation: `Upgrade to Redis ${MIN_REDIS_MAJOR_VERSION} or later for security improvements.`,
              complianceFrameworks: ['CIS Azure 1.4'],
              metadata: { currentVersion: props.redisVersion },
            }));
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
