/**
 * Auth Enforcement - Comprehensive auth validation:
 * 1. Protected endpoints reject unauthenticated requests (no token)
 * 2. Protected endpoints reject malformed/invalid tokens
 * 3. Public endpoints accept unauthenticated requests
 * 4. HTTP endpoints reject invalid HTTP methods (only POST allowed)
 */
import { HTTP_LAMBDAS, PUBLIC_LAMBDAS } from '../support/lambda-registry';
import { expectNoCrash, INVALID_METHODS, FAKE_EXPIRED_JWT, sampleOnePerDomain } from '../support/e2e';

describe('Auth Enforcement', () => {
  // ── Missing Token ────────────────────────────────────────────────────────
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

  // ── Invalid/Malformed Tokens ──────────────────────────────────────────────
  describe('Protected endpoints should reject invalid tokens', () => {
    const samples = sampleOnePerDomain(HTTP_LAMBDAS).slice(0, 5);

    samples.forEach((lambda) => {
      it(`${lambda.name}: should return 401 with malformed token`, () => {
        cy.apiPostInvalidToken(lambda.name, 'garbage-not-a-jwt', {}).then((res) => {
          expect(res.status, `${lambda.name} should reject malformed token`).to.eq(401);
        });
      });

      it(`${lambda.name}: should return 401 with expired-format token`, () => {
        cy.apiPostInvalidToken(lambda.name, FAKE_EXPIRED_JWT, {}).then((res) => {
          expect(res.status, `${lambda.name} should reject expired/invalid JWT`).to.eq(401);
        });
      });
    });
  });

  // ── Public Endpoints ─────────────────────────────────────────────────────
  describe('Public endpoints should accept unauthenticated requests', () => {
    const publicEndpoints = PUBLIC_LAMBDAS.filter(l => l.type === 'http');

    publicEndpoints.forEach((lambda) => {
      it(`${lambda.name}: should NOT return 401`, () => {
        cy.apiPostPublic(lambda.name, {}).then((res) => {
          expect(res.status, `${lambda.name} should not require auth`).to.not.eq(401);
        });
      });
    });
  });

  // ── Invalid HTTP Methods ─────────────────────────────────────────────────
  describe('HTTP endpoints should reject invalid methods', () => {
    sampleOnePerDomain(HTTP_LAMBDAS).forEach((lambda) => {
      INVALID_METHODS.forEach((method) => {
        it(`${lambda.name}: ${method} should not return 200`, () => {
          cy.apiRequest(lambda.name, method, {}).then((res) => {
            expectNoCrash(res, `${lambda.name} ${method}`);
            // Platform only supports POST — other methods should be rejected or at least not succeed
            expect(res.status, `${lambda.name} should not accept ${method}`).to.not.eq(200);
          });
        });
      });
    });
  });
});
