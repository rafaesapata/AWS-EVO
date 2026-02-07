/**
 * Security Engine V3 - Delta Sync Logic
 * Pure functions for finding lifecycle management and delta synchronization.
 * Extracted for testability — no database dependencies.
 */

/** Valid finding lifecycle statuses */
export type FindingStatus = 'new' | 'active' | 'resolved' | 'reopened';

/** Represents an existing finding from the database */
export interface ExistingFinding {
  id: string;
  fingerprint: string | null;
  status: string;
  first_seen: Date | null;
  last_seen: Date | null;
  resolved_at: Date | null;
  occurrence_count: number;
  suppressed: boolean;
  suppression_expires_at: Date | null;
}

/** Represents a new finding from the current scan */
export interface NewScanFinding {
  fingerprint: string;
  title: string;
  severity: string;
  description: string;
  resource_id: string;
  resource_arn: string;
  service: string;
  category: string;
  scan_type: string;
  region: string;
  compliance: string[];
  remediation: string | undefined;
  evidence: Record<string, any>;
  risk_vector: string;
  details: Record<string, any>;
  source: string;
}

/** Classification result from delta sync */
export interface DeltaSyncResult {
  toCreate: NewScanFinding[];
  toUpdate: { existing: ExistingFinding; newData: NewScanFinding }[];
  toResolve: ExistingFinding[];
  expiredSuppressions: ExistingFinding[];
}

/**
 * Compute the lifecycle transition for a finding.
 *
 * State machine:
 *   new + seen again → active
 *   active + not seen → resolved
 *   resolved + seen again → reopened
 *   reopened + seen again → active
 *   new + not seen → resolved
 *
 * Any unrecognized status (e.g. legacy 'open', 'pending') is treated
 * as 'active' for transition purposes.
 */
export function computeLifecycleTransition(
  currentStatus: string,
  isPresent: boolean
): FindingStatus {
  const normalized = normalizeLegacyStatus(currentStatus);

  if (isPresent) {
    switch (normalized) {
      case 'new':
      case 'reopened':
        return 'active';
      case 'active':
        return 'active';
      case 'resolved':
        return 'reopened';
      default:
        return 'active';
    }
  } else {
    switch (normalized) {
      case 'new':
      case 'active':
      case 'reopened':
        return 'resolved';
      case 'resolved':
        return 'resolved';
      default:
        return 'resolved';
    }
  }
}

/**
 * Normalize legacy statuses ('open', 'pending', 'ACTIVE', etc.)
 * to the new lifecycle statuses.
 */
export function normalizeLegacyStatus(status: string): FindingStatus {
  const lower = (status || '').toLowerCase().trim();
  switch (lower) {
    case 'new':
      return 'new';
    case 'active':
      return 'active';
    case 'resolved':
      return 'resolved';
    case 'reopened':
      return 'reopened';
    // Legacy statuses
    case 'open':
    case 'pending':
      return 'active';
    default:
      return 'active';
  }
}

/**
 * Classify findings into create, update, resolve, and expired suppression buckets.
 *
 * @param newFindings - Findings from the current scan (with fingerprints)
 * @param existingFindings - Existing findings from the database for this org+account
 * @param now - Current timestamp for consistency
 */
export function classifyFindings(
  newFindings: NewScanFinding[],
  existingFindings: ExistingFinding[],
  now: Date = new Date()
): DeltaSyncResult {
  // Build lookup map: fingerprint → existing finding
  const existingByFingerprint = new Map<string, ExistingFinding>();
  for (const existing of existingFindings) {
    if (existing.fingerprint) {
      existingByFingerprint.set(existing.fingerprint, existing);
    }
  }

  // Build set of new fingerprints
  const newFingerprintSet = new Set(newFindings.map(f => f.fingerprint));

  const toCreate: NewScanFinding[] = [];
  const toUpdate: { existing: ExistingFinding; newData: NewScanFinding }[] = [];

  // Classify new findings
  for (const finding of newFindings) {
    const existing = existingByFingerprint.get(finding.fingerprint);
    if (existing) {
      toUpdate.push({ existing, newData: finding });
    } else {
      toCreate.push(finding);
    }
  }

  // Find findings to resolve (exist in DB but not in current scan)
  const toResolve: ExistingFinding[] = [];
  for (const existing of existingFindings) {
    if (!existing.fingerprint) continue;
    if (newFingerprintSet.has(existing.fingerprint)) continue;

    const normalized = normalizeLegacyStatus(existing.status);
    if (normalized === 'new' || normalized === 'active' || normalized === 'reopened') {
      toResolve.push(existing);
    }
  }

  // Find expired suppressions
  const expiredSuppressions: ExistingFinding[] = [];
  for (const existing of existingFindings) {
    if (
      existing.suppressed &&
      existing.suppression_expires_at &&
      existing.suppression_expires_at <= now
    ) {
      expiredSuppressions.push(existing);
    }
  }

  return { toCreate, toUpdate, toResolve, expiredSuppressions };
}
