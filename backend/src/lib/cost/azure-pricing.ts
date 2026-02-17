/**
 * Azure Pricing Module
 * 
 * Real Azure VM, SQL, Storage, and Disk pricing for waste detection.
 * Prices in USD/month based on Pay-As-You-Go Linux pricing.
 */

// Azure VM pricing (USD/month, Pay-As-You-Go, Linux)
const AZURE_VM_PRICING: Record<string, number> = {
  // B-series (burstable)
  'Standard_B1s': 7.59, 'Standard_B1ms': 15.18, 'Standard_B2s': 30.37,
  'Standard_B2ms': 60.74, 'Standard_B4ms': 121.47, 'Standard_B8ms': 242.94,
  'Standard_B12ms': 364.42, 'Standard_B16ms': 485.89, 'Standard_B20ms': 607.36,
  // D-series v5
  'Standard_D2s_v5': 70.08, 'Standard_D4s_v5': 140.16, 'Standard_D8s_v5': 280.32,
  'Standard_D16s_v5': 560.64, 'Standard_D32s_v5': 1121.28, 'Standard_D48s_v5': 1681.92,
  'Standard_D64s_v5': 2242.56,
  // D-series v4
  'Standard_D2s_v4': 70.08, 'Standard_D4s_v4': 140.16, 'Standard_D8s_v4': 280.32,
  'Standard_D16s_v4': 560.64, 'Standard_D32s_v4': 1121.28,
  // D-series v3
  'Standard_D2s_v3': 73.00, 'Standard_D4s_v3': 146.00, 'Standard_D8s_v3': 292.00,
  'Standard_D16s_v3': 584.00, 'Standard_D32s_v3': 1168.00,
  // E-series v5 (memory optimized)
  'Standard_E2s_v5': 92.71, 'Standard_E4s_v5': 185.42, 'Standard_E8s_v5': 370.85,
  'Standard_E16s_v5': 741.69, 'Standard_E32s_v5': 1483.39, 'Standard_E64s_v5': 2966.78,
  // F-series v2 (compute optimized)
  'Standard_F2s_v2': 61.32, 'Standard_F4s_v2': 122.64, 'Standard_F8s_v2': 245.28,
  'Standard_F16s_v2': 490.56, 'Standard_F32s_v2': 981.12,
  // A-series (basic/legacy)
  'Standard_A1_v2': 29.20, 'Standard_A2_v2': 61.32, 'Standard_A4_v2': 128.48,
  'Standard_A8_v2': 270.10,
};

// Azure Managed Disk pricing (USD/month)
const AZURE_DISK_PRICING: Record<string, { perGB: number; base: number }> = {
  'Premium_LRS': { perGB: 0.132, base: 0 },
  'StandardSSD_LRS': { perGB: 0.075, base: 0 },
  'Standard_LRS': { perGB: 0.04, base: 0 },
  'UltraSSD_LRS': { perGB: 0.12, base: 0 },
  'PremiumV2_LRS': { perGB: 0.12, base: 0 },
};

// Azure SQL Database pricing (USD/month, vCore-based)
const AZURE_SQL_PRICING: Record<string, number> = {
  // General Purpose
  'GP_Gen5_2': 370.42, 'GP_Gen5_4': 740.84, 'GP_Gen5_8': 1481.68,
  'GP_Gen5_16': 2963.36, 'GP_Gen5_32': 5926.72,
  // Business Critical
  'BC_Gen5_2': 926.05, 'BC_Gen5_4': 1852.10, 'BC_Gen5_8': 3704.20,
  // Serverless
  'GP_S_Gen5_1': 46.30, 'GP_S_Gen5_2': 92.60, 'GP_S_Gen5_4': 185.21,
  // Basic/Standard DTU
  'Basic': 4.99, 'S0': 14.72, 'S1': 29.43, 'S2': 73.58, 'S3': 147.17,
  'S4': 294.34, 'S6': 588.67, 'S7': 1177.34, 'S9': 2354.69,
  // Premium DTU
  'P1': 465.00, 'P2': 930.00, 'P4': 1860.00, 'P6': 3720.00,
};

// Public IP pricing
export const AZURE_PUBLIC_IP_PRICING = {
  staticMonthly: 3.65,  // Static public IP per month
  staticHourly: 0.005,
};

// Storage Account pricing (per GB/month)
export const AZURE_STORAGE_PRICING: Record<string, number> = {
  'Hot': 0.018,
  'Cool': 0.01,
  'Archive': 0.002,
  'Premium': 0.15,
};

/**
 * Get Azure VM monthly cost
 */
export function getAzureVMMonthlyCost(vmSize: string): number {
  return AZURE_VM_PRICING[vmSize] || estimateVMCost(vmSize);
}

/**
 * Get Azure VM hourly cost
 */
export function getAzureVMHourlyCost(vmSize: string): number {
  return getAzureVMMonthlyCost(vmSize) / 730;
}

/**
 * Estimate VM cost from size name when not in pricing table
 */
function estimateVMCost(vmSize: string): number {
  const match = vmSize.match(/(\d+)/);
  const vcpus = match ? parseInt(match[1]) : 2;
  return vcpus * 35; // ~$35/vCPU/month as rough estimate
}

/**
 * Get Azure Managed Disk monthly cost
 */
export function getAzureDiskMonthlyCost(diskType: string, sizeGB: number): number {
  const pricing = AZURE_DISK_PRICING[diskType] || AZURE_DISK_PRICING['StandardSSD_LRS'];
  return pricing.base + (pricing.perGB * sizeGB);
}

/**
 * Get Azure SQL Database monthly cost
 */
export function getAzureSQLMonthlyCost(sku: string): number {
  return AZURE_SQL_PRICING[sku] || 50; // Default estimate
}

/**
 * Get Azure Storage Account monthly cost
 */
export function getAzureStorageMonthlyCost(tier: string, sizeGB: number): number {
  const pricePerGB = AZURE_STORAGE_PRICING[tier] || AZURE_STORAGE_PRICING['Hot'];
  return pricePerGB * sizeGB;
}

/**
 * Get downsize recommendation for Azure VM
 */
export function getAzureVMDownsizeRecommendation(currentSize: string, maxCpu: number): string {
  // Parse the VM family and size
  const match = currentSize.match(/^(Standard_[A-Z]+)(\d+)(.*)/);
  if (!match) return currentSize;

  const [, family, vcpuStr, suffix] = match;
  const currentVcpus = parseInt(vcpuStr);
  
  // Determine target vCPUs based on max CPU usage
  let targetVcpus: number;
  if (maxCpu < 10) targetVcpus = Math.max(1, Math.floor(currentVcpus / 4));
  else if (maxCpu < 30) targetVcpus = Math.max(2, Math.floor(currentVcpus / 2));
  else targetVcpus = Math.max(2, currentVcpus - Math.floor(currentVcpus / 3));

  if (targetVcpus >= currentVcpus) return currentSize;

  const recommended = `${family}${targetVcpus}${suffix}`;
  // Verify it exists in pricing, otherwise return closest known
  if (AZURE_VM_PRICING[recommended]) return recommended;

  // Find closest smaller size in same family
  const familyPrefix = family;
  const candidates = Object.keys(AZURE_VM_PRICING)
    .filter(k => k.startsWith(familyPrefix))
    .map(k => {
      const m = k.match(/(\d+)/);
      return { size: k, vcpus: m ? parseInt(m[1]) : 0 };
    })
    .filter(c => c.vcpus < currentVcpus && c.vcpus >= targetVcpus)
    .sort((a, b) => b.vcpus - a.vcpus);

  return candidates.length > 0 ? candidates[0].size : currentSize;
}

/**
 * Calculate Azure VM downsize savings
 */
export function calculateAzureVMDownsizeSavings(currentSize: string, recommendedSize: string): number {
  const currentCost = getAzureVMMonthlyCost(currentSize);
  const recommendedCost = getAzureVMMonthlyCost(recommendedSize);
  return Math.max(0, currentCost - recommendedCost);
}
