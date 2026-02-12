/**
 * Health Check - ALL HTTP Lambdas (148+)
 * Validates every lambda with an API route is reachable and not crashing (502/503)
 * This is the most critical test - catches dependency issues, import errors, crashes
 */
import { HTTP_LAMBDAS, type LambdaDefinition } from '../support/lambda-registry';

describe('Lambda Health Check - All HTTP Endpoints', () => {
  // Group by domain for organized output
  const byDomain = HTTP_LAMBDAS.reduce<Record<string, LambdaDefinition[]>>((acc, l) => {
    (acc[l.domain] = acc[l.domain] || []).push(l);
    return acc;
  }, {});

  Object.entries(byDomain).forEach(([domain, lambdas]) => {
    describe(`Domain: ${domain} (${lambdas.length} lambdas)`, () => {
      lambdas.forEach((lambda) => {
        it(`[${lambda.auth === 'none' ? 'PUBLIC' : 'AUTH'}] ${lambda.name} - should not crash (no 502/503)`, () => {
          if (lambda.auth === 'none') {
            cy.apiPostPublic(lambda.name, {}).then((response) => {
              expect(
                [502, 503].includes(response.status),
                `${lambda.name} crashed with ${response.status}: ${JSON.stringify(response.body).substring(0, 300)}`
              ).to.be.false;
            });
          } else {
            cy.validateLambdaHealth(lambda.name);
          }
        });
      });
    });
  });
});
