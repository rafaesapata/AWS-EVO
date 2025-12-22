/**
 * Comprehensive Testing Framework
 * Provides unit, integration, and end-to-end testing capabilities
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { logger } from './logging.js';

export interface TestCase {
  id: string;
  name: string;
  description: string;
  category: TestCategory;
  priority: TestPriority;
  tags: string[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  test: () => Promise<TestResult>;
  timeout?: number;
  retries?: number;
  dependencies?: string[];
}

export type TestCategory = 'unit' | 'integration' | 'e2e' | 'performance' | 'security' | 'smoke';
export type TestPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TestResult {
  success: boolean;
  duration: number;
  message?: string;
  error?: Error;
  assertions: AssertionResult[];
  metrics?: Record<string, number>;
  artifacts?: TestArtifact[];
}

export interface AssertionResult {
  description: string;
  success: boolean;
  expected?: any;
  actual?: any;
  error?: string;
}

export interface TestArtifact {
  type: 'screenshot' | 'log' | 'report' | 'data';
  name: string;
  content: string | Buffer;
  metadata?: Record<string, any>;
}

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  testCases: TestCase[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  parallel?: boolean;
  timeout?: number;
}

export interface TestRun {
  id: string;
  suiteId: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  results: Map<string, TestResult>;
  summary: TestSummary;
  environment: string;
  version: string;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage?: CoverageReport;
}

export interface CoverageReport {
  lines: { total: number; covered: number; percentage: number };
  functions: { total: number; covered: number; percentage: number };
  branches: { total: number; covered: number; percentage: number };
  statements: { total: number; covered: number; percentage: number };
}

/**
 * Assertion Library
 */
export class Assert {
  static assertTrue(condition: boolean, message?: string): AssertionResult {
    return {
      description: message || 'Expected condition to be true',
      success: condition,
      expected: true,
      actual: condition,
      error: condition ? undefined : 'Assertion failed: condition is false',
    };
  }

  static assertFalse(condition: boolean, message?: string): AssertionResult {
    return {
      description: message || 'Expected condition to be false',
      success: !condition,
      expected: false,
      actual: condition,
      error: !condition ? undefined : 'Assertion failed: condition is true',
    };
  }

  static assertEqual<T>(actual: T, expected: T, message?: string): AssertionResult {
    const success = actual === expected;
    return {
      description: message || 'Expected values to be equal',
      success,
      expected,
      actual,
      error: success ? undefined : `Expected ${expected}, but got ${actual}`,
    };
  }

  static assertNotEqual<T>(actual: T, expected: T, message?: string): AssertionResult {
    const success = actual !== expected;
    return {
      description: message || 'Expected values to be different',
      success,
      expected: `not ${expected}`,
      actual,
      error: success ? undefined : `Expected values to be different, but both are ${actual}`,
    };
  }

  static assertDeepEqual(actual: any, expected: any, message?: string): AssertionResult {
    const success = JSON.stringify(actual) === JSON.stringify(expected);
    return {
      description: message || 'Expected objects to be deeply equal',
      success,
      expected,
      actual,
      error: success ? undefined : 'Objects are not deeply equal',
    };
  }

  static assertThrows(fn: () => any, expectedError?: string | RegExp, message?: string): AssertionResult {
    try {
      fn();
      return {
        description: message || 'Expected function to throw an error',
        success: false,
        expected: 'Error to be thrown',
        actual: 'No error thrown',
        error: 'Function did not throw an error',
      };
    } catch (error) {
      if (expectedError) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const matches = typeof expectedError === 'string' 
          ? errorMessage.includes(expectedError)
          : expectedError.test(errorMessage);
        
        return {
          description: message || 'Expected function to throw specific error',
          success: matches,
          expected: expectedError,
          actual: errorMessage,
          error: matches ? undefined : `Error message doesn't match expected pattern`,
        };
      }
      
      return {
        description: message || 'Expected function to throw an error',
        success: true,
        expected: 'Error to be thrown',
        actual: 'Error thrown',
      };
    }
  }

  static async assertThrowsAsync(
    fn: () => Promise<any>, 
    expectedError?: string | RegExp, 
    message?: string
  ): Promise<AssertionResult> {
    try {
      await fn();
      return {
        description: message || 'Expected async function to throw an error',
        success: false,
        expected: 'Error to be thrown',
        actual: 'No error thrown',
        error: 'Async function did not throw an error',
      };
    } catch (error) {
      if (expectedError) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const matches = typeof expectedError === 'string' 
          ? errorMessage.includes(expectedError)
          : expectedError.test(errorMessage);
        
        return {
          description: message || 'Expected async function to throw specific error',
          success: matches,
          expected: expectedError,
          actual: errorMessage,
          error: matches ? undefined : `Error message doesn't match expected pattern`,
        };
      }
      
      return {
        description: message || 'Expected async function to throw an error',
        success: true,
        expected: 'Error to be thrown',
        actual: 'Error thrown',
      };
    }
  }

  static assertContains<T>(array: T[], item: T, message?: string): AssertionResult {
    const success = array.includes(item);
    return {
      description: message || 'Expected array to contain item',
      success,
      expected: `Array containing ${item}`,
      actual: array,
      error: success ? undefined : `Array does not contain ${item}`,
    };
  }

  static assertNotContains<T>(array: T[], item: T, message?: string): AssertionResult {
    const success = !array.includes(item);
    return {
      description: message || 'Expected array to not contain item',
      success,
      expected: `Array not containing ${item}`,
      actual: array,
      error: success ? undefined : `Array contains ${item}`,
    };
  }

  static assertGreaterThan(actual: number, expected: number, message?: string): AssertionResult {
    const success = actual > expected;
    return {
      description: message || 'Expected value to be greater than threshold',
      success,
      expected: `> ${expected}`,
      actual,
      error: success ? undefined : `${actual} is not greater than ${expected}`,
    };
  }

  static assertLessThan(actual: number, expected: number, message?: string): AssertionResult {
    const success = actual < expected;
    return {
      description: message || 'Expected value to be less than threshold',
      success,
      expected: `< ${expected}`,
      actual,
      error: success ? undefined : `${actual} is not less than ${expected}`,
    };
  }

  static assertBetween(actual: number, min: number, max: number, message?: string): AssertionResult {
    const success = actual >= min && actual <= max;
    return {
      description: message || 'Expected value to be between range',
      success,
      expected: `Between ${min} and ${max}`,
      actual,
      error: success ? undefined : `${actual} is not between ${min} and ${max}`,
    };
  }
}

/**
 * Mock Factory for creating test doubles
 */
export class MockFactory {
  private static mocks: Map<string, any> = new Map();

  static createMock<T>(name: string, implementation?: Partial<T>): T {
    const mock = new Proxy(implementation || {}, {
      get(target: any, prop: string) {
        if (prop in target) {
          return target[prop];
        }
        
        // Create a mock function that tracks calls
        const mockFn = (...args: any[]) => {
          (mockFn as any).calls = (mockFn as any).calls || [];
          (mockFn as any).calls.push(args);
          return mockFn.returnValue;
        };
        
        (mockFn as any).calls = [];
        mockFn.returnValue = undefined;
        mockFn.mockReturnValue = (value: any) => {
          mockFn.returnValue = value;
          return mockFn;
        };
        mockFn.mockImplementation = (fn: Function) => {
          target[prop] = fn;
          return mockFn;
        };
        
        target[prop] = mockFn;
        return mockFn;
      },
    });

    this.mocks.set(name, mock);
    return mock as T;
  }

  static getMock<T>(name: string): T | undefined {
    return this.mocks.get(name);
  }

  static clearMocks(): void {
    this.mocks.clear();
  }

  static createLambdaEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
    return {
      version: '2.0',
      routeKey: 'GET /test',
      rawPath: '/test',
      rawQueryString: '',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
      },
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api',
        domainName: 'test.execute-api.us-east-1.amazonaws.com',
        domainPrefix: 'test',
        requestId: 'test-request-id',
        routeKey: 'GET /test',
        stage: 'test',
        time: '01/Jan/2023:00:00:00 +0000',
        timeEpoch: 1672531200000,
        http: {
          method: 'GET',
          path: '/test',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test-agent',
        },
      },
      isBase64Encoded: false,
      ...overrides,
    };
  }

  static createLambdaContext(overrides: Partial<Context> = {}): Context {
    return {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'test-function',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
      memoryLimitInMB: '128',
      awsRequestId: 'test-request-id',
      logGroupName: '/aws/lambda/test-function',
      logStreamName: '2023/01/01/[$LATEST]test-stream',
      getRemainingTimeInMillis: () => 30000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
      ...overrides,
    };
  }
}

/**
 * Test Runner
 */
export class TestRunner {
  private testSuites: Map<string, TestSuite> = new Map();
  private testRuns: Map<string, TestRun> = new Map();

  addTestSuite(suite: TestSuite): void {
    this.testSuites.set(suite.id, suite);
    logger.info('Test suite added', {
      suiteId: suite.id,
      name: suite.name,
      testCount: suite.testCases.length,
    });
  }

  async runTestSuite(
    suiteId: string,
    options: {
      environment?: string;
      version?: string;
      filter?: {
        categories?: TestCategory[];
        priorities?: TestPriority[];
        tags?: string[];
      };
    } = {}
  ): Promise<TestRun> {
    const suite = this.testSuites.get(suiteId);
    if (!suite) {
      throw new Error(`Test suite not found: ${suiteId}`);
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    const testRun: TestRun = {
      id: runId,
      suiteId,
      startTime: new Date(),
      status: 'running',
      results: new Map(),
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
      },
      environment: options.environment || 'test',
      version: options.version || '1.0.0',
    };

    this.testRuns.set(runId, testRun);

    logger.info('Starting test run', {
      runId,
      suiteId,
      environment: testRun.environment,
      version: testRun.version,
    });

    try {
      // Filter test cases
      let testCases = suite.testCases;
      if (options.filter) {
        testCases = this.filterTestCases(testCases, options.filter);
      }

      testRun.summary.total = testCases.length;

      // Run suite setup
      if (suite.setup) {
        await suite.setup();
      }

      // Run test cases
      if (suite.parallel) {
        await this.runTestCasesParallel(testCases, testRun, suite.timeout);
      } else {
        await this.runTestCasesSequential(testCases, testRun, suite.timeout);
      }

      // Run suite teardown
      if (suite.teardown) {
        await suite.teardown();
      }

      testRun.status = testRun.summary.failed > 0 ? 'failed' : 'completed';
      testRun.endTime = new Date();
      testRun.summary.duration = testRun.endTime.getTime() - testRun.startTime.getTime();

      logger.info('Test run completed', {
        runId,
        status: testRun.status,
        summary: testRun.summary,
      });

    } catch (error) {
      testRun.status = 'failed';
      testRun.endTime = new Date();
      
      logger.error('Test run failed', error as Error, { runId });
    }

    return testRun;
  }

  private filterTestCases(
    testCases: TestCase[],
    filter: {
      categories?: TestCategory[];
      priorities?: TestPriority[];
      tags?: string[];
    }
  ): TestCase[] {
    return testCases.filter(testCase => {
      if (filter.categories && !filter.categories.includes(testCase.category)) {
        return false;
      }
      
      if (filter.priorities && !filter.priorities.includes(testCase.priority)) {
        return false;
      }
      
      if (filter.tags && !filter.tags.some(tag => testCase.tags.includes(tag))) {
        return false;
      }
      
      return true;
    });
  }

  private async runTestCasesSequential(
    testCases: TestCase[],
    testRun: TestRun,
    suiteTimeout?: number
  ): Promise<void> {
    for (const testCase of testCases) {
      const result = await this.runTestCase(testCase, suiteTimeout);
      testRun.results.set(testCase.id, result);
      
      if (result.success) {
        testRun.summary.passed++;
      } else {
        testRun.summary.failed++;
      }
    }
  }

  private async runTestCasesParallel(
    testCases: TestCase[],
    testRun: TestRun,
    suiteTimeout?: number
  ): Promise<void> {
    const promises = testCases.map(async testCase => {
      const result = await this.runTestCase(testCase, suiteTimeout);
      testRun.results.set(testCase.id, result);
      return { testCase, result };
    });

    const results = await Promise.allSettled(promises);
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.result.success) {
          testRun.summary.passed++;
        } else {
          testRun.summary.failed++;
        }
      } else {
        testRun.summary.failed++;
      }
    }
  }

  private async runTestCase(testCase: TestCase, suiteTimeout?: number): Promise<TestResult> {
    const startTime = Date.now();
    const timeout = testCase.timeout || suiteTimeout || 30000;

    logger.debug('Running test case', {
      testId: testCase.id,
      name: testCase.name,
      category: testCase.category,
    });

    try {
      // Run setup
      if (testCase.setup) {
        await testCase.setup();
      }

      // Run test with timeout
      const result = await Promise.race([
        testCase.test(),
        new Promise<TestResult>((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), timeout)
        ),
      ]);

      result.duration = Date.now() - startTime;

      // Run teardown
      if (testCase.teardown) {
        await testCase.teardown();
      }

      logger.debug('Test case completed', {
        testId: testCase.id,
        success: result.success,
        duration: result.duration,
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Run teardown even on failure
      if (testCase.teardown) {
        try {
          await testCase.teardown();
        } catch (teardownError) {
          logger.error('Test teardown failed', teardownError as Error, {
            testId: testCase.id,
          });
        }
      }

      logger.error('Test case failed', error as Error, {
        testId: testCase.id,
        duration,
      });

      return {
        success: false,
        duration,
        error: error instanceof Error ? error : new Error(String(error)),
        assertions: [],
      };
    }
  }

  getTestRun(runId: string): TestRun | undefined {
    return this.testRuns.get(runId);
  }

  getTestRuns(suiteId?: string): TestRun[] {
    const runs = Array.from(this.testRuns.values());
    
    if (suiteId) {
      return runs.filter(run => run.suiteId === suiteId);
    }
    
    return runs.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  generateReport(runId: string, format: 'json' | 'html' | 'junit' = 'json'): string {
    const testRun = this.testRuns.get(runId);
    if (!testRun) {
      throw new Error(`Test run not found: ${runId}`);
    }

    switch (format) {
      case 'json':
        return this.generateJSONReport(testRun);
      case 'html':
        return this.generateHTMLReport(testRun);
      case 'junit':
        return this.generateJUnitReport(testRun);
      default:
        throw new Error(`Unsupported report format: ${format}`);
    }
  }

  private generateJSONReport(testRun: TestRun): string {
    const report = {
      runId: testRun.id,
      suiteId: testRun.suiteId,
      startTime: testRun.startTime.toISOString(),
      endTime: testRun.endTime?.toISOString(),
      status: testRun.status,
      environment: testRun.environment,
      version: testRun.version,
      summary: testRun.summary,
      results: Array.from(testRun.results.entries()).map(([testId, result]) => ({
        testId,
        ...result,
      })),
    };

    return JSON.stringify(report, null, 2);
  }

  private generateHTMLReport(testRun: TestRun): string {
    // Simplified HTML report
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Test Report - ${testRun.id}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; }
        .passed { color: green; }
        .failed { color: red; }
        .test-case { margin: 10px 0; padding: 10px; border: 1px solid #ddd; }
    </style>
</head>
<body>
    <h1>Test Report</h1>
    <div class="summary">
        <h2>Summary</h2>
        <p>Total: ${testRun.summary.total}</p>
        <p class="passed">Passed: ${testRun.summary.passed}</p>
        <p class="failed">Failed: ${testRun.summary.failed}</p>
        <p>Duration: ${testRun.summary.duration}ms</p>
    </div>
    <h2>Test Results</h2>
    ${Array.from(testRun.results.entries()).map(([testId, result]) => `
        <div class="test-case ${result.success ? 'passed' : 'failed'}">
            <h3>${testId}</h3>
            <p>Status: ${result.success ? 'PASSED' : 'FAILED'}</p>
            <p>Duration: ${result.duration}ms</p>
            ${result.error ? `<p>Error: ${result.error.message}</p>` : ''}
        </div>
    `).join('')}
</body>
</html>
    `.trim();
  }

  private generateJUnitReport(testRun: TestRun): string {
    // Simplified JUnit XML format
    const testCases = Array.from(testRun.results.entries()).map(([testId, result]) => {
      if (result.success) {
        return `<testcase name="${testId}" time="${result.duration / 1000}" />`;
      } else {
        return `
<testcase name="${testId}" time="${result.duration / 1000}">
    <failure message="${result.error?.message || 'Test failed'}">${result.error?.stack || ''}</failure>
</testcase>
        `.trim();
      }
    }).join('\n');

    return `
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${testRun.suiteId}" tests="${testRun.summary.total}" failures="${testRun.summary.failed}" time="${testRun.summary.duration / 1000}">
${testCases}
</testsuite>
    `.trim();
  }
}

// Global test runner instance
export const testRunner = new TestRunner();

// Helper functions for common test patterns
export function createLambdaTest(
  name: string,
  handler: (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2>,
  testFn: (event: APIGatewayProxyEventV2, context: Context, result: APIGatewayProxyResultV2) => Promise<AssertionResult[]>
): TestCase {
  return {
    id: `lambda_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    description: `Lambda function test: ${name}`,
    category: 'integration',
    priority: 'medium',
    tags: ['lambda', 'api'],
    test: async (): Promise<TestResult> => {
      const event = MockFactory.createLambdaEvent();
      const context = MockFactory.createLambdaContext();
      
      const result = await handler(event, context);
      const assertions = await testFn(event, context, result);
      
      return {
        success: assertions.every(a => a.success),
        duration: 0, // Will be set by runner
        assertions,
      };
    },
  };
}

export function createDatabaseTest(
  name: string,
  testFn: () => Promise<AssertionResult[]>
): TestCase {
  return {
    id: `db_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    description: `Database test: ${name}`,
    category: 'integration',
    priority: 'high',
    tags: ['database', 'persistence'],
    test: async (): Promise<TestResult> => {
      const assertions = await testFn();
      
      return {
        success: assertions.every(a => a.success),
        duration: 0,
        assertions,
      };
    },
  };
}

export function createPerformanceTest(
  name: string,
  testFn: () => Promise<void>,
  thresholds: {
    maxDuration?: number;
    maxMemory?: number;
  }
): TestCase {
  return {
    id: `perf_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    description: `Performance test: ${name}`,
    category: 'performance',
    priority: 'medium',
    tags: ['performance', 'benchmark'],
    test: async (): Promise<TestResult> => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;
      
      await testFn();
      
      const duration = Date.now() - startTime;
      const memoryUsed = process.memoryUsage().heapUsed - startMemory;
      
      const assertions: AssertionResult[] = [];
      
      if (thresholds.maxDuration) {
        assertions.push(Assert.assertLessThan(
          duration,
          thresholds.maxDuration,
          `Duration should be less than ${thresholds.maxDuration}ms`
        ));
      }
      
      if (thresholds.maxMemory) {
        assertions.push(Assert.assertLessThan(
          memoryUsed,
          thresholds.maxMemory,
          `Memory usage should be less than ${thresholds.maxMemory} bytes`
        ));
      }
      
      return {
        success: assertions.every(a => a.success),
        duration,
        assertions,
        metrics: {
          duration,
          memoryUsed,
        },
      };
    },
  };
}