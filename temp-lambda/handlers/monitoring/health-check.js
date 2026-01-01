"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const checks = {
            lambda: { status: 'healthy', timestamp: new Date().toISOString() },
            database: { status: 'unknown' },
            memory: {
                used: process.memoryUsage().heapUsed / 1024 / 1024,
                total: process.memoryUsage().heapTotal / 1024 / 1024,
                limit: parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '512'),
            },
        };
        // Check database
        try {
            const prisma = (0, database_js_1.getPrismaClient)();
            await prisma.$queryRaw `SELECT 1`;
            checks.database = { status: 'healthy', latency_ms: 0 };
        }
        catch (dbError) {
            checks.database = {
                status: 'unhealthy',
                error: dbError instanceof Error ? dbError.message : 'Unknown error'
            };
        }
        const allHealthy = Object.values(checks).every(check => !check.status || check.status === 'healthy');
        return (0, response_js_1.success)({
            status: allHealthy ? 'healthy' : 'degraded',
            checks,
            version: process.env.APP_VERSION || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Health check error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error', 503);
    }
}
//# sourceMappingURL=health-check.js.map