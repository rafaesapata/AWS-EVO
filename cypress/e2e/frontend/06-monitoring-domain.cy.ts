/**
 * Frontend E2E - Monitoring Domain Pages
 */
import '../../support/frontend';

const pages = [
  { path: '/resource-monitoring', name: 'Resource Monitoring' },
  { path: '/system-monitoring', name: 'System Monitoring', noLayout: true },
  { path: '/endpoint-monitoring', name: 'Endpoint Monitoring' },
  { path: '/edge-monitoring', name: 'Edge Monitoring', slowLoad: true, noLayout: true },
  { path: '/intelligent-alerts', name: 'Intelligent Alerts' },
  { path: '/predictive-incidents', name: 'Predictive Incidents' },
  { path: '/anomaly-detection', name: 'Anomaly Detection' },
  { path: '/ml-waste-detection', name: 'ML Waste Detection' },
  { path: '/platform-monitoring', name: 'Platform Monitoring' },
];

describe('Monitoring Domain', () => {
  pages.forEach(({ path, name, noLayout, slowLoad }) => {
    it(`${name} (${path}) - should load and render correctly`, () => {
      cy.loginAndVisit(path);
      cy.waitForLoad(slowLoad ? 60000 : 30000);
      cy.assertNoCrash();
      if (noLayout) {
        cy.get('body').invoke('text').should('have.length.greaterThan', 50);
      } else {
        cy.assertLayoutLoaded();
      }
      cy.get('main, [class*="min-h-screen"]').first().invoke('text').should('have.length.greaterThan', 50);
    });
  });
});
