/**
 * Frontend E2E - Cost Domain Pages
 */
import '../../support/frontend';
import { COST_PAGES } from '../../support/page-registry';

describe('Cost Domain', () => {
  COST_PAGES.forEach(({ path, name }) => {
    it(`${name} (${path}) - should load and render correctly`, () => {
      cy.loginAndVisit(path);
      cy.waitForLoad();
      cy.assertLayoutLoaded();
      cy.assertNoCrash();
      cy.get('main').invoke('text').should('have.length.greaterThan', 50);
    });
  });
});
