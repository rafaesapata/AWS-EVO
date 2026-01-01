/**
 * Database Connection and Prisma Client
 * Manages database connections and provides Prisma client instance
 */
import { PrismaClient } from '@prisma/client';
/**
 * Get Prisma client instance (singleton)
 * MILITARY GRADE: Includes query logging for audit trail in production
 */
export declare function getPrismaClient(): PrismaClient;
/**
 * Connect to database
 */
export declare function connectDatabase(): Promise<void>;
/**
 * Disconnect from database
 */
export declare function disconnectDatabase(): Promise<void>;
/**
 * Health check for database connection
 */
export declare function checkDatabaseHealth(): Promise<{
    healthy: boolean;
    message: string;
    details?: any;
}>;
/**
 * Execute database transaction
 */
export declare function executeTransaction<T>(callback: (prisma: PrismaClient) => Promise<T>): Promise<T>;
/**
 * Database migration utilities
 */
export declare const migrations: {
    /**
     * Run pending migrations
     */
    run(): Promise<void>;
    /**
     * Check migration status
     */
    status(): Promise<{
        pending: number;
        applied: number;
        lastMigration?: string;
    }>;
};
/**
 * Database cleanup utilities
 */
export declare const cleanup: {
    /**
     * Clean up old records
     */
    oldRecords(olderThanDays?: number): Promise<number>;
    /**
     * Vacuum database (PostgreSQL specific)
     */
    vacuum(): Promise<void>;
};
/**
 * Tenant-isolated Prisma client
 */
export declare class TenantIsolatedPrisma {
    private client;
    private organizationId;
    constructor(organizationId: string);
    get prisma(): PrismaClient;
    get tenantId(): string;
    get awsCredential(): import(".prisma/client").Prisma.AwsCredentialDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get securityScan(): import(".prisma/client").Prisma.SecurityScanDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get finding(): import(".prisma/client").Prisma.FindingDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get notificationSettings(): import(".prisma/client").Prisma.NotificationSettingsDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get reportExport(): import(".prisma/client").Prisma.ReportExportDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get cloudTrailFetch(): import(".prisma/client").Prisma.CloudTrailFetchDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get iAMBehaviorAnomaly(): import(".prisma/client").Prisma.IAMBehaviorAnomalyDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get driftDetection(): import(".prisma/client").Prisma.DriftDetectionDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get driftDetectionHistory(): import(".prisma/client").Prisma.DriftDetectionHistoryDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get securityPosture(): import(".prisma/client").Prisma.SecurityPostureDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get user(): import(".prisma/client").Prisma.UserDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get auditLog(): import(".prisma/client").Prisma.AuditLogDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get tvDisplayToken(): import(".prisma/client").Prisma.TvDisplayTokenDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get tvTokenUsage(): import(".prisma/client").Prisma.TvTokenUsageDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get tvSession(): import(".prisma/client").Prisma.TvSessionDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get securityEvent(): import(".prisma/client").Prisma.SecurityEventDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get securityFinding(): import(".prisma/client").Prisma.SecurityFindingDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get dashboard(): import(".prisma/client").Prisma.DashboardDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get webauthnChallenge(): import(".prisma/client").Prisma.WebauthnChallengeDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get session(): import(".prisma/client").Prisma.SessionDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get systemEvent(): import(".prisma/client").Prisma.SystemEventDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get costOptimization(): import(".prisma/client").Prisma.CostOptimizationDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get copilotInteraction(): import(".prisma/client").Prisma.CopilotInteractionDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
    get complianceScan(): import(".prisma/client").Prisma.ComplianceScanDelegate<import("@prisma/client/runtime/library").DefaultArgs>;
}
/**
 * Tenant isolation helper
 */
export declare function withTenantIsolation<T>(organizationId: string, callback: (prisma: TenantIsolatedPrisma) => Promise<T>): Promise<T>;
//# sourceMappingURL=database.d.ts.map