/**
 * Security Engine V3 - Scan Manager
 * Orchestrates all security scanners with parallel execution
 */
import type { ScanResult, ScanContext } from '../types.js';
export declare class ScanManager {
    private context;
    private cache;
    private executor;
    private clientFactory;
    constructor(context: ScanContext);
    scan(): Promise<ScanResult>;
    private getEnabledScanners;
    private runScanners;
    private calculateSummary;
    private calculateMetrics;
}
export declare function runSecurityScan(context: ScanContext): Promise<ScanResult>;
//# sourceMappingURL=scan-manager.d.ts.map