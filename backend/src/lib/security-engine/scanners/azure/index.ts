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
import { logger } from '../../../logging.js';
import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding } from './types.js';

// Per-scanner timeout configuration (ms). Identity scanners get more time due to pagination.
const AZURE_SCANNER_TIMEOUT_MS: Record<string, number> = {
  'azure-entra-id': 120_000,      // 2min — Graph API pagination can be slow
  'azure-network-security': 90_000, // 1.5min — many NSGs in enterprise
  'azure-defender': 90_000,         // 1.5min — assessments can be large
  'azure-key-vault': 90_000,       // 1.5min — data plane calls per vault
  'azure-virtual-machines': 90_000, // 1.5min — extensions per VM
  'azure-storage-accounts': 90_000, // 1.5min — containers per account
  'azure-aks': 60_000,
  'azure-app-service': 60_000,
  'azure-functions': 60_000,
  'azure-cosmos-db': 60_000,
  'azure-redis': 60_000,
  'azure-sql-database': 60_000,
};

const DEFAULT_SCANNER_TIMEOUT_MS = 60_000;

/**
 * Wraps a scanner execution with a timeout. If the scanner exceeds the timeout,
 * it returns a partial result with a timeout error instead of blocking indefinitely.
 */
async function withScannerTimeout(
  scanFn: () => Promise<AzureScanResult>,
  scannerName: string,
  timeoutMs: number
): Promise<AzureScanResult> {
  return new Promise<AzureScanResult>((resolve) => {
    const timer = setTimeout(() => {
      logger.warn(`Azure scanner ${scannerName} timed out after ${timeoutMs}ms`);
      resolve({
        findings: [],
        resourcesScanned: 0,
        errors: [{
          scanner: scannerName,
          message: `Scanner timed out after ${timeoutMs}ms`,
          recoverable: true,
        }],
        scanDurationMs: timeoutMs,
      });
    }, timeoutMs);

    scanFn()
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(err => {
        clearTimeout(timer);
        resolve({
          findings: [],
          resourcesScanned: 0,
          errors: [{
            scanner: scannerName,
            message: err instanceof Error ? err.message : String(err),
            recoverable: true,
          }],
          scanDurationMs: 0,
        });
      });
  });
}

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
  // Each scanner has an individual timeout to prevent indefinite blocking
  const results = await Promise.allSettled(
    azureScanners.map(async scanner => {
      const timeoutMs = AZURE_SCANNER_TIMEOUT_MS[scanner.name] || DEFAULT_SCANNER_TIMEOUT_MS;
      try {
        const result = await withScannerTimeout(
          () => scanner.scan(context),
          scanner.name,
          timeoutMs
        );
        const hasErrors = result.errors.length > 0;
        return { name: scanner.name, result, success: !hasErrors };
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
