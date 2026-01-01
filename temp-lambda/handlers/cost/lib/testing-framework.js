"use strict";
/**
 * Comprehensive Testing Framework
 * Provides unit, integration, and end-to-end testing capabilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testRunner = exports.TestRunner = exports.MockFactory = exports.Assert = void 0;
exports.createLambdaTest = createLambdaTest;
exports.createDatabaseTest = createDatabaseTest;
exports.createPerformanceTest = createPerformanceTest;
const logging_js_1 = require("./logging.js");
/**
 * Assertion Library
 */
class Assert {
    static assertTrue(condition, message) {
        return {
            description: message || 'Expected condition to be true',
            success: condition,
            expected: true,
            actual: condition,
            error: condition ? undefined : 'Assertion failed: condition is false',
        };
    }
    static assertFalse(condition, message) {
        return {
            description: message || 'Expected condition to be false',
            success: !condition,
            expected: false,
            actual: condition,
            error: !condition ? undefined : 'Assertion failed: condition is true',
        };
    }
    static assertEqual(actual, expected, message) {
        const success = actual === expected;
        return {
            description: message || 'Expected values to be equal',
            success,
            expected,
            actual,
            error: success ? undefined : `Expected ${expected}, but got ${actual}`,
        };
    }
    static assertNotEqual(actual, expected, message) {
        const success = actual !== expected;
        return {
            description: message || 'Expected values to be different',
            success,
            expected: `not ${expected}`,
            actual,
            error: success ? undefined : `Expected values to be different, but both are ${actual}`,
        };
    }
    static assertDeepEqual(actual, expected, message) {
        const success = JSON.stringify(actual) === JSON.stringify(expected);
        return {
            description: message || 'Expected objects to be deeply equal',
            success,
            expected,
            actual,
            error: success ? undefined : 'Objects are not deeply equal',
        };
    }
    static assertThrows(fn, expectedError, message) {
        try {
            fn();
            return {
                description: message || 'Expected function to throw an error',
                success: false,
                expected: 'Error to be thrown',
                actual: 'No error thrown',
                error: 'Function did not throw an error',
            };
        }
        catch (error) {
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
    static async assertThrowsAsync(fn, expectedError, message) {
        try {
            await fn();
            return {
                description: message || 'Expected async function to throw an error',
                success: false,
                expected: 'Error to be thrown',
                actual: 'No error thrown',
                error: 'Async function did not throw an error',
            };
        }
        catch (error) {
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
    static assertContains(array, item, message) {
        const success = array.includes(item);
        return {
            description: message || 'Expected array to contain item',
            success,
            expected: `Array containing ${item}`,
            actual: array,
            error: success ? undefined : `Array does not contain ${item}`,
        };
    }
    static assertNotContains(array, item, message) {
        const success = !array.includes(item);
        return {
            description: message || 'Expected array to not contain item',
            success,
            expected: `Array not containing ${item}`,
            actual: array,
            error: success ? undefined : `Array contains ${item}`,
        };
    }
    static assertGreaterThan(actual, expected, message) {
        const success = actual > expected;
        return {
            description: message || 'Expected value to be greater than threshold',
            success,
            expected: `> ${expected}`,
            actual,
            error: success ? undefined : `${actual} is not greater than ${expected}`,
        };
    }
    static assertLessThan(actual, expected, message) {
        const success = actual < expected;
        return {
            description: message || 'Expected value to be less than threshold',
            success,
            expected: `< ${expected}`,
            actual,
            error: success ? undefined : `${actual} is not less than ${expected}`,
        };
    }
    static assertBetween(actual, min, max, message) {
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
exports.Assert = Assert;
/**
 * Mock Factory for creating test doubles
 */
class MockFactory {
    static createMock(name, implementation) {
        const mock = new Proxy(implementation || {}, {
            get(target, prop) {
                if (prop in target) {
                    return target[prop];
                }
                // Create a mock function that tracks calls
                const mockFn = (...args) => {
                    mockFn.calls = mockFn.calls || [];
                    mockFn.calls.push(args);
                    return mockFn.returnValue;
                };
                mockFn.calls = [];
                mockFn.returnValue = undefined;
                mockFn.mockReturnValue = (value) => {
                    mockFn.returnValue = value;
                    return mockFn;
                };
                mockFn.mockImplementation = (fn) => {
                    target[prop] = fn;
                    return mockFn;
                };
                target[prop] = mockFn;
                return mockFn;
            },
        });
        this.mocks.set(name, mock);
        return mock;
    }
    static getMock(name) {
        return this.mocks.get(name);
    }
    static clearMocks() {
        this.mocks.clear();
    }
    static createLambdaEvent(overrides = {}) {
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
    static createLambdaContext(overrides = {}) {
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
            done: () => { },
            fail: () => { },
            succeed: () => { },
            ...overrides,
        };
    }
}
exports.MockFactory = MockFactory;
MockFactory.mocks = new Map();
/**
 * Test Runner
 */
class TestRunner {
    constructor() {
        this.testSuites = new Map();
        this.testRuns = new Map();
    }
    addTestSuite(suite) {
        this.testSuites.set(suite.id, suite);
        logging_js_1.logger.info('Test suite added', {
            suiteId: suite.id,
            name: suite.name,
            testCount: suite.testCases.length,
        });
    }
    async runTestSuite(suiteId, options = {}) {
        const suite = this.testSuites.get(suiteId);
        if (!suite) {
            throw new Error(`Test suite not found: ${suiteId}`);
        }
        const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        const testRun = {
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
        logging_js_1.logger.info('Starting test run', {
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
            }
            else {
                await this.runTestCasesSequential(testCases, testRun, suite.timeout);
            }
            // Run suite teardown
            if (suite.teardown) {
                await suite.teardown();
            }
            testRun.status = testRun.summary.failed > 0 ? 'failed' : 'completed';
            testRun.endTime = new Date();
            testRun.summary.duration = testRun.endTime.getTime() - testRun.startTime.getTime();
            logging_js_1.logger.info('Test run completed', {
                runId,
                status: testRun.status,
                summary: testRun.summary,
            });
        }
        catch (error) {
            testRun.status = 'failed';
            testRun.endTime = new Date();
            logging_js_1.logger.error('Test run failed', error, { runId });
        }
        return testRun;
    }
    filterTestCases(testCases, filter) {
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
    async runTestCasesSequential(testCases, testRun, suiteTimeout) {
        for (const testCase of testCases) {
            const result = await this.runTestCase(testCase, suiteTimeout);
            testRun.results.set(testCase.id, result);
            if (result.success) {
                testRun.summary.passed++;
            }
            else {
                testRun.summary.failed++;
            }
        }
    }
    async runTestCasesParallel(testCases, testRun, suiteTimeout) {
        const promises = testCases.map(async (testCase) => {
            const result = await this.runTestCase(testCase, suiteTimeout);
            testRun.results.set(testCase.id, result);
            return { testCase, result };
        });
        const results = await Promise.allSettled(promises);
        for (const result of results) {
            if (result.status === 'fulfilled') {
                if (result.value.result.success) {
                    testRun.summary.passed++;
                }
                else {
                    testRun.summary.failed++;
                }
            }
            else {
                testRun.summary.failed++;
            }
        }
    }
    async runTestCase(testCase, suiteTimeout) {
        const startTime = Date.now();
        const timeout = testCase.timeout || suiteTimeout || 30000;
        logging_js_1.logger.debug('Running test case', {
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
                new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), timeout)),
            ]);
            result.duration = Date.now() - startTime;
            // Run teardown
            if (testCase.teardown) {
                await testCase.teardown();
            }
            logging_js_1.logger.debug('Test case completed', {
                testId: testCase.id,
                success: result.success,
                duration: result.duration,
            });
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            // Run teardown even on failure
            if (testCase.teardown) {
                try {
                    await testCase.teardown();
                }
                catch (teardownError) {
                    logging_js_1.logger.error('Test teardown failed', teardownError, {
                        testId: testCase.id,
                    });
                }
            }
            logging_js_1.logger.error('Test case failed', error, {
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
    getTestRun(runId) {
        return this.testRuns.get(runId);
    }
    getTestRuns(suiteId) {
        const runs = Array.from(this.testRuns.values());
        if (suiteId) {
            return runs.filter(run => run.suiteId === suiteId);
        }
        return runs.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    }
    generateReport(runId, format = 'json') {
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
    generateJSONReport(testRun) {
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
    generateHTMLReport(testRun) {
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
    generateJUnitReport(testRun) {
        // Simplified JUnit XML format
        const testCases = Array.from(testRun.results.entries()).map(([testId, result]) => {
            if (result.success) {
                return `<testcase name="${testId}" time="${result.duration / 1000}" />`;
            }
            else {
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
exports.TestRunner = TestRunner;
// Global test runner instance
exports.testRunner = new TestRunner();
// Helper functions for common test patterns
function createLambdaTest(name, handler, testFn) {
    return {
        id: `lambda_${name.toLowerCase().replace(/\s+/g, '_')}`,
        name,
        description: `Lambda function test: ${name}`,
        category: 'integration',
        priority: 'medium',
        tags: ['lambda', 'api'],
        test: async () => {
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
function createDatabaseTest(name, testFn) {
    return {
        id: `db_${name.toLowerCase().replace(/\s+/g, '_')}`,
        name,
        description: `Database test: ${name}`,
        category: 'integration',
        priority: 'high',
        tags: ['database', 'persistence'],
        test: async () => {
            const assertions = await testFn();
            return {
                success: assertions.every(a => a.success),
                duration: 0,
                assertions,
            };
        },
    };
}
function createPerformanceTest(name, testFn, thresholds) {
    return {
        id: `perf_${name.toLowerCase().replace(/\s+/g, '_')}`,
        name,
        description: `Performance test: ${name}`,
        category: 'performance',
        priority: 'medium',
        tags: ['performance', 'benchmark'],
        test: async () => {
            const startTime = Date.now();
            const startMemory = process.memoryUsage().heapUsed;
            await testFn();
            const duration = Date.now() - startTime;
            const memoryUsed = process.memoryUsage().heapUsed - startMemory;
            const assertions = [];
            if (thresholds.maxDuration) {
                assertions.push(Assert.assertLessThan(duration, thresholds.maxDuration, `Duration should be less than ${thresholds.maxDuration}ms`));
            }
            if (thresholds.maxMemory) {
                assertions.push(Assert.assertLessThan(memoryUsed, thresholds.maxMemory, `Memory usage should be less than ${thresholds.maxMemory} bytes`));
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
//# sourceMappingURL=testing-framework.js.map