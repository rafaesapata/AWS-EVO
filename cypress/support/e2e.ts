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
      /** Send request with invalid/malformed auth token */
      apiPostInvalidToken(lambdaName: string, token: string, body?: Record<string, any>): Chainable<Cypress.Response<any>>;
      /** Send request with a specific HTTP method (for method rejection tests) */
      apiRequest(lambdaName: string, method: string, body?: Record<string, any>): Chainable<Cypress.Response<any>>;
      /** Validate standard response structure */
      validateResponse(): Chainable<any>;
      /** Validate that lambda is reachable (not 502/503/504) */
      validateLambdaHealth(lambdaName: string): Chainable<Cypress.Response<any>>;
    }
  }
}

import type { LambdaDefinition } from './lambda-registry';

/** Status codes that indicate a lambda crash or infrastructure failure */
export const CRASH_CODES = [502, 503, 504];

/** Valid HTTP methods for method rejection tests */
export const INVALID_METHODS = ['GET', 'PUT', 'DELETE', 'PATCH'] as const;

/** Structurally valid but unsigned/expired JWT for auth rejection tests */
export const FAKE_EXPIRED_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxfQ.invalid';

/**
 * Pick one safe+cognito lambda per domain for sampling.
 * Useful for tests that need broad domain coverage without testing every endpoint.
 */
export function sampleOnePerDomain(lambdas: LambdaDefinition[]): LambdaDefinition[] {
  const byDomain = lambdas
    .filter(l => l.auth === 'cognito' && l.safe)
    .reduce<Record<string, LambdaDefinition>>((acc, l) => {
      if (!acc[l.domain]) acc[l.domain] = l;
      return acc;
    }, {});
  return Object.values(byDomain);
}

/**
 * Assert response is not a crash (502/503/504).
 * Provides clear error message with status and body snippet on failure.
 */
export function expectNoCrash(res: Cypress.Response<any>, label?: string): void {
  const prefix = label ? `${label}: ` : '';
  expect(
    CRASH_CODES.includes(res.status),
    `${prefix}crashed with ${res.status}: ${JSON.stringify(res.body).substring(0, 200)}`
  ).to.be.false;
}

/**
 * Parse response body safely (handles string, object, null, empty)
 */
export function parseBody(res: Cypress.Response<any>): any {
  if (!res.body) return {};
  if (typeof res.body === 'string') {
    try {
      return JSON.parse(res.body);
    } catch {
      return { _raw: res.body };
    }
  }
  return res.body;
}

// Cache token across tests in same run
let cachedToken: string | null = null;
let tokenTimestamp: number = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 min (Cognito tokens last 60 min)

/**
 * Authenticate via Cognito USER_PASSWORD_AUTH flow
 * Automatically refreshes token before expiry
 */
Cypress.Commands.add('authenticate', () => {
  const now = Date.now();
  if (cachedToken && (now - tokenTimestamp) < TOKEN_TTL_MS) {
    return cy.wrap(cachedToken);
  }

  // Force refresh if expired
  if (cachedToken) {
    Cypress.log({ name: 'auth', message: 'Token expired, refreshing...' });
  }
  cachedToken = null;

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
    tokenTimestamp = Date.now();
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
  expectNoCrash(response);

  if (response.status === 200) {
    const body = parseBody(response);
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
 * Rejects: 502 (crash), 503 (unavailable), 504 (timeout)
 */
Cypress.Commands.add('validateLambdaHealth', (lambdaName: string) => {
  return cy.apiPost(lambdaName, {}).then((response) => {
    expectNoCrash(response, lambdaName);
    return cy.wrap(response);
  });
});

/**
 * POST with invalid/malformed auth token
 * Used to test that auth validation rejects bad tokens, not just missing ones
 */
Cypress.Commands.add('apiPostInvalidToken', (lambdaName: string, token: string, body: Record<string, any> = {}) => {
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

/** HTTP methods that should be rejected (platform only supports POST) */
const BODYLESS_METHODS = ['GET', 'DELETE', 'HEAD'] as const;

/**
 * Send request with arbitrary HTTP method (for method rejection tests)
 */
Cypress.Commands.add('apiRequest', (lambdaName: string, method: string, body: Record<string, any> = {}) => {
  return cy.authenticate().then((token) => {
    return cy.request({
      method,
      url: `/api/functions/${lambdaName}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: (BODYLESS_METHODS as readonly string[]).includes(method) ? undefined : body,
      failOnStatusCode: false,
    });
  });
});

export {};
