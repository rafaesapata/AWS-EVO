"use strict";
/**
 * Check License Data - Debug handler to check license tables
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const middleware_js_1 = require("../../lib/middleware.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        if (!(0, auth_js_1.isAdmin)(user)) {
            return (0, response_js_1.error)('Admin access required', 403, undefined, origin);
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // Check license_seat_assignments table using raw query - get ALL records
        const seatAssignments = await prisma.$queryRaw `
      SELECT id, license_id, user_id::text, assigned_at, assigned_by::text 
      FROM license_seat_assignments
    `;
        // Check licenses table - get all columns
        const licenses = await prisma.$queryRaw `
      SELECT * 
      FROM licenses 
      WHERE organization_id = ${organizationId}::uuid
      LIMIT 5
    `;
        // Get table schema
        const licenseColumns = await prisma.$queryRaw `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'licenses'
      ORDER BY ordinal_position
    `;
        // Check organization_license_configs
        const configs = await prisma.$queryRaw `
      SELECT id, organization_id, customer_id, sync_status, sync_error 
      FROM organization_license_configs 
      WHERE organization_id = ${organizationId}::uuid
    `;
        return (0, response_js_1.success)({
            organization_id: organizationId,
            seat_assignments: seatAssignments,
            licenses: licenses,
            license_columns: licenseColumns,
            configs: configs,
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Check license data error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
    }
}
//# sourceMappingURL=check-license-data.js.map