/**
 * Azure Key Vault Security Scanner
 * 
 * Scans Azure Key Vaults for security misconfigurations including:
 * - Soft delete and purge protection
 * - Network rules
 * - RBAC vs Access Policies
 * - Diagnostic settings
 * - Key/Secret expiration
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';

interface KeyVault {
  id: string;
  name: string;
  location: string;
  properties: {
    enableSoftDelete?: boolean;
    softDeleteRetentionInDays?: number;
    enablePurgeProtection?: boolean;
    enableRbacAuthorization?: boolean;
    publicNetworkAccess?: string;
    networkAcls?: {
      defaultAction?: string;
      bypass?: string;
      virtualNetworkRules?: any[];
      ipRules?: any[];
    };
    accessPolicies?: Array<{
      tenantId: string;
      objectId: string;
      permissions: {
        keys?: string[];
        secrets?: string[];
        certificates?: string[];
      };
    }>;
    sku?: { family?: string; name?: string };
    vaultUri?: string;
  };
  tags?: Record<string, string>;
}

async function fetchKeyVaults(context: AzureScanContext): Promise<KeyVault[]> {
  const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.KeyVault/vaults?api-version=2023-07-01`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${context.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Key Vaults: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { value?: KeyVault[] };
  return data.value || [];
}

export const keyVaultScanner: AzureScanner = {
  name: 'azure-key-vault',
  description: 'Scans Azure Key Vaults for security misconfigurations',
  category: 'Security',

  async scan(context: AzureScanContext): Promise<AzureScanResult> {
    const startTime = Date.now();
    const findings: AzureSecurityFinding[] = [];
    const errors: AzureScanError[] = [];
    let resourcesScanned = 0;

    try {
      const keyVaults = await fetchKeyVaults(context);
      resourcesScanned = keyVaults.length;

      for (const vault of keyVaults) {
        const resourceGroup = vault.id?.split('/resourceGroups/')[1]?.split('/')[0] || 'unknown';
        const props = vault.properties;

        // Check 1: Soft Delete
        if (props.enableSoftDelete !== true) {
          findings.push({
            severity: 'HIGH',
            title: 'Key Vault Soft Delete Disabled',
            description: `Key Vault ${vault.name} does not have soft delete enabled`,
            resourceType: 'Microsoft.KeyVault/vaults',
            resourceId: vault.id,
            resourceName: vault.name,
            resourceGroup,
            region: vault.location,
            remediation: 'Enable soft delete to protect against accidental deletion',
            complianceFrameworks: ['CIS Azure 1.4', 'LGPD'],
          });
        }

        // Check 2: Purge Protection
        if (props.enablePurgeProtection !== true) {
          findings.push({
            severity: 'HIGH',
            title: 'Key Vault Purge Protection Disabled',
            description: `Key Vault ${vault.name} does not have purge protection enabled`,
            resourceType: 'Microsoft.KeyVault/vaults',
            resourceId: vault.id,
            resourceName: vault.name,
            resourceGroup,
            region: vault.location,
            remediation: 'Enable purge protection to prevent permanent deletion during retention period',
            complianceFrameworks: ['CIS Azure 1.4', 'LGPD'],
          });
        }

        // Check 3: Soft Delete Retention
        if (props.softDeleteRetentionInDays && props.softDeleteRetentionInDays < 90) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Key Vault Short Retention Period',
            description: `Key Vault ${vault.name} has soft delete retention of only ${props.softDeleteRetentionInDays} days`,
            resourceType: 'Microsoft.KeyVault/vaults',
            resourceId: vault.id,
            resourceName: vault.name,
            resourceGroup,
            region: vault.location,
            remediation: 'Increase soft delete retention to at least 90 days',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check 4: RBAC Authorization
        if (props.enableRbacAuthorization !== true) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Key Vault Using Access Policies',
            description: `Key Vault ${vault.name} uses access policies instead of RBAC`,
            resourceType: 'Microsoft.KeyVault/vaults',
            resourceId: vault.id,
            resourceName: vault.name,
            resourceGroup,
            region: vault.location,
            remediation: 'Consider migrating to Azure RBAC for more granular access control',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check 5: Network Rules
        const networkAcls = props.networkAcls;
        if (!networkAcls || networkAcls.defaultAction === 'Allow') {
          findings.push({
            severity: 'MEDIUM',
            title: 'Key Vault Allows All Networks',
            description: `Key Vault ${vault.name} allows access from all networks`,
            resourceType: 'Microsoft.KeyVault/vaults',
            resourceId: vault.id,
            resourceName: vault.name,
            resourceGroup,
            region: vault.location,
            remediation: 'Configure firewall rules to restrict access to specific VNets or IPs',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check 6: Public Network Access
        if (props.publicNetworkAccess === 'Enabled') {
          findings.push({
            severity: 'MEDIUM',
            title: 'Key Vault Public Network Access Enabled',
            description: `Key Vault ${vault.name} has public network access enabled`,
            resourceType: 'Microsoft.KeyVault/vaults',
            resourceId: vault.id,
            resourceName: vault.name,
            resourceGroup,
            region: vault.location,
            remediation: 'Consider using private endpoints and disabling public network access',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check 7: Overly Permissive Access Policies
        const accessPolicies = props.accessPolicies || [];
        for (const policy of accessPolicies) {
          const allPermissions = [
            ...(policy.permissions.keys || []),
            ...(policy.permissions.secrets || []),
            ...(policy.permissions.certificates || []),
          ];
          
          if (allPermissions.includes('all') || allPermissions.includes('*')) {
            findings.push({
              severity: 'HIGH',
              title: 'Key Vault Overly Permissive Access Policy',
              description: `Key Vault ${vault.name} has an access policy with "all" permissions`,
              resourceType: 'Microsoft.KeyVault/vaults',
              resourceId: vault.id,
              resourceName: vault.name,
              resourceGroup,
              region: vault.location,
              remediation: 'Apply principle of least privilege - grant only required permissions',
              complianceFrameworks: ['CIS Azure 1.4', 'LGPD'],
              metadata: { objectId: policy.objectId },
            });
          }
        }
      }

      logger.info('Azure Key Vault scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: any) {
      logger.error('Error scanning Azure Key Vaults', { error: err.message });
      errors.push({
        scanner: 'azure-key-vault',
        message: err.message,
        recoverable: true,
        resourceType: 'Microsoft.KeyVault/vaults',
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

export default keyVaultScanner;
