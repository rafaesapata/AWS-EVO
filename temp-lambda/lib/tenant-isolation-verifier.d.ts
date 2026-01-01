/**
 * Multi-Tenant Data Isolation Verifier
 * Military-grade verification of tenant data isolation and security boundaries
 */
export interface TenantIsolationTest {
    id: string;
    name: string;
    description: string;
    category: 'data_access' | 'api_security' | 'cache_isolation' | 'query_isolation' | 'file_access';
    severity: 'critical' | 'high' | 'medium' | 'low';
    testFunction: (organizationId1: string, organizationId2: string) => Promise<TenantIsolationResult>;
}
export interface TenantIsolationResult {
    testId: string;
    passed: boolean;
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    details: Record<string, any>;
    evidence?: any[];
    remediation?: string;
}
export interface TenantIsolationReport {
    organizationId: string;
    testResults: TenantIsolationResult[];
    overallStatus: 'secure' | 'vulnerable' | 'critical_vulnerability';
    riskScore: number;
    summary: {
        totalTests: number;
        passed: number;
        failed: number;
        criticalFailures: number;
    };
    recommendations: string[];
    timestamp: Date;
}
export declare class TenantIsolationVerifier {
    private prisma;
    private tests;
    constructor();
    /**
     * Initialize all tenant isolation tests
     */
    private initializeTests;
    /**
     * Run comprehensive tenant isolation verification
     */
    runIsolationVerification(organizationId: string): Promise<TenantIsolationReport>;
    /**
     * Test organization data isolation
     */
    private testOrganizationDataIsolation;
    /**
     * Test security findings data isolation
     */
    private testFindingsDataIsolation;
    /**
     * Test AWS credentials isolation
     */
    private testAwsCredentialsIsolation;
    /**
     * Test user profile isolation
     */
    private testUserProfileIsolation;
    /**
     * Test knowledge base isolation
     */
    private testKnowledgeBaseIsolation;
    /**
     * Test cross-tenant API access
     */
    private testCrossTenantApiAccess;
    /**
     * Test parameter tampering protection
     */
    private testParameterTampering;
    /**
     * Test query WHERE clause isolation
     */
    private testQueryWhereClauseIsolation;
    /**
     * Test JOIN query isolation
     */
    private testJoinQueryIsolation;
    /**
     * Test cache key isolation
     */
    private testCacheKeyIsolation;
    /**
     * Test S3 file isolation
     */
    private testS3FileIsolation;
    /**
     * Get another organization for testing
     */
    private getOtherOrganization;
    /**
     * Generate isolation verification report
     */
    private generateReport;
    /**
     * Generate recommendations based on test results
     */
    private generateRecommendations;
    /**
     * Store verification results in database
     */
    private storeVerificationResults;
}
export declare const tenantIsolationVerifier: TenantIsolationVerifier;
//# sourceMappingURL=tenant-isolation-verifier.d.ts.map