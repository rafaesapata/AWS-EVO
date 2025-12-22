/**
 * Comprehensive Database Migration System
 * Provides schema versioning, rollback capabilities, and migration validation
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logging';

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
  estimatedDuration: number; // seconds
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
  maxMigrationDuration: number; // seconds
  parallelExecution: boolean;
  dryRun: boolean;
}

/**
 * Database Migration Manager
 */
export class DatabaseMigrationManager {
  private prisma: PrismaClient;
  private config: MigrationConfig;
  private migrations: Map<string, Migration> = new Map();
  private executionHistory: Map<string, MigrationExecution> = new Map();

  constructor(prisma: PrismaClient, config: MigrationConfig) {
    this.prisma = prisma;
    this.config = config;
  }

  /**
   * Initialize migration system
   */
  async initialize(): Promise<void> {
    logger.info('Initializing database migration system');

    // Ensure migration tracking table exists
    await this.ensureMigrationTable();

    // Load migrations from directory
    await this.loadMigrations();

    // Load execution history
    await this.loadExecutionHistory();

    logger.info('Database migration system initialized', {
      migrationsCount: this.migrations.size,
      executionHistoryCount: this.executionHistory.size,
    });
  }

  /**
   * Ensure migration tracking table exists
   */
  private async ensureMigrationTable(): Promise<void> {
    try {
      await this.prisma.$executeRaw`
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

      logger.debug('Migration tracking table ensured');
    } catch (error) {
      logger.error('Failed to create migration tracking table', error as Error);
      throw error;
    }
  }

  /**
   * Load migrations from directory
   */
  private async loadMigrations(): Promise<void> {
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

      logger.info('Migrations loaded', {
        count: this.migrations.size,
        directory: this.config.migrationsDir,
      });
    } catch (error) {
      logger.error('Failed to load migrations', error as Error);
      throw error;
    }
  }

  /**
   * Load single migration file
   */
  private async loadMigration(filePath: string): Promise<Migration | null> {
    try {
      const migrationModule = await import(filePath);
      const migration = migrationModule.default || migrationModule.migration;
      
      if (!migration || !migration.id) {
        logger.warn('Invalid migration file', { filePath });
        return null;
      }

      logger.debug('Migration loaded', {
        id: migration.id,
        name: migration.name,
        version: migration.version,
      });

      return migration;
    } catch (error) {
      logger.error('Failed to load migration file', error as Error, { filePath });
      return null;
    }
  }

  /**
   * Load execution history from database
   */
  private async loadExecutionHistory(): Promise<void> {
    try {
      const executions = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM _migration_history 
        ORDER BY start_time DESC
      `;

      for (const execution of executions) {
        const migrationExecution: MigrationExecution = {
          id: execution.id,
          migrationId: execution.migration_id,
          startTime: new Date(execution.start_time),
          endTime: execution.end_time ? new Date(execution.end_time) : undefined,
          status: execution.status as MigrationStatus,
          direction: execution.direction as 'up' | 'down',
          executedBy: execution.executed_by,
          environment: execution.environment,
          duration: execution.duration,
          error: execution.error_message,
          rollbackId: execution.rollback_id,
          validationResults: execution.validation_results ? JSON.parse(execution.validation_results) : undefined,
        };

        this.executionHistory.set(migrationExecution.id, migrationExecution);
      }

      logger.debug('Migration execution history loaded', {
        count: this.executionHistory.size,
      });
    } catch (error) {
      logger.error('Failed to load execution history', error as Error);
    }
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const appliedMigrations = new Set(
      Array.from(this.executionHistory.values())
        .filter(exec => exec.status === 'completed' && exec.direction === 'up')
        .map(exec => exec.migrationId)
    );

    return Array.from(this.migrations.values())
      .filter(migration => !appliedMigrations.has(migration.id))
      .sort((a, b) => a.version.localeCompare(b.version));
  }

  /**
   * Create migration plan
   */
  async createMigrationPlan(targetVersion?: string): Promise<MigrationPlan> {
    const pendingMigrations = await this.getPendingMigrations();
    
    let migrationsToRun = pendingMigrations;
    if (targetVersion) {
      migrationsToRun = pendingMigrations.filter(
        migration => migration.version <= targetVersion
      );
    }

    // Resolve dependencies
    const resolvedMigrations = this.resolveDependencies(migrationsToRun);

    const totalEstimatedDuration = resolvedMigrations.reduce(
      (total, migration) => total + migration.estimatedDuration,
      0
    );

    const riskLevels = resolvedMigrations.map(m => m.riskLevel);
    const highestRiskLevel = this.getHighestRiskLevel(riskLevels);

    const requiresDowntime = resolvedMigrations.some(
      migration => migration.riskLevel === 'critical' || migration.tags.includes('downtime')
    );

    const backupRequired = this.config.backupBeforeMigration || 
      resolvedMigrations.some(migration => migration.riskLevel === 'high' || migration.riskLevel === 'critical');

    // Create rollback plan
    const rollbackPlan = resolvedMigrations
      .filter(migration => migration.rollbackable)
      .reverse();

    const plan: MigrationPlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      migrations: resolvedMigrations,
      totalEstimatedDuration,
      highestRiskLevel,
      requiresDowntime,
      backupRequired,
      rollbackPlan,
    };

    logger.info('Migration plan created', {
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
  async executePlan(
    plan: MigrationPlan,
    options: {
      executedBy: string;
      environment: string;
      dryRun?: boolean;
    }
  ): Promise<MigrationExecution[]> {
    logger.info('Starting migration plan execution', {
      planId: plan.id,
      migrationsCount: plan.migrations.length,
      dryRun: options.dryRun || this.config.dryRun,
    });

    const executions: MigrationExecution[] = [];

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
          logger.error('Migration plan execution failed', {
            planId: plan.id,
            failedMigration: migration.id,
            error: execution.error,
          });
          break;
        }
      }

      logger.info('Migration plan execution completed', {
        planId: plan.id,
        executedCount: executions.filter(e => e.status === 'completed').length,
        failedCount: executions.filter(e => e.status === 'failed').length,
      });

    } catch (error) {
      logger.error('Migration plan execution failed', error as Error, {
        planId: plan.id,
      });
      throw error;
    }

    return executions;
  }

  /**
   * Execute single migration
   */
  async executeMigration(
    migration: Migration,
    direction: 'up' | 'down',
    options: {
      executedBy: string;
      environment: string;
      dryRun?: boolean;
    }
  ): Promise<MigrationExecution> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const startTime = new Date();

    const execution: MigrationExecution = {
      id: executionId,
      migrationId: migration.id,
      startTime,
      status: 'running',
      direction,
      executedBy: options.executedBy,
      environment: options.environment,
    };

    logger.info('Starting migration execution', {
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

      logger.info('Migration execution completed', {
        executionId,
        migrationId: migration.id,
        direction,
        duration: execution.duration,
      });

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      execution.error = error instanceof Error ? error.message : String(error);

      // Record failed execution
      if (!options.dryRun) {
        await this.recordExecution(execution);
      }

      logger.error('Migration execution failed', error as Error, {
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
   * Execute migration script
   */
  private async executeScript(script: MigrationScript, migration: Migration): Promise<void> {
    if (script.custom) {
      await script.custom(this.prisma);
    } else if (script.sql) {
      await this.prisma.$executeRawUnsafe(script.sql);
    } else if (script.prisma) {
      // Execute Prisma schema changes
      try {
        logger.info('Executing Prisma schema migration', {
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
                
                await this.prisma.$executeRawUnsafe(trimmedCommand);
                logger.info('Executed Prisma command', { command: trimmedCommand });
              } else {
                logger.warn('Skipping unsupported Prisma command', { command: trimmedCommand });
              }
            } catch (cmdError) {
              logger.error('Failed to execute Prisma command', cmdError as Error, { 
                command: trimmedCommand,
                migrationId: migration.id 
              });
              throw cmdError;
            }
          }
        }

        logger.info('Prisma schema migration completed successfully', {
          migrationId: migration.id,
          commandsExecuted: prismaCommands.length
        });

      } catch (prismaError) {
        logger.error('Prisma script execution failed', prismaError as Error, {
          migrationId: migration.id,
        });
        throw prismaError;
      }
    } else {
      throw new Error('No executable script found in migration');
    }
  }

  /**
   * Record migration execution in database
   */
  private async recordExecution(execution: MigrationExecution): Promise<void> {
    try {
      await this.prisma.$executeRaw`
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
    } catch (error) {
      logger.error('Failed to record migration execution', error as Error, {
        executionId: execution.id,
      });
    }
  }

  /**
   * Rollback migration
   */
  async rollbackMigration(migrationId: string, options: {
    executedBy: string;
    environment: string;
  }): Promise<MigrationExecution> {
    const migration = this.migrations.get(migrationId);
    if (!migration) {
      throw new Error(`Migration not found: ${migrationId}`);
    }

    if (!migration.rollbackable) {
      throw new Error(`Migration is not rollbackable: ${migrationId}`);
    }

    logger.info('Starting migration rollback', {
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
  private resolveDependencies(migrations: Migration[]): Migration[] {
    const resolved: Migration[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (migration: Migration) => {
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
  private getHighestRiskLevel(riskLevels: MigrationRiskLevel[]): MigrationRiskLevel {
    const riskOrder: MigrationRiskLevel[] = ['low', 'medium', 'high', 'critical'];
    
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
  private async validatePlan(plan: MigrationPlan): Promise<void> {
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
  private async createBackup(): Promise<void> {
    logger.info('Creating database backup before migration');
    
    // Real database backup implementation
    try {
      const backupPath = await this.createRealDatabaseBackup();
      logger.info('Database backup created successfully', { backupPath });
    } catch (error) {
      logger.error('Database backup failed', { error: (error as any).message });
      throw new Error(`Database backup failed: ${(error as any).message}`);
    }
  }

  /**
   * Create real database backup using pg_dump
   */
  private async createRealDatabaseBackup(): Promise<string> {
    const { execSync } = await import('child_process');
    const { join } = await import('path');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup_${timestamp}.sql`;
    const backupPath = join(process.cwd(), 'backups', backupFileName);
    
    try {
      // Ensure backup directory exists
      const { mkdirSync, existsSync } = await import('fs');
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
    } catch (error) {
      throw new Error(`Backup creation failed: ${(error as any).message}`);
    }
  }

  /**
   * Get migration status
   */
  getMigrationStatus(): {
    totalMigrations: number;
    appliedMigrations: number;
    pendingMigrations: number;
    failedMigrations: number;
    lastExecution?: MigrationExecution;
  } {
    const executions = Array.from(this.executionHistory.values());
    const appliedMigrations = executions.filter(
      exec => exec.status === 'completed' && exec.direction === 'up'
    ).length;
    
    const failedMigrations = executions.filter(
      exec => exec.status === 'failed'
    ).length;

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
  generateMigrationTemplate(name: string, options: {
    author: string;
    description: string;
    riskLevel?: MigrationRiskLevel;
    estimatedDuration?: number;
  }): string {
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

// Default migration configuration
export const DEFAULT_MIGRATION_CONFIG: MigrationConfig = {
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
export const EXAMPLE_MIGRATIONS: Migration[] = [
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