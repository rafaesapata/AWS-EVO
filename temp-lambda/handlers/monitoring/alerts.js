"use strict";
/**
 * Lambda handler for Alerts CRUD
 * Gerencia alertas (listar, reconhecer, resolver)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const middleware_js_1 = require("../../lib/middleware.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Alerts handler started');
    const method = (0, middleware_js_1.getHttpMethod)(event);
    if (method === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const prisma = (0, database_js_1.getPrismaClient)();
        // GET - Listar alertas
        if (method === 'GET') {
            const queryParams = event.queryStringParameters || {};
            const severity = queryParams.severity;
            const status = queryParams.status; // 'active', 'acknowledged', 'resolved'
            const limit = parseInt(queryParams.limit || '50');
            const alerts = await prisma.alert.findMany({
                where: {
                    organization_id: organizationId,
                    ...(severity && { severity }),
                    ...(status === 'active' && { acknowledged_at: null, resolved_at: null }),
                    ...(status === 'acknowledged' && { acknowledged_at: { not: null }, resolved_at: null }),
                    ...(status === 'resolved' && { resolved_at: { not: null } }),
                },
                orderBy: { triggered_at: 'desc' },
                take: limit,
                include: {
                    rule: true,
                },
            });
            return (0, response_js_1.success)(alerts);
        }
        // PUT - Atualizar alerta (acknowledge/resolve)
        if (method === 'PUT') {
            const body = event.body ? JSON.parse(event.body) : {};
            if (!body.id || !body.action) {
                return (0, response_js_1.error)('ID e ação são obrigatórios', 400);
            }
            // Verificar se alerta pertence à organização
            const existing = await prisma.alert.findFirst({
                where: { id: body.id, organization_id: organizationId },
            });
            if (!existing) {
                return (0, response_js_1.error)('Alerta não encontrado', 404);
            }
            const updateData = {};
            if (body.action === 'acknowledge') {
                updateData.acknowledged_at = new Date();
            }
            else if (body.action === 'resolve') {
                updateData.resolved_at = new Date();
                if (!existing.acknowledged_at) {
                    updateData.acknowledged_at = new Date();
                }
            }
            const alert = await prisma.alert.update({
                where: { id: body.id },
                data: updateData,
            });
            logging_js_1.logger.info(`✅ Alert ${body.action}d: ${alert.id}`);
            return (0, response_js_1.success)(alert);
        }
        // DELETE - Deletar alerta
        if (method === 'DELETE') {
            const body = event.body ? JSON.parse(event.body) : {};
            const alertId = body.id || event.queryStringParameters?.id;
            if (!alertId) {
                return (0, response_js_1.error)('ID do alerta é obrigatório', 400);
            }
            // Verificar se alerta pertence à organização
            const existing = await prisma.alert.findFirst({
                where: { id: alertId, organization_id: organizationId },
            });
            if (!existing) {
                return (0, response_js_1.error)('Alerta não encontrado', 404);
            }
            await prisma.alert.delete({
                where: { id: alertId },
            });
            logging_js_1.logger.info(`✅ Alert deleted: ${alertId}`);
            return (0, response_js_1.success)({ success: true, message: 'Alerta deletado com sucesso' });
        }
        return (0, response_js_1.error)('Método não suportado', 405);
    }
    catch (err) {
        logging_js_1.logger.error('❌ Alerts error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=alerts.js.map