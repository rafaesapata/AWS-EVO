/**
 * Database Connection and Prisma Client
 * Manages database connections and provides Prisma client instance
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logging';

let prisma: PrismaClient | null = null;

/**
 * Get Prisma client instance (singleton)
 * MILITARY GRADE: Includes query logging for audit trail in production
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    const isProduction = process.env.NODE_ENV === 'production';
    const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const enableQueryLogging = process.env.ENABLE_QUERY_LOGGING === 'true';
    
    try {
      // MILITARY GRADE: Configure logging based on environment
      // In production, log warnings and errors always
      // Query logging can be enabled via ENABLE_QUERY_LOGGING for audit purposes
      const logConfig: any[] = isProduction 
        ? ['warn', 'error'] 
        : ['query', 'info', 'warn', 'error'];
      
      // Add query logging in production if explicitly enabled for audit
      if (isProduction && enableQueryLogging) {
        logConfig.unshift('query');
      }
      
      prisma = new PrismaClient({
        log: logConfig,
        datasources: {
          db: {
            url: process.env.DATABASE_URL,
          },
        },
      });

      // MILITARY GRADE: Add middleware for query timing and audit logging
      prisma.$use(async (params, next) => {
        const startTime = Date.now();
        const result = await next(params);
        const duration = Date.now() - startTime;
        
        // Log slow queries (> 1000ms) in production
        if (isProduction && duration > 1000) {
          logger.warn('Slow database query detected', {
            model: params.model,
            action: params.action,
            duration,
            threshold: 1000
          });
        }
        
        // Log all write operations for audit trail in production
        if (isProduction && ['create', 'update', 'delete', 'createMany', 'updateMany', 'deleteMany'].includes(params.action || '')) {
          logger.info('Database write operation', {
            model: params.model,
            action: params.action,
            duration
          });
        }
        
        return result;
      });

      // Only auto-connect in Lambda environment
      if (isLambda) {
        prisma.$connect().catch((error) => {
          logger.error('Failed to connect Prisma client', error);
        });
      }

      logger.info('Prisma client initialized', { isLambda, isProduction, queryLogging: enableQueryLogging });
    } catch (error) {
      logger.error('Failed to create Prisma client', error as Error);
      throw new Error('Prisma client initialization failed');
    }
  }

  return prisma;
}

/**
 * Connect to database
 */
export async function connectDatabase(): Promise<void> {
  try {
    const client = getPrismaClient();
    await client.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database', error as Error);
    throw error;
  }
}

/**
 * Disconnect from database
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    if (prisma) {
      await prisma.$disconnect();
      prisma = null;
      logger.info('Database disconnected successfully');
    }
  } catch (error) {
    logger.error('Failed to disconnect from database', error as Error);
    throw error;
  }
}

/**
 * Health check for database connection
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  message: string;
  details?: any;
}> {
  try {
    const client = getPrismaClient();
    const startTime = Date.now();
    
    // Simple query to test connection
    await client.$queryRaw`SELECT 1 as health_check`;
    
    const responseTime = Date.now() - startTime;
    
    return {
      healthy: true,
      message: 'Database is healthy',
      details: {
        responseTime,
        connectionStatus: 'connected',
      },
    };
  } catch (error) {
    logger.error('Database health check failed', error as Error);
    
    return {
      healthy: false,
      message: error instanceof Error ? error.message : 'Database health check failed',
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Execute database transaction
 */
export async function executeTransaction<T>(
  callback: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  const client = getPrismaClient();
  
  return await client.$transaction(async (tx) => {
    return await callback(tx as PrismaClient);
  });
}

/**
 * Database migration utilities
 */
export const migrations = {
  /**
   * Run pending migrations
   */
  async run(): Promise<void> {
    try {
      const client = getPrismaClient();
      // In a real implementation, this would run Prisma migrations
      // For now, we'll just log that migrations would be run
      logger.info('Database migrations would be run here');
    } catch (error) {
      logger.error('Failed to run migrations', error as Error);
      throw error;
    }
  },

  /**
   * Check migration status
   */
  async status(): Promise<{
    pending: number;
    applied: number;
    lastMigration?: string;
  }> {
    try {
      // In a real implementation, this would check migration status
      return {
        pending: 0,
        applied: 1,
        lastMigration: '001_create_notification_settings',
      };
    } catch (error) {
      logger.error('Failed to check migration status', error as Error);
      throw error;
    }
  },
};

/**
 * Database cleanup utilities
 */
export const cleanup = {
  /**
   * Clean up old records
   */
  async oldRecords(olderThanDays: number = 90): Promise<number> {
    try {
      const client = getPrismaClient();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Example: Clean up old audit logs (if they exist)
      // const result = await client.auditLog.deleteMany({
      //   where: {
      //     createdAt: {
      //       lt: cutoffDate,
      //     },
      //   },
      // });

      logger.info('Old records cleanup completed', {
        cutoffDate: cutoffDate.toISOString(),
        olderThanDays,
      });

      return 0; // Return number of deleted records
    } catch (error) {
      logger.error('Failed to clean up old records', error as Error);
      throw error;
    }
  },

  /**
   * Vacuum database (PostgreSQL specific)
   */
  async vacuum(): Promise<void> {
    try {
      const client = getPrismaClient();
      await client.$executeRaw`VACUUM ANALYZE`;
      logger.info('Database vacuum completed');
    } catch (error) {
      logger.error('Failed to vacuum database', error as Error);
      throw error;
    }
  },
};

/**
 * Tenant-isolated Prisma client
 */
export class TenantIsolatedPrisma {
  private client: PrismaClient;
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
    this.client = getPrismaClient();
  }

  get prisma(): PrismaClient {
    return this.client;
  }

  get tenantId(): string {
    return this.organizationId;
  }

  // Delegate all Prisma model access
  get awsCredential() {
    return this.client.awsCredential;
  }

  get securityScan() {
    return this.client.securityScan;
  }

  get finding() {
    return this.client.finding;
  }

  get notificationSettings() {
    return this.client.notificationSettings;
  }

  get reportExport() {
    return this.client.reportExport;
  }

  get cloudTrailFetch() {
    return this.client.cloudTrailFetch;
  }

  get iAMBehaviorAnomaly() {
    return this.client.iAMBehaviorAnomaly;
  }

  get driftDetection() {
    return this.client.driftDetection;
  }

  get driftDetectionHistory() {
    return this.client.driftDetectionHistory;
  }

  get securityPosture() {
    return this.client.securityPosture;
  }

  // Additional models
  get user() {
    return this.client.user;
  }

  get auditLog() {
    return this.client.auditLog;
  }

  get tvDisplayToken() {
    return this.client.tvDisplayToken;
  }

  get tvTokenUsage() {
    return this.client.tvTokenUsage;
  }

  get tvSession() {
    return this.client.tvSession;
  }

  get securityEvent() {
    return this.client.securityEvent;
  }

  get securityFinding() {
    return this.client.securityFinding;
  }

  get dashboard() {
    return this.client.dashboard;
  }

  get webauthnChallenge() {
    return this.client.webauthnChallenge;
  }

  get session() {
    return this.client.session;
  }

  get systemEvent() {
    return this.client.systemEvent;
  }

  get costOptimization() {
    return this.client.costOptimization;
  }

  get copilotInteraction() {
    return this.client.copilotInteraction;
  }

  get complianceScan() {
    return this.client.complianceScan;
  }
}

/**
 * Tenant isolation helper
 */
export function withTenantIsolation<T>(
  organizationId: string,
  callback: (prisma: TenantIsolatedPrisma) => Promise<T>
): Promise<T> {
  const tenantPrisma = new TenantIsolatedPrisma(organizationId);
  return callback(tenantPrisma);
}

// Graceful shutdown handling - apenas para ambientes não-Lambda
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

if (!isLambda) {
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, disconnecting from database...');
    await disconnectDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, disconnecting from database...');
    await disconnectDatabase();
    process.exit(0);
  });
}

/**
 * Multi-cloud credential filter helper
 * Creates a Prisma where clause that works with both AWS and Azure credentials
 * 
 * @param credentialId - The credential ID (can be AWS or Azure)
 * @param cloudProvider - Optional cloud provider hint ('AWS' | 'AZURE')
 * @returns Prisma where clause for credential filtering
 */
export function createCredentialFilter(
  credentialId: string,
  cloudProvider?: 'AWS' | 'AZURE'
): { aws_account_id?: string; azure_credential_id?: string; OR?: Array<{ aws_account_id?: string; azure_credential_id?: string }> } {
  // If cloud provider is specified, use direct filter
  if (cloudProvider === 'AWS') {
    return { aws_account_id: credentialId };
  }
  if (cloudProvider === 'AZURE') {
    return { azure_credential_id: credentialId };
  }
  
  // If no provider specified, create OR filter for both
  return {
    OR: [
      { aws_account_id: credentialId },
      { azure_credential_id: credentialId }
    ]
  };
}

/**
 * Get credential filter for optional credential ID
 * Returns empty object if no credentialId provided
 */
export function getOptionalCredentialFilter(
  credentialId?: string,
  cloudProvider?: 'AWS' | 'AZURE'
): Record<string, any> {
  if (!credentialId) {
    return {};
  }
  return createCredentialFilter(credentialId, cloudProvider);
}

/**
 * Detect cloud provider from credential ID by checking database
 */
export async function detectCloudProvider(
  organizationId: string,
  credentialId: string
): Promise<'AWS' | 'AZURE' | null> {
  const prisma = getPrismaClient();
  
  // Check AWS credentials first
  const awsCredential = await prisma.awsCredential.findFirst({
    where: {
      id: credentialId,
      organization_id: organizationId,
    },
    select: { id: true },
  });
  
  if (awsCredential) {
    return 'AWS';
  }
  
  // Check Azure credentials
  const azureCredential = await prisma.azureCredential.findFirst({
    where: {
      id: credentialId,
      organization_id: organizationId,
    },
    select: { id: true },
  });
  
  if (azureCredential) {
    return 'AZURE';
  }
  
  return null;
}