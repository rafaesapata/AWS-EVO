/**
 * Azure Remediation Scripts Generator
 * 
 * Generates remediation scripts for Azure security findings.
 * Supports Azure CLI, PowerShell, ARM templates, and Terraform.
 */

export type RemediationType = 'azure-cli' | 'powershell' | 'arm-template' | 'terraform';

export interface RemediationScript {
  type: RemediationType;
  title: string;
  description: string;
  script: string;
  prerequisites?: string[];
  warnings?: string[];
}

export interface RemediationInfo {
  description: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  scripts: RemediationScript[];
  documentationUrl?: string;
  automatable: boolean;
}

/**
 * VM Disk Encryption Remediation
 */
export function getVMDiskEncryptionRemediation(vmName: string, resourceGroup: string): RemediationInfo {
  return {
    description: 'Enable Azure Disk Encryption (ADE) to protect data at rest on VM disks',
    impact: 'low',
    effort: 'medium',
    automatable: true,
    documentationUrl: 'https://docs.microsoft.com/azure/virtual-machines/disk-encryption-overview',
    scripts: [
      {
        type: 'azure-cli',
        title: 'Enable ADE via Azure CLI',
        description: 'Enables Azure Disk Encryption using a Key Vault',
        prerequisites: [
          'Azure CLI installed and logged in',
          'Key Vault with disk encryption enabled',
          'Appropriate RBAC permissions',
        ],
        script: `# Create Key Vault if not exists
az keyvault create --name "kv-${vmName}-ade" --resource-group "${resourceGroup}" --location "eastus" --enabled-for-disk-encryption true

# Enable encryption on the VM
az vm encryption enable --resource-group "${resourceGroup}" --name "${vmName}" --disk-encryption-keyvault "kv-${vmName}-ade"

# Verify encryption status
az vm encryption show --resource-group "${resourceGroup}" --name "${vmName}"`,
      },
      {
        type: 'powershell',
        title: 'Enable ADE via PowerShell',
        description: 'Enables Azure Disk Encryption using PowerShell',
        prerequisites: [
          'Azure PowerShell module installed',
          'Connected to Azure (Connect-AzAccount)',
        ],
        script: `# Variables
$vmName = "${vmName}"
$rgName = "${resourceGroup}"
$kvName = "kv-$vmName-ade"
$location = "eastus"

# Create Key Vault
$kv = New-AzKeyVault -Name $kvName -ResourceGroupName $rgName -Location $location -EnabledForDiskEncryption

# Enable encryption
Set-AzVMDiskEncryptionExtension -ResourceGroupName $rgName -VMName $vmName -DiskEncryptionKeyVaultUrl $kv.VaultUri -DiskEncryptionKeyVaultId $kv.ResourceId

# Check status
Get-AzVmDiskEncryptionStatus -ResourceGroupName $rgName -VMName $vmName`,
      },
    ],
  };
}

/**
 * VM Managed Identity Remediation
 */
export function getVMManagedIdentityRemediation(vmName: string, resourceGroup: string): RemediationInfo {
  return {
    description: 'Enable System-Assigned Managed Identity for secure access to Azure resources',
    impact: 'low',
    effort: 'low',
    automatable: true,
    documentationUrl: 'https://docs.microsoft.com/azure/active-directory/managed-identities-azure-resources/overview',
    scripts: [
      {
        type: 'azure-cli',
        title: 'Enable Managed Identity via Azure CLI',
        description: 'Enables system-assigned managed identity on the VM',
        script: `# Enable system-assigned managed identity
az vm identity assign --resource-group "${resourceGroup}" --name "${vmName}"

# Verify identity
az vm identity show --resource-group "${resourceGroup}" --name "${vmName}"`,
      },
      {
        type: 'powershell',
        title: 'Enable Managed Identity via PowerShell',
        description: 'Enables system-assigned managed identity using PowerShell',
        script: `# Enable system-assigned managed identity
$vm = Get-AzVM -ResourceGroupName "${resourceGroup}" -Name "${vmName}"
Update-AzVM -ResourceGroupName "${resourceGroup}" -VM $vm -IdentityType SystemAssigned

# Verify
(Get-AzVM -ResourceGroupName "${resourceGroup}" -Name "${vmName}").Identity`,
      },
    ],
  };
}

/**
 * Storage Account HTTPS Remediation
 */
export function getStorageHttpsRemediation(storageAccountName: string, resourceGroup: string): RemediationInfo {
  return {
    description: 'Enable HTTPS-only traffic to ensure encrypted data in transit',
    impact: 'medium',
    effort: 'low',
    automatable: true,
    documentationUrl: 'https://docs.microsoft.com/azure/storage/common/storage-require-secure-transfer',
    scripts: [
      {
        type: 'azure-cli',
        title: 'Enable HTTPS via Azure CLI',
        description: 'Enforces HTTPS-only traffic on the storage account',
        warnings: ['Applications using HTTP will stop working after this change'],
        script: `# Enable secure transfer (HTTPS only)
az storage account update --name "${storageAccountName}" --resource-group "${resourceGroup}" --https-only true

# Verify
az storage account show --name "${storageAccountName}" --resource-group "${resourceGroup}" --query "enableHttpsTrafficOnly"`,
      },
      {
        type: 'powershell',
        title: 'Enable HTTPS via PowerShell',
        description: 'Enforces HTTPS-only traffic using PowerShell',
        script: `# Enable secure transfer
Set-AzStorageAccount -ResourceGroupName "${resourceGroup}" -Name "${storageAccountName}" -EnableHttpsTrafficOnly $true

# Verify
(Get-AzStorageAccount -ResourceGroupName "${resourceGroup}" -Name "${storageAccountName}").EnableHttpsTrafficOnly`,
      },
    ],
  };
}

/**
 * Key Vault Soft Delete Remediation
 */
export function getKeyVaultSoftDeleteRemediation(vaultName: string, resourceGroup: string): RemediationInfo {
  return {
    description: 'Enable soft delete to protect against accidental deletion of secrets and keys',
    impact: 'low',
    effort: 'low',
    automatable: true,
    documentationUrl: 'https://docs.microsoft.com/azure/key-vault/general/soft-delete-overview',
    scripts: [
      {
        type: 'azure-cli',
        title: 'Enable Soft Delete via Azure CLI',
        description: 'Enables soft delete on the Key Vault (90 day retention)',
        warnings: ['Once enabled, soft delete cannot be disabled'],
        script: `# Enable soft delete (this is now enabled by default for new vaults)
az keyvault update --name "${vaultName}" --resource-group "${resourceGroup}" --enable-soft-delete true

# Verify
az keyvault show --name "${vaultName}" --resource-group "${resourceGroup}" --query "properties.enableSoftDelete"`,
      },
    ],
  };
}

/**
 * NSG Rule Remediation (remove dangerous rule)
 */
export function getNSGDangerousRuleRemediation(nsgName: string, resourceGroup: string, ruleName: string): RemediationInfo {
  return {
    description: 'Remove or restrict overly permissive NSG rule allowing traffic from any source',
    impact: 'high',
    effort: 'medium',
    automatable: true,
    documentationUrl: 'https://docs.microsoft.com/azure/virtual-network/network-security-groups-overview',
    scripts: [
      {
        type: 'azure-cli',
        title: 'Remove Dangerous Rule via Azure CLI',
        description: 'Removes the overly permissive NSG rule',
        warnings: [
          'This may disrupt connectivity - ensure you have alternative access',
          'Review the rule before deletion to understand its purpose',
        ],
        script: `# List current rules
az network nsg rule list --nsg-name "${nsgName}" --resource-group "${resourceGroup}" --output table

# Delete the dangerous rule
az network nsg rule delete --nsg-name "${nsgName}" --resource-group "${resourceGroup}" --name "${ruleName}"

# Or update to restrict source (recommended)
# az network nsg rule update --nsg-name "${nsgName}" --resource-group "${resourceGroup}" --name "${ruleName}" --source-address-prefixes "10.0.0.0/8"`,
      },
    ],
  };
}

/**
 * SQL TDE with CMK Remediation
 */
export function getSQLTDERemediation(serverName: string, resourceGroup: string): RemediationInfo {
  return {
    description: 'Enable Transparent Data Encryption with Customer-Managed Keys for enhanced control',
    impact: 'low',
    effort: 'high',
    automatable: true,
    documentationUrl: 'https://docs.microsoft.com/azure/azure-sql/database/transparent-data-encryption-byok-overview',
    scripts: [
      {
        type: 'azure-cli',
        title: 'Enable TDE with CMK via Azure CLI',
        description: 'Configures TDE with a customer-managed key from Key Vault',
        prerequisites: [
          'Key Vault with a key for TDE',
          'SQL Server identity with access to Key Vault',
        ],
        script: `# Assign identity to SQL Server
az sql server update --name "${serverName}" --resource-group "${resourceGroup}" --assign-identity

# Get the identity principal ID
PRINCIPAL_ID=$(az sql server show --name "${serverName}" --resource-group "${resourceGroup}" --query "identity.principalId" -o tsv)

# Grant Key Vault access to SQL Server identity
az keyvault set-policy --name "your-keyvault" --object-id $PRINCIPAL_ID --key-permissions get unwrapKey wrapKey

# Set the TDE protector
az sql server tde-key set --server-key-type AzureKeyVault --kid "https://your-keyvault.vault.azure.net/keys/your-key/version" --server "${serverName}" --resource-group "${resourceGroup}"`,
      },
    ],
  };
}

/**
 * Generic remediation info for findings without specific scripts
 */
export function getGenericRemediation(
  description: string,
  documentationUrl?: string
): RemediationInfo {
  return {
    description,
    impact: 'medium',
    effort: 'medium',
    automatable: false,
    documentationUrl,
    scripts: [],
  };
}
