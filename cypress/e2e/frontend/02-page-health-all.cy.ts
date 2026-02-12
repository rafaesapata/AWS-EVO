/**
 * Frontend E2E - Page Health Check (ALL protected pages)
 * Visits every protected page and validates no crash, Layout renders.
 * This is the frontend equivalent of 01-health-check-all.cy.ts
 */
import '../../support/frontend';
import { ALL_PROTECTED_PAGES, getPagesByDomain } from '../../support/page-registry';

describe('Frontend Page Health - All Protected Pages', () => {
  const byDomain = getPagesByDomain();

  Object.entries(byDomain).forEach(([domain, pages]) => {
    describe(`Domain: ${domain} (${pages.length} pages)`, () => {
      pages.forEach((page) => {
        it(`${page.name} (${page.path}) - should load without crash`, () => {
          cy.loginAndVisit(page.path);
          cy.waitForLoad(page.slowLoad ? 60000 : 30000);
          cy.assertNoCrash();
          if (page.noLayout) {
            // Pages without Layout: just verify meaningful content rendered
            cy.get('body').invoke('text').should('have.length.greaterThan', 50);
          } else {
            cy.assertLayoutLoaded();
          }
        });
      });
    });
  });
});
