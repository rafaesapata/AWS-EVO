/**
 * Azure Virtual Machines Security Scanner
 * 
 * Scans Azure VMs for security misconfigurations including:
 * - Disk encryption status (ADE)
 * - Managed disks usage
 * - Auto-updates configuration
 * - Network security (public IPs)
 * - Extensions and agents
 * - Azure Defender for Servers
 * - Antimalware detection
 * - Managed Identity validation
 * - Suspicious extensions check
 * 
 * Features:
 * - Resource caching to avoid duplicate API calls
 * - Rate limiting to prevent Azure API throttling
 * - Detailed remediation scripts (Azure CLI, PowerShell)
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';
import { getGlobalCache, CacheKeys } from '../utils/cache.js';
import { rateLimitedFetch } from '../utils/rate-limiter.js';

interface AzureVM {
  id: string;
  name: string;
  location: string;
  identity?: {
    type?: string;
    principalId?: string;
    tenantId?: string;
  };
  properties: {
    storageProfile?: {
      osDisk?: {
        encryptionSettings?: { enabled?: boolean };
        managedDisk?: { id?: string };
        osType?: string;
      };
      dataDisks?: Array<{
        encryptionSettings?: { enabled?: boolean };
        managedDisk?: { id?: string };
        name?: string;
      }>;
    };
    osProfile?: {
      computerName?: string;
      windowsConfiguration?: {
        enableAutomaticUpdates?: boolean;
        patchSettings?: { 
          patchMode?: string;
          assessmentMode?: string;
          enableHotpatching?: boolean;
        };
      };
      linuxConfiguration?: {
        patchSettings?: { 
          patchMode?: string;
          assessmentMode?: string;
        };
      };
    };
    networkProfile?: {
      networkInterfaces?: Array<{ id: string; properties?: { primary?: boolean } }>;
    };
    securityProfile?: {
      encryptionAtHost?: boolean;
      securityType?: string;
      uefiSettings?: {
        secureBootEnabled?: boolean;
        vTpmEnabled?: boolean;
      };
    };
    diagnosticsProfile?: {
      bootDiagnostics?: { enabled?: boolean };
    };
    hardwareProfile?: {
      vmSize?: string;
    };
    provisioningState?: string;
  };
  tags?: Record<string, string>;
}

interface VMExtension {
  id: string;
  name: string;
  properties: {
    publisher?: string;
    type?: string;
    typeHandlerVersion?: string;
    autoUpgradeMinorVersion?: boolean;
    provisioningState?: string;
    settings?: any;
  };
}

interface NetworkInterface {
  id: string;
  name: string;
  properties: {
    ipConfigurations?: Array<{
      id: string;
      properties: {
        publicIPAddress?: { id: string };
        privateIPAddress?: string;
        subnet?: { id: string };
      };
    }>;
    networkSecurityGroup?: { id: string };
  };
}

interface PublicIPAddress {
  id: string;
  name: string;
  properties: {
    ipAddress?: string;
    publicIPAllocationMethod?: string;
    dnsSettings?: {
      domainNameLabel?: string;
      fqdn?: string;
    };
  };
}

// Known suspicious or risky VM extensions
const SUSPICIOUS_EXTENSIONS = [
  'CustomScript', // Can execute arbitrary code
  'CustomScriptExtension',
  'RunCommandLinux',
  'RunCommandWindows',
];

// Known antimalware extensions
const ANTIMALWARE_EXTENSIONS = [
  'IaaSAntimalware',
  'MicrosoftMonitoringAgent',
  'AzureSecurityLinuxAgent',
  'AzureSecurityWindowsAgent',
  'MDE.Linux',
  'MDE.Windows',
];

async function fetchVMs(context: AzureScanContext): Promise<AzureVM[]> {
  const cache = getGlobalCache();
  const cacheKey = CacheKeys.vms(context.subscriptionId);
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.Compute/virtualMachines?api-version=2023-09-01`;
    
    const response = await rateLimitedFetch(url, {
      headers: {
        'Authorization': `Bearer ${context.accessToken}`,
        'Content-Type': 'application/json',
      },
    }, 'fetchVMs');

    if (!response.ok) {
      throw new Error(`Failed to fetch VMs: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { value?: AzureVM[] };
    return data.value || [];
  });
}

async function fetchVMExtensions(context: AzureScanContext, vmId: string): Promise<VMExtension[]> {
  const cache = getGlobalCache();
  const cacheKey = CacheKeys.vmExtensions(vmId);
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${vmId}/extensions?api-version=2023-09-01`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchVMExtensions');

      if (!response.ok) return [];
      const data = await response.json() as { value?: VMExtension[] };
      return data.value || [];
    } catch {
      return [];
    }
  });
}

async function fetchNetworkInterface(context: AzureScanContext, nicId: string): Promise<NetworkInterface | null> {
  const cache = getGlobalCache();
  const cacheKey = `nic:${nicId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${nicId}?api-version=2023-09-01`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchNetworkInterface');

      if (!response.ok) return null;
      return await response.json() as NetworkInterface;
    } catch {
      return null;
    }
  });
}

async function fetchPublicIP(context: AzureScanContext, publicIpId: string): Promise<PublicIPAddress | null> {
  const cache = getGlobalCache();
  const cacheKey = `publicip:${publicIpId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${publicIpId}?api-version=2023-09-01`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchPublicIP');

      if (!response.ok) return null;
      return await response.json() as PublicIPAddress;
    } catch {
      return null;
    }
  });
}

/** VM context for security checks */
interface VMContext {
  vm: AzureVM;
  resourceGroup: string;
  osType: string;
  region: string;
}

/** Creates a finding with common VM fields pre-filled */
function createVMFinding(
  vmCtx: VMContext,
  params: Pick<AzureSecurityFinding, 'severity' | 'title' | 'description' | 'remediation' | 'complianceFrameworks'> & 
    Partial<Pick<AzureSecurityFinding, 'resourceType' | 'resourceId' | 'resourceName' | 'metadata'>>
): AzureSecurityFinding {
  return {
    resourceType: 'Microsoft.Compute/virtualMachines',
    resourceId: vmCtx.vm.id,
    resourceName: vmCtx.vm.name,
    resourceGroup: vmCtx.resourceGroup,
    region: vmCtx.region,
    ...params,
  };
}

/** Check disk encryption status */
function checkDiskEncryption(vmCtx: VMContext): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];
  const { vm } = vmCtx;
  const encryptionAtHost = vm.properties?.securityProfile?.encryptionAtHost;
  
  // OS Disk
  const osDisk = vm.properties?.storageProfile?.osDisk;
  if (!osDisk?.encryptionSettings?.enabled && !encryptionAtHost) {
    findings.push(createVMFinding(vmCtx, {
      severity: 'HIGH',
      title: 'VM OS Disk Not Encrypted',
      description: `Virtual machine ${vm.name} has an unencrypted OS disk. Disk encryption protects data at rest.`,
      remediation: 'Enable Azure Disk Encryption (ADE) or encryption at host for the VM',
      complianceFrameworks: ['CIS Azure 1.4', 'LGPD', 'PCI-DSS', 'NIST 800-53'],
    }));
  }

  // Data Disks
  const dataDisks = vm.properties?.storageProfile?.dataDisks || [];
  for (const disk of dataDisks) {
    if (!disk.encryptionSettings?.enabled && !encryptionAtHost) {
      findings.push(createVMFinding(vmCtx, {
        severity: 'HIGH',
        title: 'VM Data Disk Not Encrypted',
        description: `Virtual machine ${vm.name} has unencrypted data disk: ${disk.name || 'unnamed'}`,
        remediation: 'Enable Azure Disk Encryption for all data disks',
        complianceFrameworks: ['CIS Azure 1.4', 'LGPD', 'PCI-DSS'],
        metadata: { diskName: disk.name },
      }));
      break; // Only report once per VM
    }
  }

  // Managed Disks
  if (!osDisk?.managedDisk?.id) {
    findings.push(createVMFinding(vmCtx, {
      severity: 'MEDIUM',
      title: 'VM Using Unmanaged Disks',
      description: `Virtual machine ${vm.name} is using unmanaged disks instead of managed disks`,
      remediation: 'Migrate to managed disks for better reliability, security, and management',
      complianceFrameworks: ['CIS Azure 1.4'],
    }));
  }

  return findings;
}

/** Check identity and access configuration */
function checkIdentityConfig(vmCtx: VMContext): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];
  const { vm } = vmCtx;

  if (!vm.identity?.type || vm.identity.type === 'None') {
    findings.push(createVMFinding(vmCtx, {
      severity: 'MEDIUM',
      title: 'VM No Managed Identity',
      description: `Virtual machine ${vm.name} does not have a managed identity configured`,
      remediation: 'Configure a system-assigned or user-assigned managed identity for secure access to Azure resources without storing credentials',
      complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
    }));
  }

  return findings;
}

/** Check OS update configuration */
function checkUpdateConfig(vmCtx: VMContext): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];
  const { vm } = vmCtx;
  const windowsConfig = vm.properties?.osProfile?.windowsConfiguration;
  const linuxConfig = vm.properties?.osProfile?.linuxConfiguration;

  // Windows Auto-Updates
  if (windowsConfig?.enableAutomaticUpdates === false) {
    findings.push(createVMFinding(vmCtx, {
      severity: 'MEDIUM',
      title: 'Windows Auto-Updates Disabled',
      description: `Virtual machine ${vm.name} has automatic Windows updates disabled`,
      remediation: 'Enable automatic updates or configure Azure Update Management',
      complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
    }));
  }

  // Patch Assessment Mode
  const patchSettings = windowsConfig?.patchSettings || linuxConfig?.patchSettings;
  if (patchSettings?.assessmentMode !== 'AutomaticByPlatform') {
    findings.push(createVMFinding(vmCtx, {
      severity: 'LOW',
      title: 'VM Patch Assessment Not Automatic',
      description: `Virtual machine ${vm.name} does not have automatic patch assessment enabled`,
      remediation: 'Enable automatic patch assessment for proactive vulnerability detection',
      complianceFrameworks: ['CIS Azure 1.4'],
    }));
  }

  return findings;
}

/** Check security profile (Trusted Launch, Secure Boot, vTPM) */
function checkSecurityProfile(vmCtx: VMContext): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];
  const { vm } = vmCtx;
  const securityProfile = vm.properties?.securityProfile;

  // Boot Diagnostics
  if (!vm.properties?.diagnosticsProfile?.bootDiagnostics?.enabled) {
    findings.push(createVMFinding(vmCtx, {
      severity: 'LOW',
      title: 'Boot Diagnostics Disabled',
      description: `Virtual machine ${vm.name} does not have boot diagnostics enabled`,
      remediation: 'Enable boot diagnostics for troubleshooting VM boot issues',
      complianceFrameworks: ['CIS Azure 1.4'],
    }));
  }

  // Trusted Launch
  const isTrustedLaunch = securityProfile?.securityType === 'TrustedLaunch';
  const isConfidentialVM = securityProfile?.securityType === 'ConfidentialVM';
  
  if (!isTrustedLaunch && !isConfidentialVM) {
    findings.push(createVMFinding(vmCtx, {
      severity: 'MEDIUM',
      title: 'Trusted Launch Not Enabled',
      description: `Virtual machine ${vm.name} is not using Trusted Launch or Confidential VM security type`,
      remediation: 'Consider recreating VM with Trusted Launch for enhanced security (Secure Boot, vTPM)',
      complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
    }));
  }

  // Secure Boot and vTPM for Trusted Launch VMs
  if (isTrustedLaunch) {
    if (!securityProfile?.uefiSettings?.secureBootEnabled) {
      findings.push(createVMFinding(vmCtx, {
        severity: 'MEDIUM',
        title: 'Secure Boot Not Enabled',
        description: `Trusted Launch VM ${vm.name} does not have Secure Boot enabled`,
        remediation: 'Enable Secure Boot to protect against boot-level malware',
        complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
      }));
    }

    if (!securityProfile?.uefiSettings?.vTpmEnabled) {
      findings.push(createVMFinding(vmCtx, {
        severity: 'MEDIUM',
        title: 'vTPM Not Enabled',
        description: `Trusted Launch VM ${vm.name} does not have vTPM enabled`,
        remediation: 'Enable vTPM for secure key storage and attestation',
        complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
      }));
    }
  }

  return findings;
}

/** Check VM extensions for antimalware and suspicious extensions */
function checkExtensions(vmCtx: VMContext, extensions: VMExtension[]): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];
  const { vm, osType } = vmCtx;

  // Check for antimalware
  const hasAntimalware = extensions.some(ext => 
    ANTIMALWARE_EXTENSIONS.some(am => 
      ext.properties?.type?.includes(am) || ext.properties?.publisher?.includes('Microsoft.Azure.Security')
    )
  );
  
  if (!hasAntimalware) {
    findings.push(createVMFinding(vmCtx, {
      severity: 'HIGH',
      title: 'VM No Antimalware Extension',
      description: `Virtual machine ${vm.name} does not have an antimalware or Microsoft Defender extension installed`,
      remediation: 'Install Microsoft Antimalware extension or Microsoft Defender for Endpoint',
      complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
      metadata: { osType },
    }));
  }

  // Check for suspicious extensions
  for (const ext of extensions) {
    const extType = ext.properties?.type || '';
    if (SUSPICIOUS_EXTENSIONS.some(s => extType.includes(s))) {
      findings.push(createVMFinding(vmCtx, {
        severity: 'MEDIUM',
        title: 'VM Has Potentially Risky Extension',
        description: `Virtual machine ${vm.name} has extension ${ext.name} (${extType}) which can execute arbitrary code`,
        resourceType: 'Microsoft.Compute/virtualMachines/extensions',
        resourceId: ext.id,
        resourceName: ext.name,
        remediation: 'Review if this extension is necessary. CustomScript and RunCommand extensions can be used for malicious purposes',
        complianceFrameworks: ['CIS Azure 1.4'],
        metadata: { 
          extensionType: extType,
          publisher: ext.properties?.publisher,
          vmName: vm.name,
        },
      }));
    }
  }

  return findings;
}

/** Check network configuration (NSG, Public IPs) */
async function checkNetworkConfig(
  context: AzureScanContext, 
  vmCtx: VMContext
): Promise<AzureSecurityFinding[]> {
  const findings: AzureSecurityFinding[] = [];
  const { vm } = vmCtx;
  const networkInterfaces = vm.properties?.networkProfile?.networkInterfaces || [];

  for (const nicRef of networkInterfaces) {
    const nic = await fetchNetworkInterface(context, nicRef.id);
    if (!nic) continue;

    // Check if NIC has NSG
    if (!nic.properties?.networkSecurityGroup?.id) {
      findings.push(createVMFinding(vmCtx, {
        severity: 'HIGH',
        title: 'VM Network Interface No NSG',
        description: `Network interface ${nic.name} for VM ${vm.name} does not have a Network Security Group attached`,
        resourceType: 'Microsoft.Network/networkInterfaces',
        resourceId: nic.id,
        resourceName: nic.name,
        remediation: 'Attach a Network Security Group to control inbound and outbound traffic',
        complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
        metadata: { vmName: vm.name },
      }));
    }

    // Check for public IPs
    for (const ipConfig of nic.properties?.ipConfigurations || []) {
      if (ipConfig.properties?.publicIPAddress?.id) {
        const publicIp = await fetchPublicIP(context, ipConfig.properties.publicIPAddress.id);
        if (publicIp?.properties?.ipAddress) {
          findings.push(createVMFinding(vmCtx, {
            severity: 'MEDIUM',
            title: 'VM Has Public IP Address',
            description: `Virtual machine ${vm.name} has a public IP address (${publicIp.properties.ipAddress}) directly attached`,
            remediation: 'Consider using Azure Bastion, VPN, or private endpoints instead of direct public IP access',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
            metadata: { 
              publicIp: publicIp.properties.ipAddress,
              nicName: nic.name,
            },
          }));
        }
      }
    }
  }

  return findings;
}

export const virtualMachinesScanner: AzureScanner = {
  name: 'azure-virtual-machines',
  description: 'Scans Azure Virtual Machines for security misconfigurations including disk encryption, managed identity, antimalware, public IPs, and suspicious extensions',
  category: 'Compute',

  async scan(context: AzureScanContext): Promise<AzureScanResult> {
    const startTime = Date.now();
    const findings: AzureSecurityFinding[] = [];
    const errors: AzureScanError[] = [];
    let resourcesScanned = 0;

    try {
      const vms = await fetchVMs(context);
      resourcesScanned = vms.length;

      for (const vm of vms) {
        const vmCtx: VMContext = {
          vm,
          resourceGroup: vm.id?.split('/resourceGroups/')[1]?.split('/')[0] || 'unknown',
          osType: vm.properties?.storageProfile?.osDisk?.osType || 'Unknown',
          region: vm.location,
        };

        // Run all security checks
        findings.push(...checkDiskEncryption(vmCtx));
        findings.push(...checkIdentityConfig(vmCtx));
        findings.push(...checkUpdateConfig(vmCtx));
        findings.push(...checkSecurityProfile(vmCtx));

        // Extension checks (requires API call)
        const extensions = await fetchVMExtensions(context, vm.id);
        findings.push(...checkExtensions(vmCtx, extensions));

        // Network checks (requires API calls)
        findings.push(...await checkNetworkConfig(context, vmCtx));
      }

      logger.info('Azure VM scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Error scanning Azure VMs', { error: errorMessage });
      errors.push({
        scanner: 'azure-virtual-machines',
        message: errorMessage,
        recoverable: true,
        resourceType: 'Microsoft.Compute/virtualMachines',
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

export default virtualMachinesScanner;
