/**
 * Security Engine V3 - KMS Scanner
 */
import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
export declare class KMSScanner extends BaseScanner {
    get serviceName(): string;
    get category(): string;
    scan(): Promise<Finding[]>;
    private checkKey;
}
export declare function scanKMS(region: string, accountId: string, credentials: AWSCredentials, cache: ResourceCache): Promise<Finding[]>;
//# sourceMappingURL=index.d.ts.map