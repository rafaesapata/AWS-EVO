/**
 * License Seat Cleanup Handler
 * Removes seat assignments for users not in the license's organization
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions, unauthorized } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { parseEventBody } from '../../lib/request-parser.js';

interface CleanupRequest {
  licenseKey: string;
}

function getOriginFromEvent(event: AuthorizedEvent): string {
  const headers = event.headers || {};
  return headers['origin'] || headers['Origin'] || '*';
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOriginFromEvent(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let organizationId: string;
  let userId: string;
  let userRoles: string[] = [];

  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    organizationId = getOrganizationId(user);
    
    // Parse roles from user claims
    const rolesStr = user['custom:roles'] || user.roles || '[]';
    try {
      userRoles = typeof rolesStr === 'string' ? JSON.parse(rolesStr) : rolesStr;
    } catch {
      userRoles = [];
    }
  } catch (authError: any) {
    logger.error('Authentication error', authError);
    return error('Authentication failed: ' + (authError.message || 'Unknown error'), 401, undefined, origin);
  }
  
  // Check admin permission
  const isAdmin = userRoles.includes('admin') || userRoles.includes('org_admin') || userRoles.includes('super_admin');
  if (!isAdmin) {
    logger.warn('Unauthorized cleanup attempt', { userId, userRoles });
    return unauthorized('Admin permission required for seat cleanup', origin);
  }
  
  try {
    const body = parseEventBody<CleanupRequest>(event, {} as CleanupRequest, 'cleanup-seats');
    
    if (!body.licenseKey) {
      return badRequest('Missing required field: licenseKey', undefined, origin);
    }
    
    logger.info('Seat cleanup started', { 
      licenseKey: body.licenseKey,
      organizationId,
      userId,
      requestId: context.awsRequestId 
    });
    
    const prisma = getPrismaClient();
    
    // 1. Get license and verify it belongs to organization
    const license = await prisma.license.findFirst({
      where: {
        license_key: body.licenseKey,
        organization_id: organizationId
      }
    });
    
    if (!license) {
      return badRequest('License not found or does not belong to your organization', undefined, origin);
    }
    
    // 2. Get all valid user IDs from the organization
    const orgProfiles = await prisma.profile.findMany({
      where: { organization_id: organizationId },
      select: { user_id: true }
    });
    
    const validUserIds = orgProfiles.map(p => p.user_id);
    
    // 3. Find seat assignments for users NOT in the organization
    const invalidSeats = await prisma.licenseSeatAssignment.findMany({
      where: {
        license_id: license.id,
        user_id: {
          notIn: validUserIds
        }
      }
    });
    
    logger.info('Invalid seats found', { 
      licenseId: license.id,
      invalidSeatsCount: invalidSeats.length,
      invalidSeatIds: invalidSeats.map(s => s.id)
    });
    
    let result = {
      success: true,
      licenseKey: body.licenseKey,
      invalidSeatsFound: invalidSeats.length,
      invalidSeatsRemoved: 0,
      updatedCounts: false
    };
    
    // 4. Delete invalid seat assignments
    if (invalidSeats.length > 0) {
      const deleteResult = await prisma.licenseSeatAssignment.deleteMany({
        where: {
          id: { in: invalidSeats.map(s => s.id) }
        }
      });
      
      result.invalidSeatsRemoved = deleteResult.count;
      
      // 5. Update license seat counts
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
      
      result.updatedCounts = true;
      
      logger.info('Seat cleanup completed', { 
        licenseId: license.id,
        removedSeats: deleteResult.count,
        remainingSeats,
        availableSeats: license.max_users - remainingSeats
      });
    }
    
    return success(result, 200, origin);
    
  } catch (err: any) {
    logger.error('Seat cleanup error', err, { 
      organizationId,
      userId,
      requestId: context.awsRequestId,
    });
    
    return error(err instanceof Error ? err.message : 'Failed to cleanup seats', 500, undefined, origin);
  }
}