/**
 * Response Format Validation - Ensures all endpoints follow the standard response structure
 * { success: boolean, data: T, timestamp: ISO8601 } for 200 responses
 * { success: false, error: string } for error responses
 */
import { HTTP_LAMBDAS } from '../support/lambda-registry';

describe('Response Format Validation', () => {
  // Test safe read-only endpoints that should return 200 with data
  const safeReadEndpoints = HTTP_LAMBDAS
    .filter(l => l.safe && l.auth === 'cognito')
    .slice(0, 25);

  safeReadEndpoints.forEach((lambda) => {
    it(`${lambda.name}: should follow standard response format`, () => {
      cy.apiPost(lambda.name, {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);

        const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;

        // All responses must have 'success' field
        expect(body, `${lambda.name} response missing 'success' field`).to.have.property('success');

        if (res.status === 200 && body.success === true) {
          // Successful responses must have data and timestamp
          expect(body).to.have.property('data');
          expect(body).to.have.property('timestamp');
          // Timestamp must be valid ISO 8601
          expect(new Date(body.timestamp).toISOString()).to.eq(body.timestamp);
        }

        if (body.success === false) {
          // Error responses must have error message
          expect(body).to.have.property('error');
          expect(body.error).to.be.a('string');
        }

        // Security headers check
        expect(res.headers['x-content-type-options']).to.eq('nosniff');
        expect(res.headers['x-frame-options']).to.eq('DENY');
      });
    });
  });
});
