/**
 * Security Engine V2 - AWS Glue Scanner
 * Comprehensive Glue security checks for data processing workloads
 * NEW SCANNER - Sprint 1 Priority Implementation
 */
import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
export declare class GlueScanner extends BaseScanner {
    get serviceName(): string;
    get category(): string;
    scan(): Promise<Finding[]>;
    private checkJobEncryption;
    private checkDataCatalogEncryption;
    private checkConnectionSSL;
    private checkCrawlerPermissions;
    private checkSecurityConfigurations;
    private checkDatabaseSecurity;
}
export declare function scanGlue(region: string, accountId: string, credentials: AWSCredentials, cache: ResourceCache): Promise<Finding[]>;
//# sourceMappingURL=index.d.ts.map