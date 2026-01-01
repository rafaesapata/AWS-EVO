/**
 * Comprehensive Testing Framework
 * Military-grade testing suite with automated test generation and execution
 */
export interface TestSuite {
    id: string;
    name: string;
    description: string;
    category: 'unit' | 'integration' | 'e2e' | 'security' | 'performance' | 'load';
    priority: 'critical' | 'high' | 'medium' | 'low';
    tests: Test[];
    setup?: () => Promise<void>;
    teardown?: () => Promise<void>;
}
export interface Test {
    id: string;
    name: string;
    description: string;
    timeout: number;
    retries: number;
    tags: string[];
    testFunction: () => Promise<TestResult>;
    dependencies?: string[];
}
export interface TestResult {
    testId: string;
    passed: boolean;
    duration: number;
    error?: Error;
    logs: string[];
    metrics?: Record<string, number>;
    evidence?: any;
}
export interface TestExecution {
    id: string;
    suiteId: string;
    organizationId?: string;
    startTime: Date;
    endTime?: Date;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    results: TestResult[];
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        duration: number;
    };
    coverage?: {
        lines: number;
        functions: number;
        branches: number;
        statements: number;
    };
}
export interface LoadTestConfig {
    targetUrl: string;
    concurrentUsers: number;
    duration: number;
    rampUpTime: number;
    requestsPerSecond?: number;
    scenarios: LoadTestScenario[];
}
export interface LoadTestScenario {
    name: string;
    weight: number;
    requests: Array<{
        method: 'GET' | 'POST' | 'PUT' | 'DELETE';
        path: string;
        headers?: Record<string, string>;
        body?: any;
        expectedStatus?: number;
    }>;
}
export interface PerformanceTestResult {
    scenario: string;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
    throughput: number;
}
export declare class ComprehensiveTestingFramework {
    private prisma;
    private testSuites;
    private activeExecutions;
    private testHistory;
    constructor();
    /**
     * Initialize comprehensive test suites
     */
    private initializeTestSuites;
    /**
     * Register a test suite
     */
    registerTestSuite(suite: TestSuite): void;
    /**
     * Execute a test suite
     */
    executeTestSuite(suiteId: string, organizationId?: string, options?: {
        parallel?: boolean;
        failFast?: boolean;
        tags?: string[];
    }): Promise<TestExecution>;
    /**
     * Execute load testing
     */
    executeLoadTest(config: LoadTestConfig): Promise<PerformanceTestResult[]>;
    /**
     * Execute tests sequentially
     */
    private executeTestsSequentially;
    /**
     * Execute tests in parallel
     */
    private executeTestsInParallel;
    /**
     * Execute a single test
     */
    private executeTest;
    /**
     * Execute load test scenario
     */
    private executeLoadTestScenario;
    /**
     * Test implementations
     */
    private testAuthenticationBypass;
    private testSqlInjection;
    private testXssVulnerabilities;
    private testCsrfProtection;
    private testTenantIsolation;
    private testApiResponseTime;
    private testDatabasePerformance;
    private testCachePerformance;
    private testMemoryLeaks;
    private testAwsIntegration;
    private testDatabaseIntegration;
    private testApiWorkflows;
    private testHighConcurrency;
    private testSustainedLoad;
    /**
     * Get test execution history
     */
    getTestHistory(): TestExecution[];
    /**
     * Get active test executions
     */
    getActiveExecutions(): TestExecution[];
    /**
     * Get test suite information
     */
    getTestSuites(): TestSuite[];
}
export declare const comprehensiveTestingFramework: ComprehensiveTestingFramework;
//# sourceMappingURL=comprehensive-testing-framework.d.ts.map