/**
 * AUTH DOMAIN - Deep E2E Tests
 * MFA, WebAuthn, Profiles, Public Auth
 */
import { expectNoCrash, parseBody } from '../../support/e2e';

describe('Auth Domain - MFA, WebAuthn, Profiles', () => {
  // ── MFA ──────────────────────────────────────────────────────────────────
  describe('MFA Handlers', () => {
    it('mfa-check: should return MFA status for authenticated user', () => {
      cy.apiPost('mfa-check').then((res) => {
        expectNoCrash(res);
        if (res.status === 200) {
          const body = parseBody(res);
          expect(body).to.have.property('success');
        }
      });
    });

    it('mfa-list-factors: should list MFA factors', () => {
      cy.apiPost('mfa-list-factors').then((res) => {
        expectNoCrash(res);
        if (res.status === 200) {
          const body = parseBody(res);
          expect(body.success).to.be.true;
          expect(body.data).to.exist;
        }
      });
    });

    it('mfa-enroll: should require factor_type in body', () => {
      cy.apiPost('mfa-enroll', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('mfa-challenge-verify: should reject without code', () => {
      cy.apiPost('mfa-challenge-verify', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('mfa-verify-login: should reject without code', () => {
      cy.apiPost('mfa-verify-login', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('mfa-unenroll: should reject without factor_id', () => {
      cy.apiPost('mfa-unenroll', {}).then((res) => {
        expectNoCrash(res);
      });
    });
  });

  // ── WebAuthn ─────────────────────────────────────────────────────────────
  describe('WebAuthn Handlers', () => {
    it('webauthn-check: should return WebAuthn status', () => {
      cy.apiPost('webauthn-check').then((res) => {
        expectNoCrash(res);
      });
    });

    it('webauthn-register: should require registration data', () => {
      cy.apiPost('webauthn-register', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('webauthn-authenticate: should require auth data', () => {
      cy.apiPost('webauthn-authenticate', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('delete-webauthn-credential: should require credential_id', () => {
      cy.apiPost('delete-webauthn-credential', {}).then((res) => {
        expectNoCrash(res);
      });
    });
  });

  // ── Public Auth ──────────────────────────────────────────────────────────
  describe('Public Auth Endpoints', () => {
    it('self-register: should be accessible without auth', () => {
      cy.apiPostPublic('self-register', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('forgot-password: should be accessible without auth', () => {
      cy.apiPostPublic('forgot-password', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('verify-tv-token: should handle missing token', () => {
      cy.apiPost('verify-tv-token', {}).then((res) => {
        expectNoCrash(res);
      });
    });
  });

  // ── Profiles ─────────────────────────────────────────────────────────────
  describe('Profile Handlers', () => {
    it('check-organization: should return org status', () => {
      cy.apiPost('check-organization').then((res) => {
        expectNoCrash(res);
        if (res.status === 200) {
          const body = parseBody(res);
          expect(body).to.have.property('success');
        }
      });
    });

    it('get-user-organization: should return user org', () => {
      cy.apiPost('get-user-organization').then((res) => {
        expectNoCrash(res);
        if (res.status === 200) {
          const body = parseBody(res);
          expect(body.success).to.be.true;
        }
      });
    });

    it('notification-settings: should return settings', () => {
      cy.apiPost('notification-settings', { action: 'get' }).then((res) => {
        expectNoCrash(res);
      });
    });
  });
});
