/**
 * Auth Enforcement - Comprehensive auth validation:
 * 1. Protected endpoints reject unauthenticated requests (no token)
 * 2. Protected endpoints reject malformed/invalid tokens
 * 3. Public endpoints accept unauthenticated requests
 * 4. HTTP endpoints reject invalid HTTP methods (only POST allowed)
 */
import { HTTP_LAMBDAS, PUBLIC_LAMBDAS } from '../support/lambda-registry';
import { expectNoCrash, INVALID_METHODS } from '../support/e2e';

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
    // Sample 5 protected endpoints across domains for token validation
    const sampleProtected = HTTP_LAMBDAS
      .filter(l => l.auth === 'cognito' && l.safe)
      .reduce<Record<string, typeof HTTP_LAMBDAS[0]>>((acc, l) => {
        if (!acc[l.domain]) acc[l.domain] = l;
        return acc;
      }, {});

    const samples = Object.values(sampleProtected).slice(0, 5);

    samples.forEach((lambda) => {
      it(`${lambda.name}: should return 401 with malformed token`, () => {
        cy.apiPostInvalidToken(lambda.name, 'garbage-not-a-jwt', {}).then((res) => {
          expect(res.status, `${lambda.name} should reject malformed token`).to.eq(401);
        });
      });

      it(`${lambda.name}: should return 401 with expired-format token`, () => {
        // A structurally valid but unsigned/expired JWT
        const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxfQ.invalid';
        cy.apiPostInvalidToken(lambda.name, fakeJwt, {}).then((res) => {
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
    // Sample 1 per domain to avoid 148 * 4 = 592 tests
    const methodSamples = HTTP_LAMBDAS
      .filter(l => l.auth === 'cognito' && l.safe)
      .reduce<Record<string, typeof HTTP_LAMBDAS[0]>>((acc, l) => {
        if (!acc[l.domain]) acc[l.domain] = l;
        return acc;
      }, {});

    Object.values(methodSamples).forEach((lambda) => {
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
