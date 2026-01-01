/**
 * Security Engine V2 - Systems Manager (SSM) Scanner
 */
import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
export declare class SSMScanner extends BaseScanner {
    get serviceName(): string;
    get category(): string;
    scan(): Promise<Finding[]>;
}
export declare function scanSSM(region: string, accountId: string, credentials: AWSCredentials, cache: ResourceCache): Promise<Finding[]>;
//# sourceMappingURL=index.d.ts.map