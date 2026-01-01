"use strict";
/**
 * Lambda handler for Monitored Endpoints CRUD
 * Gerencia endpoints monitorados (criar, listar, atualizar, deletar)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const middleware_js_1 = require("../../lib/middleware.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Monitored Endpoints handler started');
    const method = (0, middleware_js_1.getHttpMethod)(event);
    if (method === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const prisma = (0, database_js_1.getPrismaClient)();
        // GET - Listar endpoints
        if (method === 'GET') {
            const endpoints = await prisma.monitoredEndpoint.findMany({
                where: { organization_id: organizationId },
                orderBy: { created_at: 'desc' },
                include: {
                    check_history: {
                        take: 10,
                        orderBy: { checked_at: 'desc' },
                    },
                },
            });
            return (0, response_js_1.success)(endpoints);
        }
        // POST - Criar endpoint
        if (method === 'POST') {
            const body = event.body ? JSON.parse(event.body) : {};
            if (!body.name || !body.url) {
                return (0, response_js_1.error)('Nome e URL são obrigatórios', 400);
            }
            // Validar URL
            try {
                new URL(body.url);
            }
            catch {
                return (0, response_js_1.error)('URL inválida', 400);
            }
            const endpoint = await prisma.monitoredEndpoint.create({
                data: {
                    organization_id: organizationId,
                    name: body.name,
                    url: body.url,
                    timeout: body.timeout || 5000,
                    is_active: body.is_active ?? true,
                    alert_on_failure: body.alert_on_failure ?? true,
                    monitor_ssl: body.monitor_ssl ?? true,
                    ssl_alert_days: body.ssl_alert_days || 30,
                },
            });
            logging_js_1.logger.info(`✅ Endpoint created: ${endpoint.id}`);
            return (0, response_js_1.success)(endpoint, 201);
        }
        // PUT - Atualizar endpoint
        if (method === 'PUT') {
            const body = event.body ? JSON.parse(event.body) : {};
            if (!body.id) {
                return (0, response_js_1.error)('ID do endpoint é obrigatório', 400);
            }
            // Verificar se endpoint pertence à organização
            const existing = await prisma.monitoredEndpoint.findFirst({
                where: { id: body.id, organization_id: organizationId },
            });
            if (!existing) {
                return (0, response_js_1.error)('Endpoint não encontrado', 404);
            }
            const endpoint = await prisma.monitoredEndpoint.update({
                where: { id: body.id },
                data: {
                    ...(body.name && { name: body.name }),
                    ...(body.url && { url: body.url }),
                    ...(body.timeout !== undefined && { timeout: body.timeout }),
                    ...(body.is_active !== undefined && { is_active: body.is_active }),
                    ...(body.alert_on_failure !== undefined && { alert_on_failure: body.alert_on_failure }),
                    ...(body.monitor_ssl !== undefined && { monitor_ssl: body.monitor_ssl }),
                    ...(body.ssl_alert_days !== undefined && { ssl_alert_days: body.ssl_alert_days }),
                },
            });
            logging_js_1.logger.info(`✅ Endpoint updated: ${endpoint.id}`);
            return (0, response_js_1.success)(endpoint);
        }
        // DELETE - Deletar endpoint
        if (method === 'DELETE') {
            const body = event.body ? JSON.parse(event.body) : {};
            const endpointId = body.id || event.queryStringParameters?.id;
            if (!endpointId) {
                return (0, response_js_1.error)('ID do endpoint é obrigatório', 400);
            }
            // Verificar se endpoint pertence à organização
            const existing = await prisma.monitoredEndpoint.findFirst({
                where: { id: endpointId, organization_id: organizationId },
            });
            if (!existing) {
                return (0, response_js_1.error)('Endpoint não encontrado', 404);
            }
            await prisma.monitoredEndpoint.delete({
                where: { id: endpointId },
            });
            logging_js_1.logger.info(`✅ Endpoint deleted: ${endpointId}`);
            return (0, response_js_1.success)({ success: true, message: 'Endpoint deletado com sucesso' });
        }
        return (0, response_js_1.error)('Método não suportado', 405);
    }
    catch (err) {
        logging_js_1.logger.error('❌ Monitored Endpoints error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=monitored-endpoints.js.map