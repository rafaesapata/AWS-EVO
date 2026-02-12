/**
 * EVO Platform - Cypress Frontend E2E Support
 * Injects encrypted session into sessionStorage matching secureStorage format
 */
import CryptoJS from 'crypto-js';

declare global {
  namespace Cypress {
    interface Chainable {
      loginAndVisit(path?: string): Chainable<void>;
      loginViaCognito(): Chainable<string>;
      assertLayoutLoaded(): Chainable<void>;
      assertNoCrash(): Chainable<void>;
      visitApp(path: string): Chainable<void>;
      waitForLoad(timeout?: number): Chainable<void>;
      assertSidebarPresent(): Chainable<void>;
    }
  }
}

const FRONTEND_URL = Cypress.env('FRONTEND_URL') || 'https://evo.nuevacore.com';
const STORAGE_KEY_PREFIX = 'evo_secure_';
const SESSION_KEY = 'evo-auth';
const ENCRYPTION_KEY = 'evo-uds-v3-production-secure-key-2024';

let cachedIdToken: string | null = null;
let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;
let cachedSessionObj: any = null;
let tokenTimestamp = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000;

function encryptValue(value: string): string {
  return CryptoJS.AES.encrypt(value, ENCRYPTION_KEY).toString();
}

function base64UrlDecode(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  return atob(b64);
}

function parseJwt(token: string): any {
  return JSON.parse(base64UrlDecode(token.split('.')[1]));
}

Cypress.Commands.add('loginViaCognito', () => {
  const now = Date.now();
  if (cachedIdToken && (now - tokenTimestamp) < TOKEN_TTL_MS) {
    return cy.wrap(cachedIdToken);
  }

  const email = Cypress.env('TEST_USER_EMAIL');
  const password = Cypress.env('TEST_USER_PASSWORD');
  if (!email || !password) {
    throw new Error('Missing CYPRESS_TEST_USER_EMAIL or CYPRESS_TEST_USER_PASSWORD');
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
      AuthParameters: { USERNAME: email, PASSWORD: password },
    },
  }).then((response) => {
    expect(response.status).to.eq(200);
    const { IdToken, AccessToken, RefreshToken } = response.body.AuthenticationResult;
    cachedIdToken = IdToken;
    cachedAccessToken = AccessToken;
    cachedRefreshToken = RefreshToken;
    tokenTimestamp = Date.now();

    const payload = parseJwt(IdToken);
    cachedSessionObj = {
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name || payload.email,
        organizationId: payload['custom:organization_id'],
        attributes: {
          'custom:organization_id': payload['custom:organization_id'],
          'custom:roles': payload['custom:roles'] || '["org_admin"]',
          'custom:organization_name': payload['custom:organization_name'] || '',
        },
      },
      accessToken: AccessToken,
      idToken: IdToken,
      refreshToken: RefreshToken,
    };

    return IdToken;
  });
});

Cypress.Commands.add('loginAndVisit', (path = '/app') => {
  cy.loginViaCognito().then(() => {
    const encrypted = encryptValue(JSON.stringify(cachedSessionObj));
    const storageKey = `${STORAGE_KEY_PREFIX}${SESSION_KEY}`;

    cy.visit(FRONTEND_URL + path, {
      onBeforeLoad(win) {
        win.sessionStorage.setItem(storageKey, encrypted);
      },
    });
  });
});

Cypress.Commands.add('visitApp', (path: string) => {
  const encrypted = encryptValue(JSON.stringify(cachedSessionObj));
  const storageKey = `${STORAGE_KEY_PREFIX}${SESSION_KEY}`;

  cy.visit(FRONTEND_URL + path, {
    onBeforeLoad(win) {
      win.sessionStorage.setItem(storageKey, encrypted);
    },
  });
});

Cypress.Commands.add('assertLayoutLoaded', () => {
  cy.get('header', { timeout: 60000 }).should('exist').and('be.visible');
  cy.get('main').should('exist');
});

Cypress.Commands.add('assertNoCrash', () => {
  cy.get('body').then(($body) => {
    const text = $body.text();
    expect(text).not.to.include('Something went wrong');
    expect(text).not.to.include('Unexpected Application Error');
    expect(text).not.to.include('ChunkLoadError');
  });
  cy.get('body').invoke('text').should('have.length.greaterThan', 50);
});

Cypress.Commands.add('waitForLoad', (timeout = 30000) => {
  cy.get('body', { timeout }).should('not.contain.text', 'Verificando autenticação');
  cy.get('body', { timeout }).should('not.contain.text', 'Validando licença');
});

Cypress.Commands.add('assertSidebarPresent', () => {
  cy.get('[data-sidebar]').should('exist');
});

export {};
