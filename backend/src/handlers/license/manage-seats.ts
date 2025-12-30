/**
 * Manage License Seats - Assign/revoke seats to users
 * Each seat allows one user to access the system
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, badRequest, corsOptions, forbidden, notFound } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId, isAdmin } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { assignSeat, revokeSeat } from '../../lib/license-service.js';

interface ManageSeatsRequest {
  action: 'assign' | 'revoke';
  license_id: string;
  user_id: string;
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const method = getHttpMethod(event);

  if (method === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    const userId = user.sub;

    // Only admins can manage seats
    if (!isAdmin(user)) {
      return forbidden('Only administrators can manage license seats', origin);
    }

    const prisma = getPrismaClient() as any;

    // GET - List seat assignments for organization's licenses
    if (method === 'GET') {
      const licenses = await prisma.license.findMany({
        where: {
          organization_id: organizationId,
          is_active: true,
        },
        include: {
          seat_assignments: true,
        },
      });

      // Get user details for assigned seats
      const allUserIds = licenses.flatMap((l: any) => 
        l.seat_assignments.map((s: any) => s.user_id)
      );
      
      const users = await prisma.profile.findMany({
        where: {
          user_id: { in: allUserIds },
          organization_id: organizationId,
        },
        select: {
          user_id: true,
          full_name: true,
        },
      });

      const userMap = new Map(users.map((u: any) => [u.user_id, u.full_name]));

      // Get all org users for available assignment
      const allOrgUsers = await prisma.profile.findMany({
        where: { organization_id: organizationId },
        select: {
          user_id: true,
          full_name: true,
          role: true,
        },
      });

      const result = licenses.map((license: any) => ({
        license_id: license.id,
        license_key: license.license_key,
        product_type: license.product_type,
        total_seats: license.max_users,
        used_seats: license.seat_assignments.length,
        available_seats: license.max_users - license.seat_assignments.length,
        assignments: license.seat_assignments.map((a: any) => ({
          id: a.id,
          user_id: a.user_id,
          user_name: userMap.get(a.user_id) || 'Unknown',
          assigned_at: a.assigned_at,
        })),
      }));

      // Users without seats
      const assignedUserIds = new Set(allUserIds);
      const unassignedUsers = allOrgUsers.filter((u: any) => !assignedUserIds.has(u.user_id));

      return success({
        licenses: result,
        unassigned_users: unassignedUsers.map((u: any) => ({
          user_id: u.user_id,
          full_name: u.full_name,
          role: u.role,
        })),
        total_org_users: allOrgUsers.length,
      }, 200, origin);
    }

    // POST - Assign or revoke seat
    const body: ManageSeatsRequest = event.body ? JSON.parse(event.body) : {};

    if (!body.action || !body.license_id || !body.user_id) {
      return badRequest('action, license_id, and user_id are required', undefined, origin);
    }

    // Verify license belongs to organization
    const license = await prisma.license.findFirst({
      where: {
        id: body.license_id,
        organization_id: organizationId,
      },
    });

    if (!license) {
      return notFound('License not found', origin);
    }

    // Verify user belongs to organization
    const targetUser = await prisma.profile.findFirst({
      where: {
        user_id: body.user_id,
        organization_id: organizationId,
      },
    });

    if (!targetUser) {
      return notFound('User not found in organization', origin);
    }

    let result;

    if (body.action === 'assign') {
      result = await assignSeat(body.license_id, body.user_id, userId);
      
      if (result.success) {
        logger.info(`Seat assigned: license=${body.license_id}, user=${body.user_id}, by=${userId}`);
      }
    } else if (body.action === 'revoke') {
      result = await revokeSeat(body.license_id, body.user_id);
      
      if (result.success) {
        logger.info(`Seat revoked: license=${body.license_id}, user=${body.user_id}, by=${userId}`);
      }
    } else {
      return badRequest('Invalid action. Use "assign" or "revoke"', undefined, origin);
    }

    if (!result.success) {
      return badRequest(result.error || 'Operation failed', undefined, origin);
    }

    // Get updated license info
    const updatedLicense = await prisma.license.findUnique({
      where: { id: body.license_id },
      include: { seat_assignments: true },
    });

    return success({
      message: body.action === 'assign' ? 'Seat assigned successfully' : 'Seat revoked successfully',
      license: {
        id: updatedLicense?.id,
        total_seats: updatedLicense?.max_users,
        used_seats: updatedLicense?.seat_assignments?.length || 0,
        available_seats: (updatedLicense?.max_users || 0) - (updatedLicense?.seat_assignments?.length || 0),
      },
    }, 200, origin);

  } catch (err) {
    logger.error('Manage seats error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error', 500, undefined, origin);
  }
}
