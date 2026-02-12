/**
 * Frontend E2E - Security Domain Pages
 */
import '../../support/frontend';
import { SECURITY_PAGES } from '../../support/page-registry';

describe('Security Domain', () => {
  SECURITY_PAGES.forEach(({ path, name }) => {
    it(`${name} (${path}) - should load and render correctly`, () => {
      cy.loginAndVisit(path);
      cy.waitForLoad();
      cy.assertLayoutLoaded();
      cy.assertNoCrash();
      cy.get('main').invoke('text').should('have.length.greaterThan', 50);
    });
  });
});
