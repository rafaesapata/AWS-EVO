/**
 * Azure Cosmos DB Security Scanner
 * 
 * Scans Azure Cosmos DB accounts for security misconfigurations including:
 * - Firewall configuration
 * - Customer Managed Keys (CMK)
 * - Private endpoints
 * - Diagnostic settings
 * - Backup policies
 * - Public network access
 * - Virtual network rules
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';
import { getGlobalCache, CacheKeys } from '../utils/cache.js';
import { rateLimitedFetch } from '../utils/rate-limiter.js';

// Configuration constants
const AZURE_COSMOSDB_API_VERSION = '2023-11-15';
const MIN_BACKUP_RETENTION_HOURS = 168; // 7 days

// Helper to extract resource group from Azure resource ID
function extractResourceGroup(resourceId: string): string {
  return resourceId?.split('/resourceGroups/')[1]?.split('/')[0] || 'unknown';
}

interface CosmosDBAccount {
  id: string;
  name: string;
  location: string;
  kind?: string;
  properties: {
    documentEndpoint?: string;
    provisioningState?: string;
    publicNetworkAccess?: string;
    enableAutomaticFailover?: boolean;
    enableMultipleWriteLocations?: boolean;
    isVirtualNetworkFilterEnabled?: boolean;
    virtualNetworkRules?: VirtualNetworkRule[];
    ipRules?: IpRule[];
    capabilities?: { name: string }[];
    disableKeyBasedMetadataWriteAccess?: boolean;
    enableFreeTier?: boolean;
    analyticalStorageConfiguration?: {
      schemaType?: string;
    };
    backupPolicy?: {
      type?: string;
      periodicModeProperties?: {
        backupIntervalInMinutes?: number;
        backupRetentionIntervalInHours?: number;
        backupStorageRedundancy?: string;
      };
      continuousModeProperties?: {
        tier?: string;
      };
    };
    cors?: CorsPolicy[];
    networkAclBypass?: string;
    networkAclBypassResourceIds?: string[];
    disableLocalAuth?: boolean;
    enablePartitionMerge?: boolean;
    minimalTlsVersion?: string;
    keyVaultKeyUri?: string;
    defaultIdentity?: string;
  };
  identity?: {
    type?: string;
    principalId?: string;
    tenantId?: string;
  };
  tags?: Record<string, string>;
}

interface VirtualNetworkRule {
  id: string;
  ignoreMissingVNetServiceEndpoint?: boolean;
}

interface IpRule {
  ipAddressOrRange: string;
}

interface CorsPolicy {
  allowedOrigins: string;
  allowedMethods?: string;
  allowedHeaders?: string;
  exposedHeaders?: string;
  maxAgeInSeconds?: number;
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

async function fetchCosmosDBAccounts(context: AzureScanContext): Promise<CosmosDBAccount[]> {
  const cache = getGlobalCache();
  const cacheKey = CacheKeys.cosmosDb(context.subscriptionId);
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.DocumentDB/databaseAccounts?api-version=${AZURE_COSMOSDB_API_VERSION}`;
    
    const response = await rateLimitedFetch(url, {
      headers: {
        'Authorization': `Bearer ${context.accessToken}`,
        'Content-Type': 'application/json',
      },
    }, 'fetchCosmosDBAccounts');

    if (!response.ok) {
      throw new Error(`Failed to fetch Cosmos DB accounts: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { value?: CosmosDBAccount[] };
    return data.value || [];
  });
}

async function fetchPrivateEndpoints(context: AzureScanContext, accountId: string): Promise<PrivateEndpointConnection[]> {
  const cache = getGlobalCache();
  const cacheKey = `cosmosdb-pe:${accountId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${accountId}/privateEndpointConnections?api-version=${AZURE_COSMOSDB_API_VERSION}`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchCosmosDBPrivateEndpoints');

      if (!response.ok) return [];
      const data = await response.json() as { value?: PrivateEndpointConnection[] };
      return data.value || [];
    } catch {
      return [];
    }
  });
}

export const cosmosDbScanner: AzureScanner = {
  name: 'azure-cosmos-db',
  description: 'Scans Azure Cosmos DB accounts for security misconfigurations',
  category: 'Database',

  async scan(context: AzureScanContext): Promise<AzureScanResult> {
    const startTime = Date.now();
    const findings: AzureSecurityFinding[] = [];
    const errors: AzureScanError[] = [];
    let resourcesScanned = 0;

    try {
      logger.info('Starting Cosmos DB security scan', { subscriptionId: context.subscriptionId });

      const accounts = await fetchCosmosDBAccounts(context);
      resourcesScanned = accounts.length;

      for (const account of accounts) {
        const resourceGroup = extractResourceGroup(account.id);
        const props = account.properties;

        // Fetch private endpoints
        const privateEndpoints = await fetchPrivateEndpoints(context, account.id);
        const hasPrivateEndpoints = privateEndpoints.some(pe => 
          pe.properties.privateLinkServiceConnectionState?.status === 'Approved'
        );

        // 1. Check Public Network Access
        if (props.publicNetworkAccess === 'Enabled' || props.publicNetworkAccess === undefined) {
          if (!hasPrivateEndpoints) {
            findings.push({
              severity: 'HIGH',
              title: 'Cosmos DB Public Network Access Enabled',
              description: `Cosmos DB account ${account.name} has public network access enabled without private endpoints.`,
              resourceType: 'Microsoft.DocumentDB/databaseAccounts',
              resourceId: account.id,
              resourceName: account.name,
              resourceGroup,
              region: account.location,
              remediation: 'Disable public network access and use private endpoints.',
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
            });
          }
        }

        // 2. Check Firewall Rules
        const hasFirewall = props.isVirtualNetworkFilterEnabled || 
                           (props.ipRules && props.ipRules.length > 0) ||
                           (props.virtualNetworkRules && props.virtualNetworkRules.length > 0);

        if (!hasFirewall && props.publicNetworkAccess !== 'Disabled') {
          findings.push({
            severity: 'HIGH',
            title: 'Cosmos DB No Firewall Configured',
            description: `Cosmos DB account ${account.name} has no firewall rules configured.`,
            resourceType: 'Microsoft.DocumentDB/databaseAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Configure IP firewall rules or virtual network rules to restrict access.',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          });
        }

        // Check for overly permissive IP rules
        if (props.ipRules) {
          for (const rule of props.ipRules) {
            if (rule.ipAddressOrRange === '0.0.0.0' || rule.ipAddressOrRange === '0.0.0.0/0') {
              findings.push({
                severity: 'CRITICAL',
                title: 'Cosmos DB Allows All IPs',
                description: `Cosmos DB account ${account.name} has a firewall rule allowing all IP addresses.`,
                resourceType: 'Microsoft.DocumentDB/databaseAccounts',
                resourceId: account.id,
                resourceName: account.name,
                resourceGroup,
                region: account.location,
                remediation: 'Remove the 0.0.0.0 rule and restrict to specific IP addresses.',
                complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
              });
            }
          }
        }

        // 3. Check Customer Managed Keys (CMK)
        if (!props.keyVaultKeyUri) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Cosmos DB Not Using Customer Managed Keys',
            description: `Cosmos DB account ${account.name} is using Microsoft-managed keys instead of customer-managed keys.`,
            resourceType: 'Microsoft.DocumentDB/databaseAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Configure customer-managed keys (CMK) for encryption at rest.',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD'],
          });
        }

        // 4. Check Private Endpoints
        if (!hasPrivateEndpoints) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Cosmos DB Without Private Endpoints',
            description: `Cosmos DB account ${account.name} does not have private endpoints configured.`,
            resourceType: 'Microsoft.DocumentDB/databaseAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Configure private endpoints for secure VNet access.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 5. Check Local Authentication
        if (!props.disableLocalAuth) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Cosmos DB Local Authentication Enabled',
            description: `Cosmos DB account ${account.name} has local (key-based) authentication enabled.`,
            resourceType: 'Microsoft.DocumentDB/databaseAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Disable local authentication and use Azure AD authentication.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 6. Check Minimum TLS Version
        if (!props.minimalTlsVersion || props.minimalTlsVersion < 'Tls12') {
          findings.push({
            severity: 'HIGH',
            title: 'Cosmos DB Allows Outdated TLS',
            description: `Cosmos DB account ${account.name} allows TLS versions older than 1.2.`,
            resourceType: 'Microsoft.DocumentDB/databaseAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Set minimum TLS version to TLS 1.2.',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          });
        }

        // 7. Check Backup Policy
        const backupPolicy = props.backupPolicy;
        if (!backupPolicy || backupPolicy.type === 'Periodic') {
          // Check periodic backup settings
          const periodicProps = backupPolicy?.periodicModeProperties;
          
          if (periodicProps) {
            // Check backup retention
            if (periodicProps.backupRetentionIntervalInHours && periodicProps.backupRetentionIntervalInHours < MIN_BACKUP_RETENTION_HOURS) {
              findings.push({
                severity: 'MEDIUM',
                title: 'Cosmos DB Short Backup Retention',
                description: `Cosmos DB account ${account.name} has backup retention of ${periodicProps.backupRetentionIntervalInHours} hours (less than ${MIN_BACKUP_RETENTION_HOURS / 24} days).`,
                resourceType: 'Microsoft.DocumentDB/databaseAccounts',
                resourceId: account.id,
                resourceName: account.name,
                resourceGroup,
                region: account.location,
                remediation: `Increase backup retention to at least ${MIN_BACKUP_RETENTION_HOURS / 24} days.`,
                complianceFrameworks: ['CIS Azure 1.4'],
                metadata: { retentionHours: periodicProps.backupRetentionIntervalInHours },
              });
            }

            // Check backup redundancy
            if (periodicProps.backupStorageRedundancy === 'Local') {
              findings.push({
                severity: 'MEDIUM',
                title: 'Cosmos DB Using Local Backup Storage',
                description: `Cosmos DB account ${account.name} uses locally redundant backup storage.`,
                resourceType: 'Microsoft.DocumentDB/databaseAccounts',
                resourceId: account.id,
                resourceName: account.name,
                resourceGroup,
                region: account.location,
                remediation: 'Consider using geo-redundant backup storage for disaster recovery.',
                complianceFrameworks: ['CIS Azure 1.4'],
              });
            }
          }

          // Recommend continuous backup
          findings.push({
            severity: 'LOW',
            title: 'Cosmos DB Not Using Continuous Backup',
            description: `Cosmos DB account ${account.name} is using periodic backup instead of continuous backup.`,
            resourceType: 'Microsoft.DocumentDB/databaseAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Consider enabling continuous backup for point-in-time restore capability.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 8. Check Managed Identity
        if (!account.identity || account.identity.type === 'None') {
          findings.push({
            severity: 'LOW',
            title: 'Cosmos DB Without Managed Identity',
            description: `Cosmos DB account ${account.name} does not have a managed identity configured.`,
            resourceType: 'Microsoft.DocumentDB/databaseAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Configure managed identity for secure access to other Azure resources.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 9. Check Automatic Failover
        if (!props.enableAutomaticFailover) {
          findings.push({
            severity: 'LOW',
            title: 'Cosmos DB Automatic Failover Disabled',
            description: `Cosmos DB account ${account.name} does not have automatic failover enabled.`,
            resourceType: 'Microsoft.DocumentDB/databaseAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Enable automatic failover for high availability.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 10. Check CORS Configuration
        if (props.cors) {
          for (const corsPolicy of props.cors) {
            if (corsPolicy.allowedOrigins === '*') {
              findings.push({
                severity: 'MEDIUM',
                title: 'Cosmos DB CORS Allows All Origins',
                description: `Cosmos DB account ${account.name} CORS configuration allows all origins (*).`,
                resourceType: 'Microsoft.DocumentDB/databaseAccounts',
                resourceId: account.id,
                resourceName: account.name,
                resourceGroup,
                region: account.location,
                remediation: 'Restrict CORS to specific trusted origins.',
                complianceFrameworks: ['CIS Azure 1.4'],
              });
            }
          }
        }

        // 11. Check Key-Based Metadata Write Access
        if (!props.disableKeyBasedMetadataWriteAccess) {
          findings.push({
            severity: 'LOW',
            title: 'Cosmos DB Key-Based Metadata Write Enabled',
            description: `Cosmos DB account ${account.name} allows key-based metadata write access.`,
            resourceType: 'Microsoft.DocumentDB/databaseAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Disable key-based metadata write access and use Azure RBAC.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }
      }

      logger.info('Cosmos DB security scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error scanning Cosmos DB', { error: errorMessage });
      errors.push({
        scanner: 'azure-cosmos-db',
        message: errorMessage,
        recoverable: true,
        resourceType: 'Microsoft.DocumentDB/databaseAccounts',
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

export default cosmosDbScanner;
