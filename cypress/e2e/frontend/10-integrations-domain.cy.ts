/**
 * Frontend E2E - Integrations Domain Pages
 */
import '../../support/frontend';
import { INTEGRATIONS_PAGES } from '../../support/page-registry';

describe('Integrations Domain', () => {
  INTEGRATIONS_PAGES.forEach(({ path, name }) => {
    it(`${name} (${path}) - should load and render correctly`, () => {
      cy.loginAndVisit(path);
      cy.waitForLoad();
      cy.assertLayoutLoaded();
      cy.assertNoCrash();
      cy.get('main').invoke('text').should('have.length.greaterThan', 50);
    });
  });
});
