/**
 * Critical Lambda Validation - Deep tests for onboarding and core lambdas
 * These are the most important lambdas for platform stability.
 * A failure here = immediate attention required.
 */
import { expectNoCrash, parseBody } from '../support/e2e';

describe('Critical Lambdas - Onboarding', () => {
  const onboardingLambdas = [
    'save-aws-credentials',
    'validate-aws-credentials',
    'save-azure-credentials',
    'validate-azure-credentials',
  ];

  onboardingLambdas.forEach((name) => {
    it(`🔴 ${name}: should be reachable and respond correctly`, () => {
      cy.apiPost(name, {}).then((res) => {
        expectNoCrash(res, name);

        const body = parseBody(res);
        expect(body).to.have.property('success');
      });
    });
  });
});

describe('Critical Lambdas - Core', () => {
  const coreLambdas = [
    { name: 'security-scan', safe: true },
    { name: 'compliance-scan', safe: true },
    { name: 'mfa-check', safe: true },
    { name: 'mfa-list-factors', safe: true },
    { name: 'get-executive-dashboard', safe: true },
    { name: 'list-aws-credentials', safe: true },
    { name: 'list-azure-credentials', safe: true },
    { name: 'list-cloud-credentials', safe: true },
    { name: 'fetch-daily-costs', safe: true },
    { name: 'get-findings', safe: true },
    { name: 'get-security-posture', safe: true },
    { name: 'alerts', safe: true },
    { name: 'validate-license', safe: true },
  ];

  coreLambdas.forEach(({ name }) => {
    it(`🟠 ${name}: should return valid response structure`, () => {
      cy.apiPost(name, {}).then((res) => {
        expectNoCrash(res, name);

        const body = parseBody(res);
        expect(body, `${name} missing 'success' field`).to.have.property('success');

        if (res.status === 200 && body.success) {
          expect(body).to.have.property('data');
          expect(body).to.have.property('timestamp');
        }
      });
    });
  });
});

describe('Critical Lambdas - Public Endpoints', () => {
  const publicCritical = [
    'self-register',
    'forgot-password',
    'get-executive-dashboard-public',
    'log-frontend-error',
  ];

  publicCritical.forEach((name) => {
    it(`🟢 ${name}: should be accessible without auth and not crash`, () => {
      cy.apiPostPublic(name, {}).then((res) => {
        expect(res.status, `${name} should not require auth`).to.not.eq(401);
        expectNoCrash(res, name);
      });
    });
  });
});
