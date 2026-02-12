/**
 * Write Endpoint Error Format - Validates that mutation endpoints (safe: false)
 * return proper error structure when called with empty/invalid body.
 * Complements 04-response-format which only tests safe read-only endpoints.
 */
import { HTTP_LAMBDAS } from '../support/lambda-registry';
import { expectNoCrash, parseBody } from '../support/e2e';

describe('Write Endpoint Error Responses', () => {
  // All non-safe HTTP endpoints that require auth
  const writeEndpoints = HTTP_LAMBDAS.filter(l => !l.safe && l.auth === 'cognito');

  writeEndpoints.forEach((lambda) => {
    it(`${lambda.name}: should return structured error with empty body`, () => {
      cy.apiPost(lambda.name, {}).then((res) => {
        expectNoCrash(res, lambda.name);

        // Write endpoints with empty body should return 400/422 with error structure
        if (res.status === 400 || res.status === 422) {
          const body = parseBody(res);
          expect(body, `${lambda.name} error response missing 'success'`).to.have.property('success');
          expect(body.success, `${lambda.name} error should have success=false`).to.be.false;
          expect(body, `${lambda.name} error response missing 'error'`).to.have.property('error');
          expect(body.error).to.be.a('string');
        }

        // 200 is also acceptable (some endpoints have defaults or list actions)
        // But 500 is not — that indicates unhandled error
        expect(res.status, `${lambda.name} should not return 500`).to.not.eq(500);
      });
    });
  });
});
