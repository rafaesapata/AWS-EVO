/**
 * Property Test: Particionamento correto de findings na comparação (Property 7)
 * Feature: scheduled-service-reports
 * 
 * Validates: Requirements 3.2, 3.3, 3.4
 * 
 * Para quaisquer dois conjuntos de findings (atual e anterior), o Motor de Comparação
 * deve particionar os findings em exatamente três categorias disjuntas baseadas no fingerprint:
 * "novos" (fingerprint apenas no atual), "resolvidos" (fingerprint apenas no anterior ou
 * com resolved_at preenchido), e "persistentes" (fingerprint em ambos).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  compareFindings,
  type FindingInput,
} from '../../src/lib/report-comparison-engine.js';

// --- Generators ---

const severityArb = fc.constantFrom('critical', 'high', 'medium', 'low') as fc.Arbitrary<FindingInput['severity']>;

const findingArb = (fingerprint: string): fc.Arbitrary<FindingInput> =>
  fc.record({
    fingerprint: fc.constant(fingerprint),
    severity: severityArb,
    title: fc.string({ minLength: 1, maxLength: 50 }),
    resourceId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    resourceType: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    category: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    resolved_at: fc.constant(null),
    status: fc.option(fc.constantFrom('open', 'resolved', 'suppressed'), { nil: undefined }),
  });

/**
 * Generates two arrays of findings with controlled fingerprint overlap.
 * Uses unique fingerprints per array to avoid duplicate fingerprint issues within a single scan.
 */
const comparisonInputArb = fc.gen().chain(gen => {
  const onlyCurrent = gen(fc.integer, { min: 0, max: 10 });
  const onlyPrevious = gen(fc.integer, { min: 0, max: 10 });
  const shared = gen(fc.integer, { min: 0, max: 10 });

  const currentOnlyFingerprints = Array.from({ length: onlyCurrent }, (_, i) => `current-only-${i}`);
  const previousOnlyFingerprints = Array.from({ length: onlyPrevious }, (_, i) => `previous-only-${i}`);
  const sharedFingerprints = Array.from({ length: shared }, (_, i) => `shared-${i}`);

  const currentFindingsArb = fc.tuple(
    ...currentOnlyFingerprints.map(fp => findingArb(fp)),
    ...sharedFingerprints.map(fp => findingArb(fp)),
  );

  const previousFindingsArb = fc.tuple(
    ...previousOnlyFingerprints.map(fp => findingArb(fp)),
    ...sharedFingerprints.map(fp => findingArb(fp)),
  );

  return fc.tuple(currentFindingsArb, previousFindingsArb).map(([current, previous]) => ({
    currentFindings: current as FindingInput[],
    previousFindings: previous as FindingInput[],
    expectedNewCount: onlyCurrent,
    expectedPersistentCount: shared,
    expectedResolvedFromAbsence: onlyPrevious,
    sharedCount: shared,
  }));
});

// --- Property Tests ---

describe('Property 7: Particionamento correto de findings na comparação', () => {
  /**
   * **Validates: Requirements 3.2, 3.3, 3.4**
   * 
   * New findings = fingerprint only in current.
   * Resolved findings = fingerprint only in previous (or resolved_at filled).
   * Persistent findings = fingerprint in both.
   * The three categories must be disjoint by fingerprint (from current scan perspective).
   */
  it('should partition findings into disjoint categories with consistent counts', () => {
    fc.assert(
      fc.property(comparisonInputArb, ({ currentFindings, previousFindings, expectedNewCount, expectedPersistentCount, expectedResolvedFromAbsence }) => {
        const result = compareFindings({ currentFindings, previousFindings });

        // New findings: fingerprint only in current
        expect(result.newFindings.length).toBe(expectedNewCount);

        // Persistent findings: fingerprint in both
        expect(result.persistentFindings.length).toBe(expectedPersistentCount);

        // Resolved findings: at least those only in previous (could be more if resolved_at is set)
        expect(result.resolvedFindings.length).toBeGreaterThanOrEqual(expectedResolvedFromAbsence);

        // Summary counts match array lengths
        expect(result.summary.newCount).toBe(result.newFindings.length);
        expect(result.summary.resolvedCount).toBe(result.resolvedFindings.length);
        expect(result.summary.persistentCount).toBe(result.persistentFindings.length);

        // Current findings are fully partitioned into new + persistent
        expect(result.newFindings.length + result.persistentFindings.length).toBe(currentFindings.length);

        // Totals match
        expect(result.summary.currentTotal).toBe(currentFindings.length);
        expect(result.summary.previousTotal).toBe(previousFindings.length);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 3.2, 3.3, 3.4**
   * 
   * Fingerprints in newFindings must not appear in previousFindings.
   * Fingerprints in persistentFindings must appear in both.
   */
  it('should correctly classify fingerprints based on set membership', () => {
    fc.assert(
      fc.property(comparisonInputArb, ({ currentFindings, previousFindings }) => {
        const result = compareFindings({ currentFindings, previousFindings });

        const previousFps = new Set(previousFindings.map(f => f.fingerprint));
        const currentFps = new Set(currentFindings.map(f => f.fingerprint));

        // Every new finding's fingerprint must NOT be in previous
        for (const f of result.newFindings) {
          expect(previousFps.has(f.fingerprint)).toBe(false);
        }

        // Every persistent finding's fingerprint must be in BOTH
        for (const f of result.persistentFindings) {
          expect(previousFps.has(f.fingerprint)).toBe(true);
          expect(currentFps.has(f.fingerprint)).toBe(true);
        }

        // Every resolved finding's fingerprint must be only-in-previous OR have resolved_at
        for (const f of result.resolvedFindings) {
          const onlyInPrevious = !currentFps.has(f.fingerprint);
          const hasResolvedAt = !!f.resolved_at;
          expect(onlyInPrevious || hasResolvedAt).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 3.2, 3.3, 3.4**
   * 
   * New and persistent categories from current scan must be disjoint (no fingerprint overlap).
   */
  it('should produce disjoint new and persistent sets', () => {
    fc.assert(
      fc.property(comparisonInputArb, ({ currentFindings, previousFindings }) => {
        const result = compareFindings({ currentFindings, previousFindings });

        const newFps = new Set(result.newFindings.map(f => f.fingerprint));
        const persistentFps = new Set(result.persistentFindings.map(f => f.fingerprint));

        // No overlap between new and persistent
        for (const fp of newFps) {
          expect(persistentFps.has(fp)).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });
});
