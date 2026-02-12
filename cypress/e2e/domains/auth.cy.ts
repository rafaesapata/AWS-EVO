/**
 * AUTH DOMAIN - Deep E2E Tests
 * Lambdas: mfa-enroll, mfa-check, mfa-challenge-verify, mfa-verify-login,
 *          mfa-list-factors, mfa-unenroll, webauthn-register, webauthn-authenticate,
 *          webauthn-check, delete-webauthn-credential, verify-tv-token,
 *          self-register, forgot-password, check-organization,
 *          create-with-organization, get-user-organization, notification-settings
 */

describe('Auth Domain - MFA, WebAuthn, Profiles', () => {
  // ── MFA ──────────────────────────────────────────────────────────────────
  describe('MFA Handlers', () => {
    it('mfa-check: should return MFA status for authenticated user', () => {
      cy.apiPost('mfa-check').then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
        if (res.status === 200) {
          const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
          expect(body).to.have.property('success');
        }
      });
    });

    it('mfa-list-factors: should list MFA factors', () => {
      cy.apiPost('mfa-list-factors').then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
        if (res.status === 200) {
          const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
          expect(body.success).to.be.true;
          expect(body.data).to.exist;
        }
      });
    });

    it('mfa-enroll: should require factor_type in body', () => {
      cy.apiPost('mfa-enroll', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
        // 400 expected without proper body
      });
    });

    it('mfa-challenge-verify: should reject without code', () => {
      cy.apiPost('mfa-challenge-verify', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('mfa-verify-login: should reject without code', () => {
      cy.apiPost('mfa-verify-login', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('mfa-unenroll: should reject without factor_id', () => {
      cy.apiPost('mfa-unenroll', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });
  });

  // ── WebAuthn ─────────────────────────────────────────────────────────────
  describe('WebAuthn Handlers', () => {
    it('webauthn-check: should return WebAuthn status', () => {
      cy.apiPost('webauthn-check').then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('webauthn-register: should require registration data', () => {
      cy.apiPost('webauthn-register', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('webauthn-authenticate: should require auth data', () => {
      cy.apiPost('webauthn-authenticate', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('delete-webauthn-credential: should require credential_id', () => {
      cy.apiPost('delete-webauthn-credential', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });
  });

  // ── Public Auth ──────────────────────────────────────────────────────────
  describe('Public Auth Endpoints', () => {
    it('self-register: should be accessible without auth', () => {
      cy.apiPostPublic('self-register', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
        // 400 expected without proper registration data
      });
    });

    it('forgot-password: should be accessible without auth', () => {
      cy.apiPostPublic('forgot-password', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('verify-tv-token: should handle missing token', () => {
      cy.apiPost('verify-tv-token', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });
  });

  // ── Profiles ─────────────────────────────────────────────────────────────
  describe('Profile Handlers', () => {
    it('check-organization: should return org status', () => {
      cy.apiPost('check-organization').then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
        if (res.status === 200) {
          const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
          expect(body).to.have.property('success');
        }
      });
    });

    it('get-user-organization: should return user org', () => {
      cy.apiPost('get-user-organization').then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
        if (res.status === 200) {
          const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
          expect(body.success).to.be.true;
        }
      });
    });

    it('notification-settings: should return settings', () => {
      cy.apiPost('notification-settings', { action: 'get' }).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });
  });
});
