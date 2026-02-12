import { expectNoCrash, parseBody } from '../../support/e2e';
/**
 * MONITORING DOMAIN - Deep E2E Tests (20 lambdas)
 * Alerts, metrics, health checks, dashboard, endpoints
 */

describe('Monitoring Domain', () => {
  // ── Alerts ───────────────────────────────────────────────────────────────
  describe('Alerts', () => {
    it('alerts: should handle alerts request', () => {
      cy.apiPost('alerts', { action: 'list' }).then((res) => {
        expectNoCrash(res);
      });
    });

    it('auto-alerts: should handle auto alerts', () => {
      cy.apiPost('auto-alerts', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('check-alert-rules: should check rules', () => {
      cy.apiPost('check-alert-rules', {}).then((res) => {
        expectNoCrash(res);
      });
    });
  });

  // ── Metrics ──────────────────────────────────────────────────────────────
  describe('Metrics', () => {
    it('aws-realtime-metrics: should return metrics', () => {
      cy.apiPost('aws-realtime-metrics', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('fetch-cloudwatch-metrics: should fetch CW metrics', () => {
      cy.apiPost('fetch-cloudwatch-metrics', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('fetch-edge-services: should fetch edge services', () => {
      cy.apiPost('fetch-edge-services', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('get-platform-metrics: should return platform metrics', () => {
      cy.apiPost('get-platform-metrics', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('get-recent-errors: should return recent errors', () => {
      cy.apiPost('get-recent-errors', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('get-lambda-health: should return lambda health', () => {
      cy.apiPost('get-lambda-health', {}).then((res) => {
        expectNoCrash(res);
      });
    });
  });

  // ── Endpoints ────────────────────────────────────────────────────────────
  describe('Endpoint Monitoring', () => {
    it('endpoint-monitor-check: should check endpoints', () => {
      cy.apiPost('endpoint-monitor-check', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('monitored-endpoints: should list endpoints', () => {
      cy.apiPost('monitored-endpoints', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('generate-error-fix-prompt: should generate prompt', () => {
      cy.apiPost('generate-error-fix-prompt', {}).then((res) => {
        expectNoCrash(res);
      });
    });
  });

  // ── Dashboard ────────────────────────────────────────────────────────────
  describe('Dashboard', () => {
    it('get-executive-dashboard: should return dashboard', () => {
      cy.apiPost('get-executive-dashboard', {}).then((res) => {
        expectNoCrash(res);
        if (res.status === 200) {
          const body = parseBody(res);
          expect(body).to.have.property('success');
        }
      });
    });

    it('get-executive-dashboard-public: should work without auth', () => {
      cy.apiPostPublic('get-executive-dashboard-public', {}).then((res) => {
        expectNoCrash(res);
      });
    });

    it('manage-tv-tokens: should handle TV tokens', () => {
      cy.apiPost('manage-tv-tokens', { action: 'list' }).then((res) => {
        expectNoCrash(res);
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
        expectNoCrash(res);
      });
    });
  });
});
