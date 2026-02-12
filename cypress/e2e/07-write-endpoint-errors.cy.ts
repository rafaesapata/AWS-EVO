/**
 * Write Endpoint Error Format - Validates that mutation endpoints (safe: false)
 * return proper error structure when called with empty/invalid body.
 * Complements 04-response-format which only tests safe read-only endpoints.
 */
import { HTTP_LAMBDAS } from '../support/lambda-registry';
import { expectNoCrash, expectErrorStructure } from '../support/e2e';

describe('Write Endpoint Error Responses', () => {
  // All non-safe HTTP endpoints that require auth
  const writeEndpoints = HTTP_LAMBDAS.filter(l => !l.safe && l.auth === 'cognito');

  writeEndpoints.forEach((lambda) => {
    it(`${lambda.name}: should return structured error with empty body`, () => {
      cy.apiPost(lambda.name, {}).then((res) => {
        expectNoCrash(res, lambda.name);
        expectErrorStructure(res, lambda.name);

        // 200 is also acceptable (some endpoints have defaults or list actions)
        // But 500 is not — that indicates unhandled error
        expect(res.status, `${lambda.name} should not return 500`).to.not.eq(500);
      });
    });
  });
});
