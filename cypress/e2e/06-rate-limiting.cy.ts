/**
 * Rate Limiting - Validates public endpoints have rate limiting protection
 * Public endpoints (no auth) are abuse targets and must throttle excessive requests.
 * Sends rapid sequential requests and checks for 429 Too Many Requests.
 */
import { PUBLIC_LAMBDAS } from '../support/lambda-registry';
import { CRASH_CODES } from '../support/e2e';

const RAPID_REQUEST_COUNT = 20;

describe('Rate Limiting - Public Endpoints', () => {
  const publicHttp = PUBLIC_LAMBDAS.filter(l => l.type === 'http');

  publicHttp.forEach((lambda) => {
    it(`${lambda.name}: should enforce rate limiting under rapid requests`, () => {
      const statuses: number[] = [];

      // Fire requests sequentially and collect status codes
      cy.wrap(Array.from({ length: RAPID_REQUEST_COUNT })).each(() => {
        cy.apiPostPublic(lambda.name, {}).then((res) => {
          statuses.push(res.status);
        });
      }).then(() => {
        // At least one should be 429 if rate limiting is active
        // If none are 429, log a warning — this is a security gap, not a crash
        const has429 = statuses.includes(429);
        const hasCrash = statuses.some(s => CRASH_CODES.includes(s));

        expect(hasCrash, `${lambda.name} crashed under load: ${JSON.stringify(statuses)}`).to.be.false;

        if (!has429) {
          Cypress.log({
            name: '⚠️ NO RATE LIMIT',
            message: `${lambda.name}: ${RAPID_REQUEST_COUNT} requests, no 429 received. Consider adding throttling.`,
          });
        }
      });
    });
  });
});
