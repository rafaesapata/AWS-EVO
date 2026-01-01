"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
async function handler(event, context) {
    if (event.requestContext.http?.method === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    const prisma = (0, database_js_1.getPrismaClient)();
    logging_js_1.logger.info('List Background Jobs started', {
        requestId: context.awsRequestId,
        organizationId
    });
    try {
        // Parse query parameters
        const queryParams = event.queryStringParameters || {};
        const status = queryParams.status;
        const limit = parseInt(queryParams.limit || '50');
        const offset = parseInt(queryParams.offset || '0');
        // Build where clause
        const whereClause = {
            organization_id: organizationId
        };
        if (status && status !== 'all') {
            whereClause.status = status;
        }
        // Get background jobs for the organization
        const jobs = await prisma.backgroundJob.findMany({
            where: whereClause,
            orderBy: {
                created_at: 'desc'
            },
            take: limit,
            skip: offset,
            select: {
                id: true,
                job_type: true,
                status: true,
                created_at: true,
                started_at: true,
                completed_at: true,
                error: true,
                result: true,
                organization_id: true
            }
        });
        // Get total count for pagination
        const totalCount = await prisma.backgroundJob.count({
            where: whereClause
        });
        logging_js_1.logger.info('Background jobs retrieved', {
            organizationId,
            jobsCount: jobs.length,
            totalCount,
            status: status || 'all'
        });
        return (0, response_js_1.success)({
            jobs,
            pagination: {
                total: totalCount,
                limit,
                offset,
                hasMore: offset + jobs.length < totalCount
            }
        });
    }
    catch (err) {
        logging_js_1.logger.error('List Background Jobs error', err, {
            requestId: context.awsRequestId,
            organizationId
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=list-background-jobs.js.map