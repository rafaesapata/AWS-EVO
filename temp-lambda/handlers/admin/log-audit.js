"use strict";
/**
 * Lambda handler for Log Audit
 * Registra ações de auditoria no sistema
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const middleware_js_1 = require("../../lib/middleware.js");
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const userId = user.sub || user.id || 'unknown';
        const body = event.body ? JSON.parse(event.body) : {};
        const { action, resourceType, resourceId, details } = body;
        if (!action || !resourceType || !resourceId) {
            return (0, response_js_1.badRequest)('Missing required fields: action, resourceType, resourceId', undefined, origin);
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // Registrar log de auditoria
        const auditLog = await prisma.auditLog.create({
            data: {
                organization_id: organizationId,
                user_id: userId,
                action,
                resource_type: resourceType,
                resource_id: resourceId,
                details: details || {},
                ip_address: event.requestContext?.identity?.sourceIp ||
                    event.headers?.['x-forwarded-for']?.split(',')[0] ||
                    'unknown',
                user_agent: event.headers?.['user-agent'] || 'unknown',
            },
        });
        logging_js_1.logger.info(`✅ Audit log created: ${action} on ${resourceType}/${resourceId}`);
        return (0, response_js_1.success)({
            success: true,
            auditLogId: auditLog.id,
        }, 201, origin);
    }
    catch (err) {
        logging_js_1.logger.error('❌ Log audit error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
    }
}
//# sourceMappingURL=log-audit.js.map