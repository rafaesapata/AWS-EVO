/**
 * Auth Enforcement - Ensures protected endpoints reject unauthenticated requests
 * and public endpoints accept them
 */
import { HTTP_LAMBDAS } from '../support/lambda-registry';

describe('Auth Enforcement', () => {
  describe('Protected endpoints should reject unauthenticated requests', () => {
    // Sample protected endpoints across all domains
    const protectedSample = HTTP_LAMBDAS
      .filter(l => l.auth === 'cognito')
      .slice(0, 30)
      .map(l => l.name);

    protectedSample.forEach((name) => {
      it(`${name}: should return 401 without auth token`, () => {
        cy.apiPostPublic(name, {}).then((res) => {
          // API Gateway returns 401 for missing/invalid JWT
          expect(res.status).to.eq(401);
        });
      });
    });
  });

  describe('Public endpoints should accept unauthenticated requests', () => {
    const publicEndpoints = HTTP_LAMBDAS.filter(l => l.auth === 'none');

    publicEndpoints.forEach((lambda) => {
      it(`${lambda.name}: should NOT return 401`, () => {
        cy.apiPostPublic(lambda.name, {}).then((res) => {
          expect(res.status).to.not.eq(401);
        });
      });
    });
  });
});
