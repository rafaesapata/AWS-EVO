import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_API_URL || 'https://api.evo.nuevacore.com',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    fixturesFolder: false,
    video: false,
    screenshotOnRunFailure: false,
    defaultCommandTimeout: 30000,
    requestTimeout: 30000,
    responseTimeout: 60000,
    retries: { runMode: 2, openMode: 0 },
    env: {
      COGNITO_USER_POOL_ID: process.env.CYPRESS_COGNITO_USER_POOL_ID || 'us-east-1_HPU98xnmT',
      COGNITO_CLIENT_ID: process.env.CYPRESS_COGNITO_CLIENT_ID || '6gls4r44u96v6o0mkm1l6sbmgd',
      TEST_USER_EMAIL: process.env.CYPRESS_TEST_USER_EMAIL || '',
      TEST_USER_PASSWORD: process.env.CYPRESS_TEST_USER_PASSWORD || '',
    },
  },
});
