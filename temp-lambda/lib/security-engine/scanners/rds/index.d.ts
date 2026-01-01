/**
 * Security Engine V3 - RDS Scanner
 * Comprehensive RDS security checks (15+ checks)
 */
import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
export declare class RDSScanner extends BaseScanner {
    get serviceName(): string;
    get category(): string;
    scan(): Promise<Finding[]>;
    private checkDBInstances;
    private checkDBClusters;
    private checkSnapshots;
}
export declare function scanRDS(region: string, accountId: string, credentials: AWSCredentials, cache: ResourceCache): Promise<Finding[]>;
//# sourceMappingURL=index.d.ts.map