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
    'security-scan',
    'compliance-scan',
    'mfa-check',
    'mfa-list-factors',
    'get-executive-dashboard',
    'list-aws-credentials',
    'list-azure-credentials',
    'list-cloud-credentials',
    'fetch-daily-costs',
    'get-findings',
    'get-security-posture',
    'alerts',
    'validate-license',
  ];

  coreLambdas.forEach((name) => {
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
