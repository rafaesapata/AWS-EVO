"use strict";
/**
 * Lambda handler para limpar dados de custo antigos/incorretos
 * Remove todos os registros da tabela daily_costs para permitir re-fetch
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const middleware_js_1 = require("../../lib/middleware.js");
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    logging_js_1.logger.info('Cleanup Cost Data started', { requestId: context.awsRequestId });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const prisma = (0, database_js_1.getPrismaClient)();
        // Contar registros antes da limpeza
        const countBefore = await prisma.dailyCost.count({
            where: {
                organization_id: organizationId,
            },
        });
        logging_js_1.logger.info('Cleaning up cost data', {
            organizationId,
            recordsToDelete: countBefore
        });
        // Deletar todos os registros de custo da organização
        const deleteResult = await prisma.dailyCost.deleteMany({
            where: {
                organization_id: organizationId,
            },
        });
        logging_js_1.logger.info('Cost data cleanup completed', {
            organizationId,
            deletedRecords: deleteResult.count
        });
        return (0, response_js_1.success)({
            success: true,
            message: `Deleted ${deleteResult.count} cost records`,
            deletedRecords: deleteResult.count,
            organizationId
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Cleanup cost data error', err, {
            organizationId: 'unknown',
            requestId: context.awsRequestId,
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Failed to cleanup cost data', 500, undefined, origin);
    }
}
//# sourceMappingURL=cleanup-cost-data.js.map