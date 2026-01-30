/**
 * Security Engine V3 - Scanner Timeout
 * Implements timeout control for individual scanners
 */

import { logger } from '../../logging.js';
import type { Finding } from '../types.js';

export interface TimeoutConfig {
  defaultTimeoutMs: number;
  scannerTimeouts: Record<string, number>;
  gracePeriodMs: number;
}

export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  defaultTimeoutMs: 30000, // 30 seconds default
  scannerTimeouts: {
    // Global services (can take longer due to more resources)
    IAM: 60000,        // 60s - many users/roles to check
    S3: 60000,         // 60s - many buckets possible
    CloudFront: 45000, // 45s
    Route53: 45000,    // 45s
    Organizations: 30000, // 30s
    
    // Regional services
    EC2: 45000,        // 45s - many instances/security groups
    RDS: 30000,        // 30s
    Lambda: 45000,     // 45s - many functions possible
    EKS: 45000,        // 45s - complex checks
    ECS: 45000,        // 45s - complex checks
    
    // Security services (usually quick)
    GuardDuty: 20000,  // 20s
    SecurityHub: 20000, // 20s
    WAF: 30000,        // 30s
    CloudTrail: 30000, // 30s
    
    // Data services
    DynamoDB: 30000,   // 30s
    ElastiCache: 20000, // 20s
    OpenSearch: 30000, // 30s
    Redshift: 30000,   // 30s
    
    // Other services
    SecretsManager: 20000, // 20s
    KMS: 20000,        // 20s
    SQS: 20000,        // 20s
    SNS: 20000,        // 20s
    Cognito: 20000,    // 20s
    APIGateway: 30000, // 30s
    ACM: 20000,        // 20s
    ELB: 30000,        // 30s
    
    // Phase 2 scanners
    ECR: 30000,        // 30s
    EFS: 20000,        // 20s
    Config: 20000,     // 20s
    Backup: 20000,     // 20s
    CloudWatch: 20000, // 20s
    
    // Phase 3 scanners
    EventBridge: 20000, // 20s
    StepFunctions: 20000, // 20s
    SSM: 30000,        // 30s
    Kinesis: 20000,    // 20s
    Inspector: 30000,  // 30s
    Macie: 30000,      // 30s
    NetworkFirewall: 20000, // 20s
    Glue: 30000,       // 30s
  },
  gracePeriodMs: 2000, // 2s grace period for cleanup
};

/**
 * Error thrown when scanner times out
 */
export class ScannerTimeoutError extends Error {
  constructor(
    public scannerName: string,
    public timeoutMs: number,
    public region: string
  ) {
    super(`Scanner ${scannerName} timed out after ${timeoutMs}ms in region ${region}`);
    this.name = 'ScannerTimeoutError';
  }
}

/**
 * Execute scanner with timeout
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  scannerName: string,
  region: string,
  config: Partial<TimeoutConfig> = {}
): Promise<T> {
  const fullConfig: TimeoutConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...config };
  const timeoutMs = fullConfig.scannerTimeouts[scannerName] || fullConfig.defaultTimeoutMs;
  
  return new Promise<T>((resolve, reject) => {
    let completed = false;
    let timeoutId: NodeJS.Timeout | null = null;
    
    // Set up timeout
    timeoutId = setTimeout(() => {
      if (!completed) {
        completed = true;
        logger.warn(`[Timeout] Scanner ${scannerName} timed out in ${region}`, {
          scannerName,
          region,
          timeoutMs,
        });
        reject(new ScannerTimeoutError(scannerName, timeoutMs, region));
      }
    }, timeoutMs);
    
    // Execute operation
    operation()
      .then((result) => {
        if (!completed) {
          completed = true;
          if (timeoutId) clearTimeout(timeoutId);
          resolve(result);
        }
      })
      .catch((error) => {
        if (!completed) {
          completed = true;
          if (timeoutId) clearTimeout(timeoutId);
          reject(error);
        }
      });
  });
}

/**
 * Execute scanner with timeout and return partial results on timeout
 */
export async function withTimeoutPartial(
  operation: (signal: AbortSignal) => Promise<Finding[]>,
  scannerName: string,
  region: string,
  config: Partial<TimeoutConfig> = {}
): Promise<{ findings: Finding[]; timedOut: boolean; duration: number }> {
  const fullConfig: TimeoutConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...config };
  const timeoutMs = fullConfig.scannerTimeouts[scannerName] || fullConfig.defaultTimeoutMs;
  const startTime = Date.now();
  
  const abortController = new AbortController();
  let timedOut = false;
  
  return new Promise((resolve) => {
    let completed = false;
    let timeoutId: NodeJS.Timeout | null = null;
    
    // Set up timeout
    timeoutId = setTimeout(() => {
      if (!completed) {
        timedOut = true;
        abortController.abort();
        logger.warn(`[Timeout] Scanner ${scannerName} timed out in ${region}, returning partial results`, {
          scannerName,
          region,
          timeoutMs,
        });
        // Give grace period for cleanup
        setTimeout(() => {
          if (!completed) {
            completed = true;
            resolve({
              findings: [],
              timedOut: true,
              duration: Date.now() - startTime,
            });
          }
        }, fullConfig.gracePeriodMs);
      }
    }, timeoutMs);
    
    // Execute operation
    operation(abortController.signal)
      .then((findings) => {
        if (!completed) {
          completed = true;
          if (timeoutId) clearTimeout(timeoutId);
          resolve({
            findings,
            timedOut: false,
            duration: Date.now() - startTime,
          });
        }
      })
      .catch((error) => {
        if (!completed) {
          completed = true;
          if (timeoutId) clearTimeout(timeoutId);
          
          // If aborted due to timeout, return empty findings
          if (error.name === 'AbortError' || timedOut) {
            resolve({
              findings: [],
              timedOut: true,
              duration: Date.now() - startTime,
            });
          } else {
            // Log error but return empty findings to not break the scan
            logger.error(`[Scanner] ${scannerName} failed in ${region}`, error);
            resolve({
              findings: [],
              timedOut: false,
              duration: Date.now() - startTime,
            });
          }
        }
      });
  });
}

/**
 * Create a scanner wrapper with timeout
 */
export function createTimeoutScanner<TArgs extends any[], TResult>(
  scanner: (...args: TArgs) => Promise<TResult>,
  scannerName: string,
  config: Partial<TimeoutConfig> = {}
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    // Extract region from args (usually first argument)
    const region = typeof args[0] === 'string' ? args[0] : 'unknown';
    
    return withTimeout(
      () => scanner(...args),
      scannerName,
      region,
      config
    );
  };
}

/**
 * Get timeout for a specific scanner
 */
export function getScannerTimeout(
  scannerName: string,
  config: Partial<TimeoutConfig> = {}
): number {
  const fullConfig: TimeoutConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...config };
  return fullConfig.scannerTimeouts[scannerName] || fullConfig.defaultTimeoutMs;
}

/**
 * Calculate total estimated scan time
 */
export function estimateTotalScanTime(
  scanners: string[],
  regions: string[],
  globalScanners: string[],
  config: Partial<TimeoutConfig> = {}
): number {
  const fullConfig: TimeoutConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...config };
  
  let totalTime = 0;
  
  // Global scanners run once
  for (const scanner of scanners.filter(s => globalScanners.includes(s))) {
    totalTime += fullConfig.scannerTimeouts[scanner] || fullConfig.defaultTimeoutMs;
  }
  
  // Regional scanners run per region
  for (const scanner of scanners.filter(s => !globalScanners.includes(s))) {
    const scannerTime = fullConfig.scannerTimeouts[scanner] || fullConfig.defaultTimeoutMs;
    totalTime += scannerTime * regions.length;
  }
  
  // Assume some parallelization (divide by 5 for concurrent execution)
  return Math.ceil(totalTime / 5);
}
