/**
 * Scheduled License Sync - EventBridge triggered daily sync
 * Runs daily to sync all organization licenses from external API
 */
import type { ScheduledEvent } from 'aws-lambda';
interface SyncReport {
    date: string;
    total_organizations: number;
    successful: number;
    failed: number;
    total_licenses_synced: number;
    errors: string[];
}
export declare function handler(event: ScheduledEvent): Promise<SyncReport>;
export {};
//# sourceMappingURL=scheduled-license-sync.d.ts.map