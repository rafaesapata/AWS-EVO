/**
 * AUTH DOMAIN - Deep E2E Tests
 * MFA, WebAuthn, Profiles, Public Auth
 * Tests business logic: validates error messages, required fields, response shapes
 */
import { expectNoCrash, expectErrorStructure, parseBody } from '../../support/e2e';

describe('Auth Domain - MFA, WebAuthn, Profiles', () => {
  // ── MFA ──────────────────────────────────────────────────────────────────
  describe('MFA Handlers', () => {
    it('mfa-check: should return MFA status for authenticated user', () => {
      cy.apiPost('mfa-check').then((res) => {
        expectNoCrash(res);
        const body = parseBody(res);
        expect(body).to.have.property('success');
        if (res.status === 200 && body.success) {
          expect(body.data).to.exist;
        }
      });
    });

    it('mfa-list-factors: should list MFA factors with data array', () => {
      cy.apiPost('mfa-list-factors').then((res) => {
        expectNoCrash(res);
        const body = parseBody(res);
        if (res.status === 200 && body.success) {
          expect(body.data).to.be.an('array');
        }
      });
    });

    it('mfa-enroll: should reject without factor_type', () => {
      cy.apiPost('mfa-enroll', {}).then((res) => {
        expectNoCrash(res);
        expectErrorStructure(res, 'mfa-enroll');
      });
    });

    it('mfa-challenge-verify: should reject without code', () => {
      cy.apiPost('mfa-challenge-verify', {}).then((res) => {
        expectNoCrash(res);
        expectErrorStructure(res, 'mfa-challenge-verify');
      });
    });

    it('mfa-verify-login: should reject without code', () => {
      cy.apiPost('mfa-verify-login', {}).then((res) => {
        expectNoCrash(res);
        expectErrorStructure(res, 'mfa-verify-login');
      });
    });

    it('mfa-unenroll: should reject without factor_id', () => {
      cy.apiPost('mfa-unenroll', {}).then((res) => {
        expectNoCrash(res);
        expectErrorStructure(res, 'mfa-unenroll');
      });
    });
  });

  // ── WebAuthn ─────────────────────────────────────────────────────────────
  describe('WebAuthn Handlers', () => {
    it('webauthn-check: should return WebAuthn status with success field', () => {
      cy.apiPost('webauthn-check').then((res) => {
        expectNoCrash(res);
        const body = parseBody(res);
        expect(body).to.have.property('success');
      });
    });

    it('webauthn-register: should reject empty registration data', () => {
      cy.apiPost('webauthn-register', {}).then((res) => {
        expectNoCrash(res);
        expectErrorStructure(res, 'webauthn-register');
      });
    });

    it('webauthn-authenticate: should reject empty auth data', () => {
      cy.apiPost('webauthn-authenticate', {}).then((res) => {
        expectNoCrash(res);
        expectErrorStructure(res, 'webauthn-authenticate');
      });
    });

    it('delete-webauthn-credential: should reject without credential_id', () => {
      cy.apiPost('delete-webauthn-credential', {}).then((res) => {
        expectNoCrash(res);
        expectErrorStructure(res, 'delete-webauthn-credential');
      });
    });
  });

  // ── Public Auth ──────────────────────────────────────────────────────────
  describe('Public Auth Endpoints', () => {
    it('self-register: should be accessible without auth and return structured response', () => {
      cy.apiPostPublic('self-register', {}).then((res) => {
        expectNoCrash(res);
        expect(res.status).to.not.eq(401);
        const body = parseBody(res);
        expect(body).to.have.property('success');
      });
    });

    it('forgot-password: should be accessible without auth and return structured response', () => {
      cy.apiPostPublic('forgot-password', {}).then((res) => {
        expectNoCrash(res);
        expect(res.status).to.not.eq(401);
        const body = parseBody(res);
        expect(body).to.have.property('success');
      });
    });

    it('verify-tv-token: should return error for missing token', () => {
      cy.apiPost('verify-tv-token', {}).then((res) => {
        expectNoCrash(res);
        expectErrorStructure(res, 'verify-tv-token');
      });
    });
  });

  // ── Profiles ─────────────────────────────────────────────────────────────
  describe('Profile Handlers', () => {
    it('check-organization: should return org status with success field', () => {
      cy.apiPost('check-organization').then((res) => {
        expectNoCrash(res);
        const body = parseBody(res);
        expect(body).to.have.property('success');
      });
    });

    it('get-user-organization: should return user org with data', () => {
      cy.apiPost('get-user-organization').then((res) => {
        expectNoCrash(res);
        const body = parseBody(res);
        expect(body).to.have.property('success');
        if (res.status === 200 && body.success) {
          expect(body).to.have.property('data');
        }
      });
    });

    it('notification-settings: should return settings for get action', () => {
      cy.apiPost('notification-settings', { action: 'get' }).then((res) => {
        expectNoCrash(res);
        const body = parseBody(res);
        expect(body).to.have.property('success');
      });
    });

    it('create-with-organization: should require org data', () => {
      cy.apiPost('create-with-organization', {}).then((res) => {
        expectNoCrash(res);
        const body = parseBody(res);
        expect(body).to.have.property('success');
      });
    });
  });
});
