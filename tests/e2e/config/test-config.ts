/**
 * E2E Test Configuration
 * Browser-based testing configuration for EVO UDS platform
 */

export interface TestConfig {
  baseUrl: string;
  credentials: {
    email: string;
    password: string;
  };
  browser: {
    headless: boolean;
    timeout: number;
    actionTimeout: number;
  };
  menus?: string[];
  waitBetweenActions: number;
  verbose: boolean;
  screenshotOnError: boolean;
  outputDir: string;
}

export const defaultConfig: TestConfig = {
  baseUrl: process.env.E2E_BASE_URL || 'https://evo.ai.udstec.io',
  credentials: {
    email: process.env.E2E_EMAIL || 'rafael@uds.com.br',
    password: process.env.E2E_PASSWORD || 'Evo2024!',
  },
  browser: {
    headless: process.env.E2E_HEADLESS !== 'false',
    timeout: 30000,
    actionTimeout: 10000,
  },
  waitBetweenActions: 1000,
  verbose: process.env.E2E_VERBOSE === 'true',
  screenshotOnError: true,
  outputDir: 'test-results/e2e',
};

export function getConfig(overrides?: Partial<TestConfig>): TestConfig {
  return {
    ...defaultConfig,
    ...overrides,
    browser: {
      ...defaultConfig.browser,
      ...overrides?.browser,
    },
    credentials: {
      ...defaultConfig.credentials,
      ...overrides?.credentials,
    },
  };
}
