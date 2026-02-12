/**
 * Frontend E2E - Dashboard (Executive)
 */
import '../../support/frontend';

describe('Executive Dashboard', () => {
  beforeEach(() => {
    cy.loginAndVisit('/app');
    cy.waitForLoad();
  });

  it('should render Layout with header, sidebar, and content', () => {
    cy.assertLayoutLoaded();
    cy.assertNoCrash();
    cy.get('header').should('contain.text', 'Dashboard');
    cy.get('header button').should('have.length.greaterThan', 1);
    cy.get('main').within(() => {
      cy.get('[class*="card"], [class*="Card"], [role="status"]', { timeout: 15000 })
        .should('have.length.greaterThan', 0);
    });
  });
});
