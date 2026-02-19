/**
 * Property Test: Multi-tenant isolation for budget filtering
 *
 * Feature: budget-management-redesign, Property 6: Isolamento multi-tenant
 * Validates: Requirements 5.1, 5.2
 *
 * Tests the pure filtering logic that ensures querying budgets for one
 * organization never returns data from another organization.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Pure logic: multi-tenant budget filtering ───

interface BudgetRecord {
  organization_id: string;
  cloud_provider: string;
  year_month: string;
  amount: number;
}

/**
 * Simulates the multi-tenant filtering logic from manage-cloud-budget.
 * Filters records by org+provider and returns the most recent (vigente).
 */
function filterByOrg(
  records: BudgetRecord[],
  orgId: string,
  provider: string
): BudgetRecord | null {
  const filtered = records
    .filter(r => r.organization_id === orgId && r.cloud_provider === provider)
    .sort((a, b) => b.year_month.localeCompare(a.year_month));
  return filtered[0] ?? null;
}

// ─── Generators ───

const orgIdArb = fc.uuid();

const providerArb = fc.constantFrom('AWS', 'AZURE');

const yearMonthArb = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),
  fc.integer({ min: 1, max: 12 })
).map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`);

const amountArb = fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true })
  .filter(v => v > 0);

/** Generates a budget record for a specific org */
const budgetRecordForOrg = (orgId: fc.Arbitrary<string>) =>
  fc.record({
    organization_id: orgId,
    cloud_provider: providerArb,
    year_month: yearMonthArb,
    amount: amountArb,
  });

/** Generates a pair of distinct org IDs */
const distinctOrgPairArb = fc.tuple(orgIdArb, orgIdArb).filter(([a, b]) => a !== b);

// ─── Property Tests ───

// Feature: budget-management-redesign, Property 6: Isolamento multi-tenant
// Validates: Requirements 5.1, 5.2
describe('Property 6: Isolamento multi-tenant', () => {
  it('querying org A never returns data belonging to org B', () => {
    fc.assert(
      fc.property(
        distinctOrgPairArb,
        providerArb,
        fc.array(yearMonthArb, { minLength: 1, maxLength: 5 }),
        fc.array(yearMonthArb, { minLength: 1, maxLength: 5 }),
        ([orgA, orgB], provider, ymsA, ymsB) => {
          // Build records for both orgs with the same provider
          const recordsA: BudgetRecord[] = ymsA.map((ym, i) => ({
            organization_id: orgA,
            cloud_provider: provider,
            year_month: ym,
            amount: (i + 1) * 1000,
          }));
          const recordsB: BudgetRecord[] = ymsB.map((ym, i) => ({
            organization_id: orgB,
            cloud_provider: provider,
            year_month: ym,
            amount: (i + 1) * 500 + 1,
          }));

          const allRecords = [...recordsA, ...recordsB];

          // Query for org A
          const resultA = filterByOrg(allRecords, orgA, provider);
          // Query for org B
          const resultB = filterByOrg(allRecords, orgB, provider);

          // Org A result must belong to org A
          if (resultA !== null) {
            expect(resultA.organization_id).toBe(orgA);
            expect(resultA.organization_id).not.toBe(orgB);
          }

          // Org B result must belong to org B
          if (resultB !== null) {
            expect(resultB.organization_id).toBe(orgB);
            expect(resultB.organization_id).not.toBe(orgA);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('filtering is strict — no cross-contamination even with same provider and month', () => {
    fc.assert(
      fc.property(
        distinctOrgPairArb,
        providerArb,
        yearMonthArb,
        amountArb,
        amountArb,
        ([orgA, orgB], provider, sharedYm, amountA, amountB) => {
          // Both orgs have a budget for the exact same provider+month
          const records: BudgetRecord[] = [
            { organization_id: orgA, cloud_provider: provider, year_month: sharedYm, amount: amountA },
            { organization_id: orgB, cloud_provider: provider, year_month: sharedYm, amount: amountB },
          ];

          const resultA = filterByOrg(records, orgA, provider);
          const resultB = filterByOrg(records, orgB, provider);

          expect(resultA).not.toBeNull();
          expect(resultB).not.toBeNull();
          expect(resultA!.organization_id).toBe(orgA);
          expect(resultA!.amount).toBe(amountA);
          expect(resultB!.organization_id).toBe(orgB);
          expect(resultB!.amount).toBe(amountB);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('querying a non-existent org returns null even when other orgs have data', () => {
    fc.assert(
      fc.property(
        fc.tuple(orgIdArb, orgIdArb, orgIdArb).filter(([a, b, c]) => a !== c && b !== c),
        providerArb,
        yearMonthArb,
        amountArb,
        ([orgA, orgB, orgC], provider, ym, amount) => {
          // Only org A and B have records
          const records: BudgetRecord[] = [
            { organization_id: orgA, cloud_provider: provider, year_month: ym, amount },
            { organization_id: orgB, cloud_provider: provider, year_month: ym, amount },
          ];

          // Querying org C (no records) must return null
          const resultC = filterByOrg(records, orgC, provider);
          expect(resultC).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
