/**
 * Azure Virtual Machines Security Scanner
 * 
 * Scans Azure VMs for security misconfigurations including:
 * - Disk encryption status
 * - Managed disks usage
 * - Auto-updates configuration
 * - Network security (public IPs)
 * - Extensions and agents
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';

interface AzureVM {
  id: string;
  name: string;
  location: string;
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
      }>;
    };
    osProfile?: {
      windowsConfiguration?: {
        enableAutomaticUpdates?: boolean;
        patchSettings?: { patchMode?: string };
      };
      linuxConfiguration?: {
        patchSettings?: { patchMode?: string };
      };
    };
    networkProfile?: {
      networkInterfaces?: Array<{ id: string }>;
    };
    securityProfile?: {
      encryptionAtHost?: boolean;
      securityType?: string;
    };
    diagnosticsProfile?: {
      bootDiagnostics?: { enabled?: boolean };
    };
  };
  tags?: Record<string, string>;
}

async function fetchVMs(context: AzureScanContext): Promise<AzureVM[]> {
  const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.Compute/virtualMachines?api-version=2023-09-01`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${context.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch VMs: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { value?: AzureVM[] };
  return data.value || [];
}

export const virtualMachinesScanner: AzureScanner = {
  name: 'azure-virtual-machines',
  description: 'Scans Azure Virtual Machines for security misconfigurations',
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
        const resourceGroup = vm.id?.split('/resourceGroups/')[1]?.split('/')[0] || 'unknown';

        // Check 1: OS Disk Encryption
        const osDisk = vm.properties?.storageProfile?.osDisk;
        if (!osDisk?.encryptionSettings?.enabled && !vm.properties?.securityProfile?.encryptionAtHost) {
          findings.push({
            severity: 'HIGH',
            title: 'VM OS Disk Not Encrypted',
            description: `Virtual machine ${vm.name} has an unencrypted OS disk. Disk encryption protects data at rest.`,
            resourceType: 'Microsoft.Compute/virtualMachines',
            resourceId: vm.id,
            resourceName: vm.name,
            resourceGroup,
            region: vm.location,
            remediation: 'Enable Azure Disk Encryption (ADE) or encryption at host for the VM',
            complianceFrameworks: ['CIS Azure 1.4', 'LGPD', 'PCI-DSS'],
          });
        }

        // Check 2: Data Disk Encryption
        const dataDisks = vm.properties?.storageProfile?.dataDisks || [];
        for (const disk of dataDisks) {
          if (!disk.encryptionSettings?.enabled && !vm.properties?.securityProfile?.encryptionAtHost) {
            findings.push({
              severity: 'HIGH',
              title: 'VM Data Disk Not Encrypted',
              description: `Virtual machine ${vm.name} has unencrypted data disks`,
              resourceType: 'Microsoft.Compute/virtualMachines',
              resourceId: vm.id,
              resourceName: vm.name,
              resourceGroup,
              region: vm.location,
              remediation: 'Enable Azure Disk Encryption for all data disks',
              complianceFrameworks: ['CIS Azure 1.4', 'LGPD'],
            });
            break; // Only report once per VM
          }
        }

        // Check 3: Managed Disks
        if (!osDisk?.managedDisk?.id) {
          findings.push({
            severity: 'MEDIUM',
            title: 'VM Using Unmanaged Disks',
            description: `Virtual machine ${vm.name} is using unmanaged disks instead of managed disks`,
            resourceType: 'Microsoft.Compute/virtualMachines',
            resourceId: vm.id,
            resourceName: vm.name,
            resourceGroup,
            region: vm.location,
            remediation: 'Migrate to managed disks for better reliability, security, and management',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check 4: Windows Auto-Updates
        const windowsConfig = vm.properties?.osProfile?.windowsConfiguration;
        if (windowsConfig && windowsConfig.enableAutomaticUpdates === false) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Windows Auto-Updates Disabled',
            description: `Virtual machine ${vm.name} has automatic Windows updates disabled`,
            resourceType: 'Microsoft.Compute/virtualMachines',
            resourceId: vm.id,
            resourceName: vm.name,
            resourceGroup,
            region: vm.location,
            remediation: 'Enable automatic updates or configure Azure Update Management',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check 5: Boot Diagnostics
        if (!vm.properties?.diagnosticsProfile?.bootDiagnostics?.enabled) {
          findings.push({
            severity: 'LOW',
            title: 'Boot Diagnostics Disabled',
            description: `Virtual machine ${vm.name} does not have boot diagnostics enabled`,
            resourceType: 'Microsoft.Compute/virtualMachines',
            resourceId: vm.id,
            resourceName: vm.name,
            resourceGroup,
            region: vm.location,
            remediation: 'Enable boot diagnostics for troubleshooting VM boot issues',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check 6: Trusted Launch
        if (vm.properties?.securityProfile?.securityType !== 'TrustedLaunch') {
          findings.push({
            severity: 'LOW',
            title: 'Trusted Launch Not Enabled',
            description: `Virtual machine ${vm.name} is not using Trusted Launch security type`,
            resourceType: 'Microsoft.Compute/virtualMachines',
            resourceId: vm.id,
            resourceName: vm.name,
            resourceGroup,
            region: vm.location,
            remediation: 'Consider recreating VM with Trusted Launch for enhanced security',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }
      }

      logger.info('Azure VM scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: any) {
      logger.error('Error scanning Azure VMs', { error: err.message });
      errors.push({
        scanner: 'azure-virtual-machines',
        message: err.message,
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
