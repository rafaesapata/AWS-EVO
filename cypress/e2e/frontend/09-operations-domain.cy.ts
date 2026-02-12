/**
 * Frontend E2E - Operations Domain Pages
 */
import '../../support/frontend';
import { OPERATIONS_PAGES } from '../../support/page-registry';

describe('Operations Domain', () => {
  OPERATIONS_PAGES.forEach(({ path, name }) => {
    it(`${name} (${path}) - should load and render correctly`, () => {
      cy.loginAndVisit(path);
      cy.waitForLoad();
      cy.assertLayoutLoaded();
      cy.assertNoCrash();
    });
  });
});
