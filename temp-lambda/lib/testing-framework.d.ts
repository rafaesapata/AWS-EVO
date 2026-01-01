/**
 * Comprehensive Testing Framework
 * Provides unit, integration, and end-to-end testing capabilities
 */
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
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
    lines: {
        total: number;
        covered: number;
        percentage: number;
    };
    functions: {
        total: number;
        covered: number;
        percentage: number;
    };
    branches: {
        total: number;
        covered: number;
        percentage: number;
    };
    statements: {
        total: number;
        covered: number;
        percentage: number;
    };
}
/**
 * Assertion Library
 */
export declare class Assert {
    static assertTrue(condition: boolean, message?: string): AssertionResult;
    static assertFalse(condition: boolean, message?: string): AssertionResult;
    static assertEqual<T>(actual: T, expected: T, message?: string): AssertionResult;
    static assertNotEqual<T>(actual: T, expected: T, message?: string): AssertionResult;
    static assertDeepEqual(actual: any, expected: any, message?: string): AssertionResult;
    static assertThrows(fn: () => any, expectedError?: string | RegExp, message?: string): AssertionResult;
    static assertThrowsAsync(fn: () => Promise<any>, expectedError?: string | RegExp, message?: string): Promise<AssertionResult>;
    static assertContains<T>(array: T[], item: T, message?: string): AssertionResult;
    static assertNotContains<T>(array: T[], item: T, message?: string): AssertionResult;
    static assertGreaterThan(actual: number, expected: number, message?: string): AssertionResult;
    static assertLessThan(actual: number, expected: number, message?: string): AssertionResult;
    static assertBetween(actual: number, min: number, max: number, message?: string): AssertionResult;
}
/**
 * Mock Factory for creating test doubles
 */
export declare class MockFactory {
    private static mocks;
    static createMock<T>(name: string, implementation?: Partial<T>): T;
    static getMock<T>(name: string): T | undefined;
    static clearMocks(): void;
    static createLambdaEvent(overrides?: Partial<APIGatewayProxyEventV2>): APIGatewayProxyEventV2;
    static createLambdaContext(overrides?: Partial<Context>): Context;
}
/**
 * Test Runner
 */
export declare class TestRunner {
    private testSuites;
    private testRuns;
    addTestSuite(suite: TestSuite): void;
    runTestSuite(suiteId: string, options?: {
        environment?: string;
        version?: string;
        filter?: {
            categories?: TestCategory[];
            priorities?: TestPriority[];
            tags?: string[];
        };
    }): Promise<TestRun>;
    private filterTestCases;
    private runTestCasesSequential;
    private runTestCasesParallel;
    private runTestCase;
    getTestRun(runId: string): TestRun | undefined;
    getTestRuns(suiteId?: string): TestRun[];
    generateReport(runId: string, format?: 'json' | 'html' | 'junit'): string;
    private generateJSONReport;
    private generateHTMLReport;
    private generateJUnitReport;
}
export declare const testRunner: TestRunner;
export declare function createLambdaTest(name: string, handler: (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2>, testFn: (event: APIGatewayProxyEventV2, context: Context, result: APIGatewayProxyResultV2) => Promise<AssertionResult[]>): TestCase;
export declare function createDatabaseTest(name: string, testFn: () => Promise<AssertionResult[]>): TestCase;
export declare function createPerformanceTest(name: string, testFn: () => Promise<void>, thresholds: {
    maxDuration?: number;
    maxMemory?: number;
}): TestCase;
//# sourceMappingURL=testing-framework.d.ts.map