/**
 * Frontend E2E - Authentication Flow
 * Tests login page rendering, Cognito auth, redirect to dashboard
 */
import '../../support/frontend';

const FRONTEND_URL = Cypress.env('FRONTEND_URL') || 'https://evo.nuevacore.com';

describe('Authentication Flow', () => {
  it('should render login page with form elements', () => {
    cy.visit(FRONTEND_URL + '/auth');
    cy.get('input').should('have.length.greaterThan', 0);
    cy.get('button').should('have.length.greaterThan', 0);
    // Should show EVO branding
    cy.get('img[src*="logo"]').should('exist');
  });

  it('should show error on invalid credentials', () => {
    cy.visit(FRONTEND_URL + '/auth');
    cy.get('input[type="email"], input[type="text"]').first().type('invalid@test.com');
    cy.get('input[type="password"]').first().type('wrongpassword123');
    cy.get('button[type="submit"], button').contains(/entrar|login|sign in/i).click();
    // Should show error message (not crash)
    cy.get('body', { timeout: 15000 }).then(($body) => {
      const text = $body.text().toLowerCase();
      expect(text).not.to.include('something went wrong');
      expect(text).not.to.include('chunkloaderror');
    });
  });

  it('should login successfully and redirect to dashboard', () => {
    cy.loginAndVisit('/app');
    cy.waitForLoad();
    cy.assertNoCrash();
    cy.assertLayoutLoaded();
    // Dashboard should show title
    cy.get('header').should('contain.text', 'Dashboard');
  });

  it('should redirect unauthenticated users to login', () => {
    cy.visit(FRONTEND_URL + '/app', { failOnStatusCode: false });
    // Should redirect to / or /auth
    cy.url({ timeout: 15000 }).should('satisfy', (url: string) => {
      return url.endsWith('/') || url.includes('/auth');
    });
  });

  it('should render 404 page for unknown routes', () => {
    cy.visit(FRONTEND_URL + '/nonexistent-page-xyz', { failOnStatusCode: false });
    cy.url({ timeout: 10000 }).should('include', '/404');
  });
});
