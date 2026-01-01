"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
async function handler(event, context) {
    logging_js_1.logger.info('Cleanup Expired External IDs started', { requestId: context.awsRequestId });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar external IDs expirados (mais de 30 dias)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const expiredIds = await prisma.externalId.findMany({
            where: {
                created_at: {
                    lt: thirtyDaysAgo,
                },
                used: false,
            },
        });
        logging_js_1.logger.info('Found expired external IDs', { expiredCount: expiredIds.length });
        // Deletar IDs expirados
        const deleted = await prisma.externalId.deleteMany({
            where: {
                id: {
                    in: expiredIds.map(e => e.id),
                },
            },
        });
        logging_js_1.logger.info('Cleanup completed successfully', { deletedCount: deleted.count });
        return (0, response_js_1.success)({
            success: true,
            deletedCount: deleted.count,
            expiredIds: expiredIds.map(e => e.id),
        });
    }
    catch (err) {
        logging_js_1.logger.error('Cleanup Expired External IDs error', err, { requestId: context.awsRequestId });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=cleanup-expired-external-ids.js.map