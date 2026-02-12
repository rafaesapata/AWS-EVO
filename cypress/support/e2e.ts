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

/**
 * Detect if a 500 response is a raw API Gateway error (lambda crashed at import time)
 * vs a structured error from our code. Raw API GW errors have { message: 'Internal Server Error' }
 * without our standard { success, error } structure.
 */
export function isRawApiGateway500(res: Cypress.Response<any>): boolean {
  if (res.status !== 500) return false;
  const body = parseBody(res);
  return body.message === 'Internal Server Error' && !('success' in body);
}

/**
 * Lambdas known to require FULL_SAM deploy (import @aws-sdk/* directly).
 * When these return raw API Gateway 500, it's an infrastructure issue, not a code bug.
 */
export const AWS_SDK_LAMBDAS = new Set([
  'fetch-daily-costs', 'cost-optimization', 'budget-forecast', 'finops-copilot',
  'ml-waste-detection', 'scheduled-scan-executor', 'guardduty-scan',
  'lateral-movement-detection', 'fetch-cloudtrail', 'ri-sp-analyzer',
  'analyze-ri-sp', 'detect-anomalies', 'bedrock-chat', 'kb-export-pdf',
  'generate-excel-report', 'generate-security-pdf', 'security-scan-pdf-export',
  'fetch-cloudwatch-metrics', 'fetch-edge-services', 'get-lambda-health',
  'create-user', 'manage-organizations', 'start-security-scan',
  'start-azure-security-scan', 'ticket-attachments', 'process-background-jobs',
  'storage-delete', 'upload-attachment', 'webauthn-check', 'forgot-password',
]);

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

/** Max chars of response body to include in error messages */
const BODY_SNIPPET_LENGTH = 200;

/**
 * Assert response is not a crash (502/503/504).
 * Provides clear error message with status and body snippet on failure.
 */
export function expectNoCrash(res: Cypress.Response<any>, label?: string): void {
  const prefix = label ? `${label}: ` : '';
  expect(
    CRASH_CODES.includes(res.status),
    `${prefix}crashed with ${res.status}: ${JSON.stringify(res.body).substring(0, BODY_SNIPPET_LENGTH)}`
  ).to.be.false;
}

/**
 * Assert a 400/422 response has proper error structure: { success: false, error: string }.
 * Use for write endpoints that should reject invalid/empty payloads.
 */
export function expectErrorStructure(res: Cypress.Response<any>, label?: string): void {
  if (res.status === 400 || res.status === 422) {
    const body = parseBody(res);
    const prefix = label ? `${label} ` : '';
    expect(body, `${prefix}error response missing 'success'`).to.have.property('success');
    expect(body.success, `${prefix}error should have success=false`).to.be.false;
    expect(body, `${prefix}error response missing 'error'`).to.have.property('error');
    expect(body.error).to.be.a('string');
  }
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
        Origin: Cypress.config('baseUrl') || '',
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
    headers: {
      'Content-Type': 'application/json',
      Origin: Cypress.config('baseUrl') || '',
    },
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
      Origin: Cypress.config('baseUrl') || '',
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
        Origin: Cypress.config('baseUrl') || '',
      },
      body: (BODYLESS_METHODS as readonly string[]).includes(method) ? undefined : body,
      failOnStatusCode: false,
    });
  });
});

export {};
