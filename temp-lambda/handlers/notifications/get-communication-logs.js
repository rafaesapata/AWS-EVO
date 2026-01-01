"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Get Communication Logs started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { channel, status, limit = 50, offset = 0 } = body;
        const prisma = (0, database_js_1.getPrismaClient)();
        const logs = await prisma.communicationLog.findMany({
            where: {
                organization_id: organizationId,
                ...(channel && { channel }),
                ...(status && { status }),
            },
            orderBy: { sent_at: 'desc' },
            take: limit,
            skip: offset,
        });
        const total = await prisma.communicationLog.count({
            where: {
                organization_id: organizationId,
                ...(channel && { channel }),
                ...(status && { status }),
            },
        });
        logging_js_1.logger.info(`✅ Retrieved ${logs.length} communication logs`);
        return (0, response_js_1.success)({
            success: true,
            logs,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + logs.length < total,
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Get Communication Logs error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=get-communication-logs.js.map