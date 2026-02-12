/**
 * Frontend E2E - Navigation & Header Controls
 */
import '../../support/frontend';

describe('Navigation & Header', () => {
  it('should have header with user controls on dashboard', () => {
    cy.loginAndVisit('/app');
    cy.waitForLoad();
    cy.assertLayoutLoaded();
    cy.get('header').should('be.visible');
    cy.get('header button').should('have.length.greaterThan', 1);
  });

  it('should navigate between pages without crash', () => {
    cy.loginAndVisit('/security-posture');
    cy.waitForLoad();
    cy.assertLayoutLoaded();
    cy.assertNoCrash();

    cy.loginAndVisit('/cost-optimization');
    cy.waitForLoad();
    cy.assertLayoutLoaded();
    cy.assertNoCrash();

    cy.loginAndVisit('/app');
    cy.waitForLoad();
    cy.get('header').should('contain.text', 'Dashboard');
  });

  it('should display organization info in header', () => {
    cy.loginAndVisit('/app');
    cy.waitForLoad();
    cy.get('header').then(($header) => {
      expect($header.text().length).to.be.greaterThan(20);
    });
  });
});
