/**
 * Security Engine V3 - IAM Scanner
 * Comprehensive IAM security checks (25+ checks)
 */
import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
export declare class IAMScanner extends BaseScanner {
    get serviceName(): string;
    get category(): string;
    scan(): Promise<Finding[]>;
    private checkPasswordPolicy;
    private checkRootAccountMFA;
    private checkUsersMFA;
    private checkAccessKeys;
    private checkAdminPolicies;
    private checkRoleTrustPolicies;
    private checkAccountSummary;
    /**
     * Check IAM Access Analyzer configuration and findings
     * CRITICAL: Access Analyzer helps identify resources shared with external entities
     */
    private checkAccessAnalyzer;
}
export declare function scanIAM(region: string, accountId: string, credentials: AWSCredentials, cache: ResourceCache): Promise<Finding[]>;
//# sourceMappingURL=index.d.ts.map