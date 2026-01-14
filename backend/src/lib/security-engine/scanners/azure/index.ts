/**
 * Azure Security Scanners Index
 * 
 * Exports all Azure security scanners for use in the security scan handler.
 */

import { virtualMachinesScanner } from './virtual-machines/index.js';
import { storageAccountsScanner } from './storage-accounts/index.js';
import { keyVaultScanner } from './key-vault/index.js';
import { sqlDatabaseScanner } from './sql-database/index.js';
import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding } from './types.js';

// Export all scanners
export const azureScanners: AzureScanner[] = [
  virtualMachinesScanner,
  storageAccountsScanner,
  keyVaultScanner,
  sqlDatabaseScanner,
];

// Export individual scanners
export {
  virtualMachinesScanner,
  storageAccountsScanner,
  keyVaultScanner,
  sqlDatabaseScanner,
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
 * Run all Azure scanners
 */
export async function runAllAzureScanners(context: AzureScanContext): Promise<{
  findings: AzureSecurityFinding[];
  totalResourcesScanned: number;
  scannerResults: Record<string, AzureScanResult>;
  totalDurationMs: number;
}> {
  const startTime = Date.now();
  const findings: AzureSecurityFinding[] = [];
  let totalResourcesScanned = 0;
  const scannerResults: Record<string, AzureScanResult> = {};

  // Run scanners in parallel for better performance
  const results = await Promise.allSettled(
    azureScanners.map(async scanner => {
      const result = await scanner.scan(context);
      return { name: scanner.name, result };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { name, result: scanResult } = result.value;
      scannerResults[name] = scanResult;
      findings.push(...scanResult.findings);
      totalResourcesScanned += scanResult.resourcesScanned;
    }
  }

  return {
    findings,
    totalResourcesScanned,
    scannerResults,
    totalDurationMs: Date.now() - startTime,
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
