"use strict";
/**
 * Comprehensive Database Migration System
 * Provides schema versioning, rollback capabilities, and migration validation
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXAMPLE_MIGRATIONS = exports.DEFAULT_MIGRATION_CONFIG = exports.DatabaseMigrationManager = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const logging_1 = require("./logging");
/**
 * Database Migration Manager
 */
class DatabaseMigrationManager {
    constructor(prisma, config) {
        this.migrations = new Map();
        this.executionHistory = new Map();
        this.prisma = prisma;
        this.config = config;
    }
    /**
     * Initialize migration system
     */
    async initialize() {
        logging_1.logger.info('Initializing database migration system');
        // Ensure migration tracking table exists
        await this.ensureMigrationTable();
        // Load migrations from directory
        await this.loadMigrations();
        // Load execution history
        await this.loadExecutionHistory();
        logging_1.logger.info('Database migration system initialized', {
            migrationsCount: this.migrations.size,
            executionHistoryCount: this.executionHistory.size,
        });
    }
    /**
     * Ensure migration tracking table exists
     */
    async ensureMigrationTable() {
        try {
            await this.prisma.$executeRaw `
        CREATE TABLE IF NOT EXISTS _migration_history (
          id VARCHAR(255) PRIMARY KEY,
          migration_id VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          version VARCHAR(50) NOT NULL,
          direction VARCHAR(10) NOT NULL,
          status VARCHAR(20) NOT NULL,
          executed_by VARCHAR(255),
          environment VARCHAR(50),
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP,
          duration INTEGER,
          error_message TEXT,
          rollback_id VARCHAR(255),
          validation_results JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `;
            logging_1.logger.debug('Migration tracking table ensured');
        }
        catch (error) {
            logging_1.logger.error('Failed to create migration tracking table', error);
            throw error;
        }
    }
    /**
     * Load migrations from directory
     */
    async loadMigrations() {
        try {
            const migrationFiles = await fs.readdir(this.config.migrationsDir);
            const migrationPromises = migrationFiles
                .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
                .map(file => this.loadMigration(path.join(this.config.migrationsDir, file)));
            const migrations = await Promise.all(migrationPromises);
            for (const migration of migrations) {
                if (migration) {
                    this.migrations.set(migration.id, migration);
                }
            }
            logging_1.logger.info('Migrations loaded', {
                count: this.migrations.size,
                directory: this.config.migrationsDir,
            });
        }
        catch (error) {
            logging_1.logger.error('Failed to load migrations', error);
            throw error;
        }
    }
    /**
     * Load single migration file
     */
    async loadMigration(filePath) {
        try {
            const migrationModule = await Promise.resolve(`${filePath}`).then(s => __importStar(require(s)));
            const migration = migrationModule.default || migrationModule.migration;
            if (!migration || !migration.id) {
                logging_1.logger.warn('Invalid migration file', { filePath });
                return null;
            }
            logging_1.logger.debug('Migration loaded', {
                id: migration.id,
                name: migration.name,
                version: migration.version,
            });
            return migration;
        }
        catch (error) {
            logging_1.logger.error('Failed to load migration file', error, { filePath });
            return null;
        }
    }
    /**
     * Load execution history from database
     */
    async loadExecutionHistory() {
        try {
            const executions = await this.prisma.$queryRaw `
        SELECT * FROM _migration_history 
        ORDER BY start_time DESC
      `;
            for (const execution of executions) {
                const migrationExecution = {
                    id: execution.id,
                    migrationId: execution.migration_id,
                    startTime: new Date(execution.start_time),
                    endTime: execution.end_time ? new Date(execution.end_time) : undefined,
                    status: execution.status,
                    direction: execution.direction,
                    executedBy: execution.executed_by,
                    environment: execution.environment,
                    duration: execution.duration,
                    error: execution.error_message,
                    rollbackId: execution.rollback_id,
                    validationResults: execution.validation_results ? JSON.parse(execution.validation_results) : undefined,
                };
                this.executionHistory.set(migrationExecution.id, migrationExecution);
            }
            logging_1.logger.debug('Migration execution history loaded', {
                count: this.executionHistory.size,
            });
        }
        catch (error) {
            logging_1.logger.error('Failed to load execution history', error);
        }
    }
    /**
     * Get pending migrations
     */
    async getPendingMigrations() {
        const appliedMigrations = new Set(Array.from(this.executionHistory.values())
            .filter(exec => exec.status === 'completed' && exec.direction === 'up')
            .map(exec => exec.migrationId));
        return Array.from(this.migrations.values())
            .filter(migration => !appliedMigrations.has(migration.id))
            .sort((a, b) => a.version.localeCompare(b.version));
    }
    /**
     * Create migration plan
     */
    async createMigrationPlan(targetVersion) {
        const pendingMigrations = await this.getPendingMigrations();
        let migrationsToRun = pendingMigrations;
        if (targetVersion) {
            migrationsToRun = pendingMigrations.filter(migration => migration.version <= targetVersion);
        }
        // Resolve dependencies
        const resolvedMigrations = this.resolveDependencies(migrationsToRun);
        const totalEstimatedDuration = resolvedMigrations.reduce((total, migration) => total + migration.estimatedDuration, 0);
        const riskLevels = resolvedMigrations.map(m => m.riskLevel);
        const highestRiskLevel = this.getHighestRiskLevel(riskLevels);
        const requiresDowntime = resolvedMigrations.some(migration => migration.riskLevel === 'critical' || migration.tags.includes('downtime'));
        const backupRequired = this.config.backupBeforeMigration ||
            resolvedMigrations.some(migration => migration.riskLevel === 'high' || migration.riskLevel === 'critical');
        // Create rollback plan
        const rollbackPlan = resolvedMigrations
            .filter(migration => migration.rollbackable)
            .reverse();
        const plan = {
            id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
            migrations: resolvedMigrations,
            totalEstimatedDuration,
            highestRiskLevel,
            requiresDowntime,
            backupRequired,
            rollbackPlan,
        };
        logging_1.logger.info('Migration plan created', {
            planId: plan.id,
            migrationsCount: plan.migrations.length,
            estimatedDuration: plan.totalEstimatedDuration,
            riskLevel: plan.highestRiskLevel,
            requiresDowntime: plan.requiresDowntime,
        });
        return plan;
    }
    /**
     * Execute migration plan
     */
    async executePlan(plan, options) {
        logging_1.logger.info('Starting migration plan execution', {
            planId: plan.id,
            migrationsCount: plan.migrations.length,
            dryRun: options.dryRun || this.config.dryRun,
        });
        const executions = [];
        try {
            // Validate plan before execution
            await this.validatePlan(plan);
            // Create backup if required
            if (plan.backupRequired && !options.dryRun) {
                await this.createBackup();
            }
            // Execute migrations
            for (const migration of plan.migrations) {
                const execution = await this.executeMigration(migration, 'up', {
                    executedBy: options.executedBy,
                    environment: options.environment,
                    dryRun: options.dryRun || this.config.dryRun,
                });
                executions.push(execution);
                // Stop on failure
                if (execution.status === 'failed') {
                    logging_1.logger.error('Migration plan execution failed', {
                        planId: plan.id,
                        failedMigration: migration.id,
                        error: execution.error,
                    });
                    break;
                }
            }
            logging_1.logger.info('Migration plan execution completed', {
                planId: plan.id,
                executedCount: executions.filter(e => e.status === 'completed').length,
                failedCount: executions.filter(e => e.status === 'failed').length,
            });
        }
        catch (error) {
            logging_1.logger.error('Migration plan execution failed', error, {
                planId: plan.id,
            });
            throw error;
        }
        return executions;
    }
    /**
     * Execute single migration
     */
    async executeMigration(migration, direction, options) {
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        const startTime = new Date();
        const execution = {
            id: executionId,
            migrationId: migration.id,
            startTime,
            status: 'running',
            direction,
            executedBy: options.executedBy,
            environment: options.environment,
        };
        logging_1.logger.info('Starting migration execution', {
            executionId,
            migrationId: migration.id,
            direction,
            dryRun: options.dryRun,
        });
        try {
            // Pre-validation
            if (this.config.validateBeforeExecution && migration.validation?.pre) {
                const preValidation = await migration.validation.pre(this.prisma);
                execution.validationResults = { pre: preValidation };
                if (!preValidation.valid) {
                    throw new Error(`Pre-validation failed: ${preValidation.errors.join(', ')}`);
                }
            }
            // Execute migration script
            if (!options.dryRun) {
                const script = direction === 'up' ? migration.up : migration.down;
                await this.executeScript(script, migration);
            }
            // Post-validation
            if (this.config.validateAfterExecution && migration.validation?.post && !options.dryRun) {
                const postValidation = await migration.validation.post(this.prisma);
                execution.validationResults = {
                    ...execution.validationResults,
                    post: postValidation,
                };
                if (!postValidation.valid) {
                    throw new Error(`Post-validation failed: ${postValidation.errors.join(', ')}`);
                }
            }
            execution.status = 'completed';
            execution.endTime = new Date();
            execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
            // Record execution in database
            if (!options.dryRun) {
                await this.recordExecution(execution);
            }
            logging_1.logger.info('Migration execution completed', {
                executionId,
                migrationId: migration.id,
                direction,
                duration: execution.duration,
            });
        }
        catch (error) {
            execution.status = 'failed';
            execution.endTime = new Date();
            execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
            execution.error = error instanceof Error ? error.message : String(error);
            // Record failed execution
            if (!options.dryRun) {
                await this.recordExecution(execution);
            }
            logging_1.logger.error('Migration execution failed', error, {
                executionId,
                migrationId: migration.id,
                direction,
                duration: execution.duration,
            });
        }
        this.executionHistory.set(execution.id, execution);
        return execution;
    }
    /**
     * Validate SQL command for safety
     */
    validateSQLCommand(sql, migrationId) {
        // Only allow DDL commands
        const allowedPatterns = [
            /^CREATE\s+TABLE/i,
            /^ALTER\s+TABLE/i,
            /^DROP\s+TABLE/i,
            /^CREATE\s+INDEX/i,
            /^DROP\s+INDEX/i,
            /^CREATE\s+EXTENSION/i,
            /^CREATE\s+TYPE/i,
            /^INSERT\s+INTO/i,
            /^UPDATE\s+/i,
            /^DELETE\s+FROM/i,
        ];
        const trimmedSql = sql.trim();
        const isAllowed = allowedPatterns.some(pattern => pattern.test(trimmedSql));
        if (!isAllowed) {
            throw new Error(`Unauthorized SQL command in migration ${migrationId}: ${trimmedSql.substring(0, 50)}...`);
        }
        // Check for injection patterns
        const injectionPatterns = [
            /;\s*DROP\s+DATABASE/i,
            /;\s*TRUNCATE/i,
            /UNION\s+SELECT/i,
            /--\s*$/m,
            /\/\*.*\*\//,
            /xp_cmdshell/i,
            /EXEC\s*\(/i,
        ];
        if (injectionPatterns.some(pattern => pattern.test(sql))) {
            throw new Error(`Potential SQL injection detected in migration ${migrationId}`);
        }
    }
    /**
     * Execute migration script
     */
    async executeScript(script, migration) {
        if (script.custom) {
            await script.custom(this.prisma);
        }
        else if (script.sql) {
            // SECURITY: Validate SQL before execution
            this.validateSQLCommand(script.sql, migration.id);
            logging_1.logger.info('Executing validated SQL migration', {
                migrationId: migration.id,
                sqlPreview: script.sql.substring(0, 100),
            });
            await this.prisma.$executeRawUnsafe(script.sql);
        }
        else if (script.prisma) {
            // Execute Prisma schema changes
            try {
                logging_1.logger.info('Executing Prisma schema migration', {
                    migrationId: migration.id,
                    prismaScript: script.prisma
                });
                // In a production environment, this would:
                // 1. Generate migration files using Prisma CLI
                // 2. Apply migrations using prisma migrate deploy
                // 3. Update schema.prisma file
                // 4. Regenerate Prisma client
                // For now, we'll execute the Prisma commands as raw SQL
                // This is a simplified implementation
                const prismaCommands = script.prisma.split(';').filter(cmd => cmd.trim());
                for (const command of prismaCommands) {
                    const trimmedCommand = command.trim();
                    if (trimmedCommand) {
                        try {
                            // Convert Prisma-style commands to SQL if possible
                            if (trimmedCommand.toLowerCase().startsWith('create table') ||
                                trimmedCommand.toLowerCase().startsWith('alter table') ||
                                trimmedCommand.toLowerCase().startsWith('drop table') ||
                                trimmedCommand.toLowerCase().startsWith('create index') ||
                                trimmedCommand.toLowerCase().startsWith('drop index')) {
                                // SECURITY: Validate command before execution
                                this.validateSQLCommand(trimmedCommand, migration.id);
                                await this.prisma.$executeRawUnsafe(trimmedCommand);
                                logging_1.logger.info('Executed Prisma command', { command: trimmedCommand });
                            }
                            else {
                                logging_1.logger.warn('Skipping unsupported Prisma command', { command: trimmedCommand });
                            }
                        }
                        catch (cmdError) {
                            logging_1.logger.error('Failed to execute Prisma command', cmdError, {
                                command: trimmedCommand,
                                migrationId: migration.id
                            });
                            throw cmdError;
                        }
                    }
                }
                logging_1.logger.info('Prisma schema migration completed successfully', {
                    migrationId: migration.id,
                    commandsExecuted: prismaCommands.length
                });
            }
            catch (prismaError) {
                logging_1.logger.error('Prisma script execution failed', prismaError, {
                    migrationId: migration.id,
                });
                throw prismaError;
            }
        }
        else {
            throw new Error('No executable script found in migration');
        }
    }
    /**
     * Record migration execution in database
     */
    async recordExecution(execution) {
        try {
            await this.prisma.$executeRaw `
        INSERT INTO _migration_history (
          id, migration_id, name, version, direction, status, executed_by, environment,
          start_time, end_time, duration, error_message, rollback_id, validation_results
        ) VALUES (
          ${execution.id},
          ${execution.migrationId},
          ${this.migrations.get(execution.migrationId)?.name || ''},
          ${this.migrations.get(execution.migrationId)?.version || ''},
          ${execution.direction},
          ${execution.status},
          ${execution.executedBy},
          ${execution.environment},
          ${execution.startTime},
          ${execution.endTime},
          ${execution.duration},
          ${execution.error},
          ${execution.rollbackId},
          ${execution.validationResults ? JSON.stringify(execution.validationResults) : null}
        )
      `;
        }
        catch (error) {
            logging_1.logger.error('Failed to record migration execution', error, {
                executionId: execution.id,
            });
        }
    }
    /**
     * Rollback migration
     */
    async rollbackMigration(migrationId, options) {
        const migration = this.migrations.get(migrationId);
        if (!migration) {
            throw new Error(`Migration not found: ${migrationId}`);
        }
        if (!migration.rollbackable) {
            throw new Error(`Migration is not rollbackable: ${migrationId}`);
        }
        logging_1.logger.info('Starting migration rollback', {
            migrationId,
            executedBy: options.executedBy,
        });
        const rollbackExecution = await this.executeMigration(migration, 'down', options);
        // Update original execution with rollback reference
        const originalExecution = Array.from(this.executionHistory.values())
            .find(exec => exec.migrationId === migrationId && exec.direction === 'up' && exec.status === 'completed');
        if (originalExecution) {
            originalExecution.rollbackId = rollbackExecution.id;
            await this.recordExecution(originalExecution);
        }
        return rollbackExecution;
    }
    /**
     * Resolve migration dependencies
     */
    resolveDependencies(migrations) {
        const resolved = [];
        const visited = new Set();
        const visiting = new Set();
        const visit = (migration) => {
            if (visiting.has(migration.id)) {
                throw new Error(`Circular dependency detected: ${migration.id}`);
            }
            if (visited.has(migration.id)) {
                return;
            }
            visiting.add(migration.id);
            // Visit dependencies first
            for (const depId of migration.dependencies) {
                const dependency = this.migrations.get(depId);
                if (dependency && migrations.includes(dependency)) {
                    visit(dependency);
                }
            }
            visiting.delete(migration.id);
            visited.add(migration.id);
            resolved.push(migration);
        };
        for (const migration of migrations) {
            visit(migration);
        }
        return resolved;
    }
    /**
     * Get highest risk level from array
     */
    getHighestRiskLevel(riskLevels) {
        const riskOrder = ['low', 'medium', 'high', 'critical'];
        for (let i = riskOrder.length - 1; i >= 0; i--) {
            if (riskLevels.includes(riskOrder[i])) {
                return riskOrder[i];
            }
        }
        return 'low';
    }
    /**
     * Validate migration plan
     */
    async validatePlan(plan) {
        // Check if risky migrations are allowed
        if (!this.config.allowRiskyMigrations && plan.highestRiskLevel === 'critical') {
            throw new Error('Critical risk migrations are not allowed in current configuration');
        }
        // Check estimated duration
        if (plan.totalEstimatedDuration > this.config.maxMigrationDuration) {
            throw new Error(`Migration plan exceeds maximum duration: ${plan.totalEstimatedDuration}s > ${this.config.maxMigrationDuration}s`);
        }
        // Validate each migration
        for (const migration of plan.migrations) {
            if (!migration.up.sql && !migration.up.prisma && !migration.up.custom) {
                throw new Error(`Migration ${migration.id} has no executable script`);
            }
        }
    }
    /**
     * Create database backup
     */
    async createBackup() {
        logging_1.logger.info('Creating database backup before migration');
        // Real database backup implementation
        try {
            const backupPath = await this.createRealDatabaseBackup();
            logging_1.logger.info('Database backup created successfully', { backupPath });
        }
        catch (error) {
            logging_1.logger.error('Database backup failed', { error: error.message });
            throw new Error(`Database backup failed: ${error.message}`);
        }
    }
    /**
     * Create real database backup using pg_dump
     */
    async createRealDatabaseBackup() {
        const { execSync } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const { join } = await Promise.resolve().then(() => __importStar(require('path')));
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `backup_${timestamp}.sql`;
        const backupPath = join(process.cwd(), 'backups', backupFileName);
        try {
            // Ensure backup directory exists
            const { mkdirSync, existsSync } = await Promise.resolve().then(() => __importStar(require('fs')));
            const backupDir = join(process.cwd(), 'backups');
            if (!existsSync(backupDir)) {
                mkdirSync(backupDir, { recursive: true });
            }
            // Create database backup using pg_dump
            const databaseUrl = process.env.DATABASE_URL;
            if (!databaseUrl) {
                throw new Error('DATABASE_URL not configured');
            }
            const command = `pg_dump "${databaseUrl}" > "${backupPath}"`;
            execSync(command, {
                timeout: 300000, // 5 minutes timeout
                stdio: 'pipe'
            });
            return backupPath;
        }
        catch (error) {
            throw new Error(`Backup creation failed: ${error.message}`);
        }
    }
    /**
     * Get migration status
     */
    getMigrationStatus() {
        const executions = Array.from(this.executionHistory.values());
        const appliedMigrations = executions.filter(exec => exec.status === 'completed' && exec.direction === 'up').length;
        const failedMigrations = executions.filter(exec => exec.status === 'failed').length;
        const lastExecution = executions
            .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];
        return {
            totalMigrations: this.migrations.size,
            appliedMigrations,
            pendingMigrations: this.migrations.size - appliedMigrations,
            failedMigrations,
            lastExecution,
        };
    }
    /**
     * Generate migration file template
     */
    generateMigrationTemplate(name, options) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const version = timestamp.split('T')[0].replace(/-/g, '.');
        const id = `${timestamp}_${name.toLowerCase().replace(/\s+/g, '_')}`;
        return `
import { Migration } from '../lib/database-migrations';
import { PrismaClient } from '@prisma/client';

const migration: Migration = {
  id: '${id}',
  name: '${name}',
  version: '${version}',
  description: '${options.description}',
  author: '${options.author}',
  createdAt: new Date('${new Date().toISOString()}'),
  estimatedDuration: ${options.estimatedDuration || 30},
  riskLevel: '${options.riskLevel || 'medium'}',
  rollbackable: true,
  dependencies: [],
  tags: [],
  
  up: {
    sql: \`
      -- Add your migration SQL here
      -- Example: ALTER TABLE users ADD COLUMN email VARCHAR(255);
    \`,
    // OR use custom function:
    // custom: async (prisma: PrismaClient) => {
    //   // Your custom migration logic here
    // }
  },
  
  down: {
    sql: \`
      -- Add your rollback SQL here
      -- Example: ALTER TABLE users DROP COLUMN email;
    \`,
    // OR use custom function:
    // custom: async (prisma: PrismaClient) => {
    //   // Your custom rollback logic here
    // }
  },
  
  validation: {
    pre: async (prisma: PrismaClient) => {
      // Pre-migration validation
      return {
        valid: true,
        errors: [],
        warnings: [],
      };
    },
    
    post: async (prisma: PrismaClient) => {
      // Post-migration validation
      return {
        valid: true,
        errors: [],
        warnings: [],
      };
    },
  },
};

export default migration;
    `.trim();
    }
}
exports.DatabaseMigrationManager = DatabaseMigrationManager;
// Default migration configuration
exports.DEFAULT_MIGRATION_CONFIG = {
    migrationsDir: './migrations',
    backupBeforeMigration: true,
    validateBeforeExecution: true,
    validateAfterExecution: true,
    allowRiskyMigrations: false,
    maxMigrationDuration: 3600, // 1 hour
    parallelExecution: false,
    dryRun: false,
};
// Example migrations
exports.EXAMPLE_MIGRATIONS = [
    {
        id: '2024-01-01_initial_schema',
        name: 'Initial Schema',
        version: '1.0.0',
        description: 'Create initial database schema',
        author: 'EVO UDS Team',
        createdAt: new Date('2024-01-01'),
        estimatedDuration: 60,
        riskLevel: 'medium',
        rollbackable: true,
        dependencies: [],
        tags: ['initial', 'schema'],
        up: {
            sql: `
        CREATE TABLE IF NOT EXISTS tenants (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(255) PRIMARY KEY,
          tenant_id VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
      `,
        },
        down: {
            sql: `
        DROP TABLE IF EXISTS users;
        DROP TABLE IF EXISTS tenants;
      `,
        },
    },
    {
        id: '2024-06-01_add_security_scans',
        name: 'Add Security Scans',
        version: '1.1.0',
        description: 'Add security scan tracking tables',
        author: 'EVO UDS Team',
        createdAt: new Date('2024-06-01'),
        estimatedDuration: 30,
        riskLevel: 'low',
        rollbackable: true,
        dependencies: ['2024-01-01_initial_schema'],
        tags: ['security', 'scans'],
        up: {
            sql: `
        CREATE TABLE IF NOT EXISTS security_scans (
          id VARCHAR(255) PRIMARY KEY,
          tenant_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          status VARCHAR(50) NOT NULL,
          findings JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES tenants(id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `,
        },
        down: {
            sql: `
        DROP TABLE IF EXISTS security_scans;
      `,
        },
    },
];
//# sourceMappingURL=database-migrations.js.map