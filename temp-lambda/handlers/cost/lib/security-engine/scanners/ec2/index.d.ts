/**
 * Security Engine V2 - EC2 Scanner
 * Comprehensive EC2 security checks (20+ checks)
 */
import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
export declare class EC2Scanner extends BaseScanner {
    get serviceName(): string;
    get category(): string;
    scan(): Promise<Finding[]>;
    private checkSecurityGroups;
    private checkInstances;
    private checkVolumes;
    private checkSnapshots;
    private checkVPCFlowLogs;
}
export declare function scanEC2(region: string, accountId: string, credentials: AWSCredentials, cache: ResourceCache): Promise<Finding[]>;
//# sourceMappingURL=index.d.ts.map