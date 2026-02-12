/**
 * Write Endpoint Error Format - Validates that mutation endpoints (safe: false)
 * return proper error structure when called with empty/invalid body.
 * Complements 04-response-format which only tests safe read-only endpoints.
 */
import { HTTP_LAMBDAS } from '../support/lambda-registry';
import { expectNoCrash, expectErrorStructure, parseBody, skipIfAwsSdkBundlingIssue } from '../support/e2e';

describe('Write Endpoint Error Responses', () => {
  // All non-safe HTTP endpoints that require auth
  const writeEndpoints = HTTP_LAMBDAS.filter(l => !l.safe && l.auth === 'cognito');

  writeEndpoints.forEach((lambda) => {
    it(`${lambda.name}: should return structured error with empty body`, () => {
      cy.apiPost(lambda.name, {}).then((res) => {
        expectNoCrash(res, lambda.name);
        if (skipIfAwsSdkBundlingIssue(res, lambda.name)) return;

        expectErrorStructure(res, lambda.name);

        // 200 is also acceptable (some endpoints have defaults or list actions)
        // Structured 500 with { success: false, error } is acceptable for job/scheduler endpoints
        // Raw 500 without structure is NOT acceptable (indicates unhandled crash)
        if (res.status === 500) {
          const body = parseBody(res);
          expect(body, `${lambda.name} 500 response must have 'success' field`).to.have.property('success');
          expect(body.success, `${lambda.name} 500 should have success=false`).to.be.false;
          expect(body, `${lambda.name} 500 response must have 'error' field`).to.have.property('error');
        }
      });
    });
  });
});
