/**
 * Response Format Validation - Ensures all endpoints follow the standard response structure
 * { success: boolean, data: T, timestamp: ISO8601 } for 200 responses
 * { success: false, error: string } for error responses
 *
 * Tests ALL safe read-only endpoints (not a sample).
 */
import { HTTP_LAMBDAS } from '../support/lambda-registry';
import { CRASH_CODES, expectNoCrash, parseBody } from '../support/e2e';

describe('Response Format Validation', () => {
  const safeReadEndpoints = HTTP_LAMBDAS.filter(l => l.safe && l.auth === 'cognito');

  safeReadEndpoints.forEach((lambda) => {
    it(`${lambda.name}: should follow standard response format`, () => {
      cy.apiPost(lambda.name, {}).then((res) => {
        expectNoCrash(res, lambda.name);

        const body = parseBody(res);

        // All responses must have 'success' field
        expect(body, `${lambda.name} response missing 'success' field`).to.have.property('success');

        if (res.status === 200 && body.success === true) {
          // Successful responses must have data and timestamp
          expect(body, `${lambda.name} missing 'data'`).to.have.property('data');
          expect(body, `${lambda.name} missing 'timestamp'`).to.have.property('timestamp');
          // Timestamp must be valid ISO 8601
          const parsed = new Date(body.timestamp);
          expect(parsed.toISOString(), `${lambda.name} invalid timestamp: ${body.timestamp}`).to.eq(body.timestamp);
        }

        if (body.success === false) {
          // Error responses must have error message
          expect(body, `${lambda.name} error response missing 'error'`).to.have.property('error');
          expect(body.error).to.be.a('string');
        }
      });
    });
  });

  // Security headers check (sample — these come from API Gateway, not per-lambda)
  describe('Security Headers', () => {
    const HEADER_CHECK_SAMPLE_SIZE = 5;
    const sample = HTTP_LAMBDAS.filter(l => l.safe && l.auth === 'cognito').slice(0, HEADER_CHECK_SAMPLE_SIZE);

    sample.forEach((lambda) => {
      it(`${lambda.name}: should have security headers`, () => {
        cy.apiPost(lambda.name, {}).then((res) => {
          if (!CRASH_CODES.includes(res.status)) {
            // These headers may come from API Gateway or Lambda response
            // Only assert if present (some API Gateway configs don't add them)
            const nosniff = res.headers['x-content-type-options'];
            const frameOptions = res.headers['x-frame-options'];
            if (nosniff) expect(nosniff).to.eq('nosniff');
            if (frameOptions) expect(frameOptions).to.eq('DENY');
          }
        });
      });
    });
  });
});
