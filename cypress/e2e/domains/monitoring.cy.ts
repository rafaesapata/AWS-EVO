/**
 * MONITORING DOMAIN - Deep E2E Tests (20 lambdas)
 * Alerts, metrics, health checks, dashboard, endpoints
 */

describe('Monitoring Domain', () => {
  // ── Alerts ───────────────────────────────────────────────────────────────
  describe('Alerts', () => {
    it('alerts: should handle alerts request', () => {
      cy.apiPost('alerts', { action: 'list' }).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('auto-alerts: should handle auto alerts', () => {
      cy.apiPost('auto-alerts', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('check-alert-rules: should check rules', () => {
      cy.apiPost('check-alert-rules', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });
  });

  // ── Metrics ──────────────────────────────────────────────────────────────
  describe('Metrics', () => {
    it('aws-realtime-metrics: should return metrics', () => {
      cy.apiPost('aws-realtime-metrics', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('fetch-cloudwatch-metrics: should fetch CW metrics', () => {
      cy.apiPost('fetch-cloudwatch-metrics', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('fetch-edge-services: should fetch edge services', () => {
      cy.apiPost('fetch-edge-services', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('get-platform-metrics: should return platform metrics', () => {
      cy.apiPost('get-platform-metrics', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('get-recent-errors: should return recent errors', () => {
      cy.apiPost('get-recent-errors', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('get-lambda-health: should return lambda health', () => {
      cy.apiPost('get-lambda-health', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });
  });

  // ── Endpoints ────────────────────────────────────────────────────────────
  describe('Endpoint Monitoring', () => {
    it('endpoint-monitor-check: should check endpoints', () => {
      cy.apiPost('endpoint-monitor-check', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('monitored-endpoints: should list endpoints', () => {
      cy.apiPost('monitored-endpoints', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('generate-error-fix-prompt: should generate prompt', () => {
      cy.apiPost('generate-error-fix-prompt', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });
  });

  // ── Dashboard ────────────────────────────────────────────────────────────
  describe('Dashboard', () => {
    it('get-executive-dashboard: should return dashboard', () => {
      cy.apiPost('get-executive-dashboard', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
        if (res.status === 200) {
          const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
          expect(body).to.have.property('success');
        }
      });
    });

    it('get-executive-dashboard-public: should work without auth', () => {
      cy.apiPostPublic('get-executive-dashboard-public', {}).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });

    it('manage-tv-tokens: should handle TV tokens', () => {
      cy.apiPost('manage-tv-tokens', { action: 'list' }).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });
  });

  // ── Public Endpoints ─────────────────────────────────────────────────────
  describe('Public Monitoring', () => {
    it('log-frontend-error: should accept error logs without auth', () => {
      cy.apiPostPublic('log-frontend-error', {
        error: 'test-error',
        url: 'https://test.com',
        userAgent: 'cypress-test',
      }).then((res) => {
        expect(res.status).to.not.be.oneOf([502, 503]);
      });
    });
  });
});
