# Adding Azure Security Scanners

## Overview

This guide explains how to add new Azure security scanners to the EVO platform, following the established patterns from AWS scanners.

## Scanner Architecture

```
backend/src/lib/security-engine/
├── scanners/
│   ├── aws/
│   │   ├── iam/
│   │   ├── ec2/
│   │   ├── s3/
│   │   └── ...
│   └── azure/
│       ├── identity/
│       ├── virtual-machines/
│       ├── storage-accounts/
│       └── ...
├── types.ts
└── index.ts
```

## Scanner Interface

All scanners implement the common `SecurityScanner` interface:

```typescript
interface SecurityScanner {
  name: string;
  description: string;
  provider: 'AWS' | 'AZURE';
  category: string;
  
  scan(context: ScanContext): Promise<ScanResult>;
}

interface ScanContext {
  credentials: CloudCredentials;
  regions: string[];
  organizationId: string;
  accountId: string;
}

interface ScanResult {
  findings: SecurityFinding[];
  resourcesScanned: number;
  errors: ScanError[];
}

interface SecurityFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  region?: string;
  remediation?: string;
  complianceFrameworks?: string[];
}
```

## Step-by-Step: Adding a New Scanner

### 1. Create Scanner Directory

```bash
mkdir -p backend/src/lib/security-engine/scanners/azure/virtual-machines
```

### 2. Implement Scanner

```typescript
// backend/src/lib/security-engine/scanners/azure/virtual-machines/index.ts

import { ComputeManagementClient } from '@azure/arm-compute';
import { DefaultAzureCredential } from '@azure/identity';
import type { SecurityScanner, ScanContext, ScanResult, SecurityFinding } from '../../../types.js';
import { logger } from '../../../../logging.js';

export const virtualMachinesScanner: SecurityScanner = {
  name: 'azure-virtual-machines',
  description: 'Scans Azure Virtual Machines for security misconfigurations',
  provider: 'AZURE',
  category: 'Compute',

  async scan(context: ScanContext): Promise<ScanResult> {
    const findings: SecurityFinding[] = [];
    const errors: ScanError[] = [];
    let resourcesScanned = 0;

    try {
      const credential = new DefaultAzureCredential();
      const client = new ComputeManagementClient(
        credential,
        context.credentials.subscriptionId
      );

      // List all VMs
      const vms = [];
      for await (const vm of client.virtualMachines.listAll()) {
        vms.push(vm);
      }

      resourcesScanned = vms.length;

      for (const vm of vms) {
        // Check 1: Disk encryption
        if (!vm.storageProfile?.osDisk?.encryptionSettings?.enabled) {
          findings.push({
            severity: 'HIGH',
            title: 'VM OS Disk Not Encrypted',
            description: `Virtual machine ${vm.name} has an unencrypted OS disk`,
            resourceType: 'Microsoft.Compute/virtualMachines',
            resourceId: vm.id || '',
            resourceName: vm.name,
            region: vm.location,
            remediation: 'Enable Azure Disk Encryption for the VM',
            complianceFrameworks: ['CIS Azure 1.4', 'LGPD'],
          });
        }

        // Check 2: Managed disks
        if (vm.storageProfile?.osDisk?.managedDisk === undefined) {
          findings.push({
            severity: 'MEDIUM',
            title: 'VM Using Unmanaged Disks',
            description: `Virtual machine ${vm.name} is using unmanaged disks`,
            resourceType: 'Microsoft.Compute/virtualMachines',
            resourceId: vm.id || '',
            resourceName: vm.name,
            region: vm.location,
            remediation: 'Migrate to managed disks for better reliability and security',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check 3: Auto-updates
        if (vm.osProfile?.windowsConfiguration?.enableAutomaticUpdates === false) {
          findings.push({
            severity: 'MEDIUM',
            title: 'Windows Auto-Updates Disabled',
            description: `Virtual machine ${vm.name} has automatic updates disabled`,
            resourceType: 'Microsoft.Compute/virtualMachines',
            resourceId: vm.id || '',
            resourceName: vm.name,
            region: vm.location,
            remediation: 'Enable automatic updates for Windows VMs',
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check 4: Public IP
        // Note: Requires additional network interface lookup
        // Implementation depends on network configuration
      }

      logger.info('Azure VM scan completed', {
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: any) {
      logger.error('Error scanning Azure VMs', { error: err.message });
      errors.push({
        scanner: 'azure-virtual-machines',
        message: err.message,
        recoverable: true,
      });
    }

    return {
      findings,
      resourcesScanned,
      errors,
    };
  },
};

export default virtualMachinesScanner;
```

### 3. Register Scanner

```typescript
// backend/src/lib/security-engine/scanners/azure/index.ts

import { virtualMachinesScanner } from './virtual-machines/index.js';
import { storageAccountsScanner } from './storage-accounts/index.js';
import { keyVaultScanner } from './key-vault/index.js';
// ... other scanners

export const azureScanners = [
  virtualMachinesScanner,
  storageAccountsScanner,
  keyVaultScanner,
  // ... add new scanners here
];

export function getAzureScanner(name: string) {
  return azureScanners.find(s => s.name === name);
}

export function getAzureScannersByCategory(category: string) {
  return azureScanners.filter(s => s.category === category);
}
```

### 4. Update Security Scan Handler

```typescript
// backend/src/handlers/azure/azure-security-scan.ts

import { azureScanners } from '../../lib/security-engine/scanners/azure/index.js';

// In the handler, run all registered scanners
for (const scanner of azureScanners) {
  const result = await scanner.scan(context);
  allFindings.push(...result.findings);
  totalResourcesScanned += result.resourcesScanned;
}
```

## Scanner Categories

| Category | Azure Services | Priority |
|----------|---------------|----------|
| Identity | Azure AD, RBAC, Managed Identities | 🔴 High |
| Compute | VMs, VMSS, AKS, App Service | 🔴 High |
| Storage | Storage Accounts, Blob, Files | 🔴 High |
| Security | Key Vault, Defender, Sentinel | 🔴 High |
| Network | VNets, NSGs, Load Balancers | 🟡 Medium |
| Database | SQL, Cosmos DB, PostgreSQL | 🟡 Medium |
| Monitoring | Monitor, Log Analytics | 🟢 Low |

## Common Security Checks

### Identity & Access

- [ ] MFA enabled for all users
- [ ] No guest users with admin roles
- [ ] Service principals with expiring credentials
- [ ] Privileged Identity Management enabled
- [ ] Conditional Access policies configured

### Compute

- [ ] Disk encryption enabled
- [ ] Managed disks used
- [ ] Auto-updates enabled
- [ ] No public IPs on VMs
- [ ] Just-in-time VM access enabled
- [ ] Endpoint protection installed

### Storage

- [ ] Secure transfer required (HTTPS)
- [ ] Public blob access disabled
- [ ] Soft delete enabled
- [ ] Versioning enabled
- [ ] Customer-managed keys used
- [ ] Network rules configured

### Network

- [ ] No NSG rules allowing 0.0.0.0/0
- [ ] DDoS protection enabled
- [ ] WAF enabled on Application Gateway
- [ ] Private endpoints used
- [ ] Network Watcher enabled

### Key Vault

- [ ] Soft delete enabled
- [ ] Purge protection enabled
- [ ] Key rotation configured
- [ ] Access policies reviewed
- [ ] Diagnostic logging enabled

## Testing Scanners

### Unit Tests

```typescript
// backend/src/lib/security-engine/scanners/azure/virtual-machines/__tests__/index.test.ts

import { virtualMachinesScanner } from '../index.js';

describe('Azure Virtual Machines Scanner', () => {
  it('should detect unencrypted disks', async () => {
    const context = createTestContext({
      subscriptionId: process.env.TEST_AZURE_SUBSCRIPTION_ID,
    });

    const result = await virtualMachinesScanner.scan(context);

    expect(result.resourcesScanned).toBeGreaterThan(0);
    // Assertions based on test environment
  });
});
```

### Integration Tests

```bash
# Run scanner against real Azure subscription
npm run test:integration -- --grep "azure-virtual-machines"
```

## Azure SDK Dependencies

Ensure these packages are in the Lambda layer:

```json
{
  "@azure/identity": "^4.0.0",
  "@azure/arm-compute": "^21.0.0",
  "@azure/arm-storage": "^18.0.0",
  "@azure/arm-network": "^33.0.0",
  "@azure/arm-keyvault": "^3.0.0",
  "@azure/arm-sql": "^10.0.0",
  "@azure/arm-monitor": "^8.0.0"
}
```

## Compliance Mapping

Map findings to compliance frameworks:

| Framework | Azure Benchmark |
|-----------|-----------------|
| CIS Azure 1.4 | CIS Microsoft Azure Foundations Benchmark |
| LGPD | Brazilian General Data Protection Law |
| PCI-DSS | Payment Card Industry Data Security Standard |
| SOC 2 | Service Organization Control 2 |
| ISO 27001 | Information Security Management |

## Performance Considerations

1. **Pagination**: Use async iterators for large resource lists
2. **Parallelization**: Run independent checks concurrently
3. **Caching**: Cache subscription/resource group lists
4. **Timeouts**: Set appropriate timeouts for API calls
5. **Rate Limiting**: Respect Azure API rate limits

```typescript
// Example: Parallel scanning with rate limiting
import pLimit from 'p-limit';

const limit = pLimit(5); // Max 5 concurrent API calls

const results = await Promise.all(
  vms.map(vm => limit(() => scanVm(vm)))
);
```

## Related Documentation

- [Azure OAuth Setup](./AZURE_OAUTH_SETUP.md)
- [Multi-Cloud Architecture](./MULTI_CLOUD_ARCHITECTURE.md)
- [Azure SDK Lambda Layers](../.kiro/steering/azure-lambda-layers.md)
