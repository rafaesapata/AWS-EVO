/**
 * Security Engine V3 - Posture Scoring
 * Pure functions for security posture score calculation.
 * Extracted for testability — no database dependencies.
 */

export interface FindingForScoring {
  severity: string;
  suppressed: boolean;
  first_seen: Date | null;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface TrendResult {
  direction: 'improving' | 'stable' | 'degrading';
  adjustment: number;
  previousTotal: number;
  currentTotal: number;
  delta: number;
}

export interface PostureScoreParams {
  findings: FindingForScoring[];
  scannedServices: number;
  totalServices: number;
  previousCounts: SeverityCounts | null;
  now?: Date;
}

export interface PostureScoreResult {
  overallScore: number;
  riskLevel: string;
  breakdown: {
    baseScore: number;
    timeExposurePenalty: number;
    serviceCoverageBonus: number;
    trendAdjustment: number;
  };
  trend: TrendResult;
  counts: SeverityCounts & { total: number; suppressed: number };
  serviceCoverage: number;
}

/**
 * Calculate base score from severity-weighted penalty.
 * Score = 100 - penalty, where penalty is capped at 100.
 */
export function calculateBaseScore(counts: SeverityCounts): number {
  const penalty = counts.critical * 10 + counts.high * 5 + counts.medium * 2 + counts.low * 0.5;
  return Math.max(0, 100 - Math.min(penalty, 100));
}

/**
 * Calculate time exposure penalty based on finding age.
 * - Critical open > 7 days: 2 points each (max 20)
 * - High open > 14 days: 1 point each (max 10)
 * - Medium open > 30 days: 0.5 points each (max 5)
 */
export function calculateTimeExposurePenalty(
  findings: FindingForScoring[],
  now: Date = new Date()
): number {
  let criticalPenalty = 0;
  let highPenalty = 0;
  let mediumPenalty = 0;

  const nowMs = now.getTime();

  for (const f of findings) {
    if (f.suppressed || !f.first_seen) continue;
    const ageMs = nowMs - f.first_seen.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const sev = (f.severity || '').toLowerCase();

    if (sev === 'critical' && ageDays > 7) {
      criticalPenalty += 2;
    } else if (sev === 'high' && ageDays > 14) {
      highPenalty += 1;
    } else if (sev === 'medium' && ageDays > 30) {
      mediumPenalty += 0.5;
    }
  }

  return Math.min(criticalPenalty, 20) + Math.min(highPenalty, 10) + Math.min(mediumPenalty, 5);
}

/**
 * Calculate service coverage bonus.
 * Up to 10 bonus points for full coverage.
 */
export function calculateServiceCoverageBonus(
  scannedServices: number,
  totalServices: number
): number {
  if (totalServices <= 0) return 0;
  return (Math.min(scannedServices, totalServices) / totalServices) * 10;
}

/**
 * Calculate trend adjustment based on current vs previous finding counts.
 * Returns direction and adjustment value in [-5, 5].
 */
export function calculateTrendAdjustment(
  currentCounts: SeverityCounts,
  previousCounts: SeverityCounts | null
): TrendResult {
  const currentTotal = currentCounts.critical + currentCounts.high + currentCounts.medium + currentCounts.low;
  const previousTotal = previousCounts
    ? previousCounts.critical + previousCounts.high + previousCounts.medium + previousCounts.low
    : 0;

  const delta = currentTotal - previousTotal;

  if (!previousCounts) {
    return { direction: 'stable', adjustment: 0, previousTotal: 0, currentTotal, delta: 0 };
  }

  if (delta < 0) {
    // Improving — fewer findings
    const ratio = Math.min(Math.abs(delta) / Math.max(previousTotal, 1), 1);
    return { direction: 'improving', adjustment: Math.round(ratio * 5 * 10) / 10, previousTotal, currentTotal, delta };
  } else if (delta > 0) {
    // Degrading — more findings
    const ratio = Math.min(delta / Math.max(previousTotal, 1), 1);
    return { direction: 'degrading', adjustment: -Math.round(ratio * 5 * 10) / 10, previousTotal, currentTotal, delta };
  }

  return { direction: 'stable', adjustment: 0, previousTotal, currentTotal, delta: 0 };
}

/**
 * Calculate the complete posture score combining all components.
 * Final score is clamped to [0, 100].
 */
export function calculatePostureScore(params: PostureScoreParams): PostureScoreResult {
  const { findings, scannedServices, totalServices, previousCounts, now = new Date() } = params;

  // Filter out suppressed findings for scoring
  const activeFindings = findings.filter(f => !f.suppressed);
  const suppressedCount = findings.length - activeFindings.length;

  // Count severities from active findings only
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of activeFindings) {
    const sev = (f.severity || '').toLowerCase();
    if (sev === 'critical') counts.critical++;
    else if (sev === 'high') counts.high++;
    else if (sev === 'medium') counts.medium++;
    else if (sev === 'low') counts.low++;
  }

  const baseScore = calculateBaseScore(counts);
  const timeExposurePenalty = calculateTimeExposurePenalty(activeFindings, now);
  const serviceCoverageBonus = calculateServiceCoverageBonus(scannedServices, totalServices);
  const trend = calculateTrendAdjustment(counts, previousCounts);

  const raw = baseScore - timeExposurePenalty + serviceCoverageBonus + trend.adjustment;
  const overallScore = parseFloat(Math.max(0, Math.min(100, raw)).toFixed(1));

  let riskLevel: string;
  if (overallScore >= 80) riskLevel = 'low';
  else if (overallScore >= 60) riskLevel = 'medium';
  else if (overallScore >= 40) riskLevel = 'high';
  else riskLevel = 'critical';

  const total = counts.critical + counts.high + counts.medium + counts.low;
  const serviceCoverage = totalServices > 0
    ? parseFloat(((Math.min(scannedServices, totalServices) / totalServices) * 100).toFixed(1))
    : 0;

  return {
    overallScore,
    riskLevel,
    breakdown: {
      baseScore: parseFloat(baseScore.toFixed(1)),
      timeExposurePenalty: parseFloat(timeExposurePenalty.toFixed(1)),
      serviceCoverageBonus: parseFloat(serviceCoverageBonus.toFixed(1)),
      trendAdjustment: parseFloat(trend.adjustment.toFixed(1)),
    },
    trend,
    counts: { ...counts, total, suppressed: suppressedCount },
    serviceCoverage,
  };
}
