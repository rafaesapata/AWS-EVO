/**
 * Azure Key Vault Security Scanner
 * 
 * Scans Azure Key Vaults for security misconfigurations including:
 * - Soft delete and purge protection
 * - Network rules
 * - RBAC vs Access Policies
 * - Diagnostic settings
 * - Key/Secret expiration
 * - Private Endpoints
 * - HSM-backed keys
 * - Secret rotation (>90 days without rotation)
 * 
 * Features:
 * - Resource caching to avoid duplicate API calls
 * - Rate limiting to prevent Azure API throttling
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';
import { CacheKeys } from '../utils/cache.js';
import { fetchAzurePagedList } from '../utils/paginated-fetch.js';
import { extractResourceGroup } from '../utils/azure-helpers.js';

// Configuration constants
const AZURE_KEYVAULT_API_VERSION = '2023-07-01';
const AZURE_INSIGHTS_API_VERSION = '2021-05-01-preview';
const KEYVAULT_DATA_PLANE_API_VERSION = '7.4';
const MIN_SOFT_DELETE_RETENTION_DAYS = 90;
const SECRET_ROTATION_THRESHOLD_DAYS = 90;
const EXPIRATION_WARNING_DAYS = 30;

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
    privateEndpointConnections?: PrivateEndpointConnection[];
  };
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

interface KeyVaultKey {
  kid: string;
  attributes: {
    enabled?: boolean;
    created?: number;
    updated?: number;
    exp?: number;
    nbf?: number;
  };
  kty?: string;
  key_ops?: string[];
  managed?: boolean;
}

interface KeyVaultSecret {
  id: string;
  attributes: {
    enabled?: boolean;
    created?: number;
    updated?: number;
    exp?: number;
    nbf?: number;
  };
  contentType?: string;
  managed?: boolean;
}

interface KeyVaultCertificate {
  id: string;
  attributes: {
    enabled?: boolean;
    created?: number;
    updated?: number;
    exp?: number;
    nbf?: number;
  };
}

interface DiagnosticSettings {
  id: string;
  name: string;
  properties: {
    logs?: Array<{
      category?: string;
      categoryGroup?: string;
      enabled?: boolean;
    }>;
    metrics?: Array<{
      category?: string;
      enabled?: boolean;
    }>;
    workspaceId?: string;
    storageAccountId?: string;
    eventHubAuthorizationRuleId?: string;
  };
}

type FindingBase = Pick<AzureSecurityFinding, 'resourceType' | 'resourceId' | 'resourceName' | 'resourceGroup' | 'region'>;

function createFinding(
  base: FindingBase,
  fields: Pick<AzureSecurityFinding, 'severity' | 'title' | 'description' | 'remediation' | 'complianceFrameworks' | 'metadata'>
): AzureSecurityFinding {
  return { ...base, ...fields };
}

interface ExpirationCheckParams {
  base: FindingBase;
  itemName: string;
  vaultName: string;
  expTimestamp: number | undefined;
  updatedTimestamp?: number | undefined;
  nowSeconds: number;
  expirationWarningTime: number;
  itemType: 'Secret' | 'Key' | 'Certificate';
}

function checkExpiration(params: ExpirationCheckParams): AzureSecurityFinding[] {
  const { base, itemName, vaultName, expTimestamp, updatedTimestamp, nowSeconds, expirationWarningTime, itemType } = params;
  const results: AzureSecurityFinding[] = [];

  // Check rotation (secrets only)
  if (itemType === 'Secret' && updatedTimestamp) {
    const rotationThresholdTime = nowSeconds - (SECRET_ROTATION_THRESHOLD_DAYS * 24 * 60 * 60);
    if (updatedTimestamp < rotationThresholdTime) {
      results.push(createFinding(base, {
        severity: 'MEDIUM',
        title: `Secret Not Rotated in ${SECRET_ROTATION_THRESHOLD_DAYS}+ Days`,
        description: `Secret ${itemName} in Key Vault ${vaultName} has not been rotated in over ${SECRET_ROTATION_THRESHOLD_DAYS} days`,
        remediation: 'Implement secret rotation policy. Consider using Azure Key Vault secret rotation feature',
        complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
        metadata: { lastUpdated: new Date(updatedTimestamp * 1000).toISOString(), vaultName },
      }));
    }
  }

  if (!expTimestamp) return results;

  // Expiring soon
  if (expTimestamp < expirationWarningTime && expTimestamp > nowSeconds) {
    results.push(createFinding(base, {
      severity: 'HIGH',
      title: `${itemType} Expiring Soon`,
      description: `${itemType} ${itemName} in Key Vault ${vaultName} will expire within ${EXPIRATION_WARNING_DAYS} days`,
      remediation: itemType === 'Certificate'
        ? 'Renew the certificate before expiration. Consider enabling auto-renewal'
        : `Rotate the ${itemType.toLowerCase()} before expiration to prevent service disruption`,
      complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
      metadata: { expirationDate: new Date(expTimestamp * 1000).toISOString(), vaultName },
    }));
  }

  // Already expired
  if (expTimestamp < nowSeconds) {
    results.push(createFinding(base, {
      severity: 'CRITICAL',
      title: `${itemType} Expired`,
      description: `${itemType} ${itemName} in Key Vault ${vaultName} has expired`,
      remediation: `Immediately ${itemType === 'Certificate' ? 'renew' : 'rotate'} the expired ${itemType.toLowerCase()} and update dependent applications`,
      complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
      metadata: { expirationDate: new Date(expTimestamp * 1000).toISOString(), vaultName },
    }));
  }

  return results;
}

async function fetchKeyVaults(context: AzureScanContext): Promise<KeyVault[]> {
  const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.KeyVault/vaults?api-version=${AZURE_KEYVAULT_API_VERSION}`;
  return fetchAzurePagedList<KeyVault>(context, url, { cacheKey: CacheKeys.keyVaults(context.subscriptionId), operationName: 'fetchKeyVaults', throwOnError: true });
}

async function fetchDiagnosticSettings(context: AzureScanContext, resourceId: string): Promise<DiagnosticSettings[]> {
  const url = `https://management.azure.com${resourceId}/providers/Microsoft.Insights/diagnosticSettings?api-version=${AZURE_INSIGHTS_API_VERSION}`;
  return fetchAzurePagedList<DiagnosticSettings>(context, url, { cacheKey: `diagnostics:${resourceId}`, operationName: 'fetchDiagnosticSettings' });
}

async function fetchKeyVaultKeys(context: AzureScanContext, vaultUri: string): Promise<KeyVaultKey[]> {
  const url = `${vaultUri}keys?api-version=${KEYVAULT_DATA_PLANE_API_VERSION}`;
  return fetchAzurePagedList<KeyVaultKey>(context, url, { cacheKey: `keys:${vaultUri}`, operationName: 'fetchKeyVaultKeys' });
}

async function fetchKeyVaultSecrets(context: AzureScanContext, vaultUri: string): Promise<KeyVaultSecret[]> {
  const url = `${vaultUri}secrets?api-version=${KEYVAULT_DATA_PLANE_API_VERSION}`;
  return fetchAzurePagedList<KeyVaultSecret>(context, url, { cacheKey: `secrets:${vaultUri}`, operationName: 'fetchKeyVaultSecrets' });
}

async function fetchKeyVaultCertificates(context: AzureScanContext, vaultUri: string): Promise<KeyVaultCertificate[]> {
  const url = `${vaultUri}certificates?api-version=${KEYVAULT_DATA_PLANE_API_VERSION}`;
  return fetchAzurePagedList<KeyVaultCertificate>(context, url, { cacheKey: `certs:${vaultUri}`, operationName: 'fetchKeyVaultCertificates' });
}

export const keyVaultScanner: AzureScanner = {
  name: 'azure-key-vault',
  description: 'Scans Azure Key Vaults for security misconfigurations including soft delete, purge protection, private endpoints, diagnostic settings, and secret rotation',
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
        const resourceGroup = extractResourceGroup(vault.id);
        const props = vault.properties;
        const vaultBase: FindingBase = {
          resourceType: 'Microsoft.KeyVault/vaults',
          resourceId: vault.id,
          resourceName: vault.name,
          resourceGroup,
          region: vault.location,
        };

        // Check 1: Soft Delete
        if (props.enableSoftDelete !== true) {
          findings.push(createFinding(vaultBase, {
            severity: 'HIGH',
            title: 'Key Vault Soft Delete Disabled',
            description: `Key Vault ${vault.name} does not have soft delete enabled`,
            remediation: 'Enable soft delete to protect against accidental deletion',
            complianceFrameworks: ['CIS Azure 1.4', 'LGPD', 'NIST 800-53'],
          }));
        }

        // Check 2: Purge Protection
        if (props.enablePurgeProtection !== true) {
          findings.push(createFinding(vaultBase, {
            severity: 'HIGH',
            title: 'Key Vault Purge Protection Disabled',
            description: `Key Vault ${vault.name} does not have purge protection enabled`,
            remediation: 'Enable purge protection to prevent permanent deletion during retention period',
            complianceFrameworks: ['CIS Azure 1.4', 'LGPD', 'NIST 800-53'],
          }));
        }

        // Check 3: Soft Delete Retention
        if (props.softDeleteRetentionInDays && props.softDeleteRetentionInDays < MIN_SOFT_DELETE_RETENTION_DAYS) {
          findings.push(createFinding(vaultBase, {
            severity: 'CRITICAL',
            title: 'Key Vault Short Retention Period',
            description: `Key Vault ${vault.name} has soft delete retention of only ${props.softDeleteRetentionInDays} days. Loss of encryption keys (CMK) can mean permanent data loss.`,
            remediation: `Increase soft delete retention to at least ${MIN_SOFT_DELETE_RETENTION_DAYS} days`,
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
          }));
        }

        // Check 4: RBAC Authorization
        if (props.enableRbacAuthorization !== true) {
          findings.push(createFinding(vaultBase, {
            severity: 'MEDIUM',
            title: 'Key Vault Using Access Policies',
            description: `Key Vault ${vault.name} uses access policies instead of RBAC`,
            remediation: 'Consider migrating to Azure RBAC for more granular access control',
            complianceFrameworks: ['CIS Azure 1.4'],
          }));
        }

        // Check 5: Network Rules
        const networkAcls = props.networkAcls;
        if (!networkAcls || networkAcls.defaultAction === 'Allow') {
          findings.push(createFinding(vaultBase, {
            severity: 'MEDIUM',
            title: 'Key Vault Allows All Networks',
            description: `Key Vault ${vault.name} allows access from all networks`,
            remediation: 'Configure firewall rules to restrict access to specific VNets or IPs',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          }));
        }

        // Check 6: Public Network Access
        if (props.publicNetworkAccess === 'Enabled') {
          findings.push(createFinding(vaultBase, {
            severity: 'MEDIUM',
            title: 'Key Vault Public Network Access Enabled',
            description: `Key Vault ${vault.name} has public network access enabled`,
            remediation: 'Consider using private endpoints and disabling public network access',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          }));
        }

        // Check 7: Private Endpoints
        const privateEndpoints = props.privateEndpointConnections || [];
        const approvedEndpoints = privateEndpoints.filter(
          pe => pe.properties?.privateLinkServiceConnectionState?.status === 'Approved'
        );
        
        if (approvedEndpoints.length === 0 && props.publicNetworkAccess !== 'Disabled') {
          findings.push(createFinding(vaultBase, {
            severity: 'MEDIUM',
            title: 'Key Vault No Private Endpoints',
            description: `Key Vault ${vault.name} does not have private endpoints configured`,
            remediation: 'Configure private endpoints for secure access from VNets without exposing to public internet',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
          }));
        }

        // Check 8: Overly Permissive Access Policies
        const accessPolicies = props.accessPolicies || [];
        for (const policy of accessPolicies) {
          const allPermissions = [
            ...(policy.permissions.keys || []),
            ...(policy.permissions.secrets || []),
            ...(policy.permissions.certificates || []),
          ];
          
          if (allPermissions.includes('all') || allPermissions.includes('*')) {
            findings.push(createFinding(vaultBase, {
              severity: 'HIGH',
              title: 'Key Vault Overly Permissive Access Policy',
              description: `Key Vault ${vault.name} has an access policy with "all" permissions`,
              remediation: 'Apply principle of least privilege - grant only required permissions',
              complianceFrameworks: ['CIS Azure 1.4', 'LGPD', 'PCI-DSS'],
              metadata: { objectId: policy.objectId },
            }));
          }
        }

        // Check 9: HSM-backed keys for Premium SKU
        if (props.sku?.name === 'premium') {
          findings.push(createFinding(vaultBase, {
            severity: 'INFO',
            title: 'Key Vault Premium SKU - Verify HSM Usage',
            description: `Key Vault ${vault.name} is Premium SKU. Ensure HSM-backed keys are used for critical cryptographic operations`,
            remediation: 'Use HSM-backed keys (kty: RSA-HSM, EC-HSM) for critical data encryption',
            complianceFrameworks: ['PCI-DSS', 'NIST 800-53'],
          }));
        }

        // Check 10: Diagnostic Settings
        const diagnosticSettings = await fetchDiagnosticSettings(context, vault.id);
        if (diagnosticSettings.length === 0) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Key Vault Diagnostic Settings Not Configured',
            description: `Key Vault ${vault.name} does not have diagnostic settings enabled`,
            resourceType: 'Microsoft.KeyVault/vaults',
            resourceId: vault.id,
            resourceName: vault.name,
            resourceGroup,
            region: vault.location,
            remediation: 'Enable diagnostic settings to send audit logs to Log Analytics, Storage Account, or Event Hub',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD'],
          });
        } else {
          // Check if audit logs are enabled
          const hasAuditLogs = diagnosticSettings.some(ds => 
            ds.properties?.logs?.some(log => 
              (log.category === 'AuditEvent' || log.categoryGroup === 'audit') && log.enabled
            )
          );
          
          if (!hasAuditLogs) {
            findings.push({
              severity: 'MEDIUM',
              title: 'Key Vault Audit Logs Not Enabled',
              description: `Key Vault ${vault.name} does not have audit logs enabled in diagnostic settings`,
              resourceType: 'Microsoft.KeyVault/vaults',
              resourceId: vault.id,
              resourceName: vault.name,
              resourceGroup,
              region: vault.location,
              remediation: 'Enable AuditEvent category in diagnostic settings for compliance and security monitoring',
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD'],
            });
          }
        }

        // Check 11: Secrets/Keys/Certificates expiration and rotation
        // Note: This requires data plane access which may not be available with management token
        if (props.vaultUri) {
          try {
            const nowSeconds = Date.now() / 1000;
            const expirationWarningTime = nowSeconds + (EXPIRATION_WARNING_DAYS * 24 * 60 * 60);

            // Secrets
            const secrets = await fetchKeyVaultSecrets(context, props.vaultUri);
            for (const secret of secrets) {
              if (secret.managed) continue;
              const secretName = secret.id?.split('/secrets/')[1]?.split('/')[0] || 'unknown';
              const base: FindingBase = {
                resourceType: 'Microsoft.KeyVault/vaults/secrets',
                resourceId: secret.id,
                resourceName: secretName,
                resourceGroup,
                region: vault.location,
              };
              findings.push(...checkExpiration({
                base, itemName: secretName, vaultName: vault.name,
                expTimestamp: secret.attributes?.exp, updatedTimestamp: secret.attributes?.updated,
                nowSeconds, expirationWarningTime, itemType: 'Secret',
              }));
            }

            // Keys
            const keys = await fetchKeyVaultKeys(context, props.vaultUri);
            for (const key of keys) {
              if (key.managed) continue;
              const keyName = key.kid?.split('/keys/')[1]?.split('/')[0] || 'unknown';
              const base: FindingBase = {
                resourceType: 'Microsoft.KeyVault/vaults/keys',
                resourceId: key.kid,
                resourceName: keyName,
                resourceGroup,
                region: vault.location,
              };
              findings.push(...checkExpiration({
                base, itemName: keyName, vaultName: vault.name,
                expTimestamp: key.attributes?.exp,
                nowSeconds, expirationWarningTime, itemType: 'Key',
              }));

              // Non-HSM keys in Premium vault
              if (props.sku?.name === 'premium' && key.kty && !key.kty.endsWith('-HSM')) {
                findings.push(createFinding(base, {
                  severity: 'LOW',
                  title: 'Non-HSM Key in Premium Vault',
                  description: `Key ${keyName} in Premium Key Vault ${vault.name} is not HSM-backed`,
                  remediation: 'Consider using HSM-backed keys (RSA-HSM, EC-HSM) for enhanced security in Premium vaults',
                  complianceFrameworks: ['PCI-DSS', 'NIST 800-53'],
                  metadata: { keyType: key.kty, vaultName: vault.name },
                }));
              }
            }

            // Certificates
            const certificates = await fetchKeyVaultCertificates(context, props.vaultUri);
            for (const cert of certificates) {
              const certName = cert.id?.split('/certificates/')[1]?.split('/')[0] || 'unknown';
              const base: FindingBase = {
                resourceType: 'Microsoft.KeyVault/vaults/certificates',
                resourceId: cert.id,
                resourceName: certName,
                resourceGroup,
                region: vault.location,
              };
              findings.push(...checkExpiration({
                base, itemName: certName, vaultName: vault.name,
                expTimestamp: cert.attributes?.exp,
                nowSeconds, expirationWarningTime, itemType: 'Certificate',
              }));
            }
          } catch (dataPlaneErr: unknown) {
            const errorMessage = dataPlaneErr instanceof Error ? dataPlaneErr.message : 'Unknown error';
            logger.debug('Could not access Key Vault data plane', {
              vault: vault.name,
              error: errorMessage,
            });
          }
        }
      }

      logger.info('Azure Key Vault scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error scanning Azure Key Vaults', { error: errorMessage });
      errors.push({
        scanner: 'azure-key-vault',
        message: errorMessage,
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
