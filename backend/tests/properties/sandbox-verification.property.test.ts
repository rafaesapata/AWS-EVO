/**
 * Property Tests: Sandbox Verification Cross-Account Parity
 *
 * Validates correctness properties from the sandbox-environment-setup spec:
 * - Property 1: Lambda Function Parity
 * - Property 2: Lambda Environment Variable Parity
 * - Property 3: API Gateway Route Parity
 * - Property 5: SSM Parameter Parity
 * - Property 8: Verification Script PASS/FAIL Output
 * - Property 9: Expected Differences Ignored
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  compareLambdaLists,
  compareEnvVars,
  detectProdDomainRefs,
  compareApiRoutes,
  compareSsmParameters,
  filterExpectedDifferences,
  generateCheckSummary,
  KNOWN_SUBSTITUTIONS,
  EXPECTED_DIFFERENCES,
  type LambdaInfo,
  type EnvVarMap,
  type ApiRoute,
  type SsmParameter,
  type CheckResult,
  type Difference,
} from '../../src/lib/sandbox-verification.js';

const lambdaNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/);
const envKeyArb = fc.stringMatching(/^[A-Z][A-Z0-9_]{1,30}$/);
const envValueArb = fc.string({ minLength: 1, maxLength: 50 });
const httpMethodArb = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH');
const apiPathArb = fc.stringMatching(/^\/[a-z][a-z0-9/-]{1,30}$/);

/** Helper: fc.set returns Set, convert to array */
const uniqueNamesArb = (min: number, max: number) =>
  fc.set(lambdaNameArb, { minLength: min, maxLength: max }).map((s) => [...s]);

describe('Property 1: Lambda Function Parity', () => {
  it('should detect all missing Lambdas in sandbox', () => {
    fc.assert(
      fc.property(
        uniqueNamesArb(1, 20),
        uniqueNamesArb(0, 20),
        (prodNames, extraSandboxNames) => {
          const subsetSize = Math.floor(Math.random() * prodNames.length);
          const sandboxSubset = prodNames.slice(0, subsetSize);
          const sandboxNames = [...new Set([...sandboxSubset, ...extraSandboxNames])];

          const prodLambdas: LambdaInfo[] = prodNames.map((n) => ({ name: `prod-${n}` }));
          const sandboxLambdas: LambdaInfo[] = sandboxNames.map((n) => ({ name: `sandbox-${n}` }));

          const result = compareLambdaLists(sandboxLambdas, prodLambdas, 'sandbox-', 'prod-');

          const expectedMissing = prodNames.filter((n) => !sandboxNames.includes(n));

          if (expectedMissing.length === 0) {
            expect(result.status).toBe('PASS');
          } else {
            expect(result.status).toBe('FAIL');
            expect(result.details).toBeDefined();
            expect(result.details!.length).toBe(expectedMissing.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should PASS when sandbox has all prod Lambdas', () => {
    fc.assert(
      fc.property(
        uniqueNamesArb(1, 20),
        (names) => {
          const prodLambdas: LambdaInfo[] = names.map((n) => ({ name: `prod-${n}` }));
          const sandboxLambdas: LambdaInfo[] = names.map((n) => ({ name: `sandbox-${n}` }));

          const result = compareLambdaLists(sandboxLambdas, prodLambdas, 'sandbox-', 'prod-');
          expect(result.status).toBe('PASS');
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 2: Lambda Environment Variable Parity', () => {
  it('should only flag differences outside known substitutions', () => {
    fc.assert(
      fc.property(
        fc.dictionary(envKeyArb, envValueArb, { minKeys: 1, maxKeys: 10 }),
        (prodEnvVars) => {
          // Create sandbox env vars: same as prod for non-substitution keys
          const sandboxEnvVars: EnvVarMap = {};
          for (const [key, value] of Object.entries(prodEnvVars)) {
            if (KNOWN_SUBSTITUTIONS.has(key)) {
              sandboxEnvVars[key] = `sandbox-${value}`;
            } else {
              sandboxEnvVars[key] = value;
            }
          }

          const result = compareEnvVars(sandboxEnvVars, prodEnvVars);
          // Should PASS because all non-substitution keys match
          expect(result.status).toBe('PASS');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should detect production domain references except WEBAUTHN_RP_ID', () => {
    fc.assert(
      fc.property(
        fc.dictionary(envKeyArb, envValueArb, { minKeys: 0, maxKeys: 5 }),
        (baseEnvVars) => {
          // Add a prod domain reference
          const envVars: EnvVarMap = {
            ...baseEnvVars,
            SOME_URL: 'https://api.evo.nuevacore.com/test',
            WEBAUTHN_RP_ID: 'nuevacore.com',
          };

          const result = detectProdDomainRefs(envVars);
          // SOME_URL should be flagged, WEBAUTHN_RP_ID should not
          expect(result.status).toBe('FAIL');
          expect(result.details).toBeDefined();
          const flaggedKeys = result.details!.map((d) => d.split(' ')[0]);
          expect(flaggedKeys).toContain('SOME_URL');
          expect(flaggedKeys).not.toContain('WEBAUTHN_RP_ID');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should PASS when no production domain references exist', () => {
    fc.assert(
      fc.property(
        fc.dictionary(envKeyArb, fc.constant('https://sandbox.example.com'), { minKeys: 0, maxKeys: 10 }),
        (envVars) => {
          const result = detectProdDomainRefs(envVars);
          expect(result.status).toBe('PASS');
        }
      ),
      { numRuns: 100 }
    );
  });
});

const uniqueRoutesArb = (min: number, max: number) =>
  fc.set(
    fc.record({ method: httpMethodArb, path: apiPathArb }),
    { minLength: min, maxLength: max, compare: { selector: (r: ApiRoute) => `${r.method} ${r.path}` } }
  ).map((s) => [...s]);

describe('Property 3: API Gateway Route Parity', () => {
  it('should detect all missing routes in sandbox', () => {
    fc.assert(
      fc.property(
        uniqueRoutesArb(1, 15),
        (prodRoutes) => {
          const subsetSize = Math.floor(Math.random() * prodRoutes.length);
          const sandboxRoutes = prodRoutes.slice(0, subsetSize);

          const result = compareApiRoutes(sandboxRoutes, prodRoutes);
          const expectedMissing = prodRoutes.length - sandboxRoutes.length;

          if (expectedMissing === 0) {
            expect(result.status).toBe('PASS');
          } else {
            expect(result.status).toBe('FAIL');
            expect(result.details!.length).toBe(expectedMissing);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should PASS when sandbox has all prod routes', () => {
    fc.assert(
      fc.property(
        uniqueRoutesArb(1, 15),
        (routes) => {
          const result = compareApiRoutes(routes, routes);
          expect(result.status).toBe('PASS');
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 5: SSM Parameter Parity', () => {
  it('should detect all missing SSM parameters in sandbox', () => {
    fc.assert(
      fc.property(
        uniqueNamesArb(1, 15),
        (paramNames) => {
          const subsetSize = Math.floor(Math.random() * paramNames.length);
          const sandboxSubset = paramNames.slice(0, subsetSize);

          const prodParams: SsmParameter[] = paramNames.map((n) => ({ name: `/evo/production/${n}` }));
          const sandboxParams: SsmParameter[] = sandboxSubset.map((n) => ({ name: `/evo/sandbox/${n}` }));

          const result = compareSsmParameters(sandboxParams, prodParams);
          const expectedMissing = paramNames.length - sandboxSubset.length;

          if (expectedMissing === 0) {
            expect(result.status).toBe('PASS');
          } else {
            expect(result.status).toBe('FAIL');
            expect(result.details!.length).toBe(expectedMissing);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should PASS when sandbox has all prod parameters', () => {
    fc.assert(
      fc.property(
        uniqueNamesArb(1, 15),
        (paramNames) => {
          const prodParams: SsmParameter[] = paramNames.map((n) => ({ name: `/evo/production/${n}` }));
          const sandboxParams: SsmParameter[] = paramNames.map((n) => ({ name: `/evo/sandbox/${n}` }));

          const result = compareSsmParameters(sandboxParams, prodParams);
          expect(result.status).toBe('PASS');
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 8: PASS/FAIL Output Format', () => {
  const statusArb = fc.constantFrom('PASS' as const, 'FAIL' as const, 'SKIP' as const);

  it('should produce correct counts for any set of results', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }),
            status: statusArb,
            message: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        (results: CheckResult[]) => {
          const summary = generateCheckSummary(results);

          const expectedPass = results.filter((r) => r.status === 'PASS').length;
          const expectedFail = results.filter((r) => r.status === 'FAIL').length;
          const expectedSkip = results.filter((r) => r.status === 'SKIP').length;

          expect(summary.pass).toBe(expectedPass);
          expect(summary.fail).toBe(expectedFail);
          expect(summary.skip).toBe(expectedSkip);
          expect(summary.total).toBe(results.length);
          expect(summary.pass + summary.fail + summary.skip).toBe(summary.total);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 9: Expected Differences Ignored', () => {
  it('should never include expected differences in unexpected list', () => {
    const expectedCategoryArb = fc.constantFrom(...Array.from(EXPECTED_DIFFERENCES));
    const unexpectedCategoryArb = fc.string({ minLength: 1, maxLength: 30 }).filter(
      (s) => !EXPECTED_DIFFERENCES.has(s)
    );

    fc.assert(
      fc.property(
        fc.array(
          fc.record({ category: expectedCategoryArb, detail: fc.string({ minLength: 1, maxLength: 30 }) }),
          { minLength: 0, maxLength: 10 }
        ),
        fc.array(
          fc.record({ category: unexpectedCategoryArb, detail: fc.string({ minLength: 1, maxLength: 30 }) }),
          { minLength: 0, maxLength: 10 }
        ),
        (expectedDiffs: Difference[], unexpectedDiffs: Difference[]) => {
          const allDiffs = [...expectedDiffs, ...unexpectedDiffs];
          const { unexpected, skipped } = filterExpectedDifferences(allDiffs);

          // All expected diffs should be in skipped
          expect(skipped.length).toBe(expectedDiffs.length);
          // All unexpected diffs should be in unexpected
          expect(unexpected.length).toBe(unexpectedDiffs.length);
          // No expected category should appear in unexpected
          for (const diff of unexpected) {
            expect(EXPECTED_DIFFERENCES.has(diff.category)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
