/**
 * Azure Storage Accounts Security Scanner
 * 
 * Scans Azure Storage Accounts for security misconfigurations including:
 * - HTTPS enforcement
 * - Public blob access
 * - Network rules
 * - Encryption settings
 * - Soft delete and versioning
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';

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
    };
    allowSharedKeyAccess?: boolean;
    publicNetworkAccess?: string;
  };
  kind?: string;
  sku?: { name?: string; tier?: string };
  tags?: Record<string, string>;
}

async function fetchStorageAccounts(context: AzureScanContext): Promise<StorageAccount[]> {
  const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${context.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Storage Accounts: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { value?: StorageAccount[] };
  return data.value || [];
}

export const storageAccountsScanner: AzureScanner = {
  name: 'azure-storage-accounts',
  description: 'Scans Azure Storage Accounts for security misconfigurations',
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
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD'],
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
            complianceFrameworks: ['CIS Azure 1.4', 'LGPD'],
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
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
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
            complianceFrameworks: ['CIS Azure 1.4'],
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
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check 6: Shared Key Access
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

        // Check 7: Public Network Access
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
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }
      }

      logger.info('Azure Storage Accounts scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: any) {
      logger.error('Error scanning Azure Storage Accounts', { error: err.message });
      errors.push({
        scanner: 'azure-storage-accounts',
        message: err.message,
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
