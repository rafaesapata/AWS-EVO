/**
 * Frontend E2E - Monitoring Domain Pages
 */
import '../../support/frontend';
import { MONITORING_PAGES } from '../../support/page-registry';

describe('Monitoring Domain', () => {
  MONITORING_PAGES.forEach(({ path, name, noLayout, slowLoad }) => {
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
