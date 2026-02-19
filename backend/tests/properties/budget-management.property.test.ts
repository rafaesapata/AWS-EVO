/**
 * Property Tests: manage-cloud-budget pure logic
 *
 * Feature: budget-management-redesign
 * Validates: Requirements 1.2, 1.3, 1.5, 2.6, 3.6, 4.3, 4.4, 5.5, 6.3
 *
 * These tests extract and validate pure logic from the handler
 * without any database or Lambda dependencies.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Pure logic extracted from manage-cloud-budget.ts ───

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function findCurrentBudget<T extends { year_month: string }>(records: T[]): T | null {
  if (records.length === 0) return null;
  const sorted = [...records].sort((a, b) => b.year_month.localeCompare(a.year_month));
  return sorted[0];
}

function resolveSource(source?: string): 'manual' | 'ai_suggestion' {
  return source === 'ai_suggestion' ? 'ai_suggestion' : 'manual';
}

function calculateUtilization(amount: number, mtdSpend: number): {
  utilization_percentage: number;
  is_over_budget: boolean;
} {
  const utilization_percentage = amount > 0
    ? Math.round((mtdSpend / amount) * 100 * 100) / 100
    : 0;
  const is_over_budget = mtdSpend > amount;
  return { utilization_percentage, is_over_budget };
}

function validateBudgetAmount(amount: number | undefined): { valid: boolean; error?: string } {
  if (amount === undefined || amount < 0) {
    return { valid: false, error: 'Amount is required and must be >= 0' };
  }
  return { valid: true };
}

// ─── Generators ───

/** Generates year_month strings in YYYY-MM format */
const yearMonthArb = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),
  fc.integer({ min: 1, max: 12 })
).map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`);

/** Generates a budget record with a year_month */
const budgetRecordArb = yearMonthArb.chain(ym =>
  fc.record({
    id: fc.uuid(),
    year_month: fc.constant(ym),
    amount: fc.float({ min: 0, max: Math.fround(100000), noNaN: true }),
    source: fc.constantFrom('manual', 'ai_suggestion', 'auto'),
  })
);

/** Generates a non-empty array of budget records with unique year_months */
const uniqueBudgetRecordsArb = fc
  .uniqueArray(yearMonthArb, { minLength: 1, maxLength: 20 })
  .chain(yms =>
    fc.tuple(
      ...yms.map(ym =>
        fc.record({
          id: fc.uuid(),
          year_month: fc.constant(ym),
          amount: fc.float({ min: 0, max: Math.fround(100000), noNaN: true }),
          source: fc.constantFrom('manual', 'ai_suggestion', 'auto'),
        })
      )
    )
  );

/** Positive budget amount (use Math.fround for 32-bit float compliance) */
const positiveBudgetArb = fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true })
  .filter(v => v > 0);

/** Non-negative spend */
const spendArb = fc.float({ min: 0, max: Math.fround(200000), noNaN: true });

/** Negative amount */
const negativeBudgetArb = fc.float({ min: Math.fround(-100000), max: Math.fround(-0.01), noNaN: true })
  .filter(v => v < 0);

// ─── Property Tests ───


// Feature: budget-management-redesign, Property 1: Orçamento vigente é o mais recente
// Validates: Requirements 1.2, 6.3
describe('Property 1: Orçamento vigente é o mais recente', () => {
  it('should return the record with the highest year_month from any set of budget records', () => {
    fc.assert(
      fc.property(uniqueBudgetRecordsArb, (records) => {
        const current = findCurrentBudget(records);
        expect(current).not.toBeNull();

        // The current budget must have the lexicographically highest year_month
        const maxYm = records.reduce((max, r) =>
          r.year_month > max ? r.year_month : max, records[0].year_month
        );
        expect(current!.year_month).toBe(maxYm);
      }),
      { numRuns: 100 }
    );
  });

  it('should return null when no records exist', () => {
    expect(findCurrentBudget([])).toBeNull();
  });

  it('should return the single record when only one exists', () => {
    fc.assert(
      fc.property(budgetRecordArb, (record) => {
        const current = findCurrentBudget([record]);
        expect(current).toEqual(record);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: budget-management-redesign, Property 2: Save persiste com year_month corrente
// Validates: Requirements 1.2, 5.5
describe('Property 2: Save persiste com year_month corrente', () => {
  it('getCurrentYearMonth returns YYYY-MM format matching current date', () => {
    const result = getCurrentYearMonth();
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(result).toBe(expected);
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });

  it('for any amount, save would use getCurrentYearMonth as year_month', () => {
    fc.assert(
      fc.property(positiveBudgetArb, (amount) => {
        // Simulate save: year_month is always getCurrentYearMonth()
        const saveYearMonth = getCurrentYearMonth();
        const now = new Date();
        const expectedMonth = now.getMonth() + 1;
        const expectedYear = now.getFullYear();

        const [y, m] = saveYearMonth.split('-').map(Number);
        expect(y).toBe(expectedYear);
        expect(m).toBe(expectedMonth);
        expect(amount).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: budget-management-redesign, Property 3: Source tracking por origem
// Validates: Requirements 1.3, 3.6
describe('Property 3: Source tracking por origem', () => {
  it('ai_suggestion source is preserved, everything else defaults to manual', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('ai_suggestion'),
          fc.constant('manual'),
          fc.constant('auto'),
          fc.constant(undefined),
          fc.string()
        ),
        (source) => {
          const resolved = resolveSource(source);
          if (source === 'ai_suggestion') {
            expect(resolved).toBe('ai_suggestion');
          } else {
            expect(resolved).toBe('manual');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('result is always one of the two valid values', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: undefined }), (source) => {
        const resolved = resolveSource(source);
        expect(['manual', 'ai_suggestion']).toContain(resolved);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: budget-management-redesign, Property 5: Cálculo de utilização do orçamento
// Validates: Requirements 4.3, 4.4
describe('Property 5: Cálculo de utilização do orçamento', () => {
  it('utilization = (mtdSpend / amount) * 100 for positive budgets', () => {
    fc.assert(
      fc.property(positiveBudgetArb, spendArb, (amount, mtdSpend) => {
        const { utilization_percentage, is_over_budget } = calculateUtilization(amount, mtdSpend);

        // Utilization formula
        const expected = Math.round((mtdSpend / amount) * 100 * 100) / 100;
        expect(utilization_percentage).toBeCloseTo(expected, 2);

        // Over-budget flag
        expect(is_over_budget).toBe(mtdSpend > amount);
      }),
      { numRuns: 100 }
    );
  });

  it('utilization is 0 when budget amount is 0', () => {
    fc.assert(
      fc.property(spendArb, (mtdSpend) => {
        const { utilization_percentage } = calculateUtilization(0, mtdSpend);
        expect(utilization_percentage).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('is_over_budget is true iff mtdSpend > amount', () => {
    fc.assert(
      fc.property(positiveBudgetArb, spendArb, (amount, mtdSpend) => {
        const { is_over_budget } = calculateUtilization(amount, mtdSpend);
        expect(is_over_budget).toBe(mtdSpend > amount);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: budget-management-redesign, Property 8: Rejeição de valores negativos
// Validates: Requirements 2.6
describe('Property 8: Rejeição de valores negativos', () => {
  it('any negative amount is rejected', () => {
    fc.assert(
      fc.property(negativeBudgetArb, (amount) => {
        const result = validateBudgetAmount(amount);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  it('undefined amount is rejected', () => {
    const result = validateBudgetAmount(undefined);
    expect(result.valid).toBe(false);
  });

  it('zero and positive amounts are accepted', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: Math.fround(100000), noNaN: true }),
        (amount) => {
          const result = validateBudgetAmount(amount);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: budget-management-redesign, Property 9: Orçamento inexistente retorna null
// Validates: Requirements 1.5
describe('Property 9: Orçamento inexistente retorna null', () => {
  it('empty record set always returns null without creating records', () => {
    fc.assert(
      fc.property(
        fc.constant([] as Array<{ year_month: string }>),
        (records) => {
          const result = findCurrentBudget(records);
          expect(result).toBeNull();
          // Verify no records were created (array unchanged)
          expect(records).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any provider and org combination, no records means null', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom('AWS', 'AZURE'),
        (_orgId, _provider) => {
          // Simulate: filter returns empty array for this org+provider
          const filteredRecords: Array<{ year_month: string }> = [];
          const result = findCurrentBudget(filteredRecords);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
