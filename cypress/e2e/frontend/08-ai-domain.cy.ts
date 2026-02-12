/**
 * Frontend E2E - AI Domain Pages
 */
import '../../support/frontend';
import { AI_PAGES } from '../../support/page-registry';

describe('AI Domain', () => {
  AI_PAGES.forEach(({ path, name }) => {
    it(`${name} (${path}) - should load and render correctly`, () => {
      cy.loginAndVisit(path);
      cy.waitForLoad();
      cy.assertLayoutLoaded();
      cy.assertNoCrash();
    });
  });
});
