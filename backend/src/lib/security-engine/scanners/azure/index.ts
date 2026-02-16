/**
 * Azure Security Scanners Index
 * 
 * Exports all Azure security scanners for use in the security scan handler.
 * 
 * Scanners included:
 * - Virtual Machines: Disk encryption, managed identity, antimalware, public IPs
 * - Storage Accounts: HTTPS, soft delete, versioning, CMK, lifecycle management
 * - Key Vault: Soft delete, purge protection, private endpoints, secret rotation
 * - SQL Database: TDE with CMK, auditing, ATP, vulnerability assessment
 * - Entra ID: MFA, Conditional Access, PIM, legacy auth, permissions
 * - Network Security: NSG rules, dangerous ports, Flow Logs
 * - AKS: Network policies, RBAC, private cluster, Defender
 * - App Service: HTTPS, managed identity, VNet integration
 * - Functions: Authentication, private endpoints, CORS
 * - Cosmos DB: Firewall, CMK, private endpoints
 * - Redis: SSL/TLS, authentication, firewall
 * - Defender: Secure Score, alerts, recommendations
 */

import { virtualMachinesScanner } from './virtual-machines/index.js';
import { storageAccountsScanner } from './storage-accounts/index.js';
import { keyVaultScanner } from './key-vault/index.js';
import { sqlDatabaseScanner } from './sql-database/index.js';
import { entraIdScanner } from './entra-id/index.js';
import { networkSecurityScanner } from './network-security/index.js';
import { aksScanner } from './aks/index.js';
import { appServiceScanner } from './app-service/index.js';
import { functionsScanner } from './functions/index.js';
import { cosmosDbScanner } from './cosmos-db/index.js';
import { redisScanner } from './redis/index.js';
import { defenderScanner } from './defender/index.js';
import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding } from './types.js';

// Export all scanners - ordered by priority (Identity/IAM first, then network, then resources)
export const azureScanners: AzureScanner[] = [
  // Priority 1: Identity & Access (scan first - most critical)
  entraIdScanner,
  
  // Priority 2: Network Security
  networkSecurityScanner,
  
  // Priority 3: Security Services
  defenderScanner,
  keyVaultScanner,
  
  // Priority 4: Compute
  virtualMachinesScanner,
  aksScanner,
  appServiceScanner,
  functionsScanner,
  
  // Priority 5: Data
  storageAccountsScanner,
  sqlDatabaseScanner,
  cosmosDbScanner,
  redisScanner,
];

// Export individual scanners
export {
  virtualMachinesScanner,
  storageAccountsScanner,
  keyVaultScanner,
  sqlDatabaseScanner,
  entraIdScanner,
  networkSecurityScanner,
  aksScanner,
  appServiceScanner,
  functionsScanner,
  cosmosDbScanner,
  redisScanner,
  defenderScanner,
};

// Export types
export type {
  AzureScanner,
  AzureScanContext,
  AzureScanResult,
  AzureSecurityFinding,
};

/**
 * Get a specific scanner by name
 */
export function getAzureScanner(name: string): AzureScanner | undefined {
  return azureScanners.find(s => s.name === name);
}

/**
 * Get scanners by category
 */
export function getAzureScannersByCategory(category: string): AzureScanner[] {
  return azureScanners.filter(s => s.category === category);
}

/**
 * Run all Azure scanners with parallel execution and error isolation
 */
export async function runAllAzureScanners(context: AzureScanContext): Promise<{
  findings: AzureSecurityFinding[];
  totalResourcesScanned: number;
  scannerResults: Record<string, AzureScanResult>;
  totalDurationMs: number;
  scannersExecuted: number;
  scannersSucceeded: number;
  scannersFailed: number;
}> {
  const startTime = Date.now();
  const findings: AzureSecurityFinding[] = [];
  let totalResourcesScanned = 0;
  const scannerResults: Record<string, AzureScanResult> = {};
  let scannersSucceeded = 0;
  let scannersFailed = 0;

  // Reset cache and rate limiter at the start of each scan to avoid stale data
  const { resetGlobalCache: resetCache } = await import('./utils/cache.js');
  const { resetGlobalRateLimiter } = await import('./utils/rate-limiter.js');
  resetCache();
  resetGlobalRateLimiter();

  // Run scanners in parallel for better performance
  // Each scanner is isolated - failures don't affect others
  const results = await Promise.allSettled(
    azureScanners.map(async scanner => {
      try {
        const result = await scanner.scan(context);
        return { name: scanner.name, result, success: true };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { 
          name: scanner.name, 
          result: {
            findings: [],
            resourcesScanned: 0,
            errors: [{
              scanner: scanner.name,
              message: errorMessage,
              recoverable: true,
            }],
            scanDurationMs: 0,
          } as AzureScanResult,
          success: false,
        };
      }
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { name, result: scanResult, success } = result.value;
      scannerResults[name] = scanResult;
      findings.push(...scanResult.findings);
      totalResourcesScanned += scanResult.resourcesScanned;
      
      if (success && scanResult.errors.length === 0) {
        scannersSucceeded++;
      } else {
        scannersFailed++;
      }
    } else {
      scannersFailed++;
    }
  }

  return {
    findings,
    totalResourcesScanned,
    scannerResults,
    totalDurationMs: Date.now() - startTime,
    scannersExecuted: azureScanners.length,
    scannersSucceeded,
    scannersFailed,
  };
}

/**
 * Scanner metadata for UI display
 */
export const azureScannerMetadata = azureScanners.map(s => ({
  name: s.name,
  description: s.description,
  category: s.category,
}));

/**
 * Get scanner categories
 */
export function getAzureScannerCategories(): string[] {
  const categories = new Set(azureScanners.map(s => s.category));
  return Array.from(categories);
}

// Export utilities (optional enhancements)
export {
  AzureScannerCache,
  getGlobalCache,
  resetGlobalCache,
  CacheKeys,
  AzureRateLimiter,
  getGlobalRateLimiter,
  resetGlobalRateLimiter,
  rateLimitedFetch,
} from './utils/index.js';

export type {
  RemediationType,
  RemediationScript,
  RemediationInfo,
} from './utils/index.js';

export {
  getVMDiskEncryptionRemediation,
  getVMManagedIdentityRemediation,
  getStorageHttpsRemediation,
  getKeyVaultSoftDeleteRemediation,
  getNSGDangerousRuleRemediation,
  getSQLTDERemediation,
  getGenericRemediation,
} from './utils/index.js';
