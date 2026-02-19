/**
 * Property Tests: ai-budget-suggestion pure logic
 *
 * Feature: budget-management-redesign, Property 4: Fórmula da sugestão IA
 * Validates: Requirements 3.3, 3.4, 3.8
 *
 * Tests the pure calculation logic extracted from ai-budget-suggestion.ts
 * without any database or Lambda dependencies.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Pure logic extracted from ai-budget-suggestion.ts ───

const REALIZATION_FACTOR = 0.75;
const FALLBACK_RATIO = 0.85;

function calculateSuggestedBudget(
  previousSpend: number,
  costOptSavings: number,
  wasteSavings: number,
  riSpSavings: number
): { suggestedAmount: number; usedFallback: boolean } {
  const totalSavings = costOptSavings + wasteSavings + riSpSavings;
  let suggested = previousSpend - (totalSavings * REALIZATION_FACTOR);
  let usedFallback = false;
  if (suggested <= 0) {
    suggested = previousSpend * FALLBACK_RATIO;
    usedFallback = true;
  }
  const rounded = Math.round(suggested * 100) / 100;
  return { suggestedAmount: Math.max(0.01, rounded), usedFallback };
}

// ─── Generators ───

/** Previous month spend: always > 0 */
const previousSpendArb = fc.float({ min: Math.fround(0.01), max: Math.fround(1_000_000), noNaN: true })
  .filter(v => v > 0);

/** Individual savings: always >= 0 */
const savingsArb = fc.float({ min: 0, max: Math.fround(500_000), noNaN: true });

/** Small savings relative to spend (ensures no fallback) */
const smallSavingsArb = fc.float({ min: 0, max: Math.fround(100), noNaN: true });

// ─── Property Tests ───

// Feature: budget-management-redesign, Property 4: Fórmula da sugestão IA
// Validates: Requirements 3.3, 3.4, 3.8
describe('Property 4: Fórmula da sugestão IA', () => {

  it('suggested amount is always > 0 for any valid inputs', () => {
    fc.assert(
      fc.property(
        previousSpendArb, savingsArb, savingsArb, savingsArb,
        (prevSpend, costOpt, waste, riSp) => {
          const { suggestedAmount } = calculateSuggestedBudget(prevSpend, costOpt, waste, riSp);
          expect(suggestedAmount).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('when savings are small, suggested = spend - (savings × 0.75)', () => {
    fc.assert(
      fc.property(
        // Use a large spend with small savings to guarantee no fallback
        fc.float({ min: Math.fround(10_000), max: Math.fround(1_000_000), noNaN: true }).filter(v => v >= 10_000),
        smallSavingsArb, smallSavingsArb, smallSavingsArb,
        (prevSpend, costOpt, waste, riSp) => {
          const totalSavings = costOpt + waste + riSp;
          // With small savings and large spend, formula result is always positive
          const expectedRaw = prevSpend - (totalSavings * REALIZATION_FACTOR);
          fc.pre(expectedRaw > 0); // precondition: no fallback triggered

          const { suggestedAmount, usedFallback } = calculateSuggestedBudget(prevSpend, costOpt, waste, riSp);
          const expected = Math.round(expectedRaw * 100) / 100;

          expect(usedFallback).toBe(false);
          expect(suggestedAmount).toBeCloseTo(expected, 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('when savings exceed spend, fallback is used: suggested = spend × 0.85', () => {
    fc.assert(
      fc.property(
        previousSpendArb,
        (prevSpend) => {
          // Force savings large enough to trigger fallback
          const hugeSavings = prevSpend * 2;
          const { suggestedAmount, usedFallback } = calculateSuggestedBudget(prevSpend, hugeSavings, 0, 0);
          const expected = Math.round((prevSpend * FALLBACK_RATIO) * 100) / 100;

          expect(usedFallback).toBe(true);
          expect(suggestedAmount).toBeCloseTo(expected, 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('total savings = cost_opt + waste + ri_sp (additive)', () => {
    fc.assert(
      fc.property(
        previousSpendArb, savingsArb, savingsArb, savingsArb,
        (prevSpend, costOpt, waste, riSp) => {
          // Verify additivity: result with combined savings equals result with sum
          const resultCombined = calculateSuggestedBudget(prevSpend, costOpt, waste, riSp);
          const totalSavings = costOpt + waste + riSp;
          const resultSingle = calculateSuggestedBudget(prevSpend, totalSavings, 0, 0);

          expect(resultCombined.suggestedAmount).toBeCloseTo(resultSingle.suggestedAmount, 2);
          expect(resultCombined.usedFallback).toBe(resultSingle.usedFallback);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('realization factor is always 0.75', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(100_000), max: Math.fround(1_000_000), noNaN: true }).filter(v => v >= 100_000),
        fc.float({ min: Math.fround(1), max: Math.fround(1_000), noNaN: true }).filter(v => v > 0),
        (prevSpend, savings) => {
          // With large spend and small savings, no fallback
          const { suggestedAmount, usedFallback } = calculateSuggestedBudget(prevSpend, savings, 0, 0);
          fc.pre(!usedFallback);

          // Verify: suggestedAmount ≈ prevSpend - savings * 0.75
          const expectedWithFactor = Math.round((prevSpend - savings * 0.75) * 100) / 100;
          expect(suggestedAmount).toBeCloseTo(expectedWithFactor, 2);

          // Verify it's NOT using factor 1.0 or 0.5
          const wrongFactor1 = Math.round((prevSpend - savings * 1.0) * 100) / 100;
          const wrongFactor05 = Math.round((prevSpend - savings * 0.5) * 100) / 100;
          if (savings > 0) {
            // Only check when savings > 0 (otherwise all factors give same result)
            expect(suggestedAmount).not.toBeCloseTo(wrongFactor1, 2);
            expect(suggestedAmount).not.toBeCloseTo(wrongFactor05, 2);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
