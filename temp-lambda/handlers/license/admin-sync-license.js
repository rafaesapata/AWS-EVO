"use strict";
/**
 * Admin Sync License - Super Admin can sync any organization's license
 * Allows super admin to manually trigger license sync for specific organizations
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
        // Only super admins can use this endpoint
        if (!(0, auth_js_1.isSuperAdmin)(user)) {
            return (0, response_js_1.forbidden)('Only super administrators can access this endpoint', origin);
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // GET - List all organizations with license configs
        if (method === 'GET') {
            const configs = await prisma.organizationLicenseConfig.findMany();
            // Get organization names
            const orgIds = configs.map((c) => c.organization_id);
            const organizations = await prisma.organization.findMany({
                where: { id: { in: orgIds } },
                select: { id: true, name: true, slug: true },
            });
            const orgMap = new Map(organizations.map(o => [o.id, o]));
            const result = configs.map((config) => ({
                organization_id: config.organization_id,
                organization_name: orgMap.get(config.organization_id)?.name || 'Unknown',
                organization_slug: orgMap.get(config.organization_id)?.slug || 'unknown',
                customer_id: config.customer_id,
                auto_sync: config.auto_sync,
                last_sync_at: config.last_sync_at,
                sync_status: config.sync_status,
                sync_error: config.sync_error,
            }));
            return (0, response_js_1.success)({
                total: result.length,
                organizations: result,
            }, 200, origin);
        }
        // POST - Sync specific organizations
        const body = event.body ? JSON.parse(event.body) : {};
        let organizationIds = [];
        if (body.sync_all) {
            // Get all organizations with license config
            const configs = await prisma.organizationLicenseConfig.findMany({
                select: { organization_id: true },
            });
            organizationIds = configs.map((c) => c.organization_id);
        }
        else if (body.organization_ids && body.organization_ids.length > 0) {
            organizationIds = body.organization_ids;
        }
        else {
            return (0, response_js_1.badRequest)('Provide organization_ids array or set sync_all: true', undefined, origin);
        }
        logging_js_1.logger.info(`Admin sync triggered for ${organizationIds.length} organizations`);
        const results = [];
        for (const orgId of organizationIds) {
            const syncResult = await (0, license_service_js_1.syncOrganizationLicenses)(orgId);
            const summary = await (0, license_service_js_1.getLicenseSummary)(orgId);
            // Get org name
            const org = await prisma.organization.findUnique({
                where: { id: orgId },
                select: { name: true },
            });
            results.push({
                organization_id: orgId,
                organization_name: org?.name || 'Unknown',
                sync_success: syncResult.success,
                customer_id: syncResult.customerId,
                licenses_found: syncResult.licensesFound,
                licenses_synced: syncResult.licensesSynced,
                errors: syncResult.errors,
                current_licenses: summary.licenses.length,
            });
            // Small delay between syncs
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        const successCount = results.filter(r => r.sync_success).length;
        const failCount = results.filter(r => !r.sync_success).length;
        return (0, response_js_1.success)({
            summary: {
                total_organizations: results.length,
                successful: successCount,
                failed: failCount,
            },
            results,
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Admin sync license error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
    }
}
//# sourceMappingURL=admin-sync-license.js.map