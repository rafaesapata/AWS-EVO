/**
 * Comprehensive Database Migration System
 * Provides schema versioning, rollback capabilities, and migration validation
 */
import { PrismaClient } from '@prisma/client';
export interface Migration {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    createdAt: Date;
    up: MigrationScript;
    down: MigrationScript;
    dependencies: string[];
    tags: string[];
    estimatedDuration: number;
    riskLevel: MigrationRiskLevel;
    rollbackable: boolean;
    validation?: ValidationScript;
}
export interface MigrationScript {
    sql?: string;
    prisma?: string;
    custom?: (prisma: PrismaClient) => Promise<void>;
}
export interface ValidationScript {
    pre?: (prisma: PrismaClient) => Promise<ValidationResult>;
    post?: (prisma: PrismaClient) => Promise<ValidationResult>;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    metrics?: Record<string, number>;
}
export type MigrationRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export interface MigrationExecution {
    id: string;
    migrationId: string;
    startTime: Date;
    endTime?: Date;
    status: MigrationStatus;
    direction: 'up' | 'down';
    executedBy: string;
    environment: string;
    duration?: number;
    error?: string;
    rollbackId?: string;
    validationResults?: {
        pre?: ValidationResult;
        post?: ValidationResult;
    };
}
export type MigrationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
export interface MigrationPlan {
    id: string;
    migrations: Migration[];
    totalEstimatedDuration: number;
    highestRiskLevel: MigrationRiskLevel;
    requiresDowntime: boolean;
    backupRequired: boolean;
    rollbackPlan: Migration[];
}
export interface MigrationConfig {
    migrationsDir: string;
    backupBeforeMigration: boolean;
    validateBeforeExecution: boolean;
    validateAfterExecution: boolean;
    allowRiskyMigrations: boolean;
    maxMigrationDuration: number;
    parallelExecution: boolean;
    dryRun: boolean;
}
/**
 * Database Migration Manager
 */
export declare class DatabaseMigrationManager {
    private prisma;
    private config;
    private migrations;
    private executionHistory;
    constructor(prisma: PrismaClient, config: MigrationConfig);
    /**
     * Initialize migration system
     */
    initialize(): Promise<void>;
    /**
     * Ensure migration tracking table exists
     */
    private ensureMigrationTable;
    /**
     * Load migrations from directory
     */
    private loadMigrations;
    /**
     * Load single migration file
     */
    private loadMigration;
    /**
     * Load execution history from database
     */
    private loadExecutionHistory;
    /**
     * Get pending migrations
     */
    getPendingMigrations(): Promise<Migration[]>;
    /**
     * Create migration plan
     */
    createMigrationPlan(targetVersion?: string): Promise<MigrationPlan>;
    /**
     * Execute migration plan
     */
    executePlan(plan: MigrationPlan, options: {
        executedBy: string;
        environment: string;
        dryRun?: boolean;
    }): Promise<MigrationExecution[]>;
    /**
     * Execute single migration
     */
    executeMigration(migration: Migration, direction: 'up' | 'down', options: {
        executedBy: string;
        environment: string;
        dryRun?: boolean;
    }): Promise<MigrationExecution>;
    /**
     * Validate SQL command for safety
     */
    private validateSQLCommand;
    /**
     * Execute migration script
     */
    private executeScript;
    /**
     * Record migration execution in database
     */
    private recordExecution;
    /**
     * Rollback migration
     */
    rollbackMigration(migrationId: string, options: {
        executedBy: string;
        environment: string;
    }): Promise<MigrationExecution>;
    /**
     * Resolve migration dependencies
     */
    private resolveDependencies;
    /**
     * Get highest risk level from array
     */
    private getHighestRiskLevel;
    /**
     * Validate migration plan
     */
    private validatePlan;
    /**
     * Create database backup
     */
    private createBackup;
    /**
     * Create real database backup using pg_dump
     */
    private createRealDatabaseBackup;
    /**
     * Get migration status
     */
    getMigrationStatus(): {
        totalMigrations: number;
        appliedMigrations: number;
        pendingMigrations: number;
        failedMigrations: number;
        lastExecution?: MigrationExecution;
    };
    /**
     * Generate migration file template
     */
    generateMigrationTemplate(name: string, options: {
        author: string;
        description: string;
        riskLevel?: MigrationRiskLevel;
        estimatedDuration?: number;
    }): string;
}
export declare const DEFAULT_MIGRATION_CONFIG: MigrationConfig;
export declare const EXAMPLE_MIGRATIONS: Migration[];
//# sourceMappingURL=database-migrations.d.ts.map