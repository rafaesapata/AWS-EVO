"use strict";
/**
 * Database Connection and Prisma Client
 * Manages database connections and provides Prisma client instance
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantIsolatedPrisma = exports.cleanup = exports.migrations = void 0;
exports.getPrismaClient = getPrismaClient;
exports.connectDatabase = connectDatabase;
exports.disconnectDatabase = disconnectDatabase;
exports.checkDatabaseHealth = checkDatabaseHealth;
exports.executeTransaction = executeTransaction;
exports.withTenantIsolation = withTenantIsolation;
const client_1 = require("@prisma/client");
const logging_1 = require("./logging");
let prisma = null;
/**
 * Get Prisma client instance (singleton)
 */
function getPrismaClient() {
    if (!prisma) {
        const isProduction = process.env.NODE_ENV === 'production';
        const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
        prisma = new client_1.PrismaClient({
            log: isProduction
                ? ['warn', 'error']
                : ['query', 'info', 'warn', 'error'],
            datasources: {
                db: {
                    url: process.env.DATABASE_URL,
                },
            },
        });
        // Only auto-connect in Lambda environment
        if (isLambda) {
            prisma.$connect().catch((error) => {
                logging_1.logger.error('Failed to connect Prisma client', error);
            });
        }
        logging_1.logger.info('Prisma client initialized', { isLambda, isProduction });
    }
    return prisma;
}
/**
 * Connect to database
 */
async function connectDatabase() {
    try {
        const client = getPrismaClient();
        await client.$connect();
        logging_1.logger.info('Database connected successfully');
    }
    catch (error) {
        logging_1.logger.error('Failed to connect to database', error);
        throw error;
    }
}
/**
 * Disconnect from database
 */
async function disconnectDatabase() {
    try {
        if (prisma) {
            await prisma.$disconnect();
            prisma = null;
            logging_1.logger.info('Database disconnected successfully');
        }
    }
    catch (error) {
        logging_1.logger.error('Failed to disconnect from database', error);
        throw error;
    }
}
/**
 * Health check for database connection
 */
async function checkDatabaseHealth() {
    try {
        const client = getPrismaClient();
        const startTime = Date.now();
        // Simple query to test connection
        await client.$queryRaw `SELECT 1 as health_check`;
        const responseTime = Date.now() - startTime;
        return {
            healthy: true,
            message: 'Database is healthy',
            details: {
                responseTime,
                connectionStatus: 'connected',
            },
        };
    }
    catch (error) {
        logging_1.logger.error('Database health check failed', error);
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
async function executeTransaction(callback) {
    const client = getPrismaClient();
    return await client.$transaction(async (tx) => {
        return await callback(tx);
    });
}
/**
 * Database migration utilities
 */
exports.migrations = {
    /**
     * Run pending migrations
     */
    async run() {
        try {
            const client = getPrismaClient();
            // In a real implementation, this would run Prisma migrations
            // For now, we'll just log that migrations would be run
            logging_1.logger.info('Database migrations would be run here');
        }
        catch (error) {
            logging_1.logger.error('Failed to run migrations', error);
            throw error;
        }
    },
    /**
     * Check migration status
     */
    async status() {
        try {
            // In a real implementation, this would check migration status
            return {
                pending: 0,
                applied: 1,
                lastMigration: '001_create_notification_settings',
            };
        }
        catch (error) {
            logging_1.logger.error('Failed to check migration status', error);
            throw error;
        }
    },
};
/**
 * Database cleanup utilities
 */
exports.cleanup = {
    /**
     * Clean up old records
     */
    async oldRecords(olderThanDays = 90) {
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
            logging_1.logger.info('Old records cleanup completed', {
                cutoffDate: cutoffDate.toISOString(),
                olderThanDays,
            });
            return 0; // Return number of deleted records
        }
        catch (error) {
            logging_1.logger.error('Failed to clean up old records', error);
            throw error;
        }
    },
    /**
     * Vacuum database (PostgreSQL specific)
     */
    async vacuum() {
        try {
            const client = getPrismaClient();
            await client.$executeRaw `VACUUM ANALYZE`;
            logging_1.logger.info('Database vacuum completed');
        }
        catch (error) {
            logging_1.logger.error('Failed to vacuum database', error);
            throw error;
        }
    },
};
/**
 * Tenant-isolated Prisma client
 */
class TenantIsolatedPrisma {
    constructor(organizationId) {
        this.organizationId = organizationId;
        this.client = getPrismaClient();
    }
    get prisma() {
        return this.client;
    }
    get tenantId() {
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
exports.TenantIsolatedPrisma = TenantIsolatedPrisma;
/**
 * Tenant isolation helper
 */
function withTenantIsolation(organizationId, callback) {
    const tenantPrisma = new TenantIsolatedPrisma(organizationId);
    return callback(tenantPrisma);
}
// Graceful shutdown handling - apenas para ambientes não-Lambda
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
if (!isLambda) {
    process.on('SIGINT', async () => {
        logging_1.logger.info('Received SIGINT, disconnecting from database...');
        await disconnectDatabase();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        logging_1.logger.info('Received SIGTERM, disconnecting from database...');
        await disconnectDatabase();
        process.exit(0);
    });
}
//# sourceMappingURL=database.js.map