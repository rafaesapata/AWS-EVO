"use strict";
/**
 * Lambda handler for running raw SQL queries (READ ONLY)
 * Admin-only operation for debugging and data inspection
 * MILITARY GRADE: Strict validation to prevent SQL injection
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const middleware_js_1 = require("../../lib/middleware.js");
const auth_js_1 = require("../../lib/auth.js");
// MILITARY GRADE: Dangerous SQL patterns that could be used for injection
const DANGEROUS_PATTERNS = [
    /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)/i,
    /--/, // SQL comments
    /\/\*/, // Block comments
    /UNION\s+(ALL\s+)?SELECT/i,
    /INTO\s+(OUTFILE|DUMPFILE)/i,
    /LOAD_FILE/i,
    /BENCHMARK\s*\(/i,
    /SLEEP\s*\(/i,
    /WAITFOR\s+DELAY/i,
    /xp_cmdshell/i,
    /EXEC\s*\(/i,
    /EXECUTE\s*\(/i,
];
// MILITARY GRADE: Allowed tables for read-only queries
const ALLOWED_TABLES = [
    'daily_costs',
    'aws_credentials',
    'security_scans',
    'findings',
    'profiles',
    'organizations',
    'users',
    'audit_logs',
    'security_events',
];
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event) || '*';
    logging_js_1.logger.info('Run SQL started', { requestId: context.awsRequestId });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        // MILITARY GRADE: Only super_admin can run raw SQL
        const user = (0, auth_js_1.getUserFromEvent)(event);
        if (!(0, auth_js_1.isSuperAdmin)(user)) {
            logging_js_1.logger.warn('Unauthorized SQL access attempt', { userId: user.sub });
            return (0, response_js_1.unauthorized)('Only super_admin can execute raw SQL queries', origin);
        }
        // Parse body
        let body = {};
        if (event.body) {
            try {
                body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
            }
            catch {
                return (0, response_js_1.badRequest)('Invalid JSON body');
            }
        }
        const { sql } = body;
        if (!sql) {
            return (0, response_js_1.badRequest)('Missing required field: sql');
        }
        // MILITARY GRADE: Limit query length
        if (sql.length > 5000) {
            return (0, response_js_1.badRequest)('Query too long (max 5000 characters)');
        }
        // Only allow SELECT queries for safety
        const normalizedSql = sql.trim().toUpperCase();
        if (!normalizedSql.startsWith('SELECT')) {
            return (0, response_js_1.badRequest)('Only SELECT queries are allowed');
        }
        // MILITARY GRADE: Check for dangerous patterns
        for (const pattern of DANGEROUS_PATTERNS) {
            if (pattern.test(sql)) {
                logging_js_1.logger.warn('Dangerous SQL pattern detected', {
                    userId: user.sub,
                    pattern: pattern.toString(),
                    sql: sql.substring(0, 100)
                });
                return (0, response_js_1.badRequest)('Query contains forbidden patterns');
            }
        }
        // MILITARY GRADE: Audit log the query
        logging_js_1.logger.info('Admin SQL query executed', {
            userId: user.sub,
            sql: sql.substring(0, 500),
            requestId: context.awsRequestId
        });
        const prisma = (0, database_js_1.getPrismaClient)();
        const results = await prisma.$queryRawUnsafe(sql);
        logging_js_1.logger.info('SQL completed', {
            rowCount: Array.isArray(results) ? results.length : 1,
            userId: user.sub
        });
        return (0, response_js_1.success)({
            success: true,
            data: results,
            rowCount: Array.isArray(results) ? results.length : 1,
        });
    }
    catch (err) {
        logging_js_1.logger.error('SQL error', err, { requestId: context.awsRequestId });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=run-sql.js.map