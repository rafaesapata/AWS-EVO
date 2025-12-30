/**
 * Nova Act Test Framework - EVO UDS Platform
 * 
 * Framework de testes E2E usando Amazon Nova Act
 * 
 * @example
 * ```typescript
 * import { createNovaActClient, createTestRunner } from './index';
 * 
 * const client = createNovaActClient('https://evo.ai.udstec.io');
 * await client.start();
 * await client.act('Login with valid credentials');
 * await client.stop();
 * ```
 */

// Client
export {
  NovaActClient,
  createNovaActClient,
  quickAct,
  runWorkflow,
  type ActResult,
  type NovaActSession,
} from './lib/nova-client';

// Test Runner
export {
  NovaActTestRunner,
  createTestRunner,
  type TestCase,
  type TestStep,
  type TestResult,
  type StepResult,
  type TestSuiteResult,
} from './lib/test-runner';

// Report Generator
export {
  generateHtmlReport,
  generateJsonReport,
  generateConsoleReport,
} from './lib/report-generator';

// Configuration
export { config, URLS, type NovaActConfig } from './config/nova-act.config';

// Test Data & Schemas
export {
  DashboardMetricsSchema,
  SecurityScanResultSchema,
  AWSResourceSchema,
  CostDataSchema,
  UserInfoSchema,
  SELECTORS,
  EXPECTED_MESSAGES,
  TIMEOUTS,
  TEST_SCENARIOS,
  E2E_FLOWS,
  type DashboardMetrics,
  type SecurityScanResult,
  type AWSResource,
  type CostData,
  type UserInfo,
} from './config/test-data';

// Utilities
export {
  wait,
  timestamp,
  isCI,
  ensureDir,
  saveScreenshot,
  readJson,
  writeJson,
  retry,
  withTimeout,
  formatDuration,
  sanitizeFilename,
  generateId,
  isValidUrl,
  extractDomain,
  urlsMatch,
  logger,
  measureTime,
  chunk,
  parallelLimit,
} from './lib/utils';
