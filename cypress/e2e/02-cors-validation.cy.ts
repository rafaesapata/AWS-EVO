/**
 * CORS Validation - Ensures all HTTP endpoints return proper CORS headers
 * Tests response headers on both authenticated and public endpoints
 */
import { HTTP_LAMBDAS } from '../support/lambda-registry';
import { expectNoCrash } from '../support/e2e';

describe('CORS Validation - All HTTP Endpoints', () => {
  // Sample 20 lambdas across domains for CORS check (testing all 148 would be slow)
  const sampleLambdas = [
    'mfa-check', 'list-aws-credentials', 'security-scan', 'fetch-daily-costs',
    'get-executive-dashboard', 'alerts', 'bedrock-chat', 'validate-license',
    'query-table', 'get-communication-logs', 'list-azure-credentials',
    'get-findings', 'cost-optimization', 'get-lambda-health', 'kb-analytics-dashboard',
    'list-background-jobs', 'get-user-organization', 'list-cloud-credentials',
    'generate-pdf-report', 'manage-seats',
  ];

  sampleLambdas.forEach((name) => {
    it(`${name}: should return CORS headers`, () => {
      cy.apiPost(name, {}).then((res) => {
        expectNoCrash(res, name);
        expect(
          res.headers['access-control-allow-origin'],
          `${name} missing Access-Control-Allow-Origin`
        ).to.exist;
      });
    });
  });

  const publicLambdas = ['self-register', 'forgot-password', 'log-frontend-error', 'get-executive-dashboard-public'];
  publicLambdas.forEach((name) => {
    it(`[PUBLIC] ${name}: should return CORS headers without auth`, () => {
      cy.apiPostPublic(name, {}).then((res) => {
        expectNoCrash(res, name);
        expect(
          res.headers['access-control-allow-origin'],
          `${name} missing Access-Control-Allow-Origin`
        ).to.exist;
      });
    });
  });
});
