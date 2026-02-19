/**
 * Motor de Comparação de Findings
 * 
 * Biblioteca pura (sem side effects) para comparação de findings entre scans.
 * Classifica findings em: novos, resolvidos e persistentes baseado no fingerprint.
 */

export interface FindingInput {
  fingerprint: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  resourceId?: string;
  resourceType?: string;
  category?: string;
  resolved_at?: Date | string | null;
  status?: string;
}

export interface ComparisonInput {
  currentFindings: FindingInput[];
  previousFindings: FindingInput[];
}

export interface FindingSummary {
  title: string;
  severity: string;
  resourceId?: string;
  resourceType?: string;
  category?: string;
}

export interface SeveritySummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface ComparisonResult {
  newFindings: FindingInput[];
  resolvedFindings: FindingInput[];
  persistentFindings: FindingInput[];
  summary: {
    newCount: number;
    resolvedCount: number;
    persistentCount: number;
    previousTotal: number;
    currentTotal: number;
    changePercentage: number;
  };
}

/**
 * Calcula resumo de severidade para um conjunto de findings.
 */
export function calculateSeveritySummary(findings: FindingInput[]): SeveritySummary {
  const summary: SeveritySummary = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };

  for (const finding of findings) {
    summary.total++;
    switch (finding.severity) {
      case 'critical': summary.critical++; break;
      case 'high': summary.high++; break;
      case 'medium': summary.medium++; break;
      case 'low': summary.low++; break;
    }
  }

  return summary;
}

/**
 * Compara findings entre scan atual e anterior.
 * 
 * - Novo: fingerprint presente no atual, ausente no anterior
 * - Resolvido: fingerprint presente no anterior mas ausente no atual, OU com resolved_at preenchido
 * - Persistente: fingerprint presente em ambos os scans
 */
export function compareFindings(input: ComparisonInput): ComparisonResult {
  const { currentFindings, previousFindings } = input;

  const currentByFingerprint = new Map<string, FindingInput>();
  for (const f of currentFindings) {
    currentByFingerprint.set(f.fingerprint, f);
  }

  const previousByFingerprint = new Map<string, FindingInput>();
  for (const f of previousFindings) {
    previousByFingerprint.set(f.fingerprint, f);
  }

  const newFindings: FindingInput[] = [];
  const persistentFindings: FindingInput[] = [];
  const resolvedFindings: FindingInput[] = [];

  // Classify current findings
  for (const finding of currentFindings) {
    if (previousByFingerprint.has(finding.fingerprint)) {
      persistentFindings.push(finding);
    } else {
      newFindings.push(finding);
    }
  }

  // Classify previous findings as resolved
  for (const finding of previousFindings) {
    if (!currentByFingerprint.has(finding.fingerprint)) {
      resolvedFindings.push(finding);
    } else if (finding.resolved_at) {
      // fingerprint in both but resolved_at is filled → also resolved
      resolvedFindings.push(finding);
    }
  }

  const previousTotal = previousFindings.length;
  const currentTotal = currentFindings.length;
  const changePercentage = previousTotal === 0
    ? (currentTotal > 0 ? 100 : 0)
    : ((currentTotal - previousTotal) / previousTotal) * 100;

  return {
    newFindings,
    resolvedFindings,
    persistentFindings,
    summary: {
      newCount: newFindings.length,
      resolvedCount: resolvedFindings.length,
      persistentCount: persistentFindings.length,
      previousTotal,
      currentTotal,
      changePercentage,
    },
  };
}
