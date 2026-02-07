/**
 * Security Engine V3 - Finding Fingerprint Generator
 * Computes deterministic SHA-256 fingerprints for finding deduplication
 */

import { createHash } from 'crypto';

/**
 * Compute a deterministic fingerprint for a finding.
 * Uses SHA-256 hash of pipe-delimited resource_arn|scan_type|title.
 * Returns a 64-character lowercase hexadecimal string.
 */
export function computeFingerprint(
  resourceArn: string,
  scanType: string,
  title: string
): string {
  const input = `${resourceArn || ''}|${scanType || ''}|${title || ''}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Compute a fallback fingerprint when resource_arn is missing.
 * Uses scan_type + title + resource_id instead.
 */
export function computeFallbackFingerprint(
  scanType: string,
  title: string,
  resourceId: string
): string {
  const input = `${scanType || ''}|${title || ''}|${resourceId || ''}`;
  return createHash('sha256').update(input).digest('hex');
}
