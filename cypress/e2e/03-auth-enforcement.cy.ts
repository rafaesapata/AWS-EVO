/**
 * Auth Enforcement - Ensures protected endpoints reject unauthenticated requests
 * and public endpoints accept them.
 * Tests ALL protected HTTP endpoints, not a sample.
 */
import { HTTP_LAMBDAS } from '../support/lambda-registry';

describe('Auth Enforcement', () => {
  describe('Protected endpoints should reject unauthenticated requests', () => {
    const protectedEndpoints = HTTP_LAMBDAS.filter(l => l.auth === 'cognito');

    protectedEndpoints.forEach((lambda) => {
      it(`${lambda.name}: should return 401 without auth token`, () => {
        cy.apiPostPublic(lambda.name, {}).then((res) => {
          expect(res.status, `${lambda.name} should reject unauthenticated request`).to.eq(401);
        });
      });
    });
  });

  describe('Public endpoints should accept unauthenticated requests', () => {
    const publicEndpoints = HTTP_LAMBDAS.filter(l => l.auth === 'none');

    publicEndpoints.forEach((lambda) => {
      it(`${lambda.name}: should NOT return 401`, () => {
        cy.apiPostPublic(lambda.name, {}).then((res) => {
          expect(res.status, `${lambda.name} should not require auth`).to.not.eq(401);
        });
      });
    });
  });
});
