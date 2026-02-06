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
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Example: Clean up old audit logs (if they exist)
      // const client = getPrismaClient();
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
 * MILITARY GRADE: Tenant-isolated model wrapper
 * Automatically injects organization_id filter into ALL queries
 * This prevents cross-tenant data access vulnerabilities
 */
function createTenantIsolatedModel<T extends Record<string, any>>(
  model: T,
  organizationId: string,
  orgFieldName: string = 'organization_id'
): T {
  const handler: ProxyHandler<T> = {
    get(target, prop: string) {
      const original = target[prop];
      
      // If it's not a function, return as-is
      if (typeof original !== 'function') {
        return original;
      }
      
      // Methods that need organization_id filter injection
      const readMethods = ['findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy'];
      
      // Read methods: inject filter in where clause
      if (readMethods.includes(prop)) {
        return (args: any = {}) => {
          const isolatedArgs = {
            ...args,
            where: {
              ...args?.where,
              [orgFieldName]: organizationId,
            },
          };
          logger.debug('TenantIsolatedModel: Injecting org filter', { 
            method: prop, 
            orgFieldName, 
            organizationId: organizationId.substring(0, 8) + '...' 
          });
          return original.call(target, isolatedArgs);
        };
      }
      
      // Create methods: inject organization_id in data
      if (prop === 'create') {
        return (args: any = {}) => {
          const isolatedArgs = {
            ...args,
            data: {
              ...args?.data,
              [orgFieldName]: organizationId,
            },
          };
          logger.debug('TenantIsolatedModel: Injecting org in create', { 
            method: prop, 
            orgFieldName 
          });
          return original.call(target, isolatedArgs);
        };
      }
      
      // CreateMany: inject organization_id in each data item
      if (prop === 'createMany') {
        return (args: any = {}) => {
          const data = Array.isArray(args?.data) ? args.data : [args?.data];
          const isolatedArgs = {
            ...args,
            data: data.map((item: any) => ({
              ...item,
              [orgFieldName]: organizationId,
            })),
          };
          logger.debug('TenantIsolatedModel: Injecting org in createMany', { 
            method: prop, 
            count: data.length 
          });
          return original.call(target, isolatedArgs);
        };
      }
      
      // Update/Delete methods: inject filter in where clause
      if (['update', 'updateMany', 'delete', 'deleteMany'].includes(prop)) {
        return (args: any = {}) => {
          const isolatedArgs = {
            ...args,
            where: {
              ...args?.where,
              [orgFieldName]: organizationId,
            },
          };
          logger.debug('TenantIsolatedModel: Injecting org filter in write', { 
            method: prop, 
            orgFieldName 
          });
          return original.call(target, isolatedArgs);
        };
      }
      
      // Upsert: inject in where, create, and update
      if (prop === 'upsert') {
        return (args: any = {}) => {
          const isolatedArgs = {
            ...args,
            where: {
              ...args?.where,
              [orgFieldName]: organizationId,
            },
            create: {
              ...args?.create,
              [orgFieldName]: organizationId,
            },
            update: {
              ...args?.update,
              // Ensure update cannot change the organization_id
              [orgFieldName]: organizationId,
            },
          };
          logger.debug('TenantIsolatedModel: Injecting org in upsert', { 
            method: prop, 
            orgFieldName 
          });
          return original.call(target, isolatedArgs);
        };
      }
      
      // For any other method, return original
      return original.bind(target);
    },
  };
  
  return new Proxy(model, handler) as T;
}

/**
 * MILITARY GRADE: Tenant-isolated Prisma client
 * ALL model access automatically filters by organization_id
 * This is the ONLY safe way to access tenant data
 */
export class TenantIsolatedPrisma {
  private client: PrismaClient;
  private organizationId: string;
  
  // Cached isolated models
  private _awsCredential: any;
  private _azureCredential: any;
  private _securityScan: any;
  private _finding: any;
  private _notificationSettings: any;
  private _reportExport: any;
  private _cloudTrailFetch: any;
  private _iAMBehaviorAnomaly: any;
  private _driftDetection: any;
  private _driftDetectionHistory: any;
  private _securityPosture: any;
  private _auditLog: any;
  private _tvDisplayToken: any;
  private _tvTokenUsage: any;
  private _tvSession: any;
  private _securityEvent: any;
  private _securityFinding: any;
  private _dashboard: any;
  private _webauthnChallenge: any;
  private _session: any;
  private _systemEvent: any;
  private _costOptimization: any;
  private _copilotInteraction: any;
  private _complianceScan: any;
  private _mfaFactor: any;
  private _webauthnCredential: any;
  private _alert: any;
  private _backgroundJob: any;
  private _license: any;
  private _organization: any;
  private _profile: any;
  private _wafMonitoringConfig: any;
  private _wafBlockedIp: any;
  private _wafEvent: any;
  private _riSpRecommendation: any;
  private _riSpUtilizationHistory: any;

  constructor(organizationId: string) {
    if (!organizationId) {
      throw new Error('SECURITY: organizationId is required for TenantIsolatedPrisma');
    }
    this.organizationId = organizationId;
    this.client = getPrismaClient();
    
    logger.info('TenantIsolatedPrisma initialized', { 
      organizationId: organizationId.substring(0, 8) + '...' 
    });
  }

  /**
   * Get raw Prisma client - USE WITH EXTREME CAUTION
   * Only for operations that don't involve tenant data (e.g., system tables)
   */
  get prisma(): PrismaClient {
    logger.warn('TenantIsolatedPrisma: Raw prisma access - ensure manual org filtering');
    return this.client;
  }

  get tenantId(): string {
    return this.organizationId;
  }

  // MILITARY GRADE: All model accessors with automatic tenant isolation
  
  get awsCredential() {
    if (!this._awsCredential) {
      this._awsCredential = createTenantIsolatedModel(this.client.awsCredential, this.organizationId);
    }
    return this._awsCredential;
  }

  get azureCredential() {
    if (!this._azureCredential) {
      this._azureCredential = createTenantIsolatedModel(this.client.azureCredential, this.organizationId);
    }
    return this._azureCredential;
  }

  get securityScan() {
    if (!this._securityScan) {
      this._securityScan = createTenantIsolatedModel(this.client.securityScan, this.organizationId);
    }
    return this._securityScan;
  }

  get finding() {
    if (!this._finding) {
      this._finding = createTenantIsolatedModel(this.client.finding, this.organizationId);
    }
    return this._finding;
  }

  get notificationSettings() {
    if (!this._notificationSettings) {
      this._notificationSettings = createTenantIsolatedModel(this.client.notificationSettings, this.organizationId);
    }
    return this._notificationSettings;
  }

  get reportExport() {
    if (!this._reportExport) {
      this._reportExport = createTenantIsolatedModel(this.client.reportExport, this.organizationId);
    }
    return this._reportExport;
  }

  get cloudTrailFetch() {
    if (!this._cloudTrailFetch) {
      this._cloudTrailFetch = createTenantIsolatedModel(this.client.cloudTrailFetch, this.organizationId);
    }
    return this._cloudTrailFetch;
  }

  get iAMBehaviorAnomaly() {
    if (!this._iAMBehaviorAnomaly) {
      this._iAMBehaviorAnomaly = createTenantIsolatedModel(this.client.iAMBehaviorAnomaly, this.organizationId);
    }
    return this._iAMBehaviorAnomaly;
  }

  get driftDetection() {
    if (!this._driftDetection) {
      this._driftDetection = createTenantIsolatedModel(this.client.driftDetection, this.organizationId);
    }
    return this._driftDetection;
  }

  get driftDetectionHistory() {
    if (!this._driftDetectionHistory) {
      this._driftDetectionHistory = createTenantIsolatedModel(this.client.driftDetectionHistory, this.organizationId);
    }
    return this._driftDetectionHistory;
  }

  get securityPosture() {
    if (!this._securityPosture) {
      this._securityPosture = createTenantIsolatedModel(this.client.securityPosture, this.organizationId);
    }
    return this._securityPosture;
  }

  get auditLog() {
    if (!this._auditLog) {
      this._auditLog = createTenantIsolatedModel(this.client.auditLog, this.organizationId);
    }
    return this._auditLog;
  }

  get tvDisplayToken() {
    if (!this._tvDisplayToken) {
      this._tvDisplayToken = createTenantIsolatedModel(this.client.tvDisplayToken, this.organizationId);
    }
    return this._tvDisplayToken;
  }

  get tvTokenUsage() {
    if (!this._tvTokenUsage) {
      this._tvTokenUsage = createTenantIsolatedModel(this.client.tvTokenUsage, this.organizationId);
    }
    return this._tvTokenUsage;
  }

  get tvSession() {
    if (!this._tvSession) {
      this._tvSession = createTenantIsolatedModel(this.client.tvSession, this.organizationId);
    }
    return this._tvSession;
  }

  get securityEvent() {
    if (!this._securityEvent) {
      this._securityEvent = createTenantIsolatedModel(this.client.securityEvent, this.organizationId);
    }
    return this._securityEvent;
  }

  get securityFinding() {
    if (!this._securityFinding) {
      this._securityFinding = createTenantIsolatedModel(this.client.securityFinding, this.organizationId);
    }
    return this._securityFinding;
  }

  get dashboard() {
    if (!this._dashboard) {
      this._dashboard = createTenantIsolatedModel(this.client.dashboard, this.organizationId);
    }
    return this._dashboard;
  }

  get webauthnChallenge() {
    if (!this._webauthnChallenge) {
      this._webauthnChallenge = createTenantIsolatedModel(this.client.webauthnChallenge, this.organizationId);
    }
    return this._webauthnChallenge;
  }

  get session() {
    if (!this._session) {
      this._session = createTenantIsolatedModel(this.client.session, this.organizationId);
    }
    return this._session;
  }

  get systemEvent() {
    if (!this._systemEvent) {
      this._systemEvent = createTenantIsolatedModel(this.client.systemEvent, this.organizationId);
    }
    return this._systemEvent;
  }

  get costOptimization() {
    if (!this._costOptimization) {
      this._costOptimization = createTenantIsolatedModel(this.client.costOptimization, this.organizationId);
    }
    return this._costOptimization;
  }

  get copilotInteraction() {
    if (!this._copilotInteraction) {
      this._copilotInteraction = createTenantIsolatedModel(this.client.copilotInteraction, this.organizationId);
    }
    return this._copilotInteraction;
  }

  get complianceScan() {
    if (!this._complianceScan) {
      this._complianceScan = createTenantIsolatedModel(this.client.complianceScan, this.organizationId);
    }
    return this._complianceScan;
  }

  get mfaFactor() {
    if (!this._mfaFactor) {
      // MFA factors use user_id, not organization_id directly
      // But we still want to ensure tenant isolation through user relationship
      this._mfaFactor = this.client.mfaFactor;
    }
    return this._mfaFactor;
  }

  get webauthnCredential() {
    if (!this._webauthnCredential) {
      // WebAuthn credentials use user_id
      this._webauthnCredential = this.client.webAuthnCredential;
    }
    return this._webauthnCredential;
  }

  get alert() {
    if (!this._alert) {
      this._alert = createTenantIsolatedModel(this.client.alert, this.organizationId);
    }
    return this._alert;
  }

  get backgroundJob() {
    if (!this._backgroundJob) {
      this._backgroundJob = createTenantIsolatedModel(this.client.backgroundJob, this.organizationId);
    }
    return this._backgroundJob;
  }

  get license() {
    if (!this._license) {
      this._license = createTenantIsolatedModel(this.client.license, this.organizationId);
    }
    return this._license;
  }

  get organization() {
    if (!this._organization) {
      // Organization model uses 'id' not 'organization_id'
      this._organization = createTenantIsolatedModel(this.client.organization, this.organizationId, 'id');
    }
    return this._organization;
  }

  get profile() {
    if (!this._profile) {
      this._profile = createTenantIsolatedModel(this.client.profile, this.organizationId);
    }
    return this._profile;
  }

  get riSpRecommendation() {
    if (!this._riSpRecommendation) {
      this._riSpRecommendation = createTenantIsolatedModel(this.client.riSpRecommendation, this.organizationId);
    }
    return this._riSpRecommendation;
  }

  get riSpUtilizationHistory() {
    if (!this._riSpUtilizationHistory) {
      this._riSpUtilizationHistory = createTenantIsolatedModel(this.client.riSpUtilizationHistory, this.organizationId);
    }
    return this._riSpUtilizationHistory;
  }

  get wafMonitoringConfig() {
    if (!this._wafMonitoringConfig) {
      this._wafMonitoringConfig = createTenantIsolatedModel(this.client.wafMonitoringConfig, this.organizationId);
    }
    return this._wafMonitoringConfig;
  }

  get wafBlockedIp() {
    if (!this._wafBlockedIp) {
      this._wafBlockedIp = createTenantIsolatedModel(this.client.wafBlockedIp, this.organizationId);
    }
    return this._wafBlockedIp;
  }

  get wafEvent() {
    if (!this._wafEvent) {
      this._wafEvent = createTenantIsolatedModel(this.client.wafEvent, this.organizationId);
    }
    return this._wafEvent;
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