"use strict";
/**
 * Sync License - Manual license sync trigger
 * Allows admin to manually sync licenses from external API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
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
        // Only admins can trigger sync
        if (!(0, auth_js_1.isAdmin)(user)) {
            return (0, response_js_1.forbidden)('Only administrators can sync licenses', origin);
        }
        logging_js_1.logger.info(`Manual license sync triggered for org ${organizationId}`);
        // Sync licenses
        const syncResult = await (0, license_service_js_1.syncOrganizationLicenses)(organizationId);
        // Get updated summary
        const summary = await (0, license_service_js_1.getLicenseSummary)(organizationId);
        return (0, response_js_1.success)({
            sync_result: {
                success: syncResult.success,
                customer_id: syncResult.customerId,
                licenses_found: syncResult.licensesFound,
                licenses_synced: syncResult.licensesSynced,
                errors: syncResult.errors,
            },
            license_summary: summary,
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Sync license error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
    }
}
//# sourceMappingURL=sync-license.js.map