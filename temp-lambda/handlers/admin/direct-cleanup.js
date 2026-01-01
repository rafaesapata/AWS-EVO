"use strict";
/**
 * Direct cleanup handler - removes invalid seat assignments
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
function getOriginFromEvent(event) {
    const headers = event.headers || {};
    return headers['origin'] || headers['Origin'] || '*';
}
async function handler(event, context) {
    const origin = getOriginFromEvent(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        logging_js_1.logger.info('Direct cleanup started', { requestId: context.awsRequestId });
        const prisma = (0, database_js_1.getPrismaClient)();
        // Target license and organization
        const licenseKey = 'NC-C7FD-5186-BCAC-CFD5';
        const organizationId = 'f7c9c432-d2c9-41ad-be8f-38883c06cb48';
        // 1. Get license
        const license = await prisma.license.findFirst({
            where: {
                license_key: licenseKey,
                organization_id: organizationId
            }
        });
        if (!license) {
            return (0, response_js_1.error)('License not found', 404, undefined, origin);
        }
        // 2. Get valid user IDs from organization
        const orgProfiles = await prisma.profile.findMany({
            where: { organization_id: organizationId },
            select: { user_id: true }
        });
        const validUserIds = orgProfiles.map(p => p.user_id);
        // 3. Find invalid seats
        const invalidSeats = await prisma.licenseSeatAssignment.findMany({
            where: {
                license_id: license.id,
                user_id: {
                    notIn: validUserIds
                }
            }
        });
        logging_js_1.logger.info('Found invalid seats', { count: invalidSeats.length, ids: invalidSeats.map(s => s.id) });
        let result = {
            success: true,
            licenseId: license.id,
            invalidSeatsFound: invalidSeats.length,
            invalidSeatsRemoved: 0,
            validUserIds,
            invalidSeats: invalidSeats.map(s => ({ id: s.id, user_id: s.user_id }))
        };
        // 4. Delete invalid seats
        if (invalidSeats.length > 0) {
            const deleteResult = await prisma.licenseSeatAssignment.deleteMany({
                where: {
                    id: { in: invalidSeats.map(s => s.id) }
                }
            });
            result.invalidSeatsRemoved = deleteResult.count;
            // 5. Update license counts
            const remainingSeats = await prisma.licenseSeatAssignment.count({
                where: { license_id: license.id }
            });
            await prisma.license.update({
                where: { id: license.id },
                data: {
                    used_seats: remainingSeats,
                    available_seats: license.max_users - remainingSeats
                }
            });
            logging_js_1.logger.info('Cleanup completed', {
                removed: deleteResult.count,
                remaining: remainingSeats,
                available: license.max_users - remainingSeats
            });
        }
        return (0, response_js_1.success)(result, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Direct cleanup error', err, { requestId: context.awsRequestId });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Cleanup failed', 500, undefined, origin);
    }
}
//# sourceMappingURL=direct-cleanup.js.map