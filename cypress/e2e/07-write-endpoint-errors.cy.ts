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

        // Write endpoints with empty body should return 400/422, not 500
        // 200 is also acceptable (some endpoints have defaults or list actions)
        // 500 means unhandled error — the handler has a bug
        expect(
          res.status,
          `${lambda.name} returned 500 with empty body — handler should validate input and return 400`
        ).to.not.eq(500);
      });
    });
  });
});
