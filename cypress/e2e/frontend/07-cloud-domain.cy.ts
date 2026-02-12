/**
 * Frontend E2E - Cloud Domain Pages
 */
import '../../support/frontend';
import { CLOUD_PAGES } from '../../support/page-registry';

describe('Cloud Domain', () => {
  CLOUD_PAGES.forEach(({ path, name }) => {
    it(`${name} (${path}) - should load and render correctly`, () => {
      cy.loginAndVisit(path);
      cy.waitForLoad();
      cy.assertLayoutLoaded();
      cy.assertNoCrash();
      cy.get('main').invoke('text').should('have.length.greaterThan', 50);
    });
  });

  it('Cloud Credentials - should have AWS/Azure tabs', () => {
    cy.loginAndVisit('/cloud-credentials');
    cy.waitForLoad();
    cy.get('[role="tablist"]', { timeout: 10000 }).should('exist');
    cy.get('[role="tab"]').should('have.length.greaterThan', 1);
    cy.get('[role="tab"]').contains(/azure/i).click();
    cy.assertNoCrash();
  });
});
