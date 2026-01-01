"use strict";
/**
 * Configure License - Set customer_id for organization
 * Allows organization admin to configure their license customer ID
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const middleware_js_1 = require("../../lib/middleware.js");
const license_service_js_1 = require("../../lib/license-service.js");
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const method = (0, middleware_js_1.getHttpMethod)(event);
    if (method === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        // Only admins can configure license
        if (!(0, auth_js_1.isAdmin)(user)) {
            return (0, response_js_1.forbidden)('Only administrators can configure license settings', origin);
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // GET - Return current config
        if (method === 'GET') {
            const config = await prisma.organizationLicenseConfig.findUnique({
                where: { organization_id: organizationId },
            });
            return (0, response_js_1.success)({
                configured: !!config,
                customer_id: config?.customer_id,
                auto_sync: config?.auto_sync ?? true,
                last_sync_at: config?.last_sync_at,
                sync_status: config?.sync_status,
                sync_error: config?.sync_error,
            }, 200, origin);
        }
        // POST/PUT - Configure customer_id
        const body = event.body ? JSON.parse(event.body) : {};
        if (!body.customer_id) {
            return (0, response_js_1.badRequest)('customer_id is required', undefined, origin);
        }
        // Validate customer_id format (UUID)
        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (!uuidRegex.test(body.customer_id)) {
            return (0, response_js_1.badRequest)('Invalid customer_id format. Must be a valid UUID.', undefined, origin);
        }
        // Upsert config
        const config = await prisma.organizationLicenseConfig.upsert({
            where: { organization_id: organizationId },
            create: {
                organization_id: organizationId,
                customer_id: body.customer_id,
                auto_sync: body.auto_sync ?? true,
                sync_status: 'pending',
            },
            update: {
                customer_id: body.customer_id,
                auto_sync: body.auto_sync ?? true,
                sync_status: 'pending',
                sync_error: null,
            },
        });
        logging_js_1.logger.info(`License config updated for org ${organizationId}, customer_id: ${body.customer_id}`);
        // Trigger initial sync
        const syncResult = await (0, license_service_js_1.syncOrganizationLicenses)(organizationId);
        return (0, response_js_1.success)({
            message: 'License configuration saved',
            customer_id: config.customer_id,
            auto_sync: config.auto_sync,
            sync_result: {
                success: syncResult.success,
                licenses_found: syncResult.licensesFound,
                licenses_synced: syncResult.licensesSynced,
                errors: syncResult.errors,
            },
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Configure license error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
    }
}
//# sourceMappingURL=configure-license.js.map