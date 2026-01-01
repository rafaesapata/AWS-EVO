/**
 * Comprehensive Backup Strategies System
 * Provides automated backup, restore, and disaster recovery capabilities
 */
import { S3Client } from '@aws-sdk/client-s3';
import { RDSClient } from '@aws-sdk/client-rds';
export interface BackupConfig {
    enabled: boolean;
    schedule: {
        daily: boolean;
        weekly: boolean;
        monthly: boolean;
        customCron?: string;
    };
    retention: {
        daily: number;
        weekly: number;
        monthly: number;
    };
    compression: boolean;
    encryption: boolean;
    verification: boolean;
    destinations: BackupDestination[];
}
export interface BackupDestination {
    type: 'S3' | 'RDS' | 'EFS' | 'DynamoDB';
    name: string;
    config: Record<string, any>;
    priority: number;
}
export interface BackupMetadata {
    id: string;
    type: BackupType;
    source: string;
    destination: string;
    timestamp: Date;
    size: number;
    checksum: string;
    encrypted: boolean;
    compressed: boolean;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'expired';
    retentionUntil: Date;
    metadata: Record<string, any>;
}
export type BackupType = 'database_full' | 'database_incremental' | 'files_full' | 'files_incremental' | 'configuration' | 'logs' | 'application_state';
export interface RestoreOptions {
    backupId: string;
    targetLocation?: string;
    pointInTime?: Date;
    partialRestore?: {
        tables?: string[];
        files?: string[];
        excludePatterns?: string[];
    };
    dryRun?: boolean;
}
export interface BackupVerificationResult {
    valid: boolean;
    checksumMatch: boolean;
    sizeMatch: boolean;
    readableContent: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Abstract Backup Strategy
 */
export declare abstract class BackupStrategy {
    protected config: BackupConfig;
    protected s3Client: S3Client;
    protected rdsClient: RDSClient;
    constructor(config: BackupConfig);
    abstract backup(source: string, options?: Record<string, any>): Promise<BackupMetadata>;
    abstract restore(options: RestoreOptions): Promise<boolean>;
    abstract verify(backupId: string): Promise<BackupVerificationResult>;
    abstract cleanup(olderThan: Date): Promise<number>;
    protected generateBackupId(type: BackupType, source: string): string;
    protected calculateChecksum(data: Buffer): string;
    protected compressData(data: Buffer): Promise<Buffer>;
    protected decompressData(data: Buffer): Promise<Buffer>;
    protected encryptData(data: Buffer): Promise<Buffer>;
    protected decryptData(data: Buffer): Promise<Buffer>;
}
/**
 * Database Backup Strategy
 */
export declare class DatabaseBackupStrategy extends BackupStrategy {
    backup(source: string, options?: {
        type?: 'full' | 'incremental';
        tables?: string[];
    }): Promise<BackupMetadata>;
    restore(options: RestoreOptions): Promise<boolean>;
    verify(backupId: string): Promise<BackupVerificationResult>;
    cleanup(olderThan: Date): Promise<number>;
    private waitForSnapshotCompletion;
    private exportSnapshotToS3;
    private downloadFromS3;
    private calculateRetentionDate;
}
/**
 * File Backup Strategy
 */
export declare class FileBackupStrategy extends BackupStrategy {
    backup(source: string, options?: {
        type?: 'full' | 'incremental';
        patterns?: string[];
        excludePatterns?: string[];
    }): Promise<BackupMetadata>;
    restore(options: RestoreOptions): Promise<boolean>;
    verify(backupId: string): Promise<BackupVerificationResult>;
    cleanup(olderThan: Date): Promise<number>;
    private calculateRetentionDate;
}
/**
 * Configuration Backup Strategy
 */
export declare class ConfigurationBackupStrategy extends BackupStrategy {
    backup(source: string, options?: {
        includeSecrets?: boolean;
        environments?: string[];
    }): Promise<BackupMetadata>;
    restore(options: RestoreOptions): Promise<boolean>;
    verify(backupId: string): Promise<BackupVerificationResult>;
    cleanup(olderThan: Date): Promise<number>;
    private calculateRetentionDate;
}
/**
 * Backup Manager - Orchestrates all backup strategies
 */
export declare class BackupManager {
    private strategies;
    private config;
    constructor(config: BackupConfig);
    private initializeStrategies;
    createBackup(type: BackupType, source: string, options?: Record<string, any>): Promise<BackupMetadata>;
    restoreBackup(options: RestoreOptions): Promise<boolean>;
    verifyBackup(backupId: string): Promise<BackupVerificationResult>;
    cleanupOldBackups(olderThan: Date): Promise<number>;
    scheduleBackups(): Promise<void>;
    private determineBackupType;
}
export declare const DEFAULT_BACKUP_CONFIG: BackupConfig;
export declare const backupManager: BackupManager;
//# sourceMappingURL=backup-strategies.d.ts.map