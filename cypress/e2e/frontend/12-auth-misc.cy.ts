/**
 * Frontend E2E - Auth Misc & Public Pages
 */
import '../../support/frontend';

const FRONTEND_URL = Cypress.env('FRONTEND_URL') || 'https://evo.nuevacore.com';

describe('Auth & Misc Pages', () => {
  it('Features page should load', () => {
    cy.visit(FRONTEND_URL + '/features', { failOnStatusCode: false });
    cy.get('body').invoke('text').should('have.length.greaterThan', 50);
  });

  it('Terms page should load', () => {
    cy.visit(FRONTEND_URL + '/terms', { failOnStatusCode: false });
    cy.get('body').invoke('text').should('have.length.greaterThan', 50);
  });

  it('Register page should load', () => {
    cy.visit(FRONTEND_URL + '/register', { failOnStatusCode: false });
    cy.get('body').invoke('text').should('have.length.greaterThan', 50);
  });

  it('Change Password should load with password fields', () => {
    cy.loginAndVisit('/change-password');
    cy.waitForLoad();
    cy.assertNoCrash();
    // ChangePassword does not use <Layout> - it has its own standalone UI
    cy.get('body').invoke('text').should('have.length.greaterThan', 50);
    cy.get('input[type="password"]').should('have.length.greaterThan', 0);
  });
});
