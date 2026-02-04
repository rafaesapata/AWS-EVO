/**
 * Azure Scanner Utilities
 * 
 * Exports utility functions for Azure security scanners.
 * These utilities are optional enhancements that don't affect core functionality.
 */

export { AzureScannerCache, getGlobalCache, resetGlobalCache, CacheKeys } from './cache.js';
export { AzureRateLimiter, getGlobalRateLimiter, resetGlobalRateLimiter, rateLimitedFetch } from './rate-limiter.js';
export {
  type RemediationType,
  type RemediationScript,
  type RemediationInfo,
  getVMDiskEncryptionRemediation,
  getVMManagedIdentityRemediation,
  getStorageHttpsRemediation,
  getKeyVaultSoftDeleteRemediation,
  getNSGDangerousRuleRemediation,
  getSQLTDERemediation,
  getGenericRemediation,
} from './remediation.js';
