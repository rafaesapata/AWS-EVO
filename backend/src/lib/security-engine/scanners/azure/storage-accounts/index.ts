/**
 * Azure Storage Accounts Security Scanner
 * 
 * Scans Azure Storage Accounts for security misconfigurations including:
 * - HTTPS enforcement
 * - Public blob access
 * - Network rules
 * - Encryption settings (CMK)
 * - Soft delete and versioning
 * - Immutable storage for compliance
 * - Lifecycle management policies
 * - Private endpoints
 * 
 * Features:
 * - Resource caching to avoid duplicate API calls
 * - Rate limiting to prevent Azure API throttling
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';
import { getGlobalCache, CacheKeys } from '../utils/cache.js';
import { rateLimitedFetch } from '../utils/rate-limiter.js';

/** Azure Storage API version */
const STORAGE_API_VERSION = '2023-01-01';

/** Minimum recommended soft delete retention in days */
const MIN_SOFT_DELETE_RETENTION_DAYS = 7;

/** Build authorization headers for Azure API calls */
function buildAuthHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

interface StorageAccount {
  id: string;
  name: string;
  location: string;
  properties: {
    supportsHttpsTrafficOnly?: boolean;
    allowBlobPublicAccess?: boolean;
    minimumTlsVersion?: string;
    networkAcls?: {
      defaultAction?: string;
      bypass?: string;
      virtualNetworkRules?: any[];
      ipRules?: any[];
    };
    encryption?: {
      services?: {
        blob?: { enabled?: boolean; keyType?: string };
        file?: { enabled?: boolean; keyType?: string };
        table?: { enabled?: boolean; keyType?: string };
        queue?: { enabled?: boolean; keyType?: string };
      };
      keySource?: string;
      requireInfrastructureEncryption?: boolean;
      keyVaultProperties?: {
        keyName?: string;
        keyVersion?: string;
        keyVaultUri?: string;
      };
    };
    allowSharedKeyAccess?: boolean;
    publicNetworkAccess?: string;
    privateEndpointConnections?: PrivateEndpointConnection[];
    allowCrossTenantReplication?: boolean;
    defaultToOAuthAuthentication?: boolean;
  };
  kind?: string;
  sku?: { name?: string; tier?: string };
  tags?: Record<string, string>;
}

interface PrivateEndpointConnection {
  id: string;
  properties: {
    privateEndpoint?: { id: string };
    privateLinkServiceConnectionState?: {
      status?: string;
    };
  };
}

interface BlobServiceProperties {
  properties: {
    deleteRetentionPolicy?: {
      enabled?: boolean;
      days?: number;
    };
    containerDeleteRetentionPolicy?: {
      enabled?: boolean;
      days?: number;
    };
    isVersioningEnabled?: boolean;
    changeFeed?: {
      enabled?: boolean;
    };
    lastAccessTimeTrackingPolicy?: {
      enable?: boolean;
    };
  };
}

interface BlobContainer {
  id: string;
  name: string;
  properties: {
    publicAccess?: string;
    hasImmutabilityPolicy?: boolean;
    hasLegalHold?: boolean;
    immutableStorageWithVersioning?: {
      enabled?: boolean;
    };
  };
}

interface ManagementPolicy {
  id: string;
  properties: {
    policy?: {
      rules?: Array<{
        name: string;
        enabled: boolean;
        type: string;
        definition: {
          actions?: {
            baseBlob?: any;
            snapshot?: any;
            version?: any;
          };
          filters?: any;
        };
      }>;
    };
  };
}

async function fetchStorageAccounts(context: AzureScanContext): Promise<StorageAccount[]> {
  const cache = getGlobalCache();
  const cacheKey = CacheKeys.storageAccounts(context.subscriptionId);
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.Storage/storageAccounts?api-version=${STORAGE_API_VERSION}`;
    
    const response = await rateLimitedFetch(url, {
      headers: buildAuthHeaders(context.accessToken),
    }, 'fetchStorageAccounts');

    if (!response.ok) {
      throw new Error(`Failed to fetch Storage Accounts: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { value?: StorageAccount[] };
    return data.value || [];
  });
}

async function fetchBlobServiceProperties(context: AzureScanContext, accountId: string): Promise<BlobServiceProperties | null> {
  const cache = getGlobalCache();
  const cacheKey = `blobservice:${accountId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${accountId}/blobServices/default?api-version=${STORAGE_API_VERSION}`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: buildAuthHeaders(context.accessToken),
      }, 'fetchBlobServiceProperties');

      if (!response.ok) return null;
      return await response.json() as BlobServiceProperties;
    } catch {
      return null;
    }
  });
}

async function fetchBlobContainers(context: AzureScanContext, accountId: string): Promise<BlobContainer[]> {
  const cache = getGlobalCache();
  const cacheKey = `containers:${accountId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${accountId}/blobServices/default/containers?api-version=${STORAGE_API_VERSION}`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: buildAuthHeaders(context.accessToken),
      }, 'fetchBlobContainers');

      if (!response.ok) return [];
      const data = await response.json() as { value?: BlobContainer[] };
      return data.value || [];
    } catch {
      return [];
    }
  });
}

async function fetchManagementPolicy(context: AzureScanContext, accountId: string): Promise<ManagementPolicy | null> {
  const cache = getGlobalCache();
  const cacheKey = `mgmtpolicy:${accountId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${accountId}/managementPolicies/default?api-version=${STORAGE_API_VERSION}`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: buildAuthHeaders(context.accessToken),
      }, 'fetchManagementPolicy');

      if (!response.ok) return null;
      return await response.json() as ManagementPolicy;
    } catch {
      return null;
    }
  });
}

export const storageAccountsScanner: AzureScanner = {
  name: 'azure-storage-accounts',
  description: 'Scans Azure Storage Accounts for security misconfigurations including encryption, soft delete, versioning, CMK, and lifecycle management',
  category: 'Storage',

  async scan(context: AzureScanContext): Promise<AzureScanResult> {
    const startTime = Date.now();
    const findings: AzureSecurityFinding[] = [];
    const errors: AzureScanError[] = [];
    let resourcesScanned = 0;

    try {
      const storageAccounts = await fetchStorageAccounts(context);
      resourcesScanned = storageAccounts.length;

      for (const account of storageAccounts) {
        const resourceGroup = account.id?.split('/resourceGroups/')[1]?.split('/')[0] || 'unknown';
        const props = account.properties;

        // Check 1: HTTPS Only
        if (props.supportsHttpsTrafficOnly !== true) {
          findings.push({
            severity: 'HIGH',
            title: 'Storage Account Allows HTTP Traffic',
            description: `Storage account ${account.name} allows insecure HTTP traffic`,
            resourceType: 'Microsoft.Storage/storageAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Enable "Secure transfer required" to enforce HTTPS',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD', 'NIST 800-53'],
          });
        }

        // Check 2: Public Blob Access
        if (props.allowBlobPublicAccess === true) {
          findings.push({
            severity: 'HIGH',
            title: 'Public Blob Access Enabled',
            description: `Storage account ${account.name} allows public blob access`,
            resourceType: 'Microsoft.Storage/storageAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Disable "Allow Blob public access" unless explicitly required',
            complianceFrameworks: ['CIS Azure 1.4', 'LGPD', 'PCI-DSS'],
          });
        }

        // Check 3: Minimum TLS Version
        if (!props.minimumTlsVersion || props.minimumTlsVersion < 'TLS1_2') {
          findings.push({
            severity: 'MEDIUM',
            title: 'Outdated TLS Version Allowed',
            description: `Storage account ${account.name} allows TLS versions older than 1.2`,
            resourceType: 'Microsoft.Storage/storageAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Set minimum TLS version to TLS 1.2',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
          });
        }

        // Check 4: Network Rules - Default Allow
        const networkAcls = props.networkAcls;
        if (!networkAcls || networkAcls.defaultAction === 'Allow') {
          findings.push({
            severity: 'MEDIUM',
            title: 'Storage Account Allows All Networks',
            description: `Storage account ${account.name} allows access from all networks`,
            resourceType: 'Microsoft.Storage/storageAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Configure network rules to restrict access to specific VNets or IPs',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          });
        }

        // Check 5: Infrastructure Encryption
        if (!props.encryption?.requireInfrastructureEncryption) {
          findings.push({
            severity: 'LOW',
            title: 'Infrastructure Encryption Not Enabled',
            description: `Storage account ${account.name} does not have infrastructure encryption enabled`,
            resourceType: 'Microsoft.Storage/storageAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Enable infrastructure encryption for double encryption at rest',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          });
        }

        // Check 6: Customer Managed Keys (CMK)
        if (props.encryption?.keySource !== 'Microsoft.Keyvault') {
          findings.push({
            severity: 'MEDIUM',
            title: 'Storage Account Not Using Customer Managed Keys',
            description: `Storage account ${account.name} uses Microsoft-managed keys instead of customer-managed keys`,
            resourceType: 'Microsoft.Storage/storageAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Configure customer-managed keys (CMK) from Azure Key Vault for enhanced control over encryption',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD', 'NIST 800-53'],
          });
        }

        // Check 7: Shared Key Access
        if (props.allowSharedKeyAccess !== false) {
          findings.push({
            severity: 'LOW',
            title: 'Shared Key Access Enabled',
            description: `Storage account ${account.name} allows shared key access`,
            resourceType: 'Microsoft.Storage/storageAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Disable shared key access and use Azure AD authentication',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check 8: Public Network Access
        if (props.publicNetworkAccess === 'Enabled') {
          findings.push({
            severity: 'MEDIUM',
            title: 'Public Network Access Enabled',
            description: `Storage account ${account.name} has public network access enabled`,
            resourceType: 'Microsoft.Storage/storageAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Consider using private endpoints and disabling public network access',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          });
        }

        // Check 9: Private Endpoints
        const privateEndpoints = props.privateEndpointConnections || [];
        const approvedEndpoints = privateEndpoints.filter(
          pe => pe.properties?.privateLinkServiceConnectionState?.status === 'Approved'
        );
        
        if (approvedEndpoints.length === 0 && props.publicNetworkAccess !== 'Disabled') {
          findings.push({
            severity: 'MEDIUM',
            title: 'Storage Account No Private Endpoints',
            description: `Storage account ${account.name} does not have private endpoints configured`,
            resourceType: 'Microsoft.Storage/storageAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Configure private endpoints for secure access from VNets',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
          });
        }

        // Check 10: Cross-Tenant Replication
        if (props.allowCrossTenantReplication === true) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Cross-Tenant Replication Enabled',
            description: `Storage account ${account.name} allows cross-tenant replication`,
            resourceType: 'Microsoft.Storage/storageAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Disable cross-tenant replication unless explicitly required for business needs',
            complianceFrameworks: ['CIS Azure 1.4', 'LGPD'],
          });
        }

        // Check 11: Default OAuth Authentication
        if (props.defaultToOAuthAuthentication !== true) {
          findings.push({
            severity: 'LOW',
            title: 'OAuth Not Default Authentication',
            description: `Storage account ${account.name} does not default to OAuth authentication in Azure Portal`,
            resourceType: 'Microsoft.Storage/storageAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Enable "Default to Azure AD authorization in the Azure portal" for better security',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Fetch Blob Service Properties for soft delete and versioning
        const blobServiceProps = await fetchBlobServiceProperties(context, account.id);
        if (blobServiceProps) {
          // Check 12: Blob Soft Delete
          if (!blobServiceProps.properties?.deleteRetentionPolicy?.enabled) {
            findings.push({
              severity: 'HIGH',
              title: 'Blob Soft Delete Not Enabled',
              description: `Storage account ${account.name} does not have blob soft delete enabled`,
              resourceType: 'Microsoft.Storage/storageAccounts',
              resourceId: account.id,
              resourceName: account.name,
              resourceGroup,
              region: account.location,
              remediation: `Enable blob soft delete with at least ${MIN_SOFT_DELETE_RETENTION_DAYS} days retention to protect against accidental deletion`,
              complianceFrameworks: ['CIS Azure 1.4', 'LGPD', 'NIST 800-53'],
            });
          } else if ((blobServiceProps.properties.deleteRetentionPolicy.days || 0) < MIN_SOFT_DELETE_RETENTION_DAYS) {
            findings.push({
              severity: 'MEDIUM',
              title: 'Blob Soft Delete Retention Too Short',
              description: `Storage account ${account.name} has blob soft delete retention of only ${blobServiceProps.properties.deleteRetentionPolicy.days} days`,
              resourceType: 'Microsoft.Storage/storageAccounts',
              resourceId: account.id,
              resourceName: account.name,
              resourceGroup,
              region: account.location,
              remediation: `Increase blob soft delete retention to at least ${MIN_SOFT_DELETE_RETENTION_DAYS} days`,
              complianceFrameworks: ['CIS Azure 1.4'],
            });
          }

          // Check 13: Container Soft Delete
          if (!blobServiceProps.properties?.containerDeleteRetentionPolicy?.enabled) {
            findings.push({
              severity: 'HIGH',
              title: 'Container Soft Delete Not Enabled',
              description: `Storage account ${account.name} does not have container soft delete enabled`,
              resourceType: 'Microsoft.Storage/storageAccounts',
              resourceId: account.id,
              resourceName: account.name,
              resourceGroup,
              region: account.location,
              remediation: `Enable container soft delete with at least ${MIN_SOFT_DELETE_RETENTION_DAYS} days retention`,
              complianceFrameworks: ['CIS Azure 1.4', 'LGPD'],
            });
          }

          // Check 14: Blob Versioning
          if (!blobServiceProps.properties?.isVersioningEnabled) {
            findings.push({
              severity: 'MEDIUM',
              title: 'Blob Versioning Not Enabled',
              description: `Storage account ${account.name} does not have blob versioning enabled`,
              resourceType: 'Microsoft.Storage/storageAccounts',
              resourceId: account.id,
              resourceName: account.name,
              resourceGroup,
              region: account.location,
              remediation: 'Enable blob versioning to maintain previous versions of blobs for recovery and compliance',
              complianceFrameworks: ['CIS Azure 1.4', 'LGPD', 'PCI-DSS'],
            });
          }

          // Check 15: Change Feed
          if (!blobServiceProps.properties?.changeFeed?.enabled) {
            findings.push({
              severity: 'LOW',
              title: 'Change Feed Not Enabled',
              description: `Storage account ${account.name} does not have change feed enabled`,
              resourceType: 'Microsoft.Storage/storageAccounts',
              resourceId: account.id,
              resourceName: account.name,
              resourceGroup,
              region: account.location,
              remediation: 'Enable change feed for audit logging and tracking blob changes',
              complianceFrameworks: ['CIS Azure 1.4'],
            });
          }
        }

        // Fetch containers to check for public access and immutability
        const containers = await fetchBlobContainers(context, account.id);
        for (const container of containers) {
          // Check 16: Container Public Access
          if (container.properties?.publicAccess && container.properties.publicAccess !== 'None') {
            findings.push({
              severity: 'CRITICAL',
              title: 'Container Has Public Access',
              description: `Container ${container.name} in storage account ${account.name} has public access level: ${container.properties.publicAccess}`,
              resourceType: 'Microsoft.Storage/storageAccounts/blobServices/containers',
              resourceId: container.id,
              resourceName: container.name,
              resourceGroup,
              region: account.location,
              remediation: 'Set container public access level to "Private" unless public access is explicitly required',
              complianceFrameworks: ['CIS Azure 1.4', 'LGPD', 'PCI-DSS', 'NIST 800-53'],
              metadata: { 
                storageAccount: account.name,
                publicAccessLevel: container.properties.publicAccess,
              },
            });
          }
        }

        // Check 17: Lifecycle Management Policy
        const managementPolicy = await fetchManagementPolicy(context, account.id);
        if (!managementPolicy || !managementPolicy.properties?.policy?.rules?.length) {
          findings.push({
            severity: 'LOW',
            title: 'No Lifecycle Management Policy',
            description: `Storage account ${account.name} does not have a lifecycle management policy configured`,
            resourceType: 'Microsoft.Storage/storageAccounts',
            resourceId: account.id,
            resourceName: account.name,
            resourceGroup,
            region: account.location,
            remediation: 'Configure lifecycle management policies to automatically tier or delete old data for cost optimization and compliance',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }
      }

      logger.info('Azure Storage Accounts scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Error scanning Azure Storage Accounts', { error: errorMessage });
      errors.push({
        scanner: 'azure-storage-accounts',
        message: errorMessage,
        recoverable: true,
        resourceType: 'Microsoft.Storage/storageAccounts',
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

export default storageAccountsScanner;
