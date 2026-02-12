/**
 * CORS Validation - Ensures all HTTP endpoints return proper CORS headers
 * Uses registry-driven sampling: picks 3 lambdas per domain for broad coverage
 * instead of a hardcoded list that drifts out of sync.
 */
import { ALL_LAMBDAS, PUBLIC_LAMBDAS, getLambdasByDomain } from '../support/lambda-registry';
import { expectNoCrash } from '../support/e2e';

const DOMAINS = [...new Set(ALL_LAMBDAS.map(l => l.domain))].sort();
const SAMPLE_PER_DOMAIN = 3;

describe('CORS Validation - Registry-Driven Sampling', () => {
  // Sample N lambdas per domain from the registry (auth-required HTTP endpoints)
  DOMAINS.forEach((domain) => {
    const domainLambdas = getLambdasByDomain(domain)
      .filter(l => l.type === 'http' && l.auth === 'cognito')
      .slice(0, SAMPLE_PER_DOMAIN);

    domainLambdas.forEach((lambda) => {
      it(`[${domain}] ${lambda.name}: should return CORS headers`, () => {
        cy.apiPost(lambda.name, {}).then((res) => {
          expectNoCrash(res, lambda.name);
          expect(
            res.headers['access-control-allow-origin'],
            `${lambda.name} missing Access-Control-Allow-Origin`
          ).to.exist;
        });
      });
    });
  });

  // All public endpoints must have CORS (no sampling — there are few)
  const publicHttp = PUBLIC_LAMBDAS.filter(l => l.type === 'http');
  publicHttp.forEach((lambda) => {
    it(`[PUBLIC] ${lambda.name}: should return CORS headers without auth`, () => {
      cy.apiPostPublic(lambda.name, {}).then((res) => {
        expectNoCrash(res, lambda.name);
        expect(
          res.headers['access-control-allow-origin'],
          `${lambda.name} missing Access-Control-Allow-Origin`
        ).to.exist;
      });
    });
  });
});
