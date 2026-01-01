"use strict";
/**
 * License Seat Management Handler
 * Handles seat allocation/deallocation with strict organization isolation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const request_parser_js_1 = require("../../lib/request-parser.js");
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
    let organizationId;
    let userId;
    let userRoles = [];
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        userId = user.sub || user.id || 'unknown';
        organizationId = (0, auth_js_1.getOrganizationId)(user);
        // Parse roles from user claims
        const rolesStr = user['custom:roles'] || user.roles || '[]';
        try {
            userRoles = typeof rolesStr === 'string' ? JSON.parse(rolesStr) : rolesStr;
        }
        catch {
            userRoles = [];
        }
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
    }
    // Check admin permission
    const isAdmin = userRoles.includes('admin') || userRoles.includes('org_admin') || userRoles.includes('super_admin');
    if (!isAdmin) {
        logging_js_1.logger.warn('Unauthorized seat management attempt', { userId, userRoles });
        return (0, response_js_1.unauthorized)('Admin permission required for seat management', origin);
    }
    try {
        const body = (0, request_parser_js_1.parseEventBody)(event, {}, 'manage-seats');
        if (!body.action) {
            return (0, response_js_1.badRequest)('Missing required field: action', undefined, origin);
        }
        logging_js_1.logger.info('Seat management started', {
            action: body.action,
            organizationId,
            userId,
            requestId: context.awsRequestId
        });
        const prisma = (0, database_js_1.getPrismaClient)();
        let result;
        switch (body.action) {
            case 'allocate': {
                if (!body.licenseKey || !body.userId) {
                    return (0, response_js_1.badRequest)('Missing required fields: licenseKey and userId for allocate action', undefined, origin);
                }
                // 1. Verify license belongs to organization
                const license = await prisma.license.findFirst({
                    where: {
                        license_key: body.licenseKey,
                        organization_id: organizationId
                    }
                });
                if (!license) {
                    return (0, response_js_1.badRequest)('License not found or does not belong to your organization', undefined, origin);
                }
                // 2. Verify user belongs to organization
                const userProfile = await prisma.profile.findFirst({
                    where: {
                        user_id: body.userId,
                        organization_id: organizationId
                    }
                });
                if (!userProfile) {
                    return (0, response_js_1.badRequest)('User not found or does not belong to your organization', undefined, origin);
                }
                // 3. Check if user already has a seat for this license
                const existingSeat = await prisma.licenseSeatAssignment.findFirst({
                    where: {
                        license_id: license.id,
                        user_id: body.userId
                    }
                });
                if (existingSeat) {
                    return (0, response_js_1.badRequest)('User already has a seat assigned for this license', undefined, origin);
                }
                // 4. Check available seats
                const currentSeats = await prisma.licenseSeatAssignment.count({
                    where: { license_id: license.id }
                });
                if (currentSeats >= license.max_users) {
                    return (0, response_js_1.badRequest)('No available seats. All seats are allocated.', undefined, origin);
                }
                // 5. Allocate seat
                result = await prisma.licenseSeatAssignment.create({
                    data: {
                        license_id: license.id,
                        user_id: body.userId,
                        assigned_at: new Date(),
                        assigned_by: userId
                    }
                });
                // 6. Update license seat counts
                await prisma.license.update({
                    where: { id: license.id },
                    data: {
                        used_seats: currentSeats + 1,
                        available_seats: license.max_users - (currentSeats + 1)
                    }
                });
                logging_js_1.logger.info('Seat allocated successfully', {
                    licenseId: license.id,
                    userId: body.userId,
                    seatId: result.id
                });
                break;
            }
            case 'deallocate': {
                if (!body.seatId) {
                    return (0, response_js_1.badRequest)('Missing required field: seatId for deallocate action', undefined, origin);
                }
                // 1. Find seat assignment and verify it belongs to organization's license
                const seatAssignment = await prisma.licenseSeatAssignment.findFirst({
                    where: { id: body.seatId },
                    include: {
                        license: {
                            select: {
                                id: true,
                                organization_id: true,
                                max_users: true
                            }
                        }
                    }
                });
                if (!seatAssignment) {
                    return (0, response_js_1.badRequest)('Seat assignment not found', undefined, origin);
                }
                if (seatAssignment.license.organization_id !== organizationId) {
                    return (0, response_js_1.unauthorized)('Seat assignment does not belong to your organization', origin);
                }
                // 2. Delete seat assignment
                await prisma.licenseSeatAssignment.delete({
                    where: { id: body.seatId }
                });
                // 3. Update license seat counts
                const remainingSeats = await prisma.licenseSeatAssignment.count({
                    where: { license_id: seatAssignment.license.id }
                });
                await prisma.license.update({
                    where: { id: seatAssignment.license.id },
                    data: {
                        used_seats: remainingSeats,
                        available_seats: seatAssignment.license.max_users - remainingSeats
                    }
                });
                result = { success: true, deallocated: true };
                logging_js_1.logger.info('Seat deallocated successfully', {
                    seatId: body.seatId,
                    licenseId: seatAssignment.license.id
                });
                break;
            }
            case 'cleanup': {
                // Remove seat assignments for users not in the organization
                if (!body.licenseKey) {
                    return (0, response_js_1.badRequest)('Missing required field: licenseKey for cleanup action', undefined, origin);
                }
                // 1. Get license
                const license = await prisma.license.findFirst({
                    where: {
                        license_key: body.licenseKey,
                        organization_id: organizationId
                    }
                });
                if (!license) {
                    return (0, response_js_1.badRequest)('License not found or does not belong to your organization', undefined, origin);
                }
                // 2. Find seat assignments for users not in the organization
                const invalidSeats = await prisma.licenseSeatAssignment.findMany({
                    where: {
                        license_id: license.id,
                        user_id: {
                            notIn: await prisma.profile.findMany({
                                where: { organization_id: organizationId },
                                select: { user_id: true }
                            }).then(profiles => profiles.map(p => p.user_id))
                        }
                    }
                });
                // 3. Delete invalid seat assignments
                if (invalidSeats.length > 0) {
                    await prisma.licenseSeatAssignment.deleteMany({
                        where: {
                            id: { in: invalidSeats.map(s => s.id) }
                        }
                    });
                    // 4. Update license seat counts
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
                }
                result = {
                    success: true,
                    cleaned: true,
                    removedSeats: invalidSeats.length,
                    invalidSeatIds: invalidSeats.map(s => s.id)
                };
                logging_js_1.logger.info('Seat cleanup completed', {
                    licenseId: license.id,
                    removedSeats: invalidSeats.length
                });
                break;
            }
            default:
                return (0, response_js_1.badRequest)(`Invalid action: ${body.action}. Use allocate, deallocate, or cleanup`, undefined, origin);
        }
        logging_js_1.logger.info('Seat management completed', {
            action: body.action,
            organizationId,
            success: true
        });
        return (0, response_js_1.success)(result, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Seat management error', err, {
            organizationId,
            userId,
            requestId: context.awsRequestId,
        });
        // Handle Prisma errors
        if (err.code === 'P2002') {
            return (0, response_js_1.badRequest)('Seat assignment already exists (unique constraint violation)', undefined, origin);
        }
        if (err.code === 'P2025') {
            return (0, response_js_1.badRequest)('Record not found', undefined, origin);
        }
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Failed to manage seats', 500, undefined, origin);
    }
}
//# sourceMappingURL=manage-seats.js.map