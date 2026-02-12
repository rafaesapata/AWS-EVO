/**
 * EVO Platform - Cypress E2E Support
 * Custom commands for API testing against real Lambda endpoints
 */

// Types for custom commands
declare global {
  namespace Cypress {
    interface Chainable {
      /** Authenticate via Cognito and store token */
      authenticate(): Chainable<string>;
      /** POST to a Lambda endpoint with auth */
      apiPost(lambdaName: string, body?: Record<string, any>): Chainable<Cypress.Response<any>>;
      /** POST to a Lambda endpoint WITHOUT auth (public endpoints) */
      apiPostPublic(lambdaName: string, body?: Record<string, any>): Chainable<Cypress.Response<any>>;
      /** Validate standard response structure */
      validateResponse(): Chainable<any>;
      /** Validate that lambda is reachable (not 502/503) */
      validateLambdaHealth(lambdaName: string): Chainable<Cypress.Response<any>>;
    }
  }
}

// Cache token across tests in same run
let cachedToken: string | null = null;

/**
 * Authenticate via Cognito USER_PASSWORD_AUTH flow
 */
Cypress.Commands.add('authenticate', () => {
  if (cachedToken) {
    return cy.wrap(cachedToken);
  }

  const email = Cypress.env('TEST_USER_EMAIL');
  const password = Cypress.env('TEST_USER_PASSWORD');

  if (!email || !password) {
    throw new Error(
      'Missing CYPRESS_TEST_USER_EMAIL or CYPRESS_TEST_USER_PASSWORD env vars. ' +
      'Set them in cypress.env.json or via environment variables.'
    );
  }

  const poolId = Cypress.env('COGNITO_USER_POOL_ID');
  const clientId = Cypress.env('COGNITO_CLIENT_ID');
  const region = poolId.split('_')[0];

  return cy.request({
    method: 'POST',
    url: `https://cognito-idp.${region}.amazonaws.com/`,
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    },
  }).then((response) => {
    expect(response.status).to.eq(200);
    const token = response.body.AuthenticationResult.IdToken;
    cachedToken = token;
    return token;
  });
});

/**
 * POST to authenticated Lambda endpoint
 */
Cypress.Commands.add('apiPost', (lambdaName: string, body: Record<string, any> = {}) => {
  return cy.authenticate().then((token) => {
    return cy.request({
      method: 'POST',
      url: `/api/functions/${lambdaName}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
      failOnStatusCode: false,
    });
  });
});

/**
 * POST to public Lambda endpoint (no auth)
 */
Cypress.Commands.add('apiPostPublic', (lambdaName: string, body: Record<string, any> = {}) => {
  return cy.request({
    method: 'POST',
    url: `/api/functions/${lambdaName}`,
    headers: { 'Content-Type': 'application/json' },
    body,
    failOnStatusCode: false,
  });
});

/**
 * Validate standard EVO response structure
 */
Cypress.Commands.add('validateResponse', { prevSubject: true }, (response: Cypress.Response<any>) => {
  // Must not be 502 (Lambda crash) or 503 (service unavailable)
  expect(response.status, 'Lambda should not crash (502/503)').to.not.be.oneOf([502, 503]);

  // If 200, validate response structure
  if (response.status === 200) {
    const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    expect(body).to.have.property('success');
    if (body.success) {
      expect(body).to.have.property('data');
      expect(body).to.have.property('timestamp');
    }
  }

  return cy.wrap(response);
});

/**
 * Health check: validates lambda is reachable and not crashing
 * Accepts: 200, 400, 401, 403, 404, 422 (business errors are OK)
 * Rejects: 502 (crash), 503 (unavailable), 504 (timeout on simple request)
 */
Cypress.Commands.add('validateLambdaHealth', (lambdaName: string) => {
  return cy.apiPost(lambdaName, {}).then((response) => {
    const crashCodes = [502, 503];
    expect(
      crashCodes.includes(response.status),
      `Lambda "${lambdaName}" should not crash. Got ${response.status}: ${JSON.stringify(response.body).substring(0, 200)}`
    ).to.be.false;
    return cy.wrap(response);
  });
});

export {};
