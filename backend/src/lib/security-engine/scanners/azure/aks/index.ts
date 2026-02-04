/**
 * Azure Kubernetes Service (AKS) Security Scanner
 * 
 * Scans AKS clusters for security misconfigurations including:
 * - Network policies
 * - Pod security standards
 * - Secrets encryption
 * - Azure Policy for AKS
 * - Azure AD integration (RBAC)
 * - Private cluster configuration
 * - Managed identity
 * - Defender for Containers
 * 
 * Features:
 * - Resource caching to avoid duplicate API calls
 * - Rate limiting to prevent Azure API throttling
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';
import { getGlobalCache, CacheKeys } from '../utils/cache.js';
import { rateLimitedFetch } from '../utils/rate-limiter.js';

// Configuration constants
const AKS_API_VERSION = '2024-01-01';
const MIN_KUBERNETES_MAJOR_VERSION = 1;
const MIN_KUBERNETES_MINOR_VERSION = 27;
const MIN_AVAILABILITY_ZONES = 2;

// Helper to extract resource group from Azure resource ID
function extractResourceGroup(resourceId: string): string {
  return resourceId?.split('/resourceGroups/')[1]?.split('/')[0] || 'unknown';
}

// Common finding metadata builder
function buildClusterFindingBase(cluster: AKSCluster, resourceGroup: string) {
  return {
    resourceType: 'Microsoft.ContainerService/managedClusters' as const,
    resourceId: cluster.id,
    resourceName: cluster.name,
    resourceGroup,
    region: cluster.location,
  };
}

interface AKSCluster {
  id: string;
  name: string;
  location: string;
  properties: {
    kubernetesVersion?: string;
    provisioningState?: string;
    enableRBAC?: boolean;
    networkProfile?: {
      networkPlugin?: string;
      networkPolicy?: string;
      podCidr?: string;
      serviceCidr?: string;
      dnsServiceIP?: string;
      outboundType?: string;
    };
    aadProfile?: {
      managed?: boolean;
      enableAzureRBAC?: boolean;
      adminGroupObjectIDs?: string[];
      tenantID?: string;
    };
    apiServerAccessProfile?: {
      enablePrivateCluster?: boolean;
      privateDNSZone?: string;
      enablePrivateClusterPublicFQDN?: boolean;
      authorizedIPRanges?: string[];
    };
    addonProfiles?: {
      azurepolicy?: { enabled?: boolean; config?: any };
      omsagent?: { enabled?: boolean; config?: any };
      azureKeyvaultSecretsProvider?: { enabled?: boolean; config?: any };
    };
    securityProfile?: {
      defender?: {
        logAnalyticsWorkspaceResourceId?: string;
        securityMonitoring?: { enabled?: boolean };
      };
      workloadIdentity?: { enabled?: boolean };
      imageCleaner?: { enabled?: boolean; intervalHours?: number };
    };
    identityProfile?: {
      kubeletidentity?: {
        resourceId?: string;
        clientId?: string;
        objectId?: string;
      };
    };
    autoUpgradeProfile?: {
      upgradeChannel?: string;
      nodeOSUpgradeChannel?: string;
    };
    disableLocalAccounts?: boolean;
    storageProfile?: {
      diskCSIDriver?: { enabled?: boolean };
      fileCSIDriver?: { enabled?: boolean };
      snapshotController?: { enabled?: boolean };
    };
    oidcIssuerProfile?: {
      enabled?: boolean;
      issuerURL?: string;
    };
    agentPoolProfiles?: AgentPoolProfile[];
  };
  identity?: {
    type?: string;
    principalId?: string;
    tenantId?: string;
  };
  sku?: {
    name?: string;
    tier?: string;
  };
  tags?: Record<string, string>;
}

interface AgentPoolProfile {
  name: string;
  count?: number;
  vmSize?: string;
  osType?: string;
  osSKU?: string;
  mode?: string;
  enableAutoScaling?: boolean;
  minCount?: number;
  maxCount?: number;
  enableNodePublicIP?: boolean;
  enableFIPS?: boolean;
  enableEncryptionAtHost?: boolean;
  osDiskType?: string;
  osDiskSizeGB?: number;
  kubeletDiskType?: string;
  maxPods?: number;
  availabilityZones?: string[];
  upgradeSettings?: {
    maxSurge?: string;
  };
}

async function fetchAKSClusters(context: AzureScanContext): Promise<AKSCluster[]> {
  const cache = getGlobalCache();
  const cacheKey = CacheKeys.aksCluster(context.subscriptionId);
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.ContainerService/managedClusters?api-version=${AKS_API_VERSION}`;
    
    const response = await rateLimitedFetch(url, {
      headers: {
        'Authorization': `Bearer ${context.accessToken}`,
        'Content-Type': 'application/json',
      },
    }, 'fetchAKSClusters');

    if (!response.ok) {
      throw new Error(`Failed to fetch AKS clusters: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { value?: AKSCluster[] };
    return data.value || [];
  });
}

/**
 * Check if Kubernetes version is outdated
 * @param version - Kubernetes version string (e.g., "1.27.3")
 * @returns true if version is older than minimum supported
 */
function isKubernetesVersionOutdated(version: string): boolean {
  if (!version) return true;
  const parts = version.split('.');
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  
  if (isNaN(major) || isNaN(minor)) return true;
  
  return major < MIN_KUBERNETES_MAJOR_VERSION || 
         (major === MIN_KUBERNETES_MAJOR_VERSION && minor < MIN_KUBERNETES_MINOR_VERSION);
}

export const aksScanner: AzureScanner = {
  name: 'azure-aks',
  description: 'Scans Azure Kubernetes Service clusters for security misconfigurations',
  category: 'Compute',

  async scan(context: AzureScanContext): Promise<AzureScanResult> {
    const startTime = Date.now();
    const findings: AzureSecurityFinding[] = [];
    const errors: AzureScanError[] = [];
    let resourcesScanned = 0;

    try {
      logger.info('Starting AKS security scan', { subscriptionId: context.subscriptionId });

      const clusters = await fetchAKSClusters(context);
      resourcesScanned = clusters.length;

      for (const cluster of clusters) {
        const resourceGroup = extractResourceGroup(cluster.id);
        const props = cluster.properties;
        const baseFinding = buildClusterFindingBase(cluster, resourceGroup);

        // 1. Check Kubernetes Version
        if (isKubernetesVersionOutdated(props.kubernetesVersion || '')) {
          findings.push({
            severity: 'HIGH',
            title: 'Outdated Kubernetes Version',
            description: `AKS cluster ${cluster.name} is running Kubernetes ${props.kubernetesVersion}. Update to a supported version.`,
            ...baseFinding,
            remediation: `Upgrade to a supported Kubernetes version (${MIN_KUBERNETES_MAJOR_VERSION}.${MIN_KUBERNETES_MINOR_VERSION}+).`,
            complianceFrameworks: ['CIS Azure 1.4', 'CIS Kubernetes'],
            metadata: { currentVersion: props.kubernetesVersion },
          });
        }

        // 2. Check RBAC
        if (!props.enableRBAC) {
          findings.push({
            severity: 'CRITICAL',
            title: 'AKS RBAC Disabled',
            description: `AKS cluster ${cluster.name} does not have Kubernetes RBAC enabled.`,
            ...baseFinding,
            remediation: 'Enable RBAC for the AKS cluster. This requires cluster recreation.',
            complianceFrameworks: ['CIS Azure 1.4', 'CIS Kubernetes', 'PCI-DSS'],
          });
        }

        // 3. Check Azure AD Integration
        if (!props.aadProfile?.managed) {
          findings.push({
            severity: 'HIGH',
            title: 'AKS Azure AD Integration Not Enabled',
            description: `AKS cluster ${cluster.name} does not have Azure AD integration enabled.`,
            ...baseFinding,
            remediation: 'Enable Azure AD integration for centralized identity management.',
            complianceFrameworks: ['CIS Azure 1.4', 'CIS Kubernetes'],
          });
        } else {
          // Check Azure RBAC for Kubernetes
          if (!props.aadProfile.enableAzureRBAC) {
            findings.push({
              severity: 'MEDIUM',
              title: 'Azure RBAC for Kubernetes Not Enabled',
              description: `AKS cluster ${cluster.name} has Azure AD but not Azure RBAC for Kubernetes authorization.`,
              ...baseFinding,
              remediation: 'Enable Azure RBAC for Kubernetes for unified access control.',
              complianceFrameworks: ['CIS Azure 1.4'],
            });
          }
        }

        // 4. Check Local Accounts
        if (!props.disableLocalAccounts) {
          findings.push({
            severity: 'MEDIUM',
            title: 'AKS Local Accounts Enabled',
            description: `AKS cluster ${cluster.name} has local accounts enabled. This bypasses Azure AD authentication.`,
            ...baseFinding,
            remediation: 'Disable local accounts to enforce Azure AD authentication.',
            complianceFrameworks: ['CIS Azure 1.4', 'CIS Kubernetes'],
          });
        }

        // 5. Check Network Policy
        if (!props.networkProfile?.networkPolicy) {
          findings.push({
            severity: 'HIGH',
            title: 'AKS Network Policy Not Configured',
            description: `AKS cluster ${cluster.name} does not have a network policy configured (Calico or Azure).`,
            ...baseFinding,
            remediation: 'Enable network policy (Azure or Calico) for pod-to-pod traffic control.',
            complianceFrameworks: ['CIS Azure 1.4', 'CIS Kubernetes', 'PCI-DSS'],
          });
        }

        // 6. Check Private Cluster
        if (!props.apiServerAccessProfile?.enablePrivateCluster) {
          // Check if authorized IP ranges are configured
          const hasAuthorizedIPs = (props.apiServerAccessProfile?.authorizedIPRanges?.length || 0) > 0;
          
          if (!hasAuthorizedIPs) {
            findings.push({
              severity: 'HIGH',
              title: 'AKS API Server Publicly Accessible',
              description: `AKS cluster ${cluster.name} API server is publicly accessible without IP restrictions.`,
              ...baseFinding,
              remediation: 'Enable private cluster or configure authorized IP ranges for API server access.',
              complianceFrameworks: ['CIS Azure 1.4', 'CIS Kubernetes', 'PCI-DSS'],
            });
          } else {
            findings.push({
              severity: 'MEDIUM',
              title: 'AKS Not Using Private Cluster',
              description: `AKS cluster ${cluster.name} is not a private cluster (using authorized IP ranges instead).`,
              ...baseFinding,
              remediation: 'Consider enabling private cluster for enhanced security.',
              complianceFrameworks: ['CIS Azure 1.4'],
              metadata: { authorizedIPRanges: props.apiServerAccessProfile?.authorizedIPRanges },
            });
          }
        }

        // 7. Check Azure Policy Addon
        if (!props.addonProfiles?.azurepolicy?.enabled) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Azure Policy for AKS Not Enabled',
            description: `AKS cluster ${cluster.name} does not have Azure Policy addon enabled.`,
            ...baseFinding,
            remediation: 'Enable Azure Policy addon for Kubernetes governance.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 8. Check Defender for Containers
        if (!props.securityProfile?.defender?.securityMonitoring?.enabled) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Defender for Containers Not Enabled',
            description: `AKS cluster ${cluster.name} does not have Microsoft Defender for Containers enabled.`,
            ...baseFinding,
            remediation: 'Enable Microsoft Defender for Containers for runtime threat protection.',
            complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
          });
        }

        // 9. Check Key Vault Secrets Provider
        if (!props.addonProfiles?.azureKeyvaultSecretsProvider?.enabled) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Key Vault Secrets Provider Not Enabled',
            description: `AKS cluster ${cluster.name} does not have Azure Key Vault Secrets Provider enabled.`,
            ...baseFinding,
            remediation: 'Enable Key Vault Secrets Provider for secure secrets management.',
            complianceFrameworks: ['CIS Azure 1.4', 'CIS Kubernetes'],
          });
        }

        // 10. Check Managed Identity
        if (cluster.identity?.type !== 'SystemAssigned' && cluster.identity?.type !== 'UserAssigned') {
          findings.push({
            severity: 'HIGH',
            title: 'AKS Not Using Managed Identity',
            description: `AKS cluster ${cluster.name} is not using managed identity.`,
            ...baseFinding,
            remediation: 'Configure managed identity for the AKS cluster.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 11. Check Workload Identity
        if (!props.securityProfile?.workloadIdentity?.enabled) {
          findings.push({
            severity: 'LOW',
            title: 'Workload Identity Not Enabled',
            description: `AKS cluster ${cluster.name} does not have Workload Identity enabled.`,
            ...baseFinding,
            remediation: 'Enable Workload Identity for pod-level Azure AD authentication.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 12. Check OIDC Issuer
        if (!props.oidcIssuerProfile?.enabled) {
          findings.push({
            severity: 'LOW',
            title: 'OIDC Issuer Not Enabled',
            description: `AKS cluster ${cluster.name} does not have OIDC issuer enabled.`,
            ...baseFinding,
            remediation: 'Enable OIDC issuer for workload identity federation.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 13. Check Auto-Upgrade
        if (!props.autoUpgradeProfile?.upgradeChannel || props.autoUpgradeProfile.upgradeChannel === 'none') {
          findings.push({
            severity: 'MEDIUM',
            title: 'AKS Auto-Upgrade Not Configured',
            description: `AKS cluster ${cluster.name} does not have automatic upgrades configured.`,
            ...baseFinding,
            remediation: 'Configure automatic upgrade channel (patch, stable, or rapid).',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 14. Check Container Insights (OMS Agent)
        if (!props.addonProfiles?.omsagent?.enabled) {
          findings.push({
            severity: 'LOW',
            title: 'Container Insights Not Enabled',
            description: `AKS cluster ${cluster.name} does not have Container Insights (monitoring) enabled.`,
            ...baseFinding,
            remediation: 'Enable Container Insights for monitoring and logging.',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // 15. Check Agent Pool Security
        for (const pool of props.agentPoolProfiles || []) {
          const poolFinding = {
            resourceType: 'Microsoft.ContainerService/managedClusters/agentPools' as const,
            resourceId: `${cluster.id}/agentPools/${pool.name}`,
            resourceName: pool.name,
            resourceGroup,
            region: cluster.location,
          };

          // Check encryption at host
          if (!pool.enableEncryptionAtHost) {
            findings.push({
              severity: 'MEDIUM',
              title: 'Node Pool Encryption at Host Disabled',
              description: `AKS cluster ${cluster.name} node pool "${pool.name}" does not have encryption at host enabled.`,
              ...poolFinding,
              remediation: 'Enable encryption at host for node pools.',
              complianceFrameworks: ['CIS Azure 1.4'],
            });
          }

          // Check public IP on nodes
          if (pool.enableNodePublicIP) {
            findings.push({
              severity: 'HIGH',
              title: 'Node Pool Has Public IPs',
              description: `AKS cluster ${cluster.name} node pool "${pool.name}" has public IPs enabled on nodes.`,
              ...poolFinding,
              remediation: 'Disable public IPs on node pools for security.',
              complianceFrameworks: ['CIS Azure 1.4', 'CIS Kubernetes'],
            });
          }

          // Check availability zones
          if (!pool.availabilityZones || pool.availabilityZones.length < MIN_AVAILABILITY_ZONES) {
            findings.push({
              severity: 'LOW',
              title: 'Node Pool Not Zone Redundant',
              description: `AKS cluster ${cluster.name} node pool "${pool.name}" is not deployed across multiple availability zones.`,
              ...poolFinding,
              remediation: 'Deploy node pools across multiple availability zones for high availability.',
              complianceFrameworks: ['CIS Azure 1.4'],
            });
          }
        }

        // 16. Check SKU Tier
        if (cluster.sku?.tier !== 'Standard' && cluster.sku?.tier !== 'Premium') {
          findings.push({
            severity: 'LOW',
            title: 'AKS Using Free Tier',
            description: `AKS cluster ${cluster.name} is using the Free tier without SLA.`,
            ...baseFinding,
            remediation: 'Consider upgrading to Standard or Premium tier for production workloads.',
            complianceFrameworks: ['CIS Azure 1.4'],
            metadata: { currentTier: cluster.sku?.tier },
          });
        }
      }

      logger.info('AKS security scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Error scanning AKS clusters', { error: errorMessage });
      errors.push({
        scanner: 'azure-aks',
        message: errorMessage,
        recoverable: true,
        resourceType: 'Microsoft.ContainerService/managedClusters',
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

export default aksScanner;
